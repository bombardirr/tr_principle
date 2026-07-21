package tm_test

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
	"github.com/bombardirr/tr_principle/api/internal/glossary"
	"github.com/bombardirr/tr_principle/api/internal/httpapi"
	"github.com/bombardirr/tr_principle/api/internal/jobs"
	"github.com/bombardirr/tr_principle/api/internal/projects"
	"github.com/bombardirr/tr_principle/api/internal/tm"
	"github.com/google/uuid"
)

func TestTmSyncFlow(t *testing.T) {
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

	_, _ = pool.Exec(ctx, `DELETE FROM users WHERE email LIKE 'tmtest_%@example.com'`)

	tokens := auth.NewTokenIssuer([]byte("test-secret-key-32bytes-minimum!!"), time.Hour)
	authHandler := &auth.Handler{
		Store:   auth.NewStore(pool),
		Tokens:  tokens,
		Limiter: auth.NewRateLimiter(100, time.Minute),
	}
	tmHandler := &tm.Handler{Store: tm.NewStore(pool)}
	glossaryHandler := &glossary.Handler{Store: glossary.NewStore(pool)}
	srv := httptest.NewServer(httpapi.NewRouter(authHandler, tmHandler, glossaryHandler, &projects.Handler{
		Store:     projects.NewStore(pool),
		BackupDir: t.TempDir(),
	}, &jobs.Handler{Store: jobs.NewStore(pool)}, "http://localhost"))
	t.Cleanup(srv.Close)

	emailA := fmt.Sprintf("tmtest_a_%s@example.com", time.Now().Format("150405.000000000"))
	emailB := fmt.Sprintf("tmtest_b_%s@example.com", time.Now().Format("150405.000000000"))
	tokenA := mustAuth(t, srv.URL+"/api/auth/register", map[string]string{
		"email": emailA, "password": "password1",
	})
	tokenB := mustAuth(t, srv.URL+"/api/auth/register", map[string]string{
		"email": emailB, "password": "password1",
	})

	unitID := uuid.NewString()
	now := time.Now().UTC()
	older := now.Add(-time.Minute).Format(time.RFC3339Nano)
	newer := now.Format(time.RFC3339Nano)
	unit := map[string]any{
		"id":         unitID,
		"source":     "Hello",
		"target":     "Привет",
		"sourceKey":  "hello::en|ru",
		"sourceLang": "en",
		"targetLang": "ru",
		"createdAt":  older,
		"updatedAt":  older,
		"createdBy":  "local",
		"updatedBy":  "local",
	}

	mustPush(t, srv.URL+"/api/tm/sync", tokenA, []map[string]any{unit})

	pull := mustPull(t, srv.URL+"/api/tm/sync?since=1970-01-01T00:00:00Z", tokenA)
	units, _ := pull["units"].([]any)
	if len(units) != 1 {
		t.Fatalf("pull units=%v", pull)
	}

	// Older update must not overwrite
	stale := map[string]any{}
	for k, v := range unit {
		stale[k] = v
	}
	stale["target"] = "WRONG"
	stale["updatedAt"] = older
	mustPush(t, srv.URL+"/api/tm/sync", tokenA, []map[string]any{stale})
	pull = mustPull(t, srv.URL+"/api/tm/sync?since=1970-01-01T00:00:00Z", tokenA)
	got := pull["units"].([]any)[0].(map[string]any)
	if got["target"] != "Привет" {
		t.Fatalf("LWW failed: %v", got)
	}

	// Newer update wins
	fresh := map[string]any{}
	for k, v := range unit {
		fresh[k] = v
	}
	fresh["target"] = "Здравствуйте"
	fresh["updatedAt"] = newer
	mustPush(t, srv.URL+"/api/tm/sync", tokenA, []map[string]any{fresh})
	pull = mustPull(t, srv.URL+"/api/tm/sync?since=1970-01-01T00:00:00Z", tokenA)
	got = pull["units"].([]any)[0].(map[string]any)
	if got["target"] != "Здравствуйте" {
		t.Fatalf("newer LWW failed: %v", got)
	}

	// Tombstone
	tomb := map[string]any{}
	for k, v := range fresh {
		tomb[k] = v
	}
	delAt := now.Add(time.Second).Format(time.RFC3339Nano)
	tomb["deletedAt"] = delAt
	tomb["updatedAt"] = delAt
	mustPush(t, srv.URL+"/api/tm/sync", tokenA, []map[string]any{tomb})
	pull = mustPull(t, srv.URL+"/api/tm/sync?since=1970-01-01T00:00:00Z", tokenA)
	got = pull["units"].([]any)[0].(map[string]any)
	if got["deletedAt"] == nil {
		t.Fatalf("expected tombstone: %v", got)
	}

	// Other user sees nothing
	pullB := mustPull(t, srv.URL+"/api/tm/sync?since=1970-01-01T00:00:00Z", tokenB)
	unitsB, _ := pullB["units"].([]any)
	if len(unitsB) != 0 {
		t.Fatalf("user B should see 0 units, got %v", pullB)
	}
}

