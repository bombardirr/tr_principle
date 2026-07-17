package jobs_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
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

func TestHTTPJobTMSyncACLAndAttribution(t *testing.T) {
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

	ownerToken := registerHTTPUser(t, srv.URL, "Owner")
	memberToken, memberEmail := registerHTTPUserWithoutName(t, srv.URL)
	jobID := uuid.New()
	requestJSON(t, http.MethodPost, srv.URL+"/api/jobs", ownerToken, map[string]any{
		"id":             jobID,
		"title":          "Shared TM",
		"sourceLang":     "en",
		"targetLang":     "ru",
		"sourceFilename": "manual.docx",
		"sourceHash":     "hash",
		"localProjectId": uuid.New(),
	}, http.StatusCreated)
	invite := requestJSON(t, http.MethodPost, srv.URL+"/api/jobs/"+jobID.String()+"/invites", ownerToken, map[string]any{
		"role": "translator",
	}, http.StatusCreated)
	requestJSON(t, http.MethodPost, srv.URL+"/api/job-invites/accept", memberToken, map[string]any{
		"token": invite["token"],
	}, http.StatusOK)

	// job_tm is not auto-seeded; insert preset so ACL/sync paths can be exercised.
	if _, err := pool.Exec(ctx, `
		INSERT INTO job_resource_presets (job_id, kind, can_read, can_write, can_export, can_clone)
		VALUES ($1, 'job_tm', true, true, false, false)
	`, jobID); err != nil {
		t.Fatal(err)
	}

	resources := requestJSON(t, http.MethodGet, srv.URL+"/api/jobs/"+jobID.String()+"/resources", memberToken, nil, http.StatusOK)
	resource := resources["resources"].([]any)[0].(map[string]any)
	if resource["kind"] != "job_tm" || resource["canRead"] != true || resource["canWrite"] != true {
		t.Fatalf("default translator resource = %v", resource)
	}
	if resource["canExport"] != false || resource["canClone"] != false {
		t.Fatalf("translator export/clone defaults = %v", resource)
	}

	requestJSON(t, http.MethodPatch, srv.URL+"/api/jobs/"+jobID.String()+"/resources/me", memberToken, map[string]any{
		"kind":     "job_tm",
		"canRead":  false,
		"canWrite": false,
	}, http.StatusOK)
	requestRaw(t, http.MethodGet, srv.URL+"/api/jobs/"+jobID.String()+"/tm/sync?since=1970-01-01T00:00:00Z", memberToken, nil, http.StatusForbidden)

	now := time.Now().UTC()
	unit := map[string]any{
		"id":         uuid.NewString(),
		"source":     "Hello",
		"target":     "Привет",
		"sourceKey":  "hello::en|ru",
		"sourceLang": "en",
		"targetLang": "ru",
		"createdAt":  now.Format(time.RFC3339Nano),
		"updatedAt":  now.Format(time.RFC3339Nano),
		"createdBy":  memberEmail,
		"updatedBy":  memberEmail,
	}
	requestRaw(t, http.MethodPost, srv.URL+"/api/jobs/"+jobID.String()+"/tm/sync", memberToken, map[string]any{
		"units": []map[string]any{unit},
	}, http.StatusForbidden)

	requestJSON(t, http.MethodPatch, srv.URL+"/api/jobs/"+jobID.String()+"/resources/preset", ownerToken, map[string]any{
		"kind":     "job_tm",
		"canRead":  false,
		"canWrite": false,
	}, http.StatusOK)
	requestJSON(t, http.MethodPatch, srv.URL+"/api/jobs/"+jobID.String()+"/resources/me", memberToken, map[string]any{
		"kind":     "job_tm",
		"canRead":  true,
		"canWrite": true,
	}, http.StatusOK)
	requestJSON(t, http.MethodPost, srv.URL+"/api/jobs/"+jobID.String()+"/tm/sync", memberToken, map[string]any{
		"units": []map[string]any{unit},
	}, http.StatusOK)

	raw := requestRaw(t, http.MethodGet, srv.URL+"/api/jobs/"+jobID.String()+"/tm/sync?since=1970-01-01T00:00:00Z", ownerToken, nil, http.StatusOK)
	if bytes.Contains(bytes.ToLower(raw), []byte(strings.ToLower(memberEmail))) || bytes.Contains(raw, []byte("@")) {
		t.Fatalf("TM attribution leaked email: %s", raw)
	}
	var pull struct {
		Units []struct {
			CreatedBy string `json:"createdBy"`
			UpdatedBy string `json:"updatedBy"`
		} `json:"units"`
	}
	if err := json.Unmarshal(raw, &pull); err != nil || len(pull.Units) != 1 {
		t.Fatalf("decode pull: %v: %s", err, raw)
	}
	if !strings.HasPrefix(pull.Units[0].CreatedBy, "anon:") ||
		pull.Units[0].CreatedBy != pull.Units[0].UpdatedBy {
		t.Fatalf("unexpected anonymous attribution: %+v", pull.Units[0])
	}
}

func registerHTTPUserWithoutName(t *testing.T, baseURL string) (string, string) {
	t.Helper()
	email := fmt.Sprintf("jobs_tm_%s@example.com", uuid.NewString())
	response := requestJSON(t, http.MethodPost, baseURL+"/api/auth/register", "", map[string]string{
		"email": email, "password": "password1",
	}, http.StatusOK)
	token, _ := response["token"].(string)
	if token == "" {
		t.Fatalf("register returned no token: %v", response)
	}
	return token, email
}
