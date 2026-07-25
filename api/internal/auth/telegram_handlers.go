package auth

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/bombardirr/tr_principle/api/internal/emailvalidate"
)

func (h *Handler) telegramEnabled() bool {
	return h.Telegram != nil && h.Telegram.Enabled() && h.TgCfg.Enabled
}

func (h *Handler) CreateTelegramLink(w http.ResponseWriter, r *http.Request) {
	if !h.telegramEnabled() {
		writeError(w, http.StatusServiceUnavailable, "telegram not configured")
		return
	}
	if !h.rateOK(w, r) {
		return
	}
	user, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	raw, expires, err := h.Store.CreateLinkToken(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	username := strings.TrimPrefix(h.TgCfg.BotUsername, "@")
	writeJSON(w, http.StatusOK, map[string]any{
		"deep_link":  fmt.Sprintf("https://t.me/%s?start=link_%s", username, raw),
		"expires_at": expires.UTC().Format(time.RFC3339),
	})
}

func (h *Handler) UnlinkTelegram(w http.ResponseWriter, r *http.Request) {
	if !h.rateOK(w, r) {
		return
	}
	user, ok := UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if err := h.Store.ClearTelegramID(r.Context(), user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	updated, err := h.Store.FindByID(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusOK, toPublic(updated))
}

func (h *Handler) PasswordResetRequest(w http.ResponseWriter, r *http.Request) {
	if !h.rateOK(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var body struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	// Always ok — no enumeration
	defer writeJSON(w, http.StatusOK, map[string]bool{"ok": true})

	if !h.telegramEnabled() {
		return
	}
	email, err := emailvalidate.NormalizeAndValidate(body.Email)
	if err != nil {
		return
	}
	user, err := h.Store.FindByEmail(r.Context(), email)
	if err != nil || user.TelegramID == nil {
		return
	}
	code, err := h.Store.CreateResetCode(r.Context(), user.ID)
	if err != nil {
		log.Printf("password reset code: %v", err)
		return
	}
	msg := fmt.Sprintf(
		"Код сброса пароля аппзац: <b>%s</b>\nДействует 15 минут. Если это не вы — проигнорируйте сообщение.",
		code,
	)
	if err := h.Telegram.SendMessage(r.Context(), *user.TelegramID, msg); err != nil {
		log.Printf("telegram send reset: %v", err)
	}
}

func (h *Handler) PasswordResetConfirm(w http.ResponseWriter, r *http.Request) {
	if !h.rateOK(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var body struct {
		Email    string `json:"email"`
		Code     string `json:"code"`
		Password string `json:"password"`
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
	code := strings.TrimSpace(body.Code)
	if len(code) != 6 {
		writeError(w, http.StatusBadRequest, "invalid code")
		return
	}
	user, err := h.Store.FindByEmail(r.Context(), email)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	hash, err := HashPassword(body.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	if err := h.Store.ConsumeResetCodeAndSetPassword(r.Context(), user.ID, code, hash); err != nil {
		if errors.Is(err, ErrInvalidCredentials) {
			writeError(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		writeError(w, http.StatusInternalServerError, "server error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

type tgUpdate struct {
	Message *struct {
		Text string `json:"text"`
		Chat struct {
			ID int64 `json:"id"`
		} `json:"chat"`
		From *struct {
			ID int64 `json:"id"`
		} `json:"from"`
	} `json:"message"`
}

func (h *Handler) TelegramWebhook(w http.ResponseWriter, r *http.Request) {
	if !h.telegramEnabled() {
		writeError(w, http.StatusServiceUnavailable, "telegram not configured")
		return
	}
	secret := r.Header.Get("X-Telegram-Bot-Api-Secret-Token")
	if secret == "" || secret != h.TgCfg.WebhookSecret {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var update tgUpdate
	if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	defer writeJSON(w, http.StatusOK, map[string]bool{"ok": true})

	if update.Message == nil {
		return
	}
	text := strings.TrimSpace(update.Message.Text)
	chatID := update.Message.Chat.ID
	if !strings.HasPrefix(text, "/start") {
		_ = h.Telegram.SendMessage(r.Context(), chatID,
			"Бот аппзац: откройте ссылку привязки из настроек аккаунта на сайте.")
		return
	}
	parts := strings.Fields(text)
	payload := ""
	if len(parts) >= 2 {
		payload = parts[1]
	}
	if !strings.HasPrefix(payload, "link_") {
		_ = h.Telegram.SendMessage(r.Context(), chatID,
			"Чтобы привязать аккаунт, нажмите «Привязать Telegram» в настройках аппзац и перейдите по ссылке.")
		return
	}
	raw := strings.TrimPrefix(payload, "link_")
	if raw == "" {
		_ = h.Telegram.SendMessage(r.Context(), chatID, "Ссылка неполная. Запросите новую в настройках.")
		return
	}
	if err := h.Store.ConsumeLinkToken(r.Context(), raw, chatID); err != nil {
		_ = h.Telegram.SendMessage(r.Context(), chatID,
			"Ссылка недействительна или устарела. Запросите новую привязку в настройках аппзац.")
		return
	}
	_ = h.Telegram.SendMessage(r.Context(), chatID,
		"Готово: Telegram привязан к аккаунту аппзац. Сюда будут приходить коды сброса пароля.")
}
