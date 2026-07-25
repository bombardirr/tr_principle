package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	HTTPAddr              string
	DatabaseURL           string
	JWTSecret             []byte
	TokenTTL              time.Duration
	AllowedOrigin         string
	PublicDir             string
	BackupDir             string
	MetricsToken          string
	TelegramBotToken      string
	TelegramWebhookSecret string
	TelegramBotUsername   string
	TelegramWebhookURL    string
}

func FromEnv() (Config, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return Config{}, fmt.Errorf("JWT_SECRET is required")
	}
	if len(secret) < 32 {
		return Config{}, fmt.Errorf("JWT_SECRET must be at least 32 bytes")
	}
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	ttlHours := 24 * 7
	if v := os.Getenv("JWT_TTL_HOURS"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n <= 0 {
			return Config{}, fmt.Errorf("invalid JWT_TTL_HOURS")
		}
		ttlHours = n
	}
	addr := os.Getenv("HTTP_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	origin := os.Getenv("CORS_ORIGIN")
	if origin == "" {
		origin = "http://localhost:5173"
	}
	publicDir := os.Getenv("PUBLIC_DIR")
	if publicDir == "" {
		publicDir = "public"
	}
	backupDir := os.Getenv("BACKUP_DIR")
	if backupDir == "" {
		backupDir = "data/backups"
	}
	tgToken := strings.TrimSpace(os.Getenv("TELEGRAM_BOT_TOKEN"))
	tgSecret := strings.TrimSpace(os.Getenv("TELEGRAM_WEBHOOK_SECRET"))
	tgUser := strings.TrimSpace(os.Getenv("TELEGRAM_BOT_USERNAME"))
	if tgUser == "" {
		tgUser = "appzac_bot"
	}
	tgWebhook := strings.TrimSpace(os.Getenv("TELEGRAM_WEBHOOK_URL"))
	if tgToken != "" && tgSecret == "" {
		// Soft-disable rather than refusing to boot prod (CI healthcheck).
		fmt.Fprintln(os.Stderr, "warning: TELEGRAM_BOT_TOKEN set without TELEGRAM_WEBHOOK_SECRET — telegram disabled")
		tgToken = ""
	}
	if tgWebhook == "" && tgToken != "" {
		base := strings.TrimRight(origin, "/")
		tgWebhook = base + "/api/telegram/webhook"
	}
	return Config{
		HTTPAddr:              addr,
		DatabaseURL:           dbURL,
		JWTSecret:             []byte(secret),
		TokenTTL:              time.Duration(ttlHours) * time.Hour,
		AllowedOrigin:         origin,
		PublicDir:             publicDir,
		BackupDir:             backupDir,
		MetricsToken:          os.Getenv("METRICS_TOKEN"),
		TelegramBotToken:      tgToken,
		TelegramWebhookSecret: tgSecret,
		TelegramBotUsername:   tgUser,
		TelegramWebhookURL:    tgWebhook,
	}, nil
}
