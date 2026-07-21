package jobs

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type attachmentCreateRequest struct {
	TmBaseID  string `json:"tmBaseId"`
	Label     string `json:"label"`
	Color     string `json:"color"`
	CanRead   *bool  `json:"canRead"`
	CanWrite  *bool  `json:"canWrite"`
	CanExport *bool  `json:"canExport"`
	CanClone  *bool  `json:"canClone"`
}

type attachmentPatchRequest struct {
	CanRead   *bool `json:"canRead"`
	CanWrite  *bool `json:"canWrite"`
	CanExport *bool `json:"canExport"`
	CanClone  *bool `json:"canClone"`
}

func (h *Handler) ListTMAttachments(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	attachments, err := h.Store.ListAttachments(r.Context(), jobID, user.ID)
	switch {
	case errors.Is(err, ErrNotMember):
		writeError(w, http.StatusNotFound, "job not found")
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		writeJSON(w, http.StatusOK, map[string]any{"attachments": attachments})
	}
}

func (h *Handler) CreateTMAttachment(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	if !requireJobOwner(w, r, h, jobID, user.ID) {
		return
	}

	var body attachmentCreateRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	flags := AttachmentFlags{CanRead: true}
	if body.CanRead != nil {
		flags.CanRead = *body.CanRead
	}
	if body.CanWrite != nil {
		flags.CanWrite = *body.CanWrite
	}
	if body.CanExport != nil {
		flags.CanExport = *body.CanExport
	}
	if body.CanClone != nil {
		flags.CanClone = *body.CanClone
	}

	if h.TM != nil {
		_ = h.TM.EnsureBase(
			r.Context(),
			user.ID,
			body.TmBaseID,
			attachmentLabel(body.TmBaseID, body.Label),
			body.Color,
		)
	}
	attachment, err := h.Store.CreateAttachment(r.Context(), jobID, user.ID, body.TmBaseID, flags)
	switch {
	case errors.Is(err, ErrInvalidAttachment):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrAttachmentConflict):
		writeError(w, http.StatusConflict, "attachment already exists")
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		writeJSON(w, http.StatusCreated, attachment)
	}
}

func attachmentLabel(baseID, label string) string {
	if label != "" {
		return label
	}
	if baseID == "personal-tm" {
		return "Personal TM"
	}
	return baseID
}

func (h *Handler) PatchTMAttachment(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	if !requireJobOwner(w, r, h, jobID, user.ID) {
		return
	}
	attachmentID, err := uuid.Parse(chi.URLParam(r, "attachmentId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid attachment id")
		return
	}

	var body attachmentPatchRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	attachment, err := h.Store.UpdateAttachment(r.Context(), jobID, user.ID, attachmentID, AttachmentPatch{
		CanRead:   body.CanRead,
		CanWrite:  body.CanWrite,
		CanExport: body.CanExport,
		CanClone:  body.CanClone,
	})
	switch {
	case errors.Is(err, ErrAttachmentMissing):
		writeError(w, http.StatusNotFound, "attachment not found")
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		writeJSON(w, http.StatusOK, attachment)
	}
}

func (h *Handler) DeleteTMAttachment(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	if !requireJobOwner(w, r, h, jobID, user.ID) {
		return
	}
	attachmentID, err := uuid.Parse(chi.URLParam(r, "attachmentId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid attachment id")
		return
	}

	err = h.Store.DeleteAttachment(r.Context(), jobID, user.ID, attachmentID)
	switch {
	case errors.Is(err, ErrAttachmentMissing):
		writeError(w, http.StatusNotFound, "attachment not found")
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

func requireJobOwner(
	w http.ResponseWriter,
	r *http.Request,
	h *Handler,
	jobID, userID uuid.UUID,
) bool {
	owner, err := h.Store.IsOwner(r.Context(), jobID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return false
	}
	if !owner {
		writeError(w, http.StatusNotFound, "job not found")
		return false
	}
	return true
}
