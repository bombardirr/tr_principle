package collab

import (
	"encoding/xml"
	"net/http"
	"strings"
	"time"

	"github.com/bombardirr/tr_principle/api/internal/auth"
	"github.com/bombardirr/tr_principle/api/internal/tm"
	"github.com/google/uuid"
)

type projectTmSyncRequest struct {
	Units []tm.Unit `json:"units"`
}

type tmAttachmentPatchRequest struct {
	CanRead   *bool `json:"canRead"`
	CanWrite  *bool `json:"canWrite"`
	CanExport *bool `json:"canExport"`
	CanClone  *bool `json:"canClone"`
}

type tmAttachmentResponse struct {
	ID        uuid.UUID  `json:"id"`
	ProjectID uuid.UUID  `json:"projectId"`
	Kind      string     `json:"kind"`
	UserID    *uuid.UUID `json:"userId,omitempty"`
	CanRead   bool       `json:"canRead"`
	CanWrite  bool       `json:"canWrite"`
	CanExport bool       `json:"canExport"`
	CanClone  bool       `json:"canClone"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

func (h *Handler) PullProjectTm(w http.ResponseWriter, r *http.Request) {
	projectID, ok := parseUUIDParam(w, r, "projectID")
	if !ok || !h.requireMember(w, r, projectID) {
		return
	}
	since, err := parseTmTime(r.URL.Query().Get("since"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid since")
		return
	}
	units, err := h.Store.PullReadableTm(r.Context(), projectID, since)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	if units == nil {
		units = []tm.Unit{}
	}
	hasMore := len(units) > 500
	if hasMore {
		units = units[:500]
	}
	writeJSON(w, http.StatusOK, tm.PullResponse{Until: time.Now().UTC().Format(time.RFC3339Nano), Units: units, HasMore: hasMore})
}

func (h *Handler) PushProjectTm(w http.ResponseWriter, r *http.Request) {
	projectID, ok := parseUUIDParam(w, r, "projectID")
	if !ok || !h.requireMember(w, r, projectID) {
		return
	}
	user, _ := auth.UserFromContext(r.Context())
	actor := projectTmActor(user)
	var request projectTmSyncRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	if len(request.Units) > 500 {
		writeError(w, http.StatusBadRequest, "too many units")
		return
	}
	attachments, err := h.Store.ListTmAttachments(r.Context(), projectID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	canWrite := false
	for _, attachment := range attachments {
		if attachment.Kind == "project" && attachment.CanWrite {
			canWrite = true
			break
		}
	}
	if !canWrite {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	for _, unit := range request.Units {
		if unit.ID == "" || unit.SourceKey == "" {
			writeError(w, http.StatusBadRequest, "invalid unit")
			return
		}
		if err := h.Store.UpsertProjectTm(r.Context(), projectID, actor, unit); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	writeJSON(w, http.StatusOK, tm.PushResponse{OK: true, Until: time.Now().UTC().Format(time.RFC3339Nano)})
}

func projectTmActor(user auth.User) string {
	name := strings.TrimSpace(user.DisplayName)
	if name != "" && !strings.Contains(name, "@") {
		return name
	}
	return "anon:" + user.ID.String()
}

func (h *Handler) ListTmAttachments(w http.ResponseWriter, r *http.Request) {
	projectID, ok := parseUUIDParam(w, r, "projectID")
	if !ok || !h.requireMember(w, r, projectID) {
		return
	}
	attachments, err := h.Store.ListTmAttachments(r.Context(), projectID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	response := make([]tmAttachmentResponse, 0, len(attachments))
	for _, attachment := range attachments {
		response = append(response, toTmAttachmentResponse(attachment))
	}
	writeJSON(w, http.StatusOK, map[string]any{"attachments": response})
}

func (h *Handler) AttachPersonalTm(w http.ResponseWriter, r *http.Request) {
	projectID, ok := parseUUIDParam(w, r, "projectID")
	if !ok || !h.requireMember(w, r, projectID) {
		return
	}
	user, _ := auth.UserFromContext(r.Context())
	attachment, err := h.Store.AttachPersonalTm(r.Context(), projectID, user.ID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toTmAttachmentResponse(attachment))
}

func (h *Handler) PatchTmAttachment(w http.ResponseWriter, r *http.Request) {
	projectID, ok := parseUUIDParam(w, r, "projectID")
	if !ok || !h.requireOwner(w, r, projectID) {
		return
	}
	attachmentID, ok := parseUUIDParam(w, r, "attachmentID")
	if !ok {
		return
	}
	var request tmAttachmentPatchRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	attachment, err := h.Store.PatchTmAttachment(r.Context(), projectID, attachmentID, TmAttachmentPatch(request))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toTmAttachmentResponse(attachment))
}

func (h *Handler) ExportTmAttachment(w http.ResponseWriter, r *http.Request) {
	projectID, ok := parseUUIDParam(w, r, "projectID")
	if !ok || !h.requireMember(w, r, projectID) {
		return
	}
	attachmentID, ok := parseUUIDParam(w, r, "attachmentID")
	if !ok {
		return
	}
	attachment, err := h.Store.GetTmAttachment(r.Context(), projectID, attachmentID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	if !attachment.CanExport {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	units, err := h.Store.TmAttachmentUnits(r.Context(), attachment)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="translation-memory.tmx"`)
	_, _ = w.Write([]byte(projectTmTmx(units)))
}

