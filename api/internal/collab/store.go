package collab

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrInvalidProject = errors.New("invalid project")

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func (s *Store) CreateProject(
	ctx context.Context,
	ownerID, id uuid.UUID,
	name string,
	langs [2]string,
	meta json.RawMessage,
) (Project, error) {
	if ownerID == uuid.Nil || id == uuid.Nil || name == "" {
		return Project{}, ErrInvalidProject
	}
	if len(meta) == 0 {
		meta = json.RawMessage("{}")
	}
	if !json.Valid(meta) {
		return Project{}, ErrInvalidProject
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Project{}, err
	}
	defer tx.Rollback(ctx)

	var project Project
	err = tx.QueryRow(ctx, `
		INSERT INTO projects (id, owner_user_id, name, source_lang, target_lang, meta)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, owner_user_id, name, source_lang, target_lang, meta, created_at, updated_at
	`, id, ownerID, name, langs[0], langs[1], meta).Scan(
		&project.ID, &project.OwnerUserID, &project.Name, &project.SourceLang, &project.TargetLang,
		&project.Meta, &project.CreatedAt, &project.UpdatedAt,
	)
	if err != nil {
		return Project{}, err
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO project_members (project_id, user_id, role)
		VALUES ($1, $2, $3)
	`, project.ID, ownerID, RoleOwner); err != nil {
		return Project{}, err
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO project_tm_attachments (
			project_id, kind, can_read, can_write, can_export, can_clone
		) VALUES ($1, 'project', true, true, true, true)
	`, project.ID); err != nil {
		return Project{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Project{}, err
	}
	return project, nil
}
