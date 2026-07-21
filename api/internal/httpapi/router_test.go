package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/bombardirr/tr_principle/api/internal/auth"
	"github.com/bombardirr/tr_principle/api/internal/glossary"
	"github.com/bombardirr/tr_principle/api/internal/httpapi"
	"github.com/bombardirr/tr_principle/api/internal/jobs"
	"github.com/bombardirr/tr_principle/api/internal/projects"
	"github.com/bombardirr/tr_principle/api/internal/tm"
)

func TestProjectRoutes_NoTrailingSlash(t *testing.T) {
	authHandler := &auth.Handler{
		Tokens: auth.NewTokenIssuer([]byte("test-secret-key-32bytes-minimum!!"), time.Hour),
	}
	handler := httpapi.NewRouter(
		authHandler,
		&tm.Handler{},
		&glossary.Handler{},
		&projects.Handler{},
		&jobs.Handler{},
		"http://localhost",
	)

	tests := []struct {
		method string
		path   string
	}{
		{http.MethodPost, "/api/projects/test-id/lock"},
		{http.MethodDelete, "/api/projects/test-id/lock"},
		{http.MethodPut, "/api/projects/test-id/backup"},
		{http.MethodGet, "/api/projects/test-id/backup"},
		{http.MethodHead, "/api/projects/test-id/backup"},
	}

	for _, tt := range tests {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, httptest.NewRequest(tt.method, tt.path, nil))
			if rec.Code == http.StatusNotFound {
				t.Fatalf("route not registered for %s %s", tt.method, tt.path)
			}
			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401 without auth, got %d", rec.Code)
			}
		})
	}
}

func TestJobsRouteRequiresAuthentication(t *testing.T) {
	authHandler := &auth.Handler{
		Tokens: auth.NewTokenIssuer([]byte("test-secret-key-32bytes-minimum!!"), time.Hour),
	}
	handler := httpapi.NewRouter(
		authHandler,
		&tm.Handler{},
		&glossary.Handler{},
		&projects.Handler{},
		&jobs.Handler{},
		"http://localhost",
	)

	tests := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/jobs"},
		{http.MethodPut, "/api/jobs/test-id/original"},
		{http.MethodGet, "/api/jobs/test-id/original"},
		{http.MethodDelete, "/api/jobs/test-id/original"},
	}
	for _, tt := range tests {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, httptest.NewRequest(tt.method, tt.path, nil))
			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("%s without auth = %d, want 401", tt.path, rec.Code)
			}
		})
	}
}
