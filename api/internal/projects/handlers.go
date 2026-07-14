package projects

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/bombardirr/tr_principle/api/internal/auth"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const MaxBackupBytes = 50 << 20 // 50 MiB

type Handler struct {
	Store     *Store
	BackupDir string
}

type lockBody struct {
	HolderID string `json:"holderId"`
	Token    string `json:"token"`
}

type lockResponse struct {
	HolderID  string `json:"holderId"`
	Token     string `json:"token"`
	ExpiresAt string `json:"expiresAt"`
}

func (h *Handler) ClaimLock(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	projectID, err := parseProjectID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	var body lockBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	lock, err := h.Store.ClaimLock(r.Context(), user.ID, projectID, body.HolderID, body.Token, time.Now().UTC())
	if errors.Is(err, ErrLockHeld) {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error":     "lock held",
			"holderId":  lock.HolderID,
			"expiresAt": lock.ExpiresAt.UTC().Format(time.RFC3339Nano),
		})
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, lockResponse{
		HolderID:  lock.HolderID,
		Token:     lock.Token,
		ExpiresAt: lock.ExpiresAt.UTC().Format(time.RFC3339Nano),
	})
}

func (h *Handler) ReleaseLock(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	projectID, err := parseProjectID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	var body lockBody
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.HolderID == "" {
		body.HolderID = r.URL.Query().Get("holderId")
		body.Token = r.URL.Query().Get("token")
	}
	if err := h.Store.ReleaseLock(r.Context(), user.ID, projectID, body.HolderID, body.Token); err != nil {
		if errors.Is(err, ErrLockNotHeld) {
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) PutBackup(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	projectID, err := parseProjectID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, MaxBackupBytes)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "backup too large")
		return
	}
	if len(data) == 0 {
		writeError(w, http.StatusBadRequest, "empty body")
		return
	}
	rel, abs, err := h.backupPaths(user.ID, projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	tmp := abs + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	if err := os.Rename(tmp, abs); err != nil {
		_ = os.Remove(tmp)
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	now := time.Now().UTC()
	if err := h.Store.UpsertBackupMeta(r.Context(), user.ID, projectID, BackupMeta{
		UpdatedAt:   now,
		SizeBytes:   int64(len(data)),
		StoragePath: rel,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":        true,
		"updatedAt": now.Format(time.RFC3339Nano),
		"sizeBytes": len(data),
	})
}

func (h *Handler) GetBackup(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	projectID, err := parseProjectID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	meta, err := h.Store.GetBackupMeta(r.Context(), user.ID, projectID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "no backup")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	_, abs, err := h.backupPaths(user.ID, projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	f, err := os.Open(abs)
	if err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "no backup")
			return
		}
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	defer f.Close()
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.tcat.zip"`, projectID.String()))
	w.Header().Set("Last-Modified", meta.UpdatedAt.UTC().Format(http.TimeFormat))
	if r.Method == http.MethodHead {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", meta.SizeBytes))
		w.WriteHeader(http.StatusOK)
		return
	}
	http.ServeContent(w, r, projectID.String()+".tcat.zip", meta.UpdatedAt, f)
}

func (h *Handler) backupPaths(userID, projectID uuid.UUID) (rel, abs string, err error) {
	if h.BackupDir == "" {
		return "", "", errors.New("BACKUP_DIR not set")
	}
	root := filepath.Clean(h.BackupDir)
	abs = filepath.Clean(filepath.Join(root, userID.String(), projectID.String()+".tcat.zip"))
	relPath, err := filepath.Rel(root, abs)
	if err != nil || strings.HasPrefix(relPath, "..") {
		return "", "", errors.New("path escape")
	}
	rel = filepath.ToSlash(relPath)
	return rel, abs, nil
}

func parseProjectID(r *http.Request) (uuid.UUID, error) {
	return uuid.Parse(chi.URLParam(r, "projectID"))
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
