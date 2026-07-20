package jobs_test

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

func TestHTTPCreateInviteAcceptAndListMembers(t *testing.T) {
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

	created := requestJSON(t, http.MethodPost, srv.URL+"/api/jobs", ownerToken, map[string]any{
		"id":             jobID,
		"title":          "Shared manual",
		"sourceLang":     "en",
		"targetLang":     "ru",
		"sourceFilename": "manual.docx",
		"sourceHash":     "abc123",
		"localProjectId": uuid.New(),
	}, http.StatusCreated)
	if created["id"] != jobID.String() {
		t.Fatalf("created job id = %v, want %s", created["id"], jobID)
	}

	invite := requestJSON(t, http.MethodPost, srv.URL+"/api/jobs/"+jobID.String()+"/invites", ownerToken, map[string]any{
		"role":    "translator",
		"maxUses": 1,
	}, http.StatusCreated)
	rawToken, _ := invite["token"].(string)
	if rawToken == "" {
		t.Fatalf("create invite returned no token: %v", invite)
	}

	accepted := requestJSON(t, http.MethodPost, srv.URL+"/api/job-invites/accept", memberToken, map[string]any{
		"token":          rawToken,
		"localProjectId": uuid.New(),
	}, http.StatusOK)
	if accepted["jobId"] != jobID.String() || accepted["role"] != "translator" {
		t.Fatalf("accepted invite = %v", accepted)
	}

	membersRaw := requestRaw(t, http.MethodGet, srv.URL+"/api/jobs/"+jobID.String()+"/members", ownerToken, nil, http.StatusOK)
	if bytes.Contains(bytes.ToLower(membersRaw), []byte(`"email"`)) {
		t.Fatalf("member response leaked email: %s", membersRaw)
	}
	var members []struct {
		UserID      uuid.UUID `json:"userId"`
		DisplayName string    `json:"displayName"`
		Role        jobs.Role `json:"role"`
	}
	if err := json.Unmarshal(membersRaw, &members); err != nil {
		t.Fatalf("decode members: %v: %s", err, membersRaw)
	}
	if len(members) != 2 {
		t.Fatalf("members count = %d, want 2: %s", len(members), membersRaw)
	}
	gotNames := map[string]jobs.Role{}
	for _, member := range members {
		gotNames[member.DisplayName] = member.Role
	}
	if gotNames["Owner"] != jobs.RoleOwner || gotNames["Translator"] != jobs.RoleTranslator {
		t.Fatalf("member names and roles = %v", gotNames)
	}

	var ownerID, memberID uuid.UUID
	for _, member := range members {
		if member.Role == jobs.RoleOwner {
			ownerID = member.UserID
		} else {
			memberID = member.UserID
		}
	}

	jobsRaw := requestRaw(t, http.MethodGet, srv.URL+"/api/jobs", ownerToken, nil, http.StatusOK)
	var listedJobs []jobs.Job
	if err := json.Unmarshal(jobsRaw, &listedJobs); err != nil || len(listedJobs) != 1 {
		t.Fatalf("list jobs = %s, error = %v", jobsRaw, err)
	}
	requestJSON(t, http.MethodGet, srv.URL+"/api/jobs/"+jobID.String(), ownerToken, nil, http.StatusOK)
	updated := requestJSON(t, http.MethodPatch, srv.URL+"/api/jobs/"+jobID.String(), ownerToken, map[string]any{
		"title": "Updated manual",
	}, http.StatusOK)
	if updated["title"] != "Updated manual" {
		t.Fatalf("updated job = %v", updated)
	}

	patchedMember := requestJSON(t, http.MethodPatch, srv.URL+"/api/jobs/"+jobID.String()+"/members/me", memberToken, map[string]any{
		"partDone":      true,
		"progressDone":  3,
		"progressTotal": 5,
	}, http.StatusOK)
	if patchedMember["partDone"] != true || patchedMember["progressDone"] != float64(3) {
		t.Fatalf("patched member = %v", patchedMember)
	}

	invitesRaw := requestRaw(t, http.MethodGet, srv.URL+"/api/jobs/"+jobID.String()+"/invites", ownerToken, nil, http.StatusOK)
	var invites []jobs.Invite
	if err := json.Unmarshal(invitesRaw, &invites); err != nil || len(invites) != 1 {
		t.Fatalf("list invites = %s, error = %v", invitesRaw, err)
	}
	requestRaw(
		t,
		http.MethodPost,
		srv.URL+"/api/jobs/"+jobID.String()+"/invites/"+invites[0].ID.String()+"/revoke",
		ownerToken,
		nil,
		http.StatusNoContent,
	)

	transferred := requestJSON(t, http.MethodPost, srv.URL+"/api/jobs/"+jobID.String()+"/transfer", ownerToken, map[string]any{
		"userId": memberID,
	}, http.StatusOK)
	if transferred["ownerUserId"] != memberID.String() {
		t.Fatalf("transferred job = %v", transferred)
	}
	requestRaw(
		t,
		http.MethodDelete,
		srv.URL+"/api/jobs/"+jobID.String()+"/members/"+ownerID.String(),
		memberToken,
		nil,
		http.StatusNoContent,
	)
}

func TestHTTPDeleteJobOwnerOnly(t *testing.T) {
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
		"id":    jobID,
		"title": "To delete",
	}, http.StatusCreated)

	invite := requestJSON(t, http.MethodPost, srv.URL+"/api/jobs/"+jobID.String()+"/invites", ownerToken, map[string]any{
		"role": "translator",
	}, http.StatusCreated)
	rawToken, _ := invite["token"].(string)
	requestJSON(t, http.MethodPost, srv.URL+"/api/job-invites/accept", memberToken, map[string]any{
		"token": rawToken,
	}, http.StatusOK)

	requestRaw(t, http.MethodDelete, srv.URL+"/api/jobs/"+jobID.String(), memberToken, nil, http.StatusNotFound)
	requestRaw(t, http.MethodDelete, srv.URL+"/api/jobs/"+jobID.String(), ownerToken, nil, http.StatusNoContent)
	requestRaw(t, http.MethodGet, srv.URL+"/api/jobs/"+jobID.String(), ownerToken, nil, http.StatusNotFound)
}

func registerHTTPUser(t *testing.T, baseURL, displayName string) string {
	t.Helper()
	email := fmt.Sprintf("jobs_http_%s@example.com", uuid.NewString())
	authResponse := requestJSON(t, http.MethodPost, baseURL+"/api/auth/register", "", map[string]string{
		"email": email, "password": "password1",
	}, http.StatusOK)
	token, _ := authResponse["token"].(string)
	if token == "" {
		t.Fatalf("register returned no token: %v", authResponse)
	}
	requestJSON(t, http.MethodPatch, baseURL+"/api/auth/me", token, map[string]string{
		"display_name": displayName,
	}, http.StatusOK)
	return token
}

func requestJSON(t *testing.T, method, url, token string, body any, wantStatus int) map[string]any {
	t.Helper()
	raw := requestRaw(t, method, url, token, body, wantStatus)
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode response: %v: %s", err, raw)
	}
	return out
}

func requestRaw(t *testing.T, method, url, token string, body any, wantStatus int) []byte {
	t.Helper()
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, url, reader)
	if err != nil {
		t.Fatal(err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode != wantStatus {
		t.Fatalf("%s %s => %d, want %d: %s", method, url, res.StatusCode, wantStatus, raw)
	}
	return raw
}
