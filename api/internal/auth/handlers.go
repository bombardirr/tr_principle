package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

type contextKey string

const userContextKey contextKey = "authUser"

type PublicUser struct {
	ID                string  `json:"id"`
	Email             string  `json:"email"`
	DisplayName       string  `json:"display_name"`
	IsAdmin           bool    `json:"is_admin"`
	Plan              string  `json:"plan"`
	PlanStatus        string  `json:"plan_status"`
	CurrentPeriodEnd  *string `json:"current_period_end,omitempty"`
	StorageUsedBytes  int64   `json:"storage_used_bytes"`
	StorageLimitBytes int64   `json:"storage_limit_bytes"`
	HasRecoveryCode   bool    `json:"has_recovery_code"`
}

type Handler struct {
	Store   *Store
	Tokens  *TokenIssuer
	Limiter *RateLimiter
}

type credsBody struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type tokenResponse struct {
	Token        string     `json:"token"`
	User         PublicUser `json:"user"`
	RecoveryCode string     `json:"recovery_code,omitempty"`
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	if !h.rateOK(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var body credsBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	email, err := ValidateCredentials(body.Email, body.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	hash, err := HashPassword(body.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	recoveryPlain, err := GenerateRecoveryCode()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	user, err := h.Store.CreateUser(r.Context(), email, hash, HashRecoveryCode(recoveryPlain))
	if errors.Is(err, ErrEmailTaken) {
		writeError(w, http.StatusConflict, "email taken")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	h.writeToken(w, user, recoveryPlain)
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	if !h.rateOK(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var body credsBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	email, err := ValidateCredentials(body.Email, body.Password)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	user, err := h.Store.FindByEmail(r.Context(), email)
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
	h.writeToken(w, user, "")
}

func (h *Handler) PasswordReset(w http.ResponseWriter, r *http.Request) {
	if !h.rateOK(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var body struct {
		Email        string `json:"email"`
		RecoveryCode string `json:"recovery_code"`
		Password     string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	email, err := ValidateCredentials(body.Email, body.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	hash, err := HashPassword(body.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	err = h.Store.ResetPasswordWithRecovery(r.Context(), email, body.RecoveryCode, hash)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) RotateRecoveryCode(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	plain, err := GenerateRecoveryCode()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	if err := h.Store.SetRecoveryCodeHash(r.Context(), user.ID, HashRecoveryCode(plain)); err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"recovery_code": plain})
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	fresh, err := h.Store.FindByID(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	_ = h.Store.SyncStorageGrace(r.Context(), fresh.ID)
	fresh, err = h.Store.FindByID(r.Context(), fresh.ID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	writeJSON(w, http.StatusOK, h.publicUser(r.Context(), fresh))
}

func (h *Handler) RedeemLicense(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var body struct {
		Key string `json:"key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	next, err := h.Store.RedeemLicense(r.Context(), user.ID, body.Key)
	if err != nil {
		switch {
		case errors.Is(err, ErrLicenseInvalid):
			writeError(w, http.StatusBadRequest, "invalid license key")
		case errors.Is(err, ErrLicenseUsed):
			writeError(w, http.StatusConflict, "license key already used")
		case errors.Is(err, ErrLicenseRevoked):
			writeError(w, http.StatusGone, "license key revoked")
		default:
			writeError(w, http.StatusInternalServerError, "server error")
		}
		return
	}
	writeJSON(w, http.StatusOK, h.publicUser(r.Context(), next))
}

func (h *Handler) Storage(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	fresh, err := h.Store.FindByID(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	used, err := h.Store.CloudStorageUsed(r.Context(), fresh.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	backups, err := h.Store.ListProjectBackups(r.Context(), fresh.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	if backups == nil {
		backups = []BackupListItem{}
	}
	type backupDTO struct {
		ProjectID   string `json:"project_id"`
		ProjectName string `json:"project_name"`
		SizeBytes   int64  `json:"size_bytes"`
		UpdatedAt   string `json:"updated_at"`
	}
	list := make([]backupDTO, 0, len(backups))
	for _, b := range backups {
		list = append(list, backupDTO{
			ProjectID:   b.ProjectID,
			ProjectName: b.ProjectName,
			SizeBytes:   b.SizeBytes,
			UpdatedAt:   b.UpdatedAt.UTC().Format(time.RFC3339Nano),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"storage_used_bytes":  used,
		"storage_limit_bytes": StorageLimitBytes(fresh.Subscription),
		"plan":                EffectivePlan(fresh.Subscription),
		"backups":             list,
	})
}

func (h *Handler) requireAdmin(w http.ResponseWriter, r *http.Request) (User, bool) {
	user, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return User{}, false
	}
	if !user.IsAdmin {
		writeError(w, http.StatusForbidden, "forbidden")
		return User{}, false
	}
	return user, true
}

func licenseKeyDTO(item LicenseKeyInfo) map[string]any {
	dto := map[string]any{
		"key_hash":      item.KeyHash,
		"key_hint":      item.KeyHint,
		"sku":           item.SKU,
		"duration_days": item.DurationDays,
		"status":        item.Status,
		"note":          item.Note,
		"created_at":    item.CreatedAt.UTC().Format(time.RFC3339Nano),
		"created_email": item.CreatedEmail,
		"redeemed_email": item.RedeemedEmail,
	}
	if item.RedeemedAt != nil {
		dto["redeemed_at"] = item.RedeemedAt.UTC().Format(time.RFC3339Nano)
	}
	if item.Plaintext != "" {
		dto["key"] = item.Plaintext
	}
	return dto
}

func (h *Handler) AdminCreateLicense(w http.ResponseWriter, r *http.Request) {
	admin, ok := h.requireAdmin(w, r)
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var body struct {
		SKU  string `json:"sku"`
		Note string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	item, err := h.Store.CreateLicenseKey(r.Context(), strings.TrimSpace(body.SKU), body.Note, admin.ID)
	if errors.Is(err, ErrUnknownSKU) {
		writeError(w, http.StatusBadRequest, "unknown license sku")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusOK, licenseKeyDTO(item))
}

func (h *Handler) AdminListLicenses(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	items, err := h.Store.ListLicenseKeys(r.Context(), 200)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	if items == nil {
		items = []LicenseKeyInfo{}
	}
	list := make([]map[string]any, 0, len(items))
	var unused, redeemed, revoked int
	for _, it := range items {
		list = append(list, licenseKeyDTO(it))
		switch it.Status {
		case "unused":
			unused++
		case "redeemed":
			redeemed++
		case "revoked":
			revoked++
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"keys": list,
		"stats": map[string]int{
			"total":    len(list),
			"unused":   unused,
			"redeemed": redeemed,
			"revoked":  revoked,
		},
	})
}

func (h *Handler) AdminRevokeLicense(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var body struct {
		KeyHash string `json:"key_hash"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := h.Store.RevokeLicenseKey(r.Context(), strings.TrimSpace(body.KeyHash), true); err != nil {
		if errors.Is(err, ErrLicenseInvalid) {
			writeError(w, http.StatusConflict, "cannot revoke")
			return
		}
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) AdminPatchLicenseNote(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var body struct {
		KeyHash string `json:"key_hash"`
		Note    string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := h.Store.UpdateLicenseNote(r.Context(), strings.TrimSpace(body.KeyHash), body.Note); err != nil {
		if errors.Is(err, ErrLicenseInvalid) {
			writeError(w, http.StatusNotFound, "not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) PatchMe(w http.ResponseWriter, r *http.Request) {
	user, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var body struct {
		DisplayName string `json:"display_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	name, err := NormalizeDisplayName(body.DisplayName)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	updated, err := h.Store.UpdateDisplayName(r.Context(), user.ID, name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusOK, h.publicUser(r.Context(), updated))
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

// AdminFromBearer returns (authed, isAdmin) for a Bearer JWT without writing a response.
// When Tokens/Store are missing or the token is invalid, authed is false.
func (h *Handler) AdminFromBearer(r *http.Request) (authed bool, isAdmin bool) {
	if h == nil || h.Tokens == nil || h.Store == nil {
		return false, false
	}
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return false, false
	}
	claims, err := h.Tokens.Parse(strings.TrimPrefix(header, "Bearer "))
	if err != nil {
		return false, false
	}
	id, err := uuid.Parse(claims.Subject)
	if err != nil {
		return false, false
	}
	user, err := h.Store.FindByID(r.Context(), id)
	if err != nil || user.SessionVersion != claims.SV {
		return false, false
	}
	return true, user.IsAdmin
}

func UserFromContext(ctx context.Context) (User, bool) {
	u, ok := ctx.Value(userContextKey).(User)
	return u, ok
}

func (h *Handler) writeToken(w http.ResponseWriter, user User, recoveryCode string) {
	token, err := h.Tokens.Issue(user.ID, user.Email, user.SessionVersion)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusOK, tokenResponse{
		Token:        token,
		User:         h.publicUser(context.Background(), user),
		RecoveryCode: recoveryCode,
	})
}

func (h *Handler) publicUser(ctx context.Context, u User) PublicUser {
	used, err := h.Store.CloudStorageUsed(ctx, u.ID)
	if err != nil {
		used = 0
	}
	return toPublic(u, used)
}

func (h *Handler) rateOK(w http.ResponseWriter, r *http.Request) bool {
	if h.Limiter == nil {
		return true
	}
	key := clientIP(r)
	if !h.Limiter.Allow(key) {
		writeError(w, http.StatusTooManyRequests, "rate limited")
		return false
	}
	return true
}

// Prefer X-Real-IP (NPM); do not trust multi-hop X-Forwarded-For.
func clientIP(r *http.Request) string {
	if xri := strings.TrimSpace(r.Header.Get("X-Real-IP")); xri != "" {
		if ip := net.ParseIP(xri); ip != nil {
			return ip.String()
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func toPublic(u User, storageUsed int64) PublicUser {
	status := u.Subscription.Status
	if status == "" {
		status = StatusInactive
	}
	var periodEnd *string
	if u.Subscription.CurrentPeriodEnd != nil {
		s := u.Subscription.CurrentPeriodEnd.UTC().Format(time.RFC3339Nano)
		periodEnd = &s
	}
	return PublicUser{
		ID:                u.ID.String(),
		Email:             u.Email,
		DisplayName:       u.DisplayName,
		IsAdmin:           u.IsAdmin,
		Plan:              EffectivePlan(u.Subscription),
		PlanStatus:        status,
		CurrentPeriodEnd:  periodEnd,
		StorageUsedBytes:  storageUsed,
		StorageLimitBytes: StorageLimitBytes(u.Subscription),
		HasRecoveryCode:   u.HasRecoveryCode,
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
