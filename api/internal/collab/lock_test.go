package collab_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/bombardirr/tr_principle/api/internal/auth"
	"github.com/bombardirr/tr_principle/api/internal/collab"
	"github.com/bombardirr/tr_principle/api/internal/db"
	"github.com/google/uuid"
)

func TestClaimSharedLockAtomicallyExcludesConcurrentClaims(t *testing.T) {
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
	userOne := createUser(t, authStore, fmt.Sprintf("lock-one-%s@example.com", suffix))
	userTwo := createUser(t, authStore, fmt.Sprintf("lock-two-%s@example.com", suffix))
	store := collab.NewStore(pool)
	project, err := store.CreateProject(ctx, userOne, uuid.New(), "Project", [2]string{"en", "ru"}, nil)
	if err != nil {
		t.Fatal(err)
	}

	_, err = pool.Exec(ctx, `
		CREATE OR REPLACE FUNCTION test_shared_lock_claim_delay() RETURNS trigger AS $$
		BEGIN
			IF NEW.project_id = '`+project.ID.String()+`' THEN
				PERFORM pg_sleep(0.1);
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql;
		CREATE TRIGGER test_shared_lock_claim_delay
		BEFORE INSERT ON shared_project_locks
		FOR EACH ROW EXECUTE FUNCTION test_shared_lock_claim_delay();
	`)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `
			DROP TRIGGER IF EXISTS test_shared_lock_claim_delay ON shared_project_locks;
			DROP FUNCTION IF EXISTS test_shared_lock_claim_delay();
		`)
	})

	type result struct {
		userID   uuid.UUID
		holderID string
		lock     collab.SharedLock
		err      error
	}
	start := make(chan struct{})
	results := make(chan result, 2)
	var claims sync.WaitGroup
	now := time.Now().UTC()
	for _, claimant := range []struct {
		userID   uuid.UUID
		holderID string
	}{
		{userOne, "tab-one"},
		{userTwo, "tab-two"},
	} {
		claims.Add(1)
		go func(userID uuid.UUID, holderID string) {
			defer claims.Done()
			<-start
			lock, err := store.ClaimSharedLock(ctx, userID, project.ID, holderID, "", now)
			results <- result{userID: userID, holderID: holderID, lock: lock, err: err}
		}(claimant.userID, claimant.holderID)
	}
	close(start)
	claims.Wait()
	close(results)

	var winner result
	successes := 0
	for outcome := range results {
		if outcome.err == nil {
			successes++
			winner = outcome
			continue
		}
		if !errors.Is(outcome.err, collab.ErrSharedLockHeld) {
			t.Fatalf("claim error = %v, want ErrSharedLockHeld", outcome.err)
		}
	}
	if successes != 1 {
		t.Fatalf("successful concurrent claims = %d, want 1", successes)
	}

	renewed, err := store.ClaimSharedLock(ctx, winner.userID, project.ID, winner.holderID, winner.lock.Token, now.Add(time.Second))
	if err != nil {
		t.Fatalf("renew shared lock: %v", err)
	}
	if renewed.Token != winner.lock.Token {
		t.Fatalf("renewed token = %q, want %q", renewed.Token, winner.lock.Token)
	}
}
