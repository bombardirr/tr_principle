package jobs_test

import (
	"context"
	"encoding/json"
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

func TestHTTPJobTMAttachmentsCRUDAndACL(t *testing.T) {
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
	memberToken := registerHTTPUser(t, srv.URL, "Translator")
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

	base := srv.URL + "/api/jobs/" + jobID.String() + "/tm-attachments"
	list := requestJSON(t, http.MethodGet, base, memberToken, nil, http.StatusOK)
	if len(list["attachments"].([]any)) != 0 {
		t.Fatalf("want empty list, got %v", list)
	}

	assertHTTPError(t, requestRaw(t, http.MethodPost, base, memberToken, map[string]any{
		"tmBaseId": "personal-tm",
	}, http.StatusNotFound), "job not found")

	requestRaw(t, http.MethodPost, base, ownerToken, map[string]any{
		"tmBaseId": "",
	}, http.StatusBadRequest)
	list = requestJSON(t, http.MethodGet, base, ownerToken, nil, http.StatusOK)
	if len(list["attachments"].([]any)) != 0 {
		t.Fatalf("EnsureBase failure created an attachment: %v", list)
	}

	created := requestJSON(t, http.MethodPost, base, ownerToken, map[string]any{
		"tmBaseId": "personal-tm",
		"canRead":  true,
		"canWrite": true,
	}, http.StatusCreated)
	if created["tmBaseId"] != "personal-tm" || created["canExport"] != false {
		t.Fatalf("created = %v", created)
	}
	attachmentID := created["id"].(string)

	assertHTTPError(t, requestRaw(t, http.MethodPost, base, ownerToken, map[string]any{
		"tmBaseId": "personal-tm",
	}, http.StatusConflict), "attachment already exists")

	list = requestJSON(t, http.MethodGet, base, memberToken, nil, http.StatusOK)
	if len(list["attachments"].([]any)) != 1 {
		t.Fatalf("list = %v", list)
	}

	patched := requestJSON(t, http.MethodPatch, base+"/"+attachmentID, ownerToken, map[string]any{
		"canWrite": false,
	}, http.StatusOK)
	if patched["canWrite"] != false || patched["canRead"] != true {
		t.Fatalf("patched = %v", patched)
	}

	assertHTTPError(t, requestRaw(t, http.MethodDelete, base+"/"+attachmentID, memberToken, nil, http.StatusNotFound), "job not found")
	requestRaw(t, http.MethodDelete, base+"/"+attachmentID, ownerToken, nil, http.StatusNoContent)

	list = requestJSON(t, http.MethodGet, base, ownerToken, nil, http.StatusOK)
	if len(list["attachments"].([]any)) != 0 {
		t.Fatalf("after delete = %v", list)
	}
}

func assertHTTPError(t *testing.T, raw []byte, want string) {
	t.Helper()
	var body struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatalf("decode error response: %v: %s", err, raw)
	}
	if body.Error != want {
		t.Fatalf("error = %q, want %q", body.Error, want)
	}
}
