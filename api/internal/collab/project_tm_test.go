package collab_test

import (
	"context"
	"fmt"
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
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestProjectTmExportRequiresAttachmentPermission(t *testing.T) {
	pool, srv := projectTmServer(t)
	suffix := time.Now().Format("150405.000000000")
	ownerToken := collabAuth(t, srv.URL, fmt.Sprintf("projecttm_owner_%s@example.com", suffix))
	viewerToken := collabAuth(t, srv.URL, fmt.Sprintf("projecttm_viewer_%s@example.com", suffix))
	projectID := createProjectTmTestProject(t, srv.URL, ownerToken)

	invite := collabJSON(t, http.MethodPost, srv.URL+"/api/projects/"+projectID+"/invites", ownerToken,
		map[string]any{"role": "viewer"}, http.StatusCreated)
	collabJSON(t, http.MethodPost, srv.URL+"/api/invites/accept", viewerToken,
		map[string]any{"token": invite["token"]}, http.StatusOK)

	var attachmentID string
	if err := pool.QueryRow(context.Background(), `
		UPDATE project_tm_attachments
		SET can_export = false
		WHERE project_id = $1 AND kind = 'project'
		RETURNING id
	`, uuid.MustParse(projectID)).Scan(&attachmentID); err != nil {
		t.Fatal(err)
	}

	collabJSON(t, http.MethodPost,
		srv.URL+"/api/projects/"+projectID+"/tm-attachments/"+attachmentID+"/export",
		viewerToken, nil, http.StatusForbidden)
}

func TestProjectTmPullRespectsProjectAttachmentReadPermission(t *testing.T) {
	pool, srv := projectTmServer(t)
	suffix := time.Now().Format("150405.000000000")
	ownerToken := collabAuth(t, srv.URL, fmt.Sprintf("projecttm_pull_%s@example.com", suffix))
	projectID := createProjectTmTestProject(t, srv.URL, ownerToken)
	projectUUID := uuid.MustParse(projectID)
	now := time.Now().UTC()

	if _, err := pool.Exec(context.Background(), `
		INSERT INTO project_tm_units (
			id, project_id, source, target, source_key, source_lang, target_lang,
			created_at, updated_at
		) VALUES ($1, $2, 'Hello', 'Привет', 'hello::en|ru', 'en', 'ru', $3, $3)
	`, uuid.New(), projectUUID, now); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(), `
		UPDATE project_tm_attachments SET can_read = false
		WHERE project_id = $1 AND kind = 'project'
	`, projectUUID); err != nil {
		t.Fatal(err)
	}

	pulled := collabJSON(t, http.MethodGet,
		srv.URL+"/api/projects/"+projectID+"/tm/sync?since=1970-01-01T00:00:00Z",
		ownerToken, nil, http.StatusOK)
	units, ok := pulled["units"].([]any)
	if !ok || len(units) != 0 {
		t.Fatalf("pull should exclude project units when project attachment is unreadable: %v", pulled)
	}
}

func TestProjectTmPushOverwritesEmailAttributionWithAuthenticatedActor(t *testing.T) {
	pool, srv := projectTmServer(t)
	suffix := time.Now().Format("150405.000000000")
	email := fmt.Sprintf("projecttm_push_%s@example.com", suffix)
	ownerToken := collabAuth(t, srv.URL, email)
	projectID := createProjectTmTestProject(t, srv.URL, ownerToken)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	unitID := uuid.New()

	collabJSON(t, http.MethodPost, srv.URL+"/api/projects/"+projectID+"/tm/sync", ownerToken, map[string]any{
		"units": []map[string]any{{
			"id": unitID.String(), "source": "Hello", "target": "Привет", "sourceKey": "hello::en|ru",
			"sourceLang": "en", "targetLang": "ru", "createdAt": now, "updatedAt": now,
			"createdBy": "a@b.com", "updatedBy": "a@b.com",
		}},
	}, http.StatusOK)

	var userID uuid.UUID
	if err := pool.QueryRow(context.Background(), `SELECT id FROM users WHERE email = $1`, email).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	var createdBy, updatedBy *string
	if err := pool.QueryRow(context.Background(), `
		SELECT created_by, updated_by FROM project_tm_units WHERE id = $1
	`, unitID).Scan(&createdBy, &updatedBy); err != nil {
		t.Fatal(err)
	}
	expected := "anon:" + userID.String()
	if createdBy == nil || updatedBy == nil || *createdBy != expected || *updatedBy != expected {
		t.Fatalf("expected safe server attribution %q, got createdBy=%v updatedBy=%v", expected, createdBy, updatedBy)
	}
}

