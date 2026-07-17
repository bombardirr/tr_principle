package collab

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/bombardirr/tr_principle/api/internal/auth"
	"github.com/google/uuid"
)

const presenceTTL = 45 * time.Second

type Presence struct {
	UserID      uuid.UUID `json:"userId"`
	DisplayName string    `json:"displayName"`
	HolderID    string    `json:"holderId"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type sharedLockRequest struct {
	HolderID string `json:"holderId"`
	Token    string `json:"token"`
}

type syncPushRequest struct {
	Meta     json.RawMessage `json:"meta"`
	Segments json.RawMessage `json:"segments"`
	DocxHash *string         `json:"docxHash"`
	HolderID string          `json:"holderId"`
	Token    string          `json:"token"`
}

type presenceRequest struct {
	HolderID string `json:"holderId"`
}

func (h *Handler) ClaimSharedOrSoloLock(fallback http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID, role, shared, ok := h.sharedRole(w, r)
		if !ok {
			return
		}
		if !shared {
			fallback(w, r)
			return
		}
		if !CanEdit(role) {
			writeError(w, http.StatusForbidden, "forbidden")
			return
		}
		var body sharedLockRequest
		if !decodeJSON(w, r, &body) {
			return
		}
		user, _ := auth.UserFromContext(r.Context())
		lock, err := h.Store.ClaimSharedLock(r.Context(), user.ID, projectID, body.HolderID, body.Token, time.Now().UTC())
		if errors.Is(err, ErrSharedLockHeld) {
			writeJSON(w, http.StatusConflict, map[string]any{
				"error": "lock held", "holderId": lock.HolderID,
				"expiresAt": lock.ExpiresAt.UTC().Format(time.RFC3339Nano),
			})
			return
		}
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"holderId": lock.HolderID, "token": lock.Token,
			"expiresAt": lock.ExpiresAt.UTC().Format(time.RFC3339Nano),
		})
	}
}

func (h *Handler) ReleaseSharedOrSoloLock(fallback http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID, _, shared, ok := h.sharedRole(w, r)
		if !ok {
			return
		}
		if !shared {
			fallback(w, r)
			return
		}
		var body sharedLockRequest
		if !decodeJSON(w, r, &body) {
			return
		}
		if body.HolderID == "" || body.Token == "" {
			writeError(w, http.StatusBadRequest, "holderId and token required")
			return
		}
		user, _ := auth.UserFromContext(r.Context())
		err := h.Store.ReleaseSharedLock(r.Context(), user.ID, projectID, body.HolderID, body.Token)
		if err != nil && !errors.Is(err, ErrSharedLockNotHeld) {
			writeError(w, http.StatusInternalServerError, "server error")
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}

func (h *Handler) PullSync(w http.ResponseWriter, r *http.Request) {
	projectID, _, shared, ok := h.sharedRole(w, r)
	if !ok {
		return
	}
	if !shared {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	state, err := h.Store.PullSyncState(r.Context(), projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"until": state.UpdatedAt.UTC().Format(time.RFC3339Nano),
		"meta":  json.RawMessage(state.Meta), "segments": json.RawMessage(state.Segments),
		"docxHash": state.DocxHash,
	})
}

func (h *Handler) PushSync(w http.ResponseWriter, r *http.Request) {
	projectID, role, shared, ok := h.sharedRole(w, r)
	if !ok {
		return
	}
	if !shared {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	if !CanEdit(role) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	var body syncPushRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	user, _ := auth.UserFromContext(r.Context())
	held, err := h.Store.HoldsSharedLock(r.Context(), user.ID, projectID, body.HolderID, body.Token, time.Now().UTC())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	if !held {
		writeError(w, http.StatusForbidden, "shared lock required")
		return
	}
	state, err := h.Store.PushSyncState(r.Context(), projectID, body.Meta, body.Segments, body.DocxHash)
	if errors.Is(err, ErrInvalidSync) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"until": state.UpdatedAt.UTC().Format(time.RFC3339Nano),
		"meta":  json.RawMessage(state.Meta), "segments": json.RawMessage(state.Segments),
		"docxHash": state.DocxHash,
	})
}

func (h *Handler) PostPresence(w http.ResponseWriter, r *http.Request) {
	projectID, _, shared, ok := h.sharedRole(w, r)
	if !ok {
		return
	}
	if !shared {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	var body presenceRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	if body.HolderID == "" {
		writeError(w, http.StatusBadRequest, "holderId required")
		return
	}
	user, _ := auth.UserFromContext(r.Context())
	entry := Presence{UserID: user.ID, DisplayName: user.DisplayName, HolderID: body.HolderID, UpdatedAt: time.Now().UTC()}
	h.presenceMu.Lock()
	if h.presence == nil {
		h.presence = make(map[uuid.UUID]map[string]Presence)
	}
	if h.presence[projectID] == nil {
		h.presence[projectID] = make(map[string]Presence)
	}
	h.presence[projectID][body.HolderID] = entry
	h.presenceMu.Unlock()
	writeJSON(w, http.StatusOK, entry)
}

func (h *Handler) GetPresence(w http.ResponseWriter, r *http.Request) {
	projectID, _, shared, ok := h.sharedRole(w, r)
	if !ok {
		return
	}
	if !shared {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	cutoff := time.Now().UTC().Add(-presenceTTL)
	items := make([]Presence, 0)
	h.presenceMu.Lock()
	for holderID, entry := range h.presence[projectID] {
		if entry.UpdatedAt.Before(cutoff) {
			delete(h.presence[projectID], holderID)
			continue
		}
		items = append(items, entry)
	}
	h.presenceMu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"presence": items})
}

func (h *Handler) sharedRole(w http.ResponseWriter, r *http.Request) (uuid.UUID, Role, bool, bool) {
	projectID, ok := parseUUIDParam(w, r, "projectID")
	if !ok {
		return uuid.Nil, "", false, false
	}
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return uuid.Nil, "", false, false
	}
	role, err := h.Store.RoleOf(r.Context(), projectID, user.ID)
	if errors.Is(err, ErrNotMember) {
		return projectID, "", false, true
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return uuid.Nil, "", false, false
	}
	return projectID, role, true, true
}
