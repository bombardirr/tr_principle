package collab

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
	ErrInvalidInvite      = errors.New("invalid invite")
	ErrInviteRevoked      = errors.New("invite revoked")
	ErrInviteExpired      = errors.New("invite expired")
	ErrInviteExhausted    = errors.New("invite exhausted")
	ErrInviteUserMismatch = errors.New("invite is for another user")
)

func (s *Store) CreateInvite(
	ctx context.Context,
	projectID, createdBy uuid.UUID,
	role Role,
	expiresAt *time.Time,
	maxUses *int,
	invitedUserID *uuid.UUID,
) (string, Invite, error) {
	if projectID == uuid.Nil || createdBy == uuid.Nil || (role != RoleEditor && role != RoleViewer) {
		return "", Invite{}, ErrInvalidInvite
	}
	if maxUses != nil && *maxUses <= 0 {
		return "", Invite{}, ErrInvalidInvite
	}

	rawToken, err := newInviteToken()
	if err != nil {
		return "", Invite{}, err
	}
	tokenHash := hashToken(rawToken)

	var invite Invite
	err = s.pool.QueryRow(ctx, `
		INSERT INTO project_invites (
			project_id, token_hash, role, created_by, expires_at, max_uses, invited_user_id
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, project_id, role, created_by, expires_at, max_uses, uses_count,
		          invited_user_id, revoked_at, created_at
	`, projectID, tokenHash, role, createdBy, expiresAt, maxUses, invitedUserID).Scan(
		&invite.ID, &invite.ProjectID, &invite.Role, &invite.CreatedBy, &invite.ExpiresAt,
		&invite.MaxUses, &invite.UsesCount, &invite.InvitedUserID, &invite.RevokedAt,
		&invite.CreatedAt,
	)
	if err != nil {
		return "", Invite{}, err
	}
	return rawToken, invite, nil
}

func (s *Store) AcceptInvite(ctx context.Context, rawToken string, userID uuid.UUID) (uuid.UUID, Role, error) {
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
		SELECT id, project_id, role, created_by, expires_at, max_uses, uses_count,
		       invited_user_id, revoked_at, created_at
		FROM project_invites
		WHERE token_hash = $1
		FOR UPDATE
	`, hashToken(rawToken)).Scan(
		&invite.ID, &invite.ProjectID, &invite.Role, &invite.CreatedBy, &invite.ExpiresAt,
		&invite.MaxUses, &invite.UsesCount, &invite.InvitedUserID, &invite.RevokedAt,
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
	case invite.InvitedUserID != nil && *invite.InvitedUserID != userID:
		return uuid.Nil, "", ErrInviteUserMismatch
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO project_members (project_id, user_id, role)
		VALUES ($1, $2, $3)
		ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role
	`, invite.ProjectID, userID, invite.Role); err != nil {
		return uuid.Nil, "", err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE project_invites
		SET uses_count = uses_count + 1
		WHERE id = $1
	`, invite.ID); err != nil {
		return uuid.Nil, "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, "", err
	}
	return invite.ProjectID, invite.Role, nil
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
