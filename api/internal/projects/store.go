package projects

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const LockTTL = 30 * time.Second

var (
	ErrLockHeld     = errors.New("lock held by another holder")
	ErrLockNotHeld  = errors.New("lock not held")
	ErrInvalidToken = errors.New("invalid lock token")
)

type Lock struct {
	HolderID  string
	Token     string
	ExpiresAt time.Time
}

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func (s *Store) ClaimLock(ctx context.Context, userID, projectID uuid.UUID, holderID, token string, now time.Time) (Lock, error) {
	if holderID == "" {
		return Lock{}, errors.New("holderId required")
	}
	expires := now.Add(LockTTL)

	var existing HolderRow
	err := s.pool.QueryRow(ctx, `
		SELECT holder_id, token, expires_at FROM project_locks
		WHERE user_id=$1 AND project_id=$2`, userID, projectID).Scan(
		&existing.HolderID, &existing.Token, &existing.ExpiresAt,
	)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return Lock{}, err
	}

	active := err == nil && existing.ExpiresAt.After(now)
	if active {
		if existing.HolderID != holderID {
			return Lock{HolderID: existing.HolderID, Token: "", ExpiresAt: existing.ExpiresAt}, ErrLockHeld
		}
		if token != "" && token != existing.Token {
			return Lock{}, ErrInvalidToken
		}
		token = existing.Token
	} else {
		token = uuid.NewString()
	}

	_, err = s.pool.Exec(ctx, `
		INSERT INTO project_locks (user_id, project_id, holder_id, token, expires_at)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (user_id, project_id) DO UPDATE SET
			holder_id = EXCLUDED.holder_id,
			token = EXCLUDED.token,
			expires_at = EXCLUDED.expires_at`,
		userID, projectID, holderID, token, expires,
	)
	if err != nil {
		return Lock{}, err
	}
	return Lock{HolderID: holderID, Token: token, ExpiresAt: expires}, nil
}

type HolderRow struct {
	HolderID  string
	Token     string
	ExpiresAt time.Time
}

func (s *Store) ReleaseLock(ctx context.Context, userID, projectID uuid.UUID, holderID, token string) error {
	tag, err := s.pool.Exec(ctx, `
		DELETE FROM project_locks
		WHERE user_id=$1 AND project_id=$2 AND holder_id=$3 AND token=$4`,
		userID, projectID, holderID, token,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrLockNotHeld
	}
	return nil
}

type BackupMeta struct {
	UpdatedAt   time.Time
	SizeBytes   int64
	StoragePath string
}

func (s *Store) UpsertBackupMeta(ctx context.Context, userID, projectID uuid.UUID, meta BackupMeta) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO project_backups (user_id, project_id, updated_at, size_bytes, storage_path)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (user_id, project_id) DO UPDATE SET
			updated_at = EXCLUDED.updated_at,
			size_bytes = EXCLUDED.size_bytes,
			storage_path = EXCLUDED.storage_path`,
		userID, projectID, meta.UpdatedAt, meta.SizeBytes, meta.StoragePath,
	)
	return err
}

func (s *Store) GetBackupMeta(ctx context.Context, userID, projectID uuid.UUID) (BackupMeta, error) {
	var m BackupMeta
	err := s.pool.QueryRow(ctx, `
		SELECT updated_at, size_bytes, storage_path FROM project_backups
		WHERE user_id=$1 AND project_id=$2`, userID, projectID).Scan(
		&m.UpdatedAt, &m.SizeBytes, &m.StoragePath,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return BackupMeta{}, err
	}
	return m, err
}
