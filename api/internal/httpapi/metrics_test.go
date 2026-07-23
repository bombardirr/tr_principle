package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/bombardirr/tr_principle/api/internal/httpapi"
)

func TestPathGroup_ReplacesUUIDs(t *testing.T) {
	got := httpapi.PathGroup("/api/jobs/550e8400-e29b-41d4-a716-446655440000/members")
	if got != "/api/jobs/*/members" {
		t.Fatalf("got %q", got)
	}
	if httpapi.PathGroup("/api/health") != "/api/health" {
		t.Fatal("health path should stay literal")
	}
	if httpapi.PathGroup("/metrics") != "/metrics" {
		t.Fatal("metrics path should stay literal")
	}
}

func TestMetricsAuth_NoAuth401(t *testing.T) {
	h := httpapi.MetricsAuth("secret", nil, okHandler())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d", rec.Code)
	}
}

func TestMetricsAuth_WrongToken401(t *testing.T) {
	h := httpapi.MetricsAuth("secret", nil, okHandler())
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	req.Header.Set("Authorization", "Bearer nope")
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d", rec.Code)
	}
}

func TestMetricsAuth_TokenOK(t *testing.T) {
	h := httpapi.MetricsAuth("secret", nil, okHandler())
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	req.Header.Set("Authorization", "Bearer secret")
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d", rec.Code)
	}
}

func TestMetricsAuth_NonAdminJWT403(t *testing.T) {
	lookup := func(*http.Request) (bool, bool) { return true, false }
	h := httpapi.MetricsAuth("secret", lookup, okHandler())
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	req.Header.Set("Authorization", "Bearer user-jwt")
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("got %d", rec.Code)
	}
}

func TestMetricsAuth_AdminJWT200(t *testing.T) {
	lookup := func(*http.Request) (bool, bool) { return true, true }
	h := httpapi.MetricsAuth("secret", lookup, okHandler())
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	req.Header.Set("Authorization", "Bearer admin-jwt")
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d", rec.Code)
	}
}

func TestMetricsAuth_EmptyTokenStillAllowsAdmin(t *testing.T) {
	lookup := func(*http.Request) (bool, bool) { return true, true }
	h := httpapi.MetricsAuth("", lookup, okHandler())
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	req.Header.Set("Authorization", "Bearer admin-jwt")
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d", rec.Code)
	}
}

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
}
