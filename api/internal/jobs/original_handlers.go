package jobs

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const MaxOriginalBytes = 50 << 20 // 50 MiB — same ceiling as project backups

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

// sanitizeOriginalFilename strips path components and characters that break
// Content-Disposition / header injection (quotes, CR/LF, controls).
func sanitizeOriginalFilename(name string) string {
	name = filepath.Base(strings.TrimSpace(name))
	name = strings.ReplaceAll(name, "\x00", "")
	var b strings.Builder
	b.Grow(len(name))
	for _, r := range name {
		switch {
		case r < 32, r == 127, r == '"', r == '\\', r == '/', r == ':', r == ';', r == '=':
			b.WriteByte('_')
		case unicode.IsControl(r):
			b.WriteByte('_')
		default:
			b.WriteRune(r)
		}
	}
	out := strings.Trim(b.String(), " .")
	if out == "" || out == "." || out == ".." {
		return "original.docx"
	}
	return out
}

func contentDispositionAttachment(filename string) string {
	safe := sanitizeOriginalFilename(filename)
	// ASCII fallback + RFC 5987 for non-ASCII
	ascii := strings.Map(func(r rune) rune {
		if r > 0x7e || r < 0x20 {
			return '_'
		}
		return r
	}, safe)
	if ascii == "" {
		ascii = "original.docx"
	}
	return fmt.Sprintf(
		`attachment; filename="%s"; filename*=UTF-8''%s`,
		ascii,
		url.PathEscape(safe),
	)
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
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeError(w, http.StatusRequestEntityTooLarge, "original too large")
			return
		}
		writeError(w, http.StatusBadRequest, "invalid body")
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
	var filename string
	if raw := strings.TrimSpace(r.Header.Get("X-Filename")); raw != "" {
		filename = sanitizeOriginalFilename(raw)
	} else if meta, err := h.Store.GetOriginalMeta(r.Context(), jobID); err == nil {
		filename = sanitizeOriginalFilename(meta.Filename)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	} else if job.SourceFilename != "" {
		filename = sanitizeOriginalFilename(job.SourceFilename)
	} else {
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
		// Avoid file-without-meta (and mismatched replace): clear disk + meta.
		_ = os.Remove(abs)
		_ = h.Store.DeleteOriginalMeta(r.Context(), jobID)
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
	safeName := sanitizeOriginalFilename(meta.Filename)
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
	w.Header().Set("Content-Disposition", contentDispositionAttachment(safeName))
	if r.Method == http.MethodHead {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", meta.SizeBytes))
		w.WriteHeader(http.StatusOK)
		return
	}
	http.ServeContent(w, r, safeName, meta.UploadedAt, f)
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
	archived, err := h.Store.IsArchived(r.Context(), jobID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	if archived {
		writeError(w, http.StatusBadRequest, "job archived")
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
