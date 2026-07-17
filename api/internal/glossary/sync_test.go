package glossary_test

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
	"github.com/bombardirr/tr_principle/api/internal/collab"
	"github.com/bombardirr/tr_principle/api/internal/db"
	"github.com/bombardirr/tr_principle/api/internal/glossary"
	"github.com/bombardirr/tr_principle/api/internal/httpapi"
	"github.com/bombardirr/tr_principle/api/internal/projects"
	"github.com/bombardirr/tr_principle/api/internal/tm"
	"github.com/google/uuid"
)

func TestGlossarySyncFlow(t *testing.T) {
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

	_, _ = pool.Exec(ctx, `DELETE FROM users WHERE email LIKE 'glostest_%@example.com'`)

	tokens := auth.NewTokenIssuer([]byte("test-secret-key-32bytes-minimum!!"), time.Hour)
	authHandler := &auth.Handler{
		Store:   auth.NewStore(pool),
		Tokens:  tokens,
		Limiter: auth.NewRateLimiter(100, time.Minute),
	}
	srv := httptest.NewServer(httpapi.NewRouter(
		authHandler,
		&tm.Handler{Store: tm.NewStore(pool)},
		&glossary.Handler{Store: glossary.NewStore(pool)},
		&projects.Handler{Store: projects.NewStore(pool), BackupDir: t.TempDir()},
		&collab.Handler{Store: collab.NewStore(pool)},
		"http://localhost",
	))
	t.Cleanup(srv.Close)

	emailA := fmt.Sprintf("glostest_a_%s@example.com", time.Now().Format("150405.000000000"))
	emailB := fmt.Sprintf("glostest_b_%s@example.com", time.Now().Format("150405.000000000"))
	tokenA := mustAuth(t, srv.URL+"/api/auth/register", map[string]string{
		"email": emailA, "password": "password1",
	})
	tokenB := mustAuth(t, srv.URL+"/api/auth/register", map[string]string{
		"email": emailB, "password": "password1",
	})

	termID := uuid.NewString()
	now := time.Now().UTC()
	older := now.Add(-time.Minute).Format(time.RFC3339Nano)
	newer := now.Format(time.RFC3339Nano)
	term := map[string]any{
		"id":            termID,
		"sourceLang":    "en",
		"targetLang":    "ru",
		"sourceTerm":    "invoice",
		"targetTerm":    "счёт",
		"status":        "approved",
		"caseSensitive": false,
		"createdAt":     older,
		"updatedAt":     older,
		"createdBy":     "local",
	}

	mustPush(t, srv.URL+"/api/glossary/sync", tokenA, []map[string]any{term})

	pull := mustPull(t, srv.URL+"/api/glossary/sync?since=1970-01-01T00:00:00Z", tokenA)
	terms, _ := pull["terms"].([]any)
	if len(terms) != 1 {
		t.Fatalf("pull terms=%v", pull)
	}

	stale := map[string]any{}
	for k, v := range term {
		stale[k] = v
	}
	stale["targetTerm"] = "WRONG"
	stale["updatedAt"] = older
	mustPush(t, srv.URL+"/api/glossary/sync", tokenA, []map[string]any{stale})
	pull = mustPull(t, srv.URL+"/api/glossary/sync?since=1970-01-01T00:00:00Z", tokenA)
	got := pull["terms"].([]any)[0].(map[string]any)
	if got["targetTerm"] != "счёт" {
		t.Fatalf("LWW failed: %v", got)
	}

	fresh := map[string]any{}
	for k, v := range term {
		fresh[k] = v
	}
	fresh["targetTerm"] = "инвойс"
	fresh["updatedAt"] = newer
	mustPush(t, srv.URL+"/api/glossary/sync", tokenA, []map[string]any{fresh})
	pull = mustPull(t, srv.URL+"/api/glossary/sync?since=1970-01-01T00:00:00Z", tokenA)
	got = pull["terms"].([]any)[0].(map[string]any)
	if got["targetTerm"] != "инвойс" {
		t.Fatalf("newer LWW failed: %v", got)
	}

	tomb := map[string]any{}
	for k, v := range fresh {
		tomb[k] = v
	}
	delAt := now.Add(time.Second).Format(time.RFC3339Nano)
	tomb["deletedAt"] = delAt
	tomb["updatedAt"] = delAt
	mustPush(t, srv.URL+"/api/glossary/sync", tokenA, []map[string]any{tomb})
	pull = mustPull(t, srv.URL+"/api/glossary/sync?since=1970-01-01T00:00:00Z", tokenA)
	got = pull["terms"].([]any)[0].(map[string]any)
	if got["deletedAt"] == nil {
		t.Fatalf("expected tombstone: %v", got)
	}

	pullB := mustPull(t, srv.URL+"/api/glossary/sync?since=1970-01-01T00:00:00Z", tokenB)
	termsB, _ := pullB["terms"].([]any)
	if len(termsB) != 0 {
		t.Fatalf("user B should see 0 terms, got %v", pullB)
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

func mustPush(t *testing.T, url, token string, terms []map[string]any) {
	t.Helper()
	res, err := doReq(http.MethodPost, url, token, map[string]any{"terms": terms})
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("push => %d %s", res.StatusCode, raw)
	}
}

func mustPull(t *testing.T, url, token string) map[string]any {
	t.Helper()
	res, err := doReq(http.MethodGet, url, token, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("pull => %d %s", res.StatusCode, raw)
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("parse: %s", raw)
	}
	return out
}

func doReq(method, url, token string, body any) (*http.Response, error) {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, url, rdr)
	if err != nil {
		return nil, err
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return http.DefaultClient.Do(req)
}
