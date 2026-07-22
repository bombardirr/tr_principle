package jobs

import (
	"errors"
	"net/http"
	"strings"

	"github.com/bombardirr/tr_principle/api/internal/glossary"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type glossaryAttachmentCreateRequest struct {
	GlossaryBaseID string `json:"glossaryBaseId"`
	Label          string `json:"label"`
	Color          string `json:"color"`
	CanRead        *bool  `json:"canRead"`
	CanWrite       *bool  `json:"canWrite"`
	CanExport      *bool  `json:"canExport"`
	CanClone       *bool  `json:"canClone"`
}

type glossaryAttachmentPatchRequest struct {
	CanRead   *bool `json:"canRead"`
	CanWrite  *bool `json:"canWrite"`
	CanExport *bool `json:"canExport"`
	CanClone  *bool `json:"canClone"`
}

func (h *Handler) ListGlossaryAttachments(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	attachments, err := h.Store.ListGlossaryAttachments(r.Context(), jobID, user.ID)
	switch {
	case errors.Is(err, ErrNotMember):
		writeError(w, http.StatusNotFound, "job not found")
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		writeJSON(w, http.StatusOK, map[string]any{"attachments": attachments})
	}
}

func (h *Handler) CreateGlossaryAttachment(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	if !requireJobOwner(w, r, h, jobID, user.ID) {
		return
	}
	var body glossaryAttachmentCreateRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	body.GlossaryBaseID = strings.TrimSpace(body.GlossaryBaseID)
	if body.GlossaryBaseID == "" {
		writeError(w, http.StatusBadRequest, ErrInvalidAttachment.Error())
		return
	}
	if h.Glossary == nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	if err := h.Glossary.EnsureBase(
		r.Context(), user.ID, body.GlossaryBaseID,
		glossaryAttachmentLabel(body.GlossaryBaseID, body.Label), body.Color,
	); err != nil {
		if errors.Is(err, glossary.ErrInvalidBase) {
			writeError(w, http.StatusBadRequest, err.Error())
		} else {
			writeError(w, http.StatusInternalServerError, "server error")
		}
		return
	}
	flags := GlossaryAttachmentFlags{CanRead: true}
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
	attachment, err := h.Store.CreateGlossaryAttachment(r.Context(), jobID, user.ID, body.GlossaryBaseID, flags)
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

func (h *Handler) PatchGlossaryAttachment(w http.ResponseWriter, r *http.Request) {
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
	var body glossaryAttachmentPatchRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	attachment, err := h.Store.UpdateGlossaryAttachment(r.Context(), jobID, user.ID, attachmentID, GlossaryAttachmentPatch{
		CanRead: body.CanRead, CanWrite: body.CanWrite, CanExport: body.CanExport, CanClone: body.CanClone,
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

func (h *Handler) DeleteGlossaryAttachment(w http.ResponseWriter, r *http.Request) {
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
	err = h.Store.DeleteGlossaryAttachment(r.Context(), jobID, user.ID, attachmentID)
	switch {
	case errors.Is(err, ErrAttachmentMissing):
		writeError(w, http.StatusNotFound, "attachment not found")
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

func glossaryAttachmentLabel(baseID, label string) string {
	if label = strings.TrimSpace(label); label != "" {
		return label
	}
	if baseID == "personal-glossary" {
		return "Personal glossary"
	}
	return baseID
}
