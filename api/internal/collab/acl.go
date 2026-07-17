package collab

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var ErrNotMember = errors.New("not a project member")

func (s *Store) RoleOf(ctx context.Context, projectID, userID uuid.UUID) (Role, error) {
	var role Role
	err := s.pool.QueryRow(ctx, `
		SELECT role
		FROM project_members
		WHERE project_id = $1 AND user_id = $2
	`, projectID, userID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotMember
	}
	return role, err
}

func CanEdit(role Role) bool {
	return role == RoleOwner || role == RoleEditor
}
