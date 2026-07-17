package jobs_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/bombardirr/tr_principle/api/internal/db"
	"github.com/bombardirr/tr_principle/api/internal/jobs"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestInviteMaxUsesOneBurnsAfterAcceptance(t *testing.T) {
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

	ownerID := createUser(t, ctx, pool)
	firstUserID := createUser(t, ctx, pool)
	secondUserID := createUser(t, ctx, pool)
	store := jobs.NewStore(pool)
	jobID := uuid.New()

	if _, err := store.CreateJob(
		ctx,
		ownerID,
		jobID,
		"Burn test",
		jobs.Langs{Source: "en", Target: "ru"},
		"source.docx",
		"abc123",
		uuid.New(),
	); err != nil {
		t.Fatal(err)
	}

	maxUses := 1
	rawToken, invite, err := store.CreateInvite(
		ctx,
		jobID,
		ownerID,
		jobs.RoleTranslator,
		nil,
		&maxUses,
	)
	if err != nil {
		t.Fatal(err)
	}
	var storedHash string
	if err := pool.QueryRow(ctx, `
		SELECT token_hash FROM job_invites WHERE id = $1
	`, invite.ID).Scan(&storedHash); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256([]byte(rawToken))
	if storedHash != hex.EncodeToString(sum[:]) || storedHash == rawToken {
		t.Fatalf("stored token hash = %q, want sha256 hex distinct from raw token", storedHash)
	}

	acceptedJobID, role, err := store.AcceptInvite(ctx, rawToken, firstUserID, nil)
	if err != nil {
		t.Fatal(err)
	}
	if acceptedJobID != jobID || role != jobs.RoleTranslator {
		t.Fatalf("accepted invite = (%s, %q), want (%s, %q)", acceptedJobID, role, jobID, jobs.RoleTranslator)
	}

	_, _, err = store.AcceptInvite(ctx, rawToken, secondUserID, nil)
	if !errors.Is(err, jobs.ErrInviteExhausted) {
		t.Fatalf("second acceptance error = %v, want %v", err, jobs.ErrInviteExhausted)
	}
}

func TestCreateJobStoresFingerprintAndOwnerMembership(t *testing.T) {
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

	ownerID := createUser(t, ctx, pool)
	store := jobs.NewStore(pool)
	jobID := uuid.New()
	localProjectID := uuid.New()

	job, err := store.CreateJob(
		ctx,
		ownerID,
		jobID,
		"Fingerprint test",
		jobs.Langs{Source: "en", Target: "de"},
		"manual.docx",
		"feedface",
		localProjectID,
	)
	if err != nil {
		t.Fatal(err)
	}
	if job.SourceFilename != "manual.docx" || job.SourceHash != "feedface" {
		t.Fatalf("job fingerprint = (%q, %q)", job.SourceFilename, job.SourceHash)
	}

	role, err := store.RoleOf(ctx, jobID, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	if role != jobs.RoleOwner {
		t.Fatalf("owner role = %q, want %q", role, jobs.RoleOwner)
	}
	isOwner, err := store.IsOwner(ctx, jobID, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	if !isOwner {
		t.Fatal("creator is not reported as owner")
	}

	var storedLocalProjectID *uuid.UUID
	if err := pool.QueryRow(ctx, `
		SELECT local_project_id
		FROM job_members
		WHERE job_id = $1 AND user_id = $2
	`, jobID, ownerID).Scan(&storedLocalProjectID); err != nil {
		t.Fatal(err)
	}
	if storedLocalProjectID == nil || *storedLocalProjectID != localProjectID {
		t.Fatalf("local project id = %v, want %s", storedLocalProjectID, localProjectID)
	}
}

func createUser(t *testing.T, ctx context.Context, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()

	var userID uuid.UUID
	email := fmt.Sprintf("jobs_%s_%d@example.com", uuid.NewString(), time.Now().UnixNano())
	if err := pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash)
		VALUES ($1, 'not-used')
		RETURNING id
	`, email).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, userID)
	})
	return userID
}
