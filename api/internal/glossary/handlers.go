package glossary

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/bombardirr/tr_principle/api/internal/auth"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct {
	Store *Store
}

func (h *Handler) Pull(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	since, err := parseTime(r.URL.Query().Get("since"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid since")
		return
	}
	terms, hasMore, err := h.Store.Pull(r.Context(), user.ID, since, pageSize)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	if terms == nil {
		terms = []Term{}
	}
	writeJSON(w, http.StatusOK, PullResponse{
		Until:   formatTime(time.Now().UTC()),
		Terms:   terms,
		HasMore: hasMore,
	})
}

func (h *Handler) Push(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4<<20)
	var body PushRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if len(body.Terms) > pageSize {
		writeError(w, http.StatusBadRequest, "too many terms")
		return
	}
	for _, term := range body.Terms {
		if term.ID == "" {
			writeError(w, http.StatusBadRequest, "invalid term")
			return
		}
		if err := h.Store.UpsertLWW(r.Context(), user.ID, term); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	writeJSON(w, http.StatusOK, PushResponse{
		OK:    true,
		Until: formatTime(time.Now().UTC()),
	})
}

func (h *Handler) ListBases(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if err := h.Store.EnsureBase(r.Context(), user.ID, personalBaseID, "Personal glossary", defaultColor); err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	bases, err := h.Store.ListBases(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"bases": bases})
}

func (h *Handler) CreateBase(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var body struct {
		ID    string `json:"id"`
		Label string `json:"label"`
		Color string `json:"color"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	body.ID = strings.TrimSpace(body.ID)
	if body.ID == "" {
		body.ID = uuid.NewString()
	}
	if err := h.Store.UpsertBase(r.Context(), user.ID, body.ID, body.Label, body.Color); err != nil {
		if errors.Is(err, ErrInvalidBase) {
			writeError(w, http.StatusBadRequest, err.Error())
		} else {
			writeError(w, http.StatusInternalServerError, "server error")
		}
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{
		"id": body.ID, "label": strings.TrimSpace(body.Label), "color": baseColor(body.Color),
	})
}

func (h *Handler) PatchBase(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var body struct {
		Label *string `json:"label"`
		Color *string `json:"color"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	err := h.Store.PatchBase(r.Context(), user.ID, chi.URLParam(r, "baseId"), body.Label, body.Color)
	switch {
	case errors.Is(err, ErrInvalidBase):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrBaseNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}

func (h *Handler) DeleteBase(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	err := h.Store.SoftDeleteBase(r.Context(), user.ID, chi.URLParam(r, "baseId"))
	switch {
	case errors.Is(err, ErrCannotDeleteBase):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrBaseNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

func (h *Handler) PullBase(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	baseID := chi.URLParam(r, "baseId")
	jobID, ok := parseJobID(w, r)
	if !ok {
		return
	}
	ownerID, canRead, _, err := h.Store.ResolveBaseAccess(r.Context(), user.ID, baseID, jobID)
	if !writeAccessError(w, err) {
		return
	}
	if !canRead {
		writeError(w, http.StatusForbidden, ErrForbidden.Error())
		return
	}
	since, err := parseTime(r.URL.Query().Get("since"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid since")
		return
	}
	terms, hasMore, err := h.Store.PullByBase(r.Context(), ownerID, baseID, since, pageSize)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	if terms == nil {
		terms = []Term{}
	}
	writeJSON(w, http.StatusOK, PullResponse{Until: formatTime(time.Now().UTC()), Terms: terms, HasMore: hasMore})
}

func (h *Handler) PushBase(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	baseID := chi.URLParam(r, "baseId")
	jobID, ok := parseJobID(w, r)
	if !ok {
		return
	}
	ownerID, _, canWrite, err := h.Store.ResolveBaseAccess(r.Context(), user.ID, baseID, jobID)
	if !writeAccessError(w, err) {
		return
	}
	if !canWrite {
		writeError(w, http.StatusForbidden, ErrForbidden.Error())
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4<<20)
	var body PushRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if len(body.Terms) > pageSize {
		writeError(w, http.StatusBadRequest, "too many terms")
		return
	}
	for _, term := range body.Terms {
		if term.ID == "" {
			writeError(w, http.StatusBadRequest, "invalid term")
			return
		}
		term.BaseID = baseID
		if err := h.Store.UpsertLWW(r.Context(), ownerID, term); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	writeJSON(w, http.StatusOK, PushResponse{OK: true, Until: formatTime(time.Now().UTC())})
}

func decodeBody(w http.ResponseWriter, r *http.Request, destination any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return false
	}
	return true
}

func parseJobID(w http.ResponseWriter, r *http.Request) (*uuid.UUID, bool) {
	raw := r.URL.Query().Get("jobId")
	if raw == "" {
		return nil, true
	}
	value, err := uuid.Parse(raw)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid jobId")
		return nil, false
	}
	return &value, true
}

func writeAccessError(w http.ResponseWriter, err error) bool {
	switch {
	case err == nil:
		return true
	case errors.Is(err, ErrJobIDRequired):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrForbidden):
		writeError(w, http.StatusForbidden, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "server error")
	}
	return false
}

func baseColor(color string) string {
	color = strings.TrimSpace(color)
	if color == "" {
		return defaultColor
	}
	return color
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
