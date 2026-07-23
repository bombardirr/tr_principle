package tm_test

import (
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
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestTMBaseCatalogAndSharedSync(t *testing.T) {
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

	tmStore := tm.NewStore(pool)
	authHandler := &auth.Handler{
		Store:   auth.NewStore(pool),
		Tokens:  auth.NewTokenIssuer([]byte("test-secret-key-32bytes-minimum!!"), time.Hour),
		Limiter: auth.NewRateLimiter(100, time.Minute),
	}
	srv := httptest.NewServer(httpapi.NewRouter(
		authHandler,
		&tm.Handler{Store: tmStore},
		&glossary.Handler{Store: glossary.NewStore(pool)},
		&projects.Handler{Store: projects.NewStore(pool), BackupDir: t.TempDir()},
		&jobs.Handler{Store: jobs.NewStore(pool), TM: tmStore},
		"http://localhost",
		"",
	))
	t.Cleanup(srv.Close)

	ownerToken := mustAuth(t, srv.URL+"/api/auth/register", map[string]string{
		"email":    fmt.Sprintf("tm_base_owner_%s@example.com", uuid.NewString()),
		"password": "password1",
	})
	memberToken := mustAuth(t, srv.URL+"/api/auth/register", map[string]string{
		"email":    fmt.Sprintf("tm_base_member_%s@example.com", uuid.NewString()),
		"password": "password1",
	})
	strangerToken := mustAuth(t, srv.URL+"/api/auth/register", map[string]string{
		"email":    fmt.Sprintf("tm_base_stranger_%s@example.com", uuid.NewString()),
		"password": "password1",
	})

	baseID := "base-" + uuid.NewString()
	requestTMJSON(t, http.MethodPost, srv.URL+"/api/tm/bases", ownerToken, map[string]any{
		"id": baseID, "label": "Legal", "color": "#123456",
	}, http.StatusCreated)
	catalog := requestTMJSON(t, http.MethodGet, srv.URL+"/api/tm/bases", ownerToken, nil, http.StatusOK)
	assertCatalogBase(t, catalog, baseID, "Legal", "#123456")

	requestTMJSON(t, http.MethodPatch, srv.URL+"/api/tm/bases/"+baseID, ownerToken, map[string]any{
		"label": "Legal updated",
	}, http.StatusOK)
	catalog = requestTMJSON(t, http.MethodGet, srv.URL+"/api/tm/bases", ownerToken, nil, http.StatusOK)
	assertCatalogBase(t, catalog, baseID, "Legal updated", "#123456")

	now := time.Now().UTC().Format(time.RFC3339Nano)
	ownerUnitID := uuid.NewString()
	requestTMJSON(t, http.MethodPost, srv.URL+"/api/tm/bases/"+baseID+"/sync", ownerToken, map[string]any{
		"units": []map[string]any{testUnit(ownerUnitID, baseID, now, "Owner target")},
	}, http.StatusOK)
	pull := requestTMJSON(t, http.MethodGet, srv.URL+"/api/tm/bases/"+baseID+"/sync?since=1970-01-01T00:00:00Z", ownerToken, nil, http.StatusOK)
	assertPulledUnit(t, pull, ownerUnitID, baseID)

	jobID := uuid.New()
	requestTMJSON(t, http.MethodPost, srv.URL+"/api/jobs", ownerToken, map[string]any{
		"id": jobID, "title": "Shared TM", "sourceLang": "en", "targetLang": "ru",
		"sourceFilename": "manual.docx", "sourceHash": "hash", "localProjectId": uuid.New(),
	}, http.StatusCreated)
	invite := requestTMJSON(t, http.MethodPost, srv.URL+"/api/jobs/"+jobID.String()+"/invites", ownerToken, map[string]any{
		"role": "translator",
	}, http.StatusCreated)
	requestTMJSON(t, http.MethodPost, srv.URL+"/api/job-invites/accept", memberToken, map[string]any{
		"token": invite["token"],
	}, http.StatusOK)

	attachment := requestTMJSON(t, http.MethodPost, srv.URL+"/api/jobs/"+jobID.String()+"/tm-attachments", ownerToken, map[string]any{
		"tmBaseId": baseID, "label": "Legal shared", "color": "#654321", "canRead": true, "canWrite": false,
	}, http.StatusCreated)
	if attachment["label"] != "Legal updated" || attachment["color"] != "#123456" {
		t.Fatalf("attachment catalog metadata = %v", attachment)
	}
	attachmentID := attachment["id"].(string)

	sharedURL := srv.URL + "/api/tm/bases/" + baseID + "/sync?jobId=" + jobID.String()
	requestTMJSON(t, http.MethodPost, srv.URL+"/api/tm/bases", memberToken, map[string]any{
		"id": baseID, "label": "Member's local base", "color": "#aabbcc",
	}, http.StatusCreated)
	pull = requestTMJSON(t, http.MethodGet, sharedURL+"&since=1970-01-01T00:00:00Z", memberToken, nil, http.StatusOK)
	assertPulledUnit(t, pull, ownerUnitID, baseID)
	requestTMJSON(t, http.MethodPost, sharedURL, memberToken, map[string]any{
		"units": []map[string]any{testUnit(uuid.NewString(), baseID, now, "Denied")},
	}, http.StatusForbidden)

	requestTMJSON(t, http.MethodPatch, srv.URL+"/api/jobs/"+jobID.String()+"/tm-attachments/"+attachmentID, ownerToken, map[string]any{
		"canWrite": true,
	}, http.StatusOK)
	memberUnitID := uuid.NewString()
	requestTMJSON(t, http.MethodPost, sharedURL, memberToken, map[string]any{
		"units": []map[string]any{testUnit(memberUnitID, baseID, now, "Member target")},
	}, http.StatusOK)
	assertUnitOwnedByJobOwner(t, pool, memberUnitID, jobID)

	requestTMJSON(t, http.MethodGet, sharedURL+"&since=1970-01-01T00:00:00Z", strangerToken, nil, http.StatusForbidden)

	promotedID := "promoted-" + uuid.NewString()
	promoted := requestTMJSON(t, http.MethodPost, srv.URL+"/api/jobs/"+jobID.String()+"/tm-attachments", ownerToken, map[string]any{
		"tmBaseId": promotedID, "label": "Promoted base", "color": "#abcdef",
	}, http.StatusCreated)
	if promoted["label"] != "Promoted base" || promoted["color"] != "#abcdef" {
		t.Fatalf("promoted attachment metadata = %v", promoted)
	}
	catalog = requestTMJSON(t, http.MethodGet, srv.URL+"/api/tm/bases", ownerToken, nil, http.StatusOK)
	assertCatalogBase(t, catalog, promotedID, "Promoted base", "#abcdef")

	secondOwnerToken := mustAuth(t, srv.URL+"/api/auth/register", map[string]string{
		"email":    fmt.Sprintf("tm_base_owner2_%s@example.com", uuid.NewString()),
		"password": "password1",
	})
	secondJobID := uuid.New()
	requestTMJSON(t, http.MethodPost, srv.URL+"/api/jobs", secondOwnerToken, map[string]any{
		"id": secondJobID, "title": "Second shared TM", "sourceLang": "en", "targetLang": "ru",
		"sourceFilename": "second.docx", "sourceHash": "hash-2", "localProjectId": uuid.New(),
	}, http.StatusCreated)
	secondInvite := requestTMJSON(t, http.MethodPost, srv.URL+"/api/jobs/"+secondJobID.String()+"/invites", secondOwnerToken, map[string]any{
		"role": "translator",
	}, http.StatusCreated)
	requestTMJSON(t, http.MethodPost, srv.URL+"/api/job-invites/accept", memberToken, map[string]any{
		"token": secondInvite["token"],
	}, http.StatusOK)
	requestTMJSON(t, http.MethodPost, srv.URL+"/api/jobs/"+secondJobID.String()+"/tm-attachments", secondOwnerToken, map[string]any{
		"tmBaseId": baseID, "label": "Other owner's base", "canRead": true,
	}, http.StatusCreated)
	requestTMJSON(t, http.MethodGet, srv.URL+"/api/tm/bases/"+baseID+"/sync?since=1970-01-01T00:00:00Z", memberToken, nil, http.StatusBadRequest)

	requestTMJSON(t, http.MethodPost, srv.URL+"/api/jobs/"+jobID.String()+"/tm-attachments", ownerToken, map[string]any{
		"tmBaseId": "personal-tm", "label": "Personal TM",
	}, http.StatusCreated)
	requestTMJSON(t, http.MethodGet, srv.URL+"/api/tm/bases/personal-tm/sync?since=1970-01-01T00:00:00Z", memberToken, nil, http.StatusBadRequest)

	requestTMJSON(t, http.MethodDelete, srv.URL+"/api/tm/bases/"+promotedID, ownerToken, nil, http.StatusNoContent)
	catalog = requestTMJSON(t, http.MethodGet, srv.URL+"/api/tm/bases", ownerToken, nil, http.StatusOK)
	assertCatalogMissing(t, catalog, promotedID)

	revivedID := "revived-" + uuid.NewString()
	requestTMJSON(t, http.MethodPost, srv.URL+"/api/tm/bases", ownerToken, map[string]any{
		"id": revivedID, "label": "Original", "color": "#111111",
	}, http.StatusCreated)
	requestTMJSON(t, http.MethodDelete, srv.URL+"/api/tm/bases/"+revivedID, ownerToken, nil, http.StatusNoContent)
	catalog = requestTMJSON(t, http.MethodGet, srv.URL+"/api/tm/bases", ownerToken, nil, http.StatusOK)
	assertCatalogMissing(t, catalog, revivedID)
	requestTMJSON(t, http.MethodPost, srv.URL+"/api/jobs/"+jobID.String()+"/tm-attachments", ownerToken, map[string]any{
		"tmBaseId": revivedID, "label": "Revived label", "color": "#222222",
	}, http.StatusCreated)
	catalog = requestTMJSON(t, http.MethodGet, srv.URL+"/api/tm/bases", ownerToken, nil, http.StatusOK)
	assertCatalogBase(t, catalog, revivedID, "Revived label", "#222222")

	trimmedID := "  trimmed-" + uuid.NewString() + "  "
	created := requestTMJSON(t, http.MethodPost, srv.URL+"/api/tm/bases", ownerToken, map[string]any{
		"id": trimmedID, "label": "Trimmed", "color": "#333333",
	}, http.StatusCreated)
	if created["id"] != strings.TrimSpace(trimmedID) {
		t.Fatalf("CreateBase id = %q, want trimmed %q", created["id"], strings.TrimSpace(trimmedID))
	}

	requestTMJSON(t, http.MethodDelete, srv.URL+"/api/tm/bases/personal-tm", ownerToken, nil, http.StatusBadRequest)
}

func testUnit(id, baseID, timestamp, target string) map[string]any {
	return map[string]any{
		"id": id, "baseId": baseID, "source": "Hello", "target": target,
		"sourceKey": id + "::en|ru", "sourceLang": "en", "targetLang": "ru",
		"createdAt": timestamp, "updatedAt": timestamp, "updatedBy": "member",
	}
}

func requestTMJSON(t *testing.T, method, url, token string, body any, wantStatus int) map[string]any {
	t.Helper()
	res, err := doReq(method, url, token, body)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var out map[string]any
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil && res.StatusCode != http.StatusNoContent {
		t.Fatalf("decode %s %s response: %v", method, url, err)
	}
	if res.StatusCode != wantStatus {
		t.Fatalf("%s %s => %d, want %d: %v", method, url, res.StatusCode, wantStatus, out)
	}
	return out
}

func assertCatalogBase(t *testing.T, response map[string]any, id, label, color string) {
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

func assertCatalogMissing(t *testing.T, response map[string]any, id string) {
	t.Helper()
	for _, raw := range response["bases"].([]any) {
		if raw.(map[string]any)["id"] == id {
			t.Fatalf("base %s unexpectedly present in %v", id, response)
		}
	}
}

func assertPulledUnit(t *testing.T, response map[string]any, id, baseID string) {
	t.Helper()
	for _, raw := range response["units"].([]any) {
		unit := raw.(map[string]any)
		if unit["id"] == id {
			if unit["baseId"] != baseID {
				t.Fatalf("unit baseId = %v, want %s", unit["baseId"], baseID)
			}
			return
		}
	}
	t.Fatalf("unit %s missing from %v", id, response)
}

func assertUnitOwnedByJobOwner(t *testing.T, pool *pgxpool.Pool, unitID string, jobID uuid.UUID) {
	t.Helper()
	var owned bool
	if err := pool.QueryRow(context.Background(), `
		SELECT u.user_id = j.owner_user_id
		FROM tm_units u
		JOIN jobs j ON j.id = $2
		WHERE u.id = $1
	`, unitID, jobID).Scan(&owned); err != nil {
		t.Fatal(err)
	}
	if !owned {
		t.Fatalf("unit %s was not stored under job owner", unitID)
	}
}