func (h *Handler) CloneTmAttachment(w http.ResponseWriter, r *http.Request) {
	projectID, ok := parseUUIDParam(w, r, "projectID")
	if !ok || !h.requireMember(w, r, projectID) {
		return
	}
	attachmentID, ok := parseUUIDParam(w, r, "attachmentID")
	if !ok {
		return
	}
	attachment, err := h.Store.GetTmAttachment(r.Context(), projectID, attachmentID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	if !attachment.CanClone {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	user, _ := auth.UserFromContext(r.Context())
	units, err := h.Store.CloneTmAttachment(r.Context(), attachment, user.ID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"units": units})
}

func toTmAttachmentResponse(attachment TmAttachment) tmAttachmentResponse {
	return tmAttachmentResponse{ID: attachment.ID, ProjectID: attachment.ProjectID, Kind: attachment.Kind, UserID: attachment.UserID,
		CanRead: attachment.CanRead, CanWrite: attachment.CanWrite, CanExport: attachment.CanExport, CanClone: attachment.CanClone,
		CreatedAt: attachment.CreatedAt, UpdatedAt: attachment.UpdatedAt}
}

func projectTmTmx(units []tm.Unit) string {
	type tuv struct {
		Lang string `xml:"xml:lang,attr"`
		Seg  string `xml:"seg"`
	}
	type tu struct {
		Tuv []tuv `xml:"tuv"`
	}
	type body struct {
		TU []tu `xml:"tu"`
	}
	type header struct {
		SourceLang string `xml:"srclang,attr"`
		Tool       string `xml:"creationtool,attr"`
	}
	type document struct {
		XMLName xml.Name `xml:"tmx"`
		Version string   `xml:"version,attr"`
		Header  header   `xml:"header"`
		Body    body     `xml:"body"`
	}
	out := document{Version: "1.4", Header: header{SourceLang: "und", Tool: "appzac"}}
	for _, unit := range units {
		sourceLang, targetLang := "und", "und"
		if unit.SourceLang != nil {
			sourceLang = *unit.SourceLang
		}
		if unit.TargetLang != nil {
			targetLang = *unit.TargetLang
		}
		out.Body.TU = append(out.Body.TU, tu{Tuv: []tuv{{Lang: sourceLang, Seg: unit.Source}, {Lang: targetLang, Seg: unit.Target}}})
	}
	result, _ := xml.Marshal(out)
	return xml.Header + string(result)
}
