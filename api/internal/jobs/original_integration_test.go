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
		"",
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
	headOriginal(t, srv.URL, jobID, ownerToken, http.StatusOK)

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
	requestRaw(t, http.MethodDelete, srv.URL+"/api/jobs/"+jobID.String()+"/members/me", translatorToken, nil, http.StatusNoContent)
	getOriginal(t, srv.URL, jobID, ownerToken, http.StatusOK)

	requestRaw(t, http.MethodDelete, srv.URL+"/api/jobs/"+jobID.String()+"/original", ownerToken, nil, http.StatusNoContent)
	getOriginal(t, srv.URL, jobID, ownerToken, http.StatusNotFound)
	job = requestJSON(t, http.MethodGet, srv.URL+"/api/jobs/"+jobID.String(), ownerToken, nil, http.StatusOK)
	if job["hasOriginal"] != false {
		t.Fatalf("hasOriginal = %v, want false", job["hasOriginal"])
	}
	requestRaw(t, http.MethodDelete, srv.URL+"/api/jobs/"+jobID.String()+"/original", ownerToken, nil, http.StatusNoContent)
	requestJSON(t, http.MethodPost, srv.URL+"/api/jobs/"+jobID.String()+"/archive", ownerToken, nil, http.StatusOK)
	archivedDelete := requestRaw(t, http.MethodDelete, srv.URL+"/api/jobs/"+jobID.String()+"/original", ownerToken, nil, http.StatusBadRequest)
	if !bytes.Contains(archivedDelete, []byte("job archived")) {
		t.Fatalf("archived delete response = %s", archivedDelete)
	}

	deleteJobID := uuid.New()
	requestJSON(t, http.MethodPost, srv.URL+"/api/jobs", ownerToken, map[string]any{
		"id":             deleteJobID,
		"title":          "Delete original",
		"sourceFilename": "source.docx",
		"sourceHash":     hash,
	}, http.StatusCreated)
	putOriginal(t, srv.URL, deleteJobID, ownerToken, payload, "manual.docx", http.StatusOK)
	originalPath := filepath.Join(backupDir, "job-originals", deleteJobID.String()+".docx")
	if _, err := os.Stat(originalPath); err != nil {
		t.Fatalf("original file before job delete: %v", err)
	}
	requestRaw(t, http.MethodDelete, srv.URL+"/api/jobs/"+deleteJobID.String(), ownerToken, nil, http.StatusNoContent)
	if _, err := os.Stat(originalPath); !os.IsNotExist(err) {
		t.Fatalf("original file after job delete: err = %v, want not exist", err)
	}

	revokeOriginalID := uuid.New()
	requestJSON(t, http.MethodPost, srv.URL+"/api/jobs", ownerToken, map[string]any{
		"id":             revokeOriginalID,
		"title":          "Revoke changed original",
		"sourceFilename": "source.docx",
		"sourceHash":     hash,
	}, http.StatusCreated)
	putOriginal(t, srv.URL, revokeOriginalID, ownerToken, payload, "manual.docx", http.StatusOK)
	revokePath := filepath.Join(backupDir, "job-originals", revokeOriginalID.String()+".docx")

	sameHash := requestJSON(t, http.MethodPatch, srv.URL+"/api/jobs/"+revokeOriginalID.String(), ownerToken, map[string]any{
		"sourceHash": hash,
	}, http.StatusOK)
	if sameHash["hasOriginal"] != true {
		t.Fatalf("same source hash hasOriginal = %v, want true", sameHash["hasOriginal"])
	}
	headOriginal(t, srv.URL, revokeOriginalID, ownerToken, http.StatusOK)

	noHash := requestJSON(t, http.MethodPatch, srv.URL+"/api/jobs/"+revokeOriginalID.String(), ownerToken, map[string]any{
		"title": "Original unchanged",
	}, http.StatusOK)
	if noHash["hasOriginal"] != true {
		t.Fatalf("missing source hash hasOriginal = %v, want true", noHash["hasOriginal"])
	}
	headOriginal(t, srv.URL, revokeOriginalID, ownerToken, http.StatusOK)

	updatedPayload := []byte("updated DOCX payload")
	updatedSum := sha256.Sum256(updatedPayload)
	updatedHash := hex.EncodeToString(updatedSum[:])
	changedHash := requestJSON(t, http.MethodPatch, srv.URL+"/api/jobs/"+revokeOriginalID.String(), ownerToken, map[string]any{
		"sourceHash": updatedHash,
	}, http.StatusOK)
	if changedHash["hasOriginal"] != false {
		t.Fatalf("changed source hash hasOriginal = %v, want false", changedHash["hasOriginal"])
	}
	getOriginal(t, srv.URL, revokeOriginalID, ownerToken, http.StatusNotFound)
	if _, err := os.Stat(revokePath); !os.IsNotExist(err) {
		t.Fatalf("original file after source hash change: err = %v, want not exist", err)
	}
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

func headOriginal(t *testing.T, baseURL string, jobID uuid.UUID, token string, wantStatus int) {
	t.Helper()
	req, err := http.NewRequest(http.MethodHead, baseURL+"/api/jobs/"+jobID.String()+"/original", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != wantStatus {
		t.Fatalf("HEAD original => %d, want %d", res.StatusCode, wantStatus)
	}
}
