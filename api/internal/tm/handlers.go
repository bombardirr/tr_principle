package tm

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
	sinceRaw := r.URL.Query().Get("since")
	since, err := parseTime(sinceRaw)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid since")
		return
	}
	units, hasMore, err := h.Store.Pull(r.Context(), user.ID, since, pageSize)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	if units == nil {
		units = []Unit{}
	}
	writeJSON(w, http.StatusOK, PullResponse{
		Until:   formatTime(time.Now().UTC()),
		Units:   units,
		HasMore: hasMore,
	})
}

func (h *Handler) Push(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4<<20) // 4 MiB
	var body PushRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if len(body.Units) > pageSize {
		writeError(w, http.StatusBadRequest, "too many units")
		return
	}
	for _, unit := range body.Units {
		if unit.ID == "" || unit.SourceKey == "" {
			writeError(w, http.StatusBadRequest, "invalid unit")
			return
		}
		if err := h.Store.UpsertLWW(r.Context(), user.ID, unit); err != nil {
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
