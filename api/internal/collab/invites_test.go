package collab_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/bombardirr/tr_principle/api/internal/auth"
	"github.com/bombardirr/tr_principle/api/internal/collab"
	"github.com/bombardirr/tr_principle/api/internal/db"
	"github.com/google/uuid"
)

func TestAcceptInviteBurnsAfterOneUse(t *testing.T) {
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

	authStore := auth.NewStore(pool)
	suffix := uuid.NewString()
	owner := createUser(t, authStore, fmt.Sprintf("collab-owner-%s@example.com", suffix))
	userB := createUser(t, authStore, fmt.Sprintf("collab-b-%s@example.com", suffix))
	userC := createUser(t, authStore, fmt.Sprintf("collab-c-%s@example.com", suffix))

	store := collab.NewStore(pool)
	project, err := store.CreateProject(ctx, owner, uuid.New(), "Project", [2]string{"en", "ru"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	rawToken, _, err := store.CreateInvite(ctx, project.ID, owner, collab.RoleEditor, nil, ptr(1), nil)
	if err != nil {
		t.Fatal(err)
	}

	projectID, role, err := store.AcceptInvite(ctx, rawToken, userB)
	if err != nil {
		t.Fatal(err)
	}
	if projectID != project.ID || role != collab.RoleEditor {
		t.Fatalf("accepted invite = (%s, %q), want (%s, %q)", projectID, role, project.ID, collab.RoleEditor)
	}

	if _, _, err := store.AcceptInvite(ctx, rawToken, userC); err == nil {
		t.Fatal("second invite acceptance succeeded; want max uses error")
	}
}

func createUser(t *testing.T, store *auth.Store, email string) uuid.UUID {
	t.Helper()
	user, err := store.CreateUser(context.Background(), email, "test-hash")
	if err != nil {
		t.Fatal(err)
	}
	return user.ID
}

func ptr[T any](v T) *T {
	return &v
}
