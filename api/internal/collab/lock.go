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
	var existing struct {
		UserID    uuid.UUID
		HolderID  string
		Token     string
		ExpiresAt time.Time
	}
	err := s.pool.QueryRow(ctx, `
		SELECT holder_user_id, holder_id, token, expires_at
		FROM shared_project_locks WHERE project_id = $1
	`, projectID).Scan(&existing.UserID, &existing.HolderID, &existing.Token, &existing.ExpiresAt)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return SharedLock{}, err
	}
	if err == nil && existing.ExpiresAt.After(now) {
		if existing.UserID != userID || existing.HolderID != holderID {
			return SharedLock{HolderID: existing.HolderID, ExpiresAt: existing.ExpiresAt}, ErrSharedLockHeld
		}
		if token != "" && token != existing.Token {
			return SharedLock{}, ErrSharedInvalidToken
		}
		token = existing.Token
	} else {
		token = uuid.NewString()
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO shared_project_locks (project_id, holder_user_id, holder_id, token, expires_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (project_id) DO UPDATE SET
			holder_user_id = EXCLUDED.holder_user_id,
			holder_id = EXCLUDED.holder_id,
			token = EXCLUDED.token,
			expires_at = EXCLUDED.expires_at
	`, projectID, userID, holderID, token, expires)
	if err != nil {
		return SharedLock{}, err
	}
	return SharedLock{HolderID: holderID, Token: token, ExpiresAt: expires}, nil
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