func TestTmSyncBaseID(t *testing.T) {
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

	_, _ = pool.Exec(ctx, `DELETE FROM users WHERE email LIKE 'tmtest_base_%@example.com'`)

	tokens := auth.NewTokenIssuer([]byte("test-secret-key-32bytes-minimum!!"), time.Hour)
	authHandler := &auth.Handler{
		Store:   auth.NewStore(pool),
		Tokens:  tokens,
		Limiter: auth.NewRateLimiter(100, time.Minute),
	}
	tmHandler := &tm.Handler{Store: tm.NewStore(pool)}
	glossaryHandler := &glossary.Handler{Store: glossary.NewStore(pool)}
	srv := httptest.NewServer(httpapi.NewRouter(authHandler, tmHandler, glossaryHandler, &projects.Handler{
		Store:     projects.NewStore(pool),
		BackupDir: t.TempDir(),
	}, &jobs.Handler{Store: jobs.NewStore(pool)}, "http://localhost"))
	t.Cleanup(srv.Close)

	email := fmt.Sprintf("tmtest_base_%s@example.com", time.Now().Format("150405.000000000"))
	token := mustAuth(t, srv.URL+"/api/auth/register", map[string]string{
		"email": email, "password": "password1",
	})

	now := time.Now().UTC().Format(time.RFC3339Nano)

	// Push without baseId defaults to personal-tm
	defaultID := uuid.NewString()
	mustPush(t, srv.URL+"/api/tm/sync", token, []map[string]any{
		{
			"id":         defaultID,
			"source":     "Hi",
			"target":     "Привет",
			"sourceKey":  "hi::en|ru",
			"sourceLang": "en",
			"targetLang": "ru",
			"createdAt":  now,
			"updatedAt":  now,
		},
	})
	pull := mustPull(t, srv.URL+"/api/tm/sync?since=1970-01-01T00:00:00Z", token)
	units := pull["units"].([]any)
	var gotDefault map[string]any
	for _, u := range units {
		m := u.(map[string]any)
		if m["id"] == defaultID {
			gotDefault = m
			break
		}
	}
	if gotDefault == nil {
		t.Fatalf("expected unit %s in pull: %v", defaultID, pull)
	}
	if gotDefault["baseId"] != "personal-tm" {
		t.Fatalf("expected baseId personal-tm, got %v", gotDefault["baseId"])
	}

	// Push with explicit baseId
	namedID := uuid.NewString()
	mustPush(t, srv.URL+"/api/tm/sync", token, []map[string]any{
		{
			"id":         namedID,
			"baseId":     "named-1",
			"source":     "Bye",
			"target":     "Пока",
			"sourceKey":  "bye::en|ru",
			"sourceLang": "en",
			"targetLang": "ru",
			"createdAt":  now,
			"updatedAt":  now,
		},
	})
	pull = mustPull(t, srv.URL+"/api/tm/sync?since=1970-01-01T00:00:00Z", token)
	units = pull["units"].([]any)
	var gotNamed map[string]any
	for _, u := range units {
		m := u.(map[string]any)
		if m["id"] == namedID {
			gotNamed = m
			break
		}
	}
	if gotNamed == nil {
		t.Fatalf("expected unit %s in pull: %v", namedID, pull)
	}
	if gotNamed["baseId"] != "named-1" {
		t.Fatalf("expected baseId named-1, got %v", gotNamed["baseId"])
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

func mustPush(t *testing.T, url, token string, units []map[string]any) {
	t.Helper()
	res, err := doReq(http.MethodPost, url, token, map[string]any{"units": units})
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
