package jobs

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/bombardirr/tr_principle/api/internal/auth"
	"github.com/bombardirr/tr_principle/api/internal/tm"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct {
	Store *Store
	TM    *tm.Store
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var body struct {
		ID             uuid.UUID `json:"id"`
		Title          string    `json:"title"`
		SourceLang     string    `json:"sourceLang"`
		TargetLang     string    `json:"targetLang"`
		SourceFilename string    `json:"sourceFilename"`
		SourceHash     string    `json:"sourceHash"`
		LocalProjectID uuid.UUID `json:"localProjectId"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	job, err := h.Store.CreateJob(
		r.Context(),
		user.ID,
		body.ID,
		body.Title,
		Langs{Source: body.SourceLang, Target: body.TargetLang},
		body.SourceFilename,
		body.SourceHash,
		body.LocalProjectID,
	)
	if errors.Is(err, ErrInvalidJob) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusCreated, job)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	jobs, err := h.Store.ListJobs(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusOK, jobs)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
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
	writeJSON(w, http.StatusOK, job)
}

func (h *Handler) Patch(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	var body struct {
		Title          *string `json:"title"`
		SourceLang     *string `json:"sourceLang"`
		TargetLang     *string `json:"targetLang"`
		SourceFilename *string `json:"sourceFilename"`
		SourceHash     *string `json:"sourceHash"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	job, err := h.Store.UpdateJob(r.Context(), jobID, user.ID, JobPatch{
		Title:          body.Title,
		SourceLang:     body.SourceLang,
		TargetLang:     body.TargetLang,
		SourceFilename: body.SourceFilename,
		SourceHash:     body.SourceHash,
	})
	switch {
	case errors.Is(err, ErrInvalidJob):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrJobNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		writeJSON(w, http.StatusOK, job)
	}
}

func (h *Handler) Archive(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	job, err := h.Store.ArchiveJob(r.Context(), jobID, user.ID)
	switch {
	case errors.Is(err, ErrJobNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		writeJSON(w, http.StatusOK, job)
	}
}

func (h *Handler) Leave(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	err := h.Store.LeaveJob(r.Context(), jobID, user.ID)
	switch {
	case errors.Is(err, ErrOwnerLeave):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrMemberAbsent):
		writeError(w, http.StatusNotFound, err.Error())
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	err := h.Store.DeleteJob(r.Context(), jobID, user.ID)
	switch {
	case errors.Is(err, ErrJobNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

func (h *Handler) Transfer(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	var body struct {
		UserID uuid.UUID `json:"userId"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	job, err := h.Store.TransferOwner(r.Context(), jobID, user.ID, body.UserID)
	switch {
	case errors.Is(err, ErrInvalidJob):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrMemberAbsent):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrJobNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		writeJSON(w, http.StatusOK, job)
	}
}

func (h *Handler) Members(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	members, err := h.Store.ListMembers(r.Context(), jobID, user.ID)
	if errors.Is(err, ErrJobNotFound) {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusOK, members)
}

func (h *Handler) PatchMe(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	var body struct {
		PartDone       *bool      `json:"partDone"`
		ProgressDone   *int       `json:"progressDone"`
		ProgressTotal  *int       `json:"progressTotal"`
		ProgressTm     *int       `json:"progressTm"`
		LocalProjectID *uuid.UUID `json:"localProjectId"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	member, err := h.Store.PatchMemberMe(r.Context(), jobID, user.ID, MemberPatch{
		PartDone:       body.PartDone,
		ProgressDone:   body.ProgressDone,
		ProgressTotal:  body.ProgressTotal,
		ProgressTm:     body.ProgressTm,
		LocalProjectID: body.LocalProjectID,
	})
	switch {
	case errors.Is(err, ErrInvalidJob):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrMemberAbsent):
		writeError(w, http.StatusNotFound, err.Error())
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		writeJSON(w, http.StatusOK, member)
	}
}

func (h *Handler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	memberID, err := uuid.Parse(chi.URLParam(r, "userId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	err = h.Store.RemoveMember(r.Context(), jobID, user.ID, memberID)
	switch {
	case errors.Is(err, ErrOwnerMember):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrMemberAbsent):
		writeError(w, http.StatusNotFound, err.Error())
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

func (h *Handler) CreateInvite(w http.ResponseWriter, r *http.Request) {
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
	archived, err := h.Store.IsArchived(r.Context(), jobID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	if archived {
		writeError(w, http.StatusConflict, ErrJobArchived.Error())
		return
	}
	var body struct {
		Role      Role       `json:"role"`
		ExpiresAt *time.Time `json:"expiresAt"`
		MaxUses   *int       `json:"maxUses"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	token, invite, err := h.Store.CreateInvite(
		r.Context(), jobID, user.ID, body.Role, body.ExpiresAt, body.MaxUses,
	)
	if errors.Is(err, ErrInvalidInvite) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		Token  string `json:"token"`
		Invite Invite `json:"invite"`
	}{Token: token, Invite: invite})
}

func (h *Handler) Invites(w http.ResponseWriter, r *http.Request) {
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
	invites, err := h.Store.ListInvites(r.Context(), jobID, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusOK, invites)
}

func (h *Handler) RevokeInvite(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	inviteID, err := uuid.Parse(chi.URLParam(r, "inviteId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid invite id")
		return
	}
	err = h.Store.RevokeInvite(r.Context(), jobID, inviteID, user.ID)
	if errors.Is(err, ErrInvalidInvite) {
		writeError(w, http.StatusNotFound, "invite not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var body struct {
		Token          string     `json:"token"`
		LocalProjectID *uuid.UUID `json:"localProjectId"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	jobID, role, err := h.Store.AcceptInvite(
		r.Context(), strings.TrimSpace(body.Token), user.ID, body.LocalProjectID,
	)
	switch {
	case errors.Is(err, ErrInvalidInvite):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrJobArchived):
		writeError(w, http.StatusConflict, err.Error())
	case errors.Is(err, ErrInviteRevoked),
		errors.Is(err, ErrInviteExpired),
		errors.Is(err, ErrInviteExhausted):
		writeError(w, http.StatusGone, err.Error())
	case errors.Is(err, ErrJobNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		writeJSON(w, http.StatusOK, struct {
			JobID uuid.UUID `json:"jobId"`
			Role  Role      `json:"role"`
		}{JobID: jobID, Role: role})
	}
}

func requestJob(w http.ResponseWriter, r *http.Request) (auth.User, uuid.UUID, bool) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return auth.User{}, uuid.Nil, false
	}
	jobID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid job id")
		return auth.User{}, uuid.Nil, false
	}
	return user, jobID, true
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
