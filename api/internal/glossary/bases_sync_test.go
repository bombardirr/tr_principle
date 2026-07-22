package glossary_test

import (
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

func TestGlossaryBaseCatalogAndOwnerSync(t *testing.T) {
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
	if err := db.Migrate(ctx, pool, filepath.Join("..", "..", "migrations")); err != nil {
		t.Fatal(err)
	}

	authHandler := &auth.Handler{
		Store:   auth.NewStore(pool),
		Tokens:  auth.NewTokenIssuer([]byte("test-secret-key-32bytes-minimum!!"), time.Hour),
		Limiter: auth.NewRateLimiter(100, time.Minute),
	}
	srv := httptest.NewServer(httpapi.NewRouter(
		authHandler,
		&tm.Handler{Store: tm.NewStore(pool)},
		&glossary.Handler{Store: glossary.NewStore(pool)},
		&projects.Handler{Store: projects.NewStore(pool), BackupDir: t.TempDir()},
		&jobs.Handler{Store: jobs.NewStore(pool)},
		"http://localhost",
	))
	t.Cleanup(srv.Close)

	ownerToken := mustAuth(t, srv.URL+"/api/auth/register", map[string]string{
		"email": fmt.Sprintf("glossary_base_owner_%s@example.com", uuid.NewString()), "password": "password1",
	})
	strangerToken := mustAuth(t, srv.URL+"/api/auth/register", map[string]string{
		"email": fmt.Sprintf("glossary_base_stranger_%s@example.com", uuid.NewString()), "password": "password1",
	})

	baseID := "base-" + uuid.NewString()
	create := glossaryRequest(t, http.MethodPost, srv.URL+"/api/glossary/bases", ownerToken, map[string]any{
		"id": baseID, "label": "Legal", "color": "#123456",
	}, http.StatusCreated)
	if create["id"] != baseID {
		t.Fatalf("created base = %v", create)
	}
	catalog := glossaryRequest(t, http.MethodGet, srv.URL+"/api/glossary/bases", ownerToken, nil, http.StatusOK)
	assertGlossaryBase(t, catalog, baseID, "Legal", "#123456")

	now := time.Now().UTC().Format(time.RFC3339Nano)
	termID := uuid.NewString()
	glossaryRequest(t, http.MethodPost, srv.URL+"/api/glossary/bases/"+baseID+"/sync", ownerToken, map[string]any{
		"terms": []map[string]any{glossaryBaseTerm(termID, baseID, now)},
	}, http.StatusOK)
	pull := glossaryRequest(t, http.MethodGet, srv.URL+"/api/glossary/bases/"+baseID+"/sync?since=1970-01-01T00:00:00Z", ownerToken, nil, http.StatusOK)
	terms := pull["terms"].([]any)
	if len(terms) != 1 || terms[0].(map[string]any)["baseId"] != baseID {
		t.Fatalf("pulled terms = %v", pull)
	}

	glossaryRequest(t, http.MethodGet, srv.URL+"/api/glossary/bases/"+baseID+"/sync?since=1970-01-01T00:00:00Z", strangerToken, nil, http.StatusForbidden)
	glossaryRequest(t, http.MethodGet, srv.URL+"/api/glossary/sync?since=1970-01-01T00:00:00Z", ownerToken, nil, http.StatusNotFound)
}

func TestGlossaryJobMemberCannotSyncDeletedBase(t *testing.T) {
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
	if err := db.Migrate(ctx, pool, filepath.Join("..", "..", "migrations")); err != nil {
		t.Fatal(err)
	}

	authHandler := &auth.Handler{
		Store:   auth.NewStore(pool),
		Tokens:  auth.NewTokenIssuer([]byte("test-secret-key-32bytes-minimum!!"), time.Hour),
		Limiter: auth.NewRateLimiter(100, time.Minute),
	}
	srv := httptest.NewServer(httpapi.NewRouter(
		authHandler,
		&tm.Handler{Store: tm.NewStore(pool)},
		&glossary.Handler{Store: glossary.NewStore(pool)},
		&projects.Handler{Store: projects.NewStore(pool), BackupDir: t.TempDir()},
		&jobs.Handler{Store: jobs.NewStore(pool)},
		"http://localhost",
	))
	t.Cleanup(srv.Close)

	ownerEmail := fmt.Sprintf("glossary_deleted_owner_%s@example.com", uuid.NewString())
	memberEmail := fmt.Sprintf("glossary_deleted_member_%s@example.com", uuid.NewString())
	ownerToken := mustAuth(t, srv.URL+"/api/auth/register", map[string]string{
		"email": ownerEmail, "password": "password1",
	})
	memberToken := mustAuth(t, srv.URL+"/api/auth/register", map[string]string{
		"email": memberEmail, "password": "password1",
	})

	jobID := uuid.New()
	glossaryRequest(t, http.MethodPost, srv.URL+"/api/jobs", ownerToken, map[string]any{
		"id": jobID, "title": "Glossary ACL", "sourceLang": "en", "targetLang": "ru",
		"sourceFilename": "manual.docx", "sourceHash": "hash", "localProjectId": uuid.New(),
	}, http.StatusCreated)
	invite := glossaryRequest(t, http.MethodPost, srv.URL+"/api/jobs/"+jobID.String()+"/invites", ownerToken, map[string]any{
		"role": "translator",
	}, http.StatusCreated)
	glossaryRequest(t, http.MethodPost, srv.URL+"/api/job-invites/accept", memberToken, map[string]any{
		"token": invite["token"],
	}, http.StatusOK)

	var ownerID uuid.UUID
	if err := pool.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, ownerEmail).Scan(&ownerID); err != nil {
		t.Fatal(err)
	}
	baseID := "base-" + uuid.NewString()
	glossaryRequest(t, http.MethodPost, srv.URL+"/api/glossary/bases", ownerToken, map[string]any{
		"id": baseID, "label": "Legal", "color": "#123456",
	}, http.StatusCreated)
	if _, err := pool.Exec(ctx, `
		INSERT INTO job_glossary_attachments (job_id, glossary_base_id, created_by)
		VALUES ($1, $2, $3)`, jobID, baseID, ownerID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		UPDATE glossary_bases SET deleted_at = now()
		WHERE owner_id = $1 AND id = $2`, ownerID, baseID); err != nil {
		t.Fatal(err)
	}

	glossaryRequest(t, http.MethodGet,
		srv.URL+"/api/glossary/bases/"+baseID+"/sync?jobId="+jobID.String(),
		memberToken, nil, http.StatusForbidden)
}

func glossaryBaseTerm(id, baseID, timestamp string) map[string]any {
	return map[string]any{
		"id": id, "baseId": baseID, "sourceLang": "en", "targetLang": "ru",
		"sourceTerm": "invoice", "targetTerm": "счёт", "status": "approved",
		"caseSensitive": false, "createdAt": timestamp, "updatedAt": timestamp, "createdBy": "local",
	}
}

func glossaryRequest(t *testing.T, method, url, token string, body any, wantStatus int) map[string]any {
	t.Helper()
	res, err := doReq(method, url, token, body)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	var out map[string]any
	if len(raw) > 0 && json.Unmarshal(raw, &out) != nil {
		t.Fatalf("decode %s %s response: %s", method, url, raw)
	}
	if res.StatusCode != wantStatus {
		t.Fatalf("%s %s => %d, want %d: %v", method, url, res.StatusCode, wantStatus, out)
	}
	return out
}

func assertGlossaryBase(t *testing.T, response map[string]any, id, label, color string) {
	t.Helper()
	for _, raw := range response["bases"].([]any) {
		base := raw.(map[string]any)
		if base["id"] == id {
			if base["label"] != label || base["color"] != color {
				t.Fatalf("base %s = %v", id, base)
			}
			return
		}
	}
	t.Fatalf("base %s missing from %v", id, response)
}
