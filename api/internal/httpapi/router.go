package httpapi

import (
	"net/http"
	"time"

	"github.com/bombardirr/tr_principle/api/internal/auth"
	"github.com/bombardirr/tr_principle/api/internal/backups"
	"github.com/bombardirr/tr_principle/api/internal/glossary"
	"github.com/bombardirr/tr_principle/api/internal/projects"
	"github.com/bombardirr/tr_principle/api/internal/tm"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func NewRouter(
	authHandler *auth.Handler,
	tmHandler *tm.Handler,
	glossaryHandler *glossary.Handler,
	backupsHandler *backups.Handler,
	projectsHandler *projects.Handler,
	allowedOrigin string,
	metricsToken string,
) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(120 * time.Second))
	r.Use(securityHeaders)
	r.Use(cors(allowedOrigin))
	r.Use(Instrument)

	r.Handle("/metrics", MetricsAuth(metricsToken, authHandler.AdminFromBearer, MetricsHandler()))

	r.Get("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})

	r.Route("/api/auth", func(r chi.Router) {
		r.Post("/register", authHandler.Register)
		r.Post("/login", authHandler.Login)
		r.Post("/password-reset", authHandler.PasswordReset)
		r.Group(func(r chi.Router) {
			r.Use(authHandler.Middleware)
			r.Get("/me", authHandler.Me)
			r.Patch("/me", authHandler.PatchMe)
			r.Post("/logout", authHandler.Logout)
			r.Post("/license/redeem", authHandler.RedeemLicense)
			r.Get("/storage", authHandler.Storage)
			r.Post("/recovery-code", authHandler.RotateRecoveryCode)
			r.Get("/license/keys", authHandler.AdminListLicenses)
			r.Post("/license/keys", authHandler.AdminCreateLicense)
			r.Post("/license/keys/revoke", authHandler.AdminRevokeLicense)
			r.Patch("/license/keys/note", authHandler.AdminPatchLicenseNote)
		})
	})

	r.Route("/api/tm", func(r chi.Router) {
		r.Use(authHandler.Middleware)
		r.Get("/sync", tmHandler.Pull)
		r.Post("/sync", tmHandler.Push)
		r.Get("/bases", tmHandler.ListBases)
		r.Post("/bases", tmHandler.CreateBase)
		r.Patch("/bases/{baseId}", tmHandler.PatchBase)
		r.Delete("/bases/{baseId}", tmHandler.DeleteBase)
		r.Get("/bases/{baseId}/sync", tmHandler.PullBase)
		r.Post("/bases/{baseId}/sync", tmHandler.PushBase)
	})

	r.Route("/api/glossary", func(r chi.Router) {
		r.Use(authHandler.Middleware)
		r.Get("/bases", glossaryHandler.ListBases)
		r.Post("/bases", glossaryHandler.CreateBase)
		r.Patch("/bases/{baseId}", glossaryHandler.PatchBase)
		r.Delete("/bases/{baseId}", glossaryHandler.DeleteBase)
		r.Get("/bases/{baseId}/sync", glossaryHandler.PullBase)
		r.Post("/bases/{baseId}/sync", glossaryHandler.PushBase)
	})

	r.Route("/api/backups/{projectID}", func(r chi.Router) {
		r.Use(authHandler.Middleware)
		r.Post("/lock", backupsHandler.ClaimLock)
		r.Delete("/lock", backupsHandler.ReleaseLock)
		r.Put("/backup", backupsHandler.PutBackup)
		r.Get("/backup", backupsHandler.GetBackup)
		r.Head("/backup", backupsHandler.GetBackup)
		r.Delete("/backup", backupsHandler.DeleteBackup)
	})

	r.Group(func(r chi.Router) {
		r.Use(authHandler.Middleware)
		r.Post("/api/projects", projectsHandler.Create)
		r.Get("/api/projects", projectsHandler.List)
		r.Get("/api/projects/{id}", projectsHandler.Get)
		r.Patch("/api/projects/{id}", projectsHandler.Patch)
		r.Post("/api/projects/{id}/archive", projectsHandler.Archive)
		r.Post("/api/projects/{id}/leave", projectsHandler.Leave)
		r.Put("/api/projects/{id}/original", projectsHandler.PutOriginal)
		r.Get("/api/projects/{id}/original", projectsHandler.GetOriginal)
		r.Head("/api/projects/{id}/original", projectsHandler.GetOriginal)
		r.Delete("/api/projects/{id}/original", projectsHandler.DeleteOriginal)
		r.Delete("/api/projects/{id}", projectsHandler.Delete)
		r.Post("/api/projects/{id}/transfer", projectsHandler.Transfer)
		r.Get("/api/projects/{id}/members", projectsHandler.Members)
		r.Patch("/api/projects/{id}/members/me", projectsHandler.PatchMe)
		r.Delete("/api/projects/{id}/members/{userId}", projectsHandler.RemoveMember)
		r.Post("/api/projects/{id}/invites", projectsHandler.CreateInvite)
		r.Get("/api/projects/{id}/invites", projectsHandler.Invites)
		r.Post("/api/projects/{id}/invites/{inviteId}/revoke", projectsHandler.RevokeInvite)
		r.Get("/api/projects/{id}/tm/sync", projectsHandler.PullJobTM)
		r.Post("/api/projects/{id}/tm/sync", projectsHandler.PushJobTM)
		r.Get("/api/projects/{id}/resources", projectsHandler.Resources)
		r.Patch("/api/projects/{id}/resources/preset", projectsHandler.PatchResourcePreset)
		r.Patch("/api/projects/{id}/resources/me", projectsHandler.PatchResourceMe)
		r.Get("/api/projects/{id}/tm-attachments", projectsHandler.ListTMAttachments)
		r.Post("/api/projects/{id}/tm-attachments", projectsHandler.CreateTMAttachment)
		r.Patch("/api/projects/{id}/tm-attachments/{attachmentId}", projectsHandler.PatchTMAttachment)
		r.Delete("/api/projects/{id}/tm-attachments/{attachmentId}", projectsHandler.DeleteTMAttachment)
		r.Get("/api/projects/{id}/glossary-attachments", projectsHandler.ListGlossaryAttachments)
		r.Post("/api/projects/{id}/glossary-attachments", projectsHandler.CreateGlossaryAttachment)
		r.Patch("/api/projects/{id}/glossary-attachments/{attachmentId}", projectsHandler.PatchGlossaryAttachment)
		r.Delete("/api/projects/{id}/glossary-attachments/{attachmentId}", projectsHandler.DeleteGlossaryAttachment)
		r.Post("/api/job-invites/accept", projectsHandler.AcceptInvite)
	})

	return r
}

func cors(origin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Project-Name, X-Filename")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
