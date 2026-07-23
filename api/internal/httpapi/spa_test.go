package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/bombardirr/tr_principle/api/internal/httpapi"
)

func TestMountSPA_FallsBackToIndex(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html>app</html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(dir, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "assets", "app.js"), []byte("1"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "robots.txt"), []byte("User-agent: *\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	api := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTeapot)
		_, _ = w.Write([]byte("api"))
	})
	h := httpapi.MountSPA(api, dir)

	res := httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/projects", nil))
	if res.Code != 200 || res.Body.String() != "<html>app</html>" {
		t.Fatalf("spa: %d %q", res.Code, res.Body.String())
	}

	res = httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/assets/app.js", nil))
	if res.Code != 200 || res.Body.String() != "1" {
		t.Fatalf("asset: %d %q", res.Code, res.Body.String())
	}

	res = httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/robots.txt", nil))
	if res.Code != 200 || res.Body.String() != "User-agent: *\n" {
		t.Fatalf("robots: %d %q", res.Code, res.Body.String())
	}

	res = httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	if res.Code != http.StatusTeapot {
		t.Fatalf("api: %d", res.Code)
	}

	res = httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if res.Code != http.StatusTeapot {
		t.Fatalf("metrics should hit api: %d", res.Code)
	}
}
