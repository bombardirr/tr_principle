package jobs

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrInvalidJob = errors.New("invalid job")

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func (s *Store) CreateJob(
	ctx context.Context,
	ownerID, jobID uuid.UUID,
	title string,
	langs Langs,
	filename, hash string,
	localProjectID uuid.UUID,
) (Job, error) {
	if ownerID == uuid.Nil || jobID == uuid.Nil || strings.TrimSpace(title) == "" {
		return Job{}, ErrInvalidJob
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Job{}, err
	}
	defer tx.Rollback(ctx)

	var job Job
	err = tx.QueryRow(ctx, `
		INSERT INTO jobs (
			id, owner_user_id, title, source_lang, target_lang,
			source_filename, source_hash
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, owner_user_id, title,
		          COALESCE(source_lang, ''), COALESCE(target_lang, ''),
		          COALESCE(source_filename, ''), COALESCE(source_hash, ''),
		          created_at, updated_at, archived_at
	`, jobID, ownerID, title, langs.Source, langs.Target, filename, hash).Scan(
		&job.ID,
		&job.OwnerUserID,
		&job.Title,
		&job.SourceLang,
		&job.TargetLang,
		&job.SourceFilename,
		&job.SourceHash,
		&job.CreatedAt,
		&job.UpdatedAt,
		&job.ArchivedAt,
	)
	if err != nil {
		return Job{}, err
	}

	var localID *uuid.UUID
	if localProjectID != uuid.Nil {
		localID = &localProjectID
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO job_members (job_id, user_id, role, local_project_id)
		VALUES ($1, $2, $3, $4)
	`, jobID, ownerID, RoleOwner, localID); err != nil {
		return Job{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Job{}, err
	}
	return job, nil
}
