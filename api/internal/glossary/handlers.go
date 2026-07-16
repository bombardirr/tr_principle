package glossary

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/bombardirr/tr_principle/api/internal/auth"
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

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
