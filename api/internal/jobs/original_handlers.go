package jobs

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const MaxOriginalBytes = 50 << 20 // 50 MiB

func (h *Handler) originalAbsPath(jobID uuid.UUID) (rel, abs string, err error) {
	if h.BackupDir == "" {
		return "", "", errors.New("BACKUP_DIR not set")
	}
	root := filepath.Clean(h.BackupDir)
	abs = filepath.Clean(filepath.Join(root, "job-originals", jobID.String()+".docx"))
	relPath, err := filepath.Rel(root, abs)
	if err != nil || strings.HasPrefix(relPath, "..") {
		return "", "", errors.New("path escape")
	}
	return filepath.ToSlash(relPath), abs, nil
}

func (h *Handler) PutOriginal(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	owner, err := h.Store.IsOwner(r.Context(), jobID, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	if !owner {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	archived, err := h.Store.IsArchived(r.Context(), jobID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	if archived {
		writeError(w, http.StatusBadRequest, "job archived")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, MaxOriginalBytes)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "original too large")
		return
	}
	if len(data) == 0 {
		writeError(w, http.StatusBadRequest, "empty body")
		return
	}
	job, err := h.Store.GetJob(r.Context(), jobID, user.ID)
	if errors.Is(err, ErrJobNotFound) {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	if job.SourceHash == "" {
		writeError(w, http.StatusBadRequest, "missing source hash")
		return
	}
	sum := sha256.Sum256(data)
	contentHash := hex.EncodeToString(sum[:])
	if contentHash != job.SourceHash {
		writeError(w, http.StatusBadRequest, "original hash mismatch")
		return
	}
	filename := filepath.Base(strings.TrimSpace(r.Header.Get("X-Filename")))
	if filename == "" || filename == "." {
		meta, err := h.Store.GetOriginalMeta(r.Context(), jobID)
		if err == nil {
			filename = meta.Filename
		} else if !errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusInternalServerError, "server error")
			return
		}
	}
	if filename == "" {
		filename = job.SourceFilename
	}
	if filename == "" {
		filename = "original.docx"
	}
	rel, abs, err := h.originalAbsPath(jobID)
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
	if err := h.Store.UpsertOriginalMeta(r.Context(), jobID, OriginalMeta{
		Filename:    filename,
		ContentHash: contentHash,
		SizeBytes:   int64(len(data)),
		StoragePath: rel,
		UploadedBy:  user.ID,
		UploadedAt:  time.Now().UTC(),
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":        true,
		"sizeBytes": len(data),
		"filename":  filename,
	})
}

func (h *Handler) GetOriginal(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	if _, err := h.Store.RoleOf(r.Context(), jobID, user.ID); err != nil {
		if errors.Is(err, ErrNotMember) {
			writeError(w, http.StatusForbidden, "forbidden")
			return
		}
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	meta, err := h.Store.GetOriginalMeta(r.Context(), jobID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "original not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	_, abs, err := h.originalAbsPath(jobID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	f, err := os.Open(abs)
	if err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "original not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	defer f.Close()
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, meta.Filename))
	if r.Method == http.MethodHead {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", meta.SizeBytes))
		w.WriteHeader(http.StatusOK)
		return
	}
	http.ServeContent(w, r, meta.Filename, meta.UploadedAt, f)
}

func (h *Handler) DeleteOriginal(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	owner, err := h.Store.IsOwner(r.Context(), jobID, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	if !owner {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	if _, abs, err := h.originalAbsPath(jobID); err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	} else if err := os.Remove(abs); err != nil && !os.IsNotExist(err) {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	if err := h.Store.DeleteOriginalMeta(r.Context(), jobID); err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
