package jobs

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var ErrNotMember = errors.New("not a job member")

func (s *Store) RoleOf(ctx context.Context, jobID, userID uuid.UUID) (Role, error) {
	var role Role
	err := s.pool.QueryRow(ctx, `
		SELECT role
		FROM job_members
		WHERE job_id = $1 AND user_id = $2
	`, jobID, userID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotMember
	}
	return role, err
}

func (s *Store) IsOwner(ctx context.Context, jobID, userID uuid.UUID) (bool, error) {
	var isOwner bool
	err := s.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM jobs
			WHERE id = $1 AND owner_user_id = $2
		)
	`, jobID, userID).Scan(&isOwner)
	return isOwner, err
}
