package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/bombardirr/tr_principle/api/internal/auth"
	"github.com/bombardirr/tr_principle/api/internal/config"
	"github.com/bombardirr/tr_principle/api/internal/db"
	"github.com/bombardirr/tr_principle/api/internal/glossary"
	"github.com/bombardirr/tr_principle/api/internal/httpapi"
	"github.com/bombardirr/tr_principle/api/internal/projects"
	"github.com/bombardirr/tr_principle/api/internal/tm"
)

func main() {
	cfg, err := config.FromEnv()
	if err != nil {
		log.Fatal(err)
	}

	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer pool.Close()

	migrationsDir := os.Getenv("MIGRATIONS_DIR")
	if migrationsDir == "" {
		migrationsDir = filepath.Join("migrations")
	}
	if err := db.Migrate(ctx, pool, migrationsDir); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	store := auth.NewStore(pool)
	tokens := auth.NewTokenIssuer(cfg.JWTSecret, cfg.TokenTTL)
	handler := &auth.Handler{
		Store:   store,
		Tokens:  tokens,
		Limiter: auth.NewRateLimiter(30, time.Minute),
	}
	tmHandler := &tm.Handler{Store: tm.NewStore(pool)}
	glossaryHandler := &glossary.Handler{Store: glossary.NewStore(pool)}
	projectsHandler := &projects.Handler{
		Store:     projects.NewStore(pool),
		BackupDir: cfg.BackupDir,
	}
	api := httpapi.NewRouter(handler, tmHandler, glossaryHandler, projectsHandler, cfg.AllowedOrigin)
	handlerRoot := httpapi.MountSPA(api, cfg.PublicDir)

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           handlerRoot,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       90 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	go func() {
		log.Printf("app listening on %s (PUBLIC_DIR=%s)", cfg.HTTPAddr, cfg.PublicDir)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
