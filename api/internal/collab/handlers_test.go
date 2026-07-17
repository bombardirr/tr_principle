package collab_test

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
)

func TestProjectInviteMemberFlow(t *testing.T) {
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

	_, _ = pool.Exec(ctx, `DELETE FROM users WHERE email LIKE 'collabhttp_%@example.com'`)
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
		&collab.Handler{Store: collab.NewStore(pool)},
		"http://localhost",
	))
	t.Cleanup(srv.Close)

	suffix := time.Now().Format("150405.000000000")
	ownerToken := collabAuth(t, srv.URL, fmt.Sprintf("collabhttp_owner_%s@example.com", suffix))
	memberToken := collabAuth(t, srv.URL, fmt.Sprintf("collabhttp_member_%s@example.com", suffix))

	project := collabJSON(t, http.MethodPost, srv.URL+"/api/projects", ownerToken, map[string]any{
		"name":       "Shared project",
		"sourceLang": "en",
		"targetLang": "ru",
		"meta":       map[string]any{"domain": "legal"},
	}, http.StatusCreated)
	projectID, _ := project["id"].(string)
	if projectID == "" {
		t.Fatalf("project response=%v", project)
	}

	inviteResponse := collabJSON(t, http.MethodPost, srv.URL+"/api/projects/"+projectID+"/invites", ownerToken, map[string]any{
		"role":    "editor",
		"maxUses": 1,
	}, http.StatusCreated)
	token, _ := inviteResponse["token"].(string)
	if token == "" {
		t.Fatalf("invite response=%v", inviteResponse)
	}

	accepted := collabJSON(t, http.MethodPost, srv.URL+"/api/invites/accept", memberToken, map[string]string{
		"token": token,
	}, http.StatusOK)
	if accepted["projectId"] != projectID || accepted["role"] != "editor" {
		t.Fatalf("accepted=%v", accepted)
	}

	members := collabJSON(t, http.MethodGet, srv.URL+"/api/projects/"+projectID+"/members", ownerToken, nil, http.StatusOK)
	items, ok := members["members"].([]any)
	if !ok || len(items) != 2 {
		t.Fatalf("members=%v", members)
	}
	for _, item := range items {
		member, ok := item.(map[string]any)
		if !ok || member["userId"] == "" || member["role"] == "" {
			t.Fatalf("invalid member=%v", item)
		}
		if _, hasEmail := member["email"]; hasEmail {
			t.Fatalf("member leaked email=%v", member)
		}
	}
}

func collabAuth(t *testing.T, baseURL, email string) string {
	t.Helper()
	response := collabJSON(t, http.MethodPost, baseURL+"/api/auth/register", "", map[string]string{
		"email": email, "password": "password1",
	}, http.StatusOK)
	token, _ := response["token"].(string)
	if token == "" {
		t.Fatalf("auth response=%v", response)
	}
	return token
}

func collabJSON(t *testing.T, method, url, token string, body any, wantStatus int) map[string]any {
	t.Helper()
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(raw)
	}
	request, err := http.NewRequest(method, url, reader)
	if err != nil {
		t.Fatal(err)
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != wantStatus {
		t.Fatalf("%s %s => %d %s", method, url, response.StatusCode, raw)
	}
	var result map[string]any
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatalf("invalid JSON %s: %v", raw, err)
	}
	return result
}
