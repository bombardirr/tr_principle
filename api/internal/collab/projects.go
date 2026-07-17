package collab

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var ErrProjectNotFound = errors.New("project not found")

type Member struct {
	UserID      uuid.UUID
	DisplayName string
	Role        Role
}

type ProjectPatch struct {
	Name       *string
	SourceLang *string
	TargetLang *string
	Meta       *json.RawMessage
}

type InvitePatch struct {
	Role      *Role
	ExpiresAt *time.Time
	MaxUses   *int
}

func (s *Store) ListProjectsForUser(ctx context.Context, userID uuid.UUID) ([]Project, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT p.id, p.owner_user_id, p.name, p.source_lang, p.target_lang, p.meta, p.created_at, p.updated_at
		FROM projects p
		JOIN project_members pm ON pm.project_id = p.id
		WHERE pm.user_id = $1
		ORDER BY p.updated_at DESC, p.id
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := make([]Project, 0)
	for rows.Next() {
		project, err := scanProject(rows)
		if err != nil {
			return nil, err
		}
		projects = append(projects, project)
	}
	return projects, rows.Err()
}

func (s *Store) GetProject(ctx context.Context, projectID uuid.UUID) (Project, error) {
	project, err := scanProject(s.pool.QueryRow(ctx, `
		SELECT id, owner_user_id, name, source_lang, target_lang, meta, created_at, updated_at
		FROM projects
		WHERE id = $1
	`, projectID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Project{}, ErrProjectNotFound
	}
	return project, err
}

func (s *Store) PatchProject(ctx context.Context, projectID uuid.UUID, patch ProjectPatch) (Project, error) {
	if patch.Name != nil && *patch.Name == "" {
		return Project{}, ErrInvalidProject
	}
	if patch.Meta != nil && !json.Valid(*patch.Meta) {
		return Project{}, ErrInvalidProject
	}
	project, err := scanProject(s.pool.QueryRow(ctx, `
		UPDATE projects
		SET name = COALESCE($2, name),
		    source_lang = COALESCE($3, source_lang),
		    target_lang = COALESCE($4, target_lang),
		    meta = COALESCE($5, meta),
		    updated_at = now()
		WHERE id = $1
		RETURNING id, owner_user_id, name, source_lang, target_lang, meta, created_at, updated_at
	`, projectID, patch.Name, patch.SourceLang, patch.TargetLang, patch.Meta))
	if errors.Is(err, pgx.ErrNoRows) {
		return Project{}, ErrProjectNotFound
	}
	return project, err
}

func (s *Store) ListMembers(ctx context.Context, projectID uuid.UUID) ([]Member, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT pm.user_id, COALESCE(u.display_name, ''), pm.role
		FROM project_members pm
		JOIN users u ON u.id = pm.user_id
		WHERE pm.project_id = $1
		ORDER BY pm.joined_at, pm.user_id
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := make([]Member, 0)
	for rows.Next() {
		var member Member
		if err := rows.Scan(&member.UserID, &member.DisplayName, &member.Role); err != nil {
			return nil, err
		}
		members = append(members, member)
	}
	return members, rows.Err()
}

func (s *Store) RemoveMember(ctx context.Context, projectID, userID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `
		DELETE FROM project_members
		WHERE project_id = $1 AND user_id = $2
	`, projectID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotMember
	}
	return nil
}

func (s *Store) ListInvites(ctx context.Context, projectID uuid.UUID) ([]Invite, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, project_id, role, created_by, expires_at, max_uses, uses_count,
		       invited_user_id, revoked_at, created_at
		FROM project_invites
		WHERE project_id = $1
		ORDER BY created_at DESC, id
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	invites := make([]Invite, 0)
	for rows.Next() {
		invite, err := scanInvite(rows)
		if err != nil {
			return nil, err
		}
		invites = append(invites, invite)
	}
	return invites, rows.Err()
}

func (s *Store) UpdateInvite(ctx context.Context, projectID, inviteID uuid.UUID, patch InvitePatch) (Invite, error) {
	if patch.Role != nil && *patch.Role != RoleEditor && *patch.Role != RoleViewer {
		return Invite{}, ErrInvalidInvite
	}
	if patch.MaxUses != nil && *patch.MaxUses <= 0 {
		return Invite{}, ErrInvalidInvite
	}
	invite, err := scanInvite(s.pool.QueryRow(ctx, `
		UPDATE project_invites
		SET role = COALESCE($3, role),
		    expires_at = COALESCE($4, expires_at),
		    max_uses = COALESCE($5, max_uses)
		WHERE id = $2 AND project_id = $1
		RETURNING id, project_id, role, created_by, expires_at, max_uses, uses_count,
		          invited_user_id, revoked_at, created_at
	`, projectID, inviteID, patch.Role, patch.ExpiresAt, patch.MaxUses))
	if errors.Is(err, pgx.ErrNoRows) {
		return Invite{}, ErrInvalidInvite
	}
	return invite, err
}

func (s *Store) RevokeInvite(ctx context.Context, projectID, inviteID uuid.UUID) (Invite, error) {
	invite, err := scanInvite(s.pool.QueryRow(ctx, `
		UPDATE project_invites
		SET revoked_at = COALESCE(revoked_at, now())
		WHERE id = $2 AND project_id = $1
		RETURNING id, project_id, role, created_by, expires_at, max_uses, uses_count,
		          invited_user_id, revoked_at, created_at
	`, projectID, inviteID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Invite{}, ErrInvalidInvite
	}
	return invite, err
}

type projectScanner interface {
	Scan(dest ...any) error
}

func scanProject(row projectScanner) (Project, error) {
	var project Project
	err := row.Scan(
		&project.ID, &project.OwnerUserID, &project.Name, &project.SourceLang, &project.TargetLang,
		&project.Meta, &project.CreatedAt, &project.UpdatedAt,
	)
	return project, err
}

type inviteScanner interface {
	Scan(dest ...any) error
}

func scanInvite(row inviteScanner) (Invite, error) {
	var invite Invite
	err := row.Scan(
		&invite.ID, &invite.ProjectID, &invite.Role, &invite.CreatedBy, &invite.ExpiresAt,
		&invite.MaxUses, &invite.UsesCount, &invite.InvitedUserID, &invite.RevokedAt,
		&invite.CreatedAt,
	)
	return invite, err
}
