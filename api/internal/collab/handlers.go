package collab

import (
	"encoding/json"
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/bombardirr/tr_principle/api/internal/auth"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct {
	Store      *Store
	presenceMu sync.Mutex
	presence   map[uuid.UUID]map[string]Presence
}

type createProjectRequest struct {
	ID         *uuid.UUID      `json:"id"`
	Name       string          `json:"name"`
	SourceLang string          `json:"sourceLang"`
	TargetLang string          `json:"targetLang"`
	Meta       json.RawMessage `json:"meta"`
}

type patchProjectRequest struct {
	Name       *string          `json:"name"`
	SourceLang *string          `json:"sourceLang"`
	TargetLang *string          `json:"targetLang"`
	Meta       *json.RawMessage `json:"meta"`
}

type createInviteRequest struct {
	Role      Role       `json:"role"`
	ExpiresAt *time.Time `json:"expiresAt"`
	MaxUses   *int       `json:"maxUses"`
}

type patchInviteRequest struct {
	Role      *Role      `json:"role"`
	ExpiresAt *time.Time `json:"expiresAt"`
	MaxUses   *int       `json:"maxUses"`
}

type acceptInviteRequest struct {
	Token string `json:"token"`
}

type projectResponse struct {
	ID          uuid.UUID       `json:"id"`
	OwnerUserID uuid.UUID       `json:"ownerUserId"`
	Name        string          `json:"name"`
	SourceLang  string          `json:"sourceLang"`
	TargetLang  string          `json:"targetLang"`
	Meta        json.RawMessage `json:"meta"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
}

type memberResponse struct {
	UserID      uuid.UUID `json:"userId"`
	DisplayName string    `json:"displayName"`
	Role        Role      `json:"role"`
}

type inviteResponse struct {
	ID            uuid.UUID  `json:"id"`
	ProjectID     uuid.UUID  `json:"projectId"`
	Role          Role       `json:"role"`
	CreatedBy     uuid.UUID  `json:"createdBy"`
	ExpiresAt     *time.Time `json:"expiresAt"`
	MaxUses       *int       `json:"maxUses"`
	UsesCount     int        `json:"usesCount"`
	InvitedUserID *uuid.UUID `json:"invitedUserId"`
	RevokedAt     *time.Time `json:"revokedAt"`
	CreatedAt     time.Time  `json:"createdAt"`
}

func (h *Handler) CreateProject(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var body createProjectRequest
	if !decodeJSON(w, r, &body) || body.Name == "" || body.SourceLang == "" || body.TargetLang == "" {
		writeError(w, http.StatusBadRequest, "invalid project")
		return
	}
	projectID := uuid.New()
	if body.ID != nil {
		projectID = *body.ID
	}
	project, err := h.Store.CreateProject(r.Context(), user.ID, projectID, body.Name, [2]string{body.SourceLang, body.TargetLang}, body.Meta)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toProjectResponse(project))
}

func (h *Handler) ListProjects(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	projects, err := h.Store.ListProjectsForUser(r.Context(), user.ID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	response := make([]projectResponse, 0, len(projects))
	for _, project := range projects {
		response = append(response, toProjectResponse(project))
	}
	writeJSON(w, http.StatusOK, map[string]any{"projects": response})
}

func (h *Handler) GetProject(w http.ResponseWriter, r *http.Request) {
	projectID, ok := parseUUIDParam(w, r, "projectID")
	if !ok || !h.requireMember(w, r, projectID) {
		return
	}
	project, err := h.Store.GetProject(r.Context(), projectID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toProjectResponse(project))
}

func (h *Handler) PatchProject(w http.ResponseWriter, r *http.Request) {
	projectID, ok := parseUUIDParam(w, r, "projectID")
	if !ok || !h.requireOwner(w, r, projectID) {
		return
	}
	var body patchProjectRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	project, err := h.Store.PatchProject(r.Context(), projectID, ProjectPatch(body))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toProjectResponse(project))
}

func (h *Handler) ListMembers(w http.ResponseWriter, r *http.Request) {
	projectID, ok := parseUUIDParam(w, r, "projectID")
	if !ok || !h.requireMember(w, r, projectID) {
		return
	}
	members, err := h.Store.ListMembers(r.Context(), projectID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	response := make([]memberResponse, 0, len(members))
	for _, member := range members {
		response = append(response, memberResponse{UserID: member.UserID, DisplayName: member.DisplayName, Role: member.Role})
	}
	writeJSON(w, http.StatusOK, map[string]any{"members": response})
}

func (h *Handler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	projectID, ok := parseUUIDParam(w, r, "projectID")
	if !ok || !h.requireOwner(w, r, projectID) {
		return
	}
	userID, ok := parseUUIDParam(w, r, "userID")
	if !ok {
		return
	}
	project, err := h.Store.GetProject(r.Context(), projectID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	if userID == project.OwnerUserID {
		writeError(w, http.StatusBadRequest, "cannot remove project owner")
		return
	}
	if err := h.Store.RemoveMember(r.Context(), projectID, userID); err != nil {
		writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) CreateInvite(w http.ResponseWriter, r *http.Request) {
	projectID, ok := parseUUIDParam(w, r, "projectID")
	if !ok || !h.requireOwner(w, r, projectID) {
		return
	}
	user, _ := auth.UserFromContext(r.Context())
	var body createInviteRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	token, invite, err := h.Store.CreateInvite(r.Context(), projectID, user.ID, body.Role, body.ExpiresAt, body.MaxUses, nil)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"invite": toInviteResponse(invite), "token": token})
}

func (h *Handler) ListInvites(w http.ResponseWriter, r *http.Request) {
	projectID, ok := parseUUIDParam(w, r, "projectID")
	if !ok || !h.requireOwner(w, r, projectID) {
		return
	}
	invites, err := h.Store.ListInvites(r.Context(), projectID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	response := make([]inviteResponse, 0, len(invites))
	for _, invite := range invites {
		response = append(response, toInviteResponse(invite))
	}
	writeJSON(w, http.StatusOK, map[string]any{"invites": response})
}

func (h *Handler) PatchInvite(w http.ResponseWriter, r *http.Request) {
	projectID, ok := parseUUIDParam(w, r, "projectID")
	if !ok || !h.requireOwner(w, r, projectID) {
		return
	}
	inviteID, ok := parseUUIDParam(w, r, "inviteID")
	if !ok {
		return
	}
	var body patchInviteRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	invite, err := h.Store.UpdateInvite(r.Context(), projectID, inviteID, InvitePatch(body))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toInviteResponse(invite))
}

func (h *Handler) RevokeInvite(w http.ResponseWriter, r *http.Request) {
	projectID, ok := parseUUIDParam(w, r, "projectID")
	if !ok || !h.requireOwner(w, r, projectID) {
		return
	}
	inviteID, ok := parseUUIDParam(w, r, "inviteID")
	if !ok {
		return
	}
	invite, err := h.Store.RevokeInvite(r.Context(), projectID, inviteID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toInviteResponse(invite))
}

func (h *Handler) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var body acceptInviteRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	projectID, role, err := h.Store.AcceptInvite(r.Context(), body.Token, user.ID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"projectId": projectID, "role": role})
}

func (h *Handler) requireMember(w http.ResponseWriter, r *http.Request, projectID uuid.UUID) bool {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return false
	}
	if _, err := h.Store.RoleOf(r.Context(), projectID, user.ID); err != nil {
		if errors.Is(err, ErrNotMember) {
			writeError(w, http.StatusForbidden, "forbidden")
		} else {
			writeStoreError(w, err)
		}
		return false
	}
	return true
}

func (h *Handler) requireOwner(w http.ResponseWriter, r *http.Request, projectID uuid.UUID) bool {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return false
	}
	role, err := h.Store.RoleOf(r.Context(), projectID, user.ID)
	if errors.Is(err, ErrNotMember) || role != RoleOwner {
		writeError(w, http.StatusForbidden, "forbidden")
		return false
	}
	if err != nil {
		writeStoreError(w, err)
		return false
	}
	return true
}

func parseUUIDParam(w http.ResponseWriter, r *http.Request, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, name))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid "+name)
		return uuid.Nil, false
	}
	return id, true
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return false
	}
	return true
}

func toProjectResponse(project Project) projectResponse {
	return projectResponse{
		ID: project.ID, OwnerUserID: project.OwnerUserID, Name: project.Name,
		SourceLang: project.SourceLang, TargetLang: project.TargetLang, Meta: project.Meta,
		CreatedAt: project.CreatedAt, UpdatedAt: project.UpdatedAt,
	}
}

func toInviteResponse(invite Invite) inviteResponse {
	return inviteResponse{
		ID: invite.ID, ProjectID: invite.ProjectID, Role: invite.Role, CreatedBy: invite.CreatedBy,
		ExpiresAt: invite.ExpiresAt, MaxUses: invite.MaxUses, UsesCount: invite.UsesCount,
		InvitedUserID: invite.InvitedUserID, RevokedAt: invite.RevokedAt, CreatedAt: invite.CreatedAt,
	}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func writeStoreError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrInvalidProject), errors.Is(err, ErrInvalidInvite):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrProjectNotFound), errors.Is(err, ErrNotMember):
		writeError(w, http.StatusNotFound, "not found")
	case errors.Is(err, ErrInviteRevoked), errors.Is(err, ErrInviteExpired), errors.Is(err, ErrInviteExhausted), errors.Is(err, ErrInviteUserMismatch):
		writeError(w, http.StatusConflict, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "server error")
	}
}
