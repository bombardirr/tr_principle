package jobs

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var (
	ErrInvalidInvite   = errors.New("invalid invite")
	ErrInviteRevoked   = errors.New("invite revoked")
	ErrInviteExpired   = errors.New("invite expired")
	ErrInviteExhausted = errors.New("invite exhausted")
)

func (s *Store) CreateInvite(
	ctx context.Context,
	jobID, createdBy uuid.UUID,
	role Role,
	expiresAt *time.Time,
	maxUses *int,
) (string, Invite, error) {
	if jobID == uuid.Nil || createdBy == uuid.Nil || !isInviteRole(role) {
		return "", Invite{}, ErrInvalidInvite
	}
	if maxUses != nil && *maxUses <= 0 {
		return "", Invite{}, ErrInvalidInvite
	}

	rawToken, err := newInviteToken()
	if err != nil {
		return "", Invite{}, err
	}

	var invite Invite
	err = s.pool.QueryRow(ctx, `
		INSERT INTO job_invites (
			job_id, token_hash, role, created_by, expires_at, max_uses
		) VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, job_id, role, created_by, expires_at, max_uses,
		          uses_count, revoked_at, created_at
	`, jobID, hashToken(rawToken), role, createdBy, expiresAt, maxUses).Scan(
		&invite.ID,
		&invite.JobID,
		&invite.Role,
		&invite.CreatedBy,
		&invite.ExpiresAt,
		&invite.MaxUses,
		&invite.UsesCount,
		&invite.RevokedAt,
		&invite.CreatedAt,
	)
	if err != nil {
		return "", Invite{}, err
	}
	return rawToken, invite, nil
}

func (s *Store) AcceptInvite(
	ctx context.Context,
	rawToken string,
	userID uuid.UUID,
	localProjectID *uuid.UUID,
) (uuid.UUID, Role, error) {
	if rawToken == "" || userID == uuid.Nil {
		return uuid.Nil, "", ErrInvalidInvite
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return uuid.Nil, "", err
	}
	defer tx.Rollback(ctx)

	var invite Invite
	err = tx.QueryRow(ctx, `
		SELECT id, job_id, role, created_by, expires_at, max_uses,
		       uses_count, revoked_at, created_at
		FROM job_invites
		WHERE token_hash = $1
		FOR UPDATE
	`, hashToken(rawToken)).Scan(
		&invite.ID,
		&invite.JobID,
		&invite.Role,
		&invite.CreatedBy,
		&invite.ExpiresAt,
		&invite.MaxUses,
		&invite.UsesCount,
		&invite.RevokedAt,
		&invite.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, "", ErrInvalidInvite
	}
	if err != nil {
		return uuid.Nil, "", err
	}

	now := time.Now()
	switch {
	case invite.RevokedAt != nil:
		return uuid.Nil, "", ErrInviteRevoked
	case invite.ExpiresAt != nil && invite.ExpiresAt.Before(now):
		return uuid.Nil, "", ErrInviteExpired
	case invite.MaxUses != nil && invite.UsesCount >= *invite.MaxUses:
		return uuid.Nil, "", ErrInviteExhausted
	}

	var archived bool
	err = tx.QueryRow(ctx, `SELECT archived_at IS NOT NULL FROM jobs WHERE id = $1`, invite.JobID).Scan(&archived)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, "", ErrJobNotFound
	}
	if err != nil {
		return uuid.Nil, "", err
	}
	if archived {
		return uuid.Nil, "", ErrJobArchived
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO job_members (job_id, user_id, role, local_project_id)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (job_id, user_id) DO UPDATE SET
			role = CASE
				WHEN job_members.role = 'owner' THEN job_members.role
				ELSE EXCLUDED.role
			END,
			local_project_id = COALESCE(EXCLUDED.local_project_id, job_members.local_project_id)
	`, invite.JobID, userID, invite.Role, localProjectID); err != nil {
		return uuid.Nil, "", err
	}

	if _, err := tx.Exec(ctx, `
		UPDATE job_invites
		SET uses_count = uses_count + 1
		WHERE id = $1
	`, invite.ID); err != nil {
		return uuid.Nil, "", err
	}

	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, "", err
	}
	return invite.JobID, invite.Role, nil
}

func isInviteRole(role Role) bool {
	return role == RoleTranslator || role == RoleViewer
}

func newInviteToken() (string, error) {
	token := make([]byte, 32)
	if _, err := rand.Read(token); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(token), nil
}

func hashToken(rawToken string) string {
	sum := sha256.Sum256([]byte(rawToken))
	return hex.EncodeToString(sum[:])
}
