package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

type contextKey string

const userContextKey contextKey = "authUser"

type PublicUser struct {
	ID      string `json:"id"`
	Login   string `json:"login"`
	IsAdmin bool   `json:"is_admin"`
}

type Handler struct {
	Store    *Store
	Tokens   *TokenIssuer
	Limiter  *RateLimiter
}

type credsBody struct {
	Login    string `json:"login"`
	Password string `json:"password"`
}

type tokenResponse struct {
	Token string     `json:"token"`
	User  PublicUser `json:"user"`
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	if !h.rateOK(w, r) {
		return
	}
	var body credsBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := ValidateCredentials(body.Login, body.Password); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	hash, err := HashPassword(body.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	user, err := h.Store.CreateUser(r.Context(), strings.TrimSpace(body.Login), hash)
	if errors.Is(err, ErrLoginTaken) {
		writeError(w, http.StatusConflict, "login taken")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	h.writeToken(w, user)
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	if !h.rateOK(w, r) {
		return
	}
	var body credsBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	user, err := h.Store.FindByLogin(r.Context(), strings.TrimSpace(body.Login))
	if err != nil || !CheckPassword(user.PasswordHash, body.Password) {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	sv, err := h.Store.BumpSession(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	user.SessionVersion = sv
	h.writeToken(w, user)
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	writeJSON(w, http.StatusOK, toPublic(user))
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if _, err := h.Store.BumpSession(r.Context(), user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		claims, err := h.Tokens.Parse(strings.TrimPrefix(header, "Bearer "))
		if err != nil {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		id, err := uuid.Parse(claims.Subject)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		user, err := h.Store.FindByID(r.Context(), id)
		if err != nil || user.SessionVersion != claims.SV {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		ctx := context.WithValue(r.Context(), userContextKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func UserFromContext(ctx context.Context) (User, bool) {
	u, ok := ctx.Value(userContextKey).(User)
	return u, ok
}

func (h *Handler) writeToken(w http.ResponseWriter, user User) {
	token, err := h.Tokens.Issue(user.ID, user.Login, user.SessionVersion)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusOK, tokenResponse{Token: token, User: toPublic(user)})
}

func (h *Handler) rateOK(w http.ResponseWriter, r *http.Request) bool {
	if h.Limiter == nil {
		return true
	}
	key := r.RemoteAddr
	if !h.Limiter.Allow(key) {
		writeError(w, http.StatusTooManyRequests, "rate limited")
		return false
	}
	return true
}

func toPublic(u User) PublicUser {
	return PublicUser{ID: u.ID.String(), Login: u.Login, IsAdmin: u.IsAdmin}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
