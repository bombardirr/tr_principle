package jobs_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
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

func TestJobOriginalShare(t *testing.T) {
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
	backupDir := t.TempDir()
	srv := httptest.NewServer(httpapi.NewRouter(
		authHandler,
		&tm.Handler{Store: tm.NewStore(pool)},
		&glossary.Handler{Store: glossary.NewStore(pool)},
		&projects.Handler{Store: projects.NewStore(pool), BackupDir: t.TempDir()},
		&jobs.Handler{Store: jobs.NewStore(pool), BackupDir: backupDir},
		"http://localhost",
	))
	t.Cleanup(srv.Close)

	ownerToken := registerHTTPUser(t, srv.URL, "Owner")
	translatorToken := registerHTTPUser(t, srv.URL, "Translator")
	viewerToken := registerHTTPUser(t, srv.URL, "Viewer")
	nonMemberToken := registerHTTPUser(t, srv.URL, "Non-member")
	payload := []byte("original DOCX payload")
	sum := sha256.Sum256(payload)
	hash := hex.EncodeToString(sum[:])
	jobID := uuid.New()

	requestJSON(t, http.MethodPost, srv.URL+"/api/jobs", ownerToken, map[string]any{
		"id":             jobID,
		"title":          "Shared manual",
		"sourceFilename": "source.docx",
		"sourceHash":     hash,
	}, http.StatusCreated)

	putOriginal(t, srv.URL, jobID, ownerToken, payload, "manual.docx", http.StatusOK)
	job := requestJSON(t, http.MethodGet, srv.URL+"/api/jobs/"+jobID.String(), ownerToken, nil, http.StatusOK)
	if job["hasOriginal"] != true {
		t.Fatalf("hasOriginal = %v, want true", job["hasOriginal"])
	}

	wrongPayload := []byte("wrong payload")
	if raw := putOriginal(t, srv.URL, jobID, ownerToken, wrongPayload, "manual.docx", http.StatusBadRequest); !bytes.Contains(raw, []byte("original hash mismatch")) {
		t.Fatalf("wrong hash response = %s", raw)
	}

	acceptInviteForRole(t, srv.URL, jobID, ownerToken, translatorToken, "translator")
	acceptInviteForRole(t, srv.URL, jobID, ownerToken, viewerToken, "viewer")

	for _, token := range []string{translatorToken, viewerToken} {
		raw := getOriginal(t, srv.URL, jobID, token, http.StatusOK)
		if !bytes.Equal(raw, payload) {
			t.Fatalf("downloaded payload = %q, want %q", raw, payload)
		}
	}
	getOriginal(t, srv.URL, jobID, nonMemberToken, http.StatusForbidden)
	putOriginal(t, srv.URL, jobID, translatorToken, payload, "manual.docx", http.StatusForbidden)

	requestRaw(t, http.MethodDelete, srv.URL+"/api/jobs/"+jobID.String()+"/original", ownerToken, nil, http.StatusNoContent)
	getOriginal(t, srv.URL, jobID, ownerToken, http.StatusNotFound)
	job = requestJSON(t, http.MethodGet, srv.URL+"/api/jobs/"+jobID.String(), ownerToken, nil, http.StatusOK)
	if job["hasOriginal"] != false {
		t.Fatalf("hasOriginal = %v, want false", job["hasOriginal"])
	}
	requestRaw(t, http.MethodDelete, srv.URL+"/api/jobs/"+jobID.String()+"/original", ownerToken, nil, http.StatusNoContent)
}

func acceptInviteForRole(t *testing.T, baseURL string, jobID uuid.UUID, ownerToken, memberToken, role string) {
	t.Helper()
	invite := requestJSON(t, http.MethodPost, baseURL+"/api/jobs/"+jobID.String()+"/invites", ownerToken, map[string]any{
		"role": role,
	}, http.StatusCreated)
	token, _ := invite["token"].(string)
	if token == "" {
		t.Fatalf("create %s invite returned no token: %v", role, invite)
	}
	requestJSON(t, http.MethodPost, baseURL+"/api/job-invites/accept", memberToken, map[string]string{
		"token": token,
	}, http.StatusOK)
}

func putOriginal(t *testing.T, baseURL string, jobID uuid.UUID, token string, body []byte, filename string, wantStatus int) []byte {
	t.Helper()
	req, err := http.NewRequest(http.MethodPut, baseURL+"/api/jobs/"+jobID.String()+"/original", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("X-Filename", filename)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode != wantStatus {
		t.Fatalf("PUT original => %d, want %d: %s", res.StatusCode, wantStatus, raw)
	}
	return raw
}

func getOriginal(t *testing.T, baseURL string, jobID uuid.UUID, token string, wantStatus int) []byte {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, baseURL+"/api/jobs/"+jobID.String()+"/original", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode != wantStatus {
		t.Fatalf("GET original => %d, want %d: %s", res.StatusCode, wantStatus, raw)
	}
	return raw
}
