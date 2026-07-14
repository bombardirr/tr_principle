package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	HTTPAddr      string
	DatabaseURL   string
	JWTSecret     []byte
	TokenTTL      time.Duration
	AllowedOrigin string
}

func FromEnv() (Config, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return Config{}, fmt.Errorf("JWT_SECRET is required")
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
	return Config{
		HTTPAddr:      addr,
		DatabaseURL:   dbURL,
		JWTSecret:     []byte(secret),
		TokenTTL:      time.Duration(ttlHours) * time.Hour,
		AllowedOrigin: origin,
	}, nil
}
