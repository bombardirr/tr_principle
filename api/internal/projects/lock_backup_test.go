package projects_test

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
	"github.com/bombardirr/tr_principle/api/internal/projects"
	"github.com/bombardirr/tr_principle/api/internal/tm"
	"github.com/google/uuid"
)

func TestProjectLockAndBackup(t *testing.T) {
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
	_, _ = pool.Exec(ctx, `DELETE FROM users WHERE email LIKE 'projtest_%@example.com'`)

	backupDir := t.TempDir()
	authHandler := &auth.Handler{
		Store:   auth.NewStore(pool),
		Tokens:  auth.NewTokenIssuer([]byte("test-secret-key-32bytes-minimum!!"), time.Hour),
		Limiter: auth.NewRateLimiter(100, time.Minute),
	}
	srv := httptest.NewServer(httpapi.NewRouter(
		authHandler,
		&tm.Handler{Store: tm.NewStore(pool)},
		&projects.Handler{Store: projects.NewStore(pool), BackupDir: backupDir},
		"http://localhost",
	))
	t.Cleanup(srv.Close)

	emailA := fmt.Sprintf("projtest_a_%s@example.com", time.Now().Format("150405.000000000"))
	emailB := fmt.Sprintf("projtest_b_%s@example.com", time.Now().Format("150405.000000000"))
	tokenA := mustAuth(t, srv.URL+"/api/auth/register", map[string]string{"email": emailA, "password": "password1"})
	tokenB := mustAuth(t, srv.URL+"/api/auth/register", map[string]string{"email": emailB, "password": "password1"})

	projectID := uuid.NewString()
	lockURL := srv.URL + "/api/projects/" + projectID + "/lock"

	claim := mustJSON(t, http.MethodPost, lockURL, tokenA, map[string]string{
		"holderId": "tab-a",
	}, http.StatusOK)
	tok, _ := claim["token"].(string)
	if tok == "" {
		t.Fatalf("no token: %v", claim)
	}

	// Other holder conflict
	res, err := doReq(http.MethodPost, lockURL, tokenA, map[string]string{"holderId": "tab-b"})
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusConflict {
		t.Fatalf("want 409, got %d", res.StatusCode)
	}

	// Renew
	_ = mustJSON(t, http.MethodPost, lockURL, tokenA, map[string]string{
		"holderId": "tab-a", "token": tok,
	}, http.StatusOK)

	// Other user can claim same project id (own namespace)
	_ = mustJSON(t, http.MethodPost, lockURL, tokenB, map[string]string{
		"holderId": "tab-b",
	}, http.StatusOK)

	backupURL := srv.URL + "/api/projects/" + projectID + "/backup"
	payload := []byte("PK\x03\x04fake-zip-bytes-for-test")
	req, _ := http.NewRequest(http.MethodPut, backupURL, bytes.NewReader(payload))
	req.Header.Set("Authorization", "Bearer "+tokenA)
	req.Header.Set("Content-Type", "application/zip")
	putRes, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := io.ReadAll(putRes.Body)
	putRes.Body.Close()
	if putRes.StatusCode != http.StatusOK {
		t.Fatalf("put backup %d %s", putRes.StatusCode, raw)
	}

	getReq, _ := http.NewRequest(http.MethodGet, backupURL, nil)
	getReq.Header.Set("Authorization", "Bearer "+tokenA)
	getRes, err := http.DefaultClient.Do(getReq)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(getRes.Body)
	getRes.Body.Close()
	if getRes.StatusCode != http.StatusOK {
		t.Fatalf("get backup %d", getRes.StatusCode)
	}
	if !bytes.Equal(got, payload) {
		t.Fatalf("backup mismatch")
	}

	// User B cannot read A's backup
	getReqB, _ := http.NewRequest(http.MethodGet, backupURL, nil)
	getReqB.Header.Set("Authorization", "Bearer "+tokenB)
	getResB, err := http.DefaultClient.Do(getReqB)
	if err != nil {
		t.Fatal(err)
	}
	getResB.Body.Close()
	if getResB.StatusCode != http.StatusNotFound {
		t.Fatalf("want 404 for other user, got %d", getResB.StatusCode)
	}

	_ = mustJSON(t, http.MethodDelete, lockURL, tokenA, map[string]string{
		"holderId": "tab-a", "token": tok,
	}, http.StatusOK)
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
	_ = json.Unmarshal(raw, &out)
	if out.Token == "" {
		t.Fatal("empty token")
	}
	return out.Token
}

func mustJSON(t *testing.T, method, url, token string, body any, want int) map[string]any {
	t.Helper()
	res, err := doReq(method, url, token, body)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode != want {
		t.Fatalf("%s %s => %d %s", method, url, res.StatusCode, raw)
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