func TestProjectTmCloneCopiesUnitsWithNewUUIDs(t *testing.T) {
	pool, srv := projectTmServer(t)
	suffix := time.Now().Format("150405.000000000")
	ownerToken := collabAuth(t, srv.URL, fmt.Sprintf("projecttm_clone_%s@example.com", suffix))
	projectID := createProjectTmTestProject(t, srv.URL, ownerToken)
	projectUUID := uuid.MustParse(projectID)
	originalID := uuid.New()
	now := time.Now().UTC()

	if _, err := pool.Exec(context.Background(), `
		INSERT INTO project_tm_units (
			id, project_id, source, target, source_key, source_lang, target_lang,
			created_at, updated_at, created_by, updated_by
		) VALUES ($1, $2, 'Hello', 'Привет', 'hello::en|ru', 'en', 'ru', $3, $3, 'Owner', 'Editor')
	`, originalID, projectUUID, now); err != nil {
		t.Fatal(err)
	}
	var attachmentID string
	if err := pool.QueryRow(context.Background(), `
		SELECT id FROM project_tm_attachments WHERE project_id = $1 AND kind = 'project'
	`, projectUUID).Scan(&attachmentID); err != nil {
		t.Fatal(err)
	}

	cloned := collabJSON(t, http.MethodPost,
		srv.URL+"/api/projects/"+projectID+"/tm-attachments/"+attachmentID+"/clone",
		ownerToken, nil, http.StatusOK)
	units, ok := cloned["units"].([]any)
	if !ok || len(units) != 1 {
		t.Fatalf("clone=%v", cloned)
	}
	unit, ok := units[0].(map[string]any)
	if !ok {
		t.Fatalf("clone unit=%v", units[0])
	}
	newID, _ := unit["id"].(string)
	if newID == "" || newID == originalID.String() {
		t.Fatalf("clone id=%q original=%q", newID, originalID)
	}
	if unit["createdBy"] != "Owner" || unit["updatedBy"] != "Editor" {
		t.Fatalf("clone did not preserve attribution: %v", unit)
	}
	var copies int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM tm_units WHERE id = $1`, uuid.MustParse(newID)).Scan(&copies); err != nil {
		t.Fatal(err)
	}
	if copies != 1 {
		t.Fatalf("expected cloned personal TM row, copies=%d", copies)
	}
}

func projectTmServer(t *testing.T) (*pgxpool.Pool, *httptest.Server) {
	t.Helper()
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
	srv := httptest.NewServer(httpapi.NewRouter(authHandler, &tm.Handler{Store: tm.NewStore(pool)},
		&glossary.Handler{Store: glossary.NewStore(pool)},
		&projects.Handler{Store: projects.NewStore(pool), BackupDir: t.TempDir()},
		&collab.Handler{Store: collab.NewStore(pool)}, "http://localhost"))
	t.Cleanup(srv.Close)
	return pool, srv
}

func createProjectTmTestProject(t *testing.T, url, token string) string {
	t.Helper()
	project := collabJSON(t, http.MethodPost, url+"/api/projects", token, map[string]any{
		"name": "Project TM", "sourceLang": "en", "targetLang": "ru",
	}, http.StatusCreated)
	projectID, _ := project["id"].(string)
	if projectID == "" {
		t.Fatalf("project=%v", project)
	}
	return projectID
}
