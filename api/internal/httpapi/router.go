package httpapi

import (
	"net/http"
	"time"

	"github.com/bombardirr/tr_principle/api/internal/auth"
	"github.com/bombardirr/tr_principle/api/internal/glossary"
	"github.com/bombardirr/tr_principle/api/internal/jobs"
	"github.com/bombardirr/tr_principle/api/internal/projects"
	"github.com/bombardirr/tr_principle/api/internal/tm"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func NewRouter(
	authHandler *auth.Handler,
	tmHandler *tm.Handler,
	glossaryHandler *glossary.Handler,
	projectsHandler *projects.Handler,
	jobsHandler *jobs.Handler,
	allowedOrigin string,
) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(120 * time.Second))
	r.Use(securityHeaders)
	r.Use(cors(allowedOrigin))

	r.Get("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})

	r.Route("/api/auth", func(r chi.Router) {
		r.Post("/register", authHandler.Register)
		r.Post("/login", authHandler.Login)
		r.Group(func(r chi.Router) {
			r.Use(authHandler.Middleware)
			r.Get("/me", authHandler.Me)
			r.Patch("/me", authHandler.PatchMe)
			r.Post("/logout", authHandler.Logout)
		})
	})

	r.Route("/api/tm", func(r chi.Router) {
		r.Use(authHandler.Middleware)
		r.Get("/sync", tmHandler.Pull)
		r.Post("/sync", tmHandler.Push)
	})

	r.Route("/api/glossary", func(r chi.Router) {
		r.Use(authHandler.Middleware)
		r.Get("/sync", glossaryHandler.Pull)
		r.Post("/sync", glossaryHandler.Push)
	})

	r.Route("/api/projects/{projectID}", func(r chi.Router) {
		r.Use(authHandler.Middleware)
		r.Post("/lock", projectsHandler.ClaimLock)
		r.Delete("/lock", projectsHandler.ReleaseLock)
		r.Put("/backup", projectsHandler.PutBackup)
		r.Get("/backup", projectsHandler.GetBackup)
		r.Head("/backup", projectsHandler.GetBackup)
	})

	r.Group(func(r chi.Router) {
		r.Use(authHandler.Middleware)
		r.Post("/api/jobs", jobsHandler.Create)
		r.Get("/api/jobs", jobsHandler.List)
		r.Get("/api/jobs/{id}", jobsHandler.Get)
		r.Patch("/api/jobs/{id}", jobsHandler.Patch)
		r.Post("/api/jobs/{id}/transfer", jobsHandler.Transfer)
		r.Get("/api/jobs/{id}/members", jobsHandler.Members)
		r.Patch("/api/jobs/{id}/members/me", jobsHandler.PatchMe)
		r.Delete("/api/jobs/{id}/members/{userId}", jobsHandler.RemoveMember)
		r.Post("/api/jobs/{id}/invites", jobsHandler.CreateInvite)
		r.Get("/api/jobs/{id}/invites", jobsHandler.Invites)
		r.Post("/api/jobs/{id}/invites/{inviteId}/revoke", jobsHandler.RevokeInvite)
		r.Post("/api/job-invites/accept", jobsHandler.AcceptInvite)
	})

	return r
}

func cors(origin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
