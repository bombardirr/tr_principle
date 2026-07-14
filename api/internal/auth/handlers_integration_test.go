package auth_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/bombardirr/tr_principle/api/internal/auth"
	"github.com/bombardirr/tr_principle/api/internal/db"
	"github.com/bombardirr/tr_principle/api/internal/httpapi"
	"github.com/bombardirr/tr_principle/api/internal/tm"
)

func TestAuthFlow(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := db.Connect(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	migrations := filepath.Join("..", "..", "migrations")
	if err := db.Migrate(ctx, pool, migrations); err != nil {
		t.Fatal(err)
	}

	_, _ = pool.Exec(ctx, `DELETE FROM users WHERE email LIKE 'test_%@example.com'`)

	handler := &auth.Handler{
		Store:   auth.NewStore(pool),
		Tokens:  auth.NewTokenIssuer([]byte("test-secret-key-32bytes-minimum!!"), time.Hour),
		Limiter: auth.NewRateLimiter(100, time.Minute),
	}
	tmHandler := &tm.Handler{Store: tm.NewStore(pool)}
	srv := httptest.NewServer(httpapi.NewRouter(handler, tmHandler, "http://localhost"))
	t.Cleanup(srv.Close)

	email := fmt.Sprintf("test_%s@example.com", time.Now().Format("150405.000000000"))
	regBody := map[string]string{"email": email, "password": "password1"}
	token := mustAuth(t, srv.URL+"/api/auth/register", regBody)

	me := mustGET(t, srv.URL+"/api/auth/me", token)
	if me["email"] != email {
		t.Fatalf("me=%v", me)
	}

	// Second login bumps sv — old token dies
	token2 := mustAuth(t, srv.URL+"/api/auth/login", regBody)
	res, err := doReq(http.MethodGet, srv.URL+"/api/auth/me", token, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected old token unauthorized, got %d", res.StatusCode)
	}

	_ = mustGET(t, srv.URL+"/api/auth/me", token2)

	res, err = doReq(http.MethodPost, srv.URL+"/api/auth/logout", token2, nil)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("logout %d", res.StatusCode)
	}
	res, err = doReq(http.MethodGet, srv.URL+"/api/auth/me", token2, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected post-logout unauthorized, got %d", res.StatusCode)
	}
}

func mustAuth(t *testing.T, url string, body map[string]string) string {
	t.Helper()
	res, err := doReq(http.MethodPost, url, "", body)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("%s => %d %s", url, res.StatusCode, raw)
	}
	var out struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(raw, &out); err != nil || out.Token == "" {
		t.Fatalf("parse token: %s", raw)
	}
	return out.Token
}

func mustGET(t *testing.T, url, token string) map[string]any {
	t.Helper()
	res, err := doReq(http.MethodGet, url, token, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("GET %s => %d %s", url, res.StatusCode, raw)
	}
	var out map[string]any
	_ = json.Unmarshal(raw, &out)
	return out
}

func doReq(method, url, token string, body any) (*http.Response, error) {
	var rdr io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, url, rdr)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return http.DefaultClient.Do(req)
}
