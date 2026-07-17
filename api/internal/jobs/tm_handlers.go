package jobs

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/bombardirr/tr_principle/api/internal/auth"
	"github.com/bombardirr/tr_principle/api/internal/tm"
)

type resourcePatchRequest struct {
	Kind      string `json:"kind"`
	Enabled   *bool  `json:"enabled"`
	CanRead   *bool  `json:"canRead"`
	CanWrite  *bool  `json:"canWrite"`
	CanExport *bool  `json:"canExport"`
	CanClone  *bool  `json:"canClone"`
}

func (request resourcePatchRequest) patch() ResourcePatch {
	return ResourcePatch{
		Enabled: request.Enabled, CanRead: request.CanRead, CanWrite: request.CanWrite,
		CanExport: request.CanExport, CanClone: request.CanClone,
	}
}

func (h *Handler) PullJobTM(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	resource, err := h.Store.EffectiveResource(r.Context(), jobID, user.ID, JobTMResourceKind)
	if !handleResourceLookupError(w, err) {
		return
	}
	if !resource.Enabled || !resource.CanRead {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	since, err := parseJobTMTime(r.URL.Query().Get("since"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid since")
		return
	}
	units, hasMore, err := h.Store.PullJobTM(r.Context(), jobID, since, jobTMPageSize)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusOK, tm.PullResponse{
		Until: time.Now().UTC().Format(time.RFC3339Nano), Units: units, HasMore: hasMore,
	})
}

func (h *Handler) PushJobTM(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	resource, err := h.Store.EffectiveResource(r.Context(), jobID, user.ID, JobTMResourceKind)
	if !handleResourceLookupError(w, err) {
		return
	}
	if !resource.Enabled || !resource.CanWrite {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 4<<20)
	var body tm.PushRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if len(body.Units) > jobTMPageSize {
		writeError(w, http.StatusBadRequest, "too many units")
		return
	}
	actor := jobTMActor(user)
	for _, unit := range body.Units {
		if unit.ID == "" || unit.SourceKey == "" {
			writeError(w, http.StatusBadRequest, "invalid unit")
			return
		}
		if err := h.Store.UpsertJobTM(r.Context(), jobID, actor, unit); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	writeJSON(w, http.StatusOK, tm.PushResponse{
		OK: true, Until: time.Now().UTC().Format(time.RFC3339Nano),
	})
}

func jobTMActor(user auth.User) string {
	name := strings.TrimSpace(user.DisplayName)
	if name != "" && !strings.Contains(name, "@") {
		return name
	}
	return "anon:" + user.ID.String()
}

func (h *Handler) Resources(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	resources, err := h.Store.ListResources(r.Context(), jobID, user.ID)
	if !handleResourceLookupError(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"resources": resources})
}

func (h *Handler) PatchResourcePreset(w http.ResponseWriter, r *http.Request) {
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
		writeError(w, http.StatusNotFound, "job not found")
		return
	}
	var body resourcePatchRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	if body.Kind == "" {
		body.Kind = JobTMResourceKind
	}
	preset, err := h.Store.PatchResourcePreset(r.Context(), jobID, body.Kind, body.patch())
	switch {
	case errors.Is(err, ErrInvalidResource):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrResourceMissing):
		writeError(w, http.StatusNotFound, err.Error())
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		writeJSON(w, http.StatusOK, map[string]any{"kind": body.Kind, "preset": preset})
	}
}

func (h *Handler) PatchResourceMe(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	var body resourcePatchRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	if body.Kind == "" {
		body.Kind = JobTMResourceKind
	}
	resource, err := h.Store.PatchMemberResource(r.Context(), jobID, user.ID, body.Kind, body.patch())
	switch {
	case errors.Is(err, ErrInvalidResource):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrNotMember), errors.Is(err, ErrResourceMissing):
		writeError(w, http.StatusNotFound, "job not found")
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		writeJSON(w, http.StatusOK, resource)
	}
}

func handleResourceLookupError(w http.ResponseWriter, err error) bool {
	switch {
	case errors.Is(err, ErrNotMember), errors.Is(err, ErrResourceMissing):
		writeError(w, http.StatusNotFound, "job not found")
		return false
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
		return false
	default:
		return true
	}
}
