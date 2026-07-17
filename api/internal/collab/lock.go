package collab

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const SharedLockTTL = 30 * time.Second

var (
	ErrSharedLockHeld     = errors.New("lock held by another holder")
	ErrSharedLockNotHeld  = errors.New("lock not held")
	ErrSharedInvalidToken = errors.New("invalid lock token")
)

type SharedLock struct {
	HolderID  string
	Token     string
	ExpiresAt time.Time
}

func (s *Store) ClaimSharedLock(ctx context.Context, userID, projectID uuid.UUID, holderID, token string, now time.Time) (SharedLock, error) {
	if holderID == "" {
		return SharedLock{}, errors.New("holderId required")
	}
	expires := now.Add(SharedLockTTL)
	newToken := uuid.NewString()
	var lock SharedLock
	err := s.pool.QueryRow(ctx, `
		INSERT INTO shared_project_locks (project_id, holder_user_id, holder_id, token, expires_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (project_id) DO UPDATE SET
			holder_user_id = EXCLUDED.holder_user_id,
			holder_id = EXCLUDED.holder_id,
			token = CASE
				WHEN shared_project_locks.expires_at <= $6 THEN EXCLUDED.token
				WHEN $7 = '' THEN shared_project_locks.token
				ELSE $7
			END,
			expires_at = EXCLUDED.expires_at
		WHERE shared_project_locks.expires_at <= $6
			OR (
				shared_project_locks.holder_user_id = $2
				AND shared_project_locks.holder_id = $3
				AND ($7 = '' OR shared_project_locks.token = $7)
			)
		RETURNING holder_id, token, expires_at
	`, projectID, userID, holderID, newToken, expires, now, token).Scan(
		&lock.HolderID, &lock.Token, &lock.ExpiresAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return SharedLock{}, ErrSharedLockHeld
	}
	if err != nil {
		return SharedLock{}, err
	}
	return lock, nil
}

func (s *Store) ReleaseSharedLock(ctx context.Context, userID, projectID uuid.UUID, holderID, token string) error {
	tag, err := s.pool.Exec(ctx, `
		DELETE FROM shared_project_locks
		WHERE project_id = $1 AND holder_user_id = $2 AND holder_id = $3 AND token = $4
	`, projectID, userID, holderID, token)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrSharedLockNotHeld
	}
	return nil
}

func (s *Store) HoldsSharedLock(ctx context.Context, userID, projectID uuid.UUID, holderID, token string, now time.Time) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM shared_project_locks
			WHERE project_id = $1 AND holder_user_id = $2 AND holder_id = $3
				AND token = $4 AND expires_at > $5
		)
	`, projectID, userID, holderID, token, now).Scan(&exists)
	return exists, err
}
