package jobs

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type OriginalMeta struct {
	Filename    string
	ContentHash string
	SizeBytes   int64
	StoragePath string
	UploadedBy  uuid.UUID
	UploadedAt  time.Time
}

func (s *Store) UpsertOriginalMeta(ctx context.Context, jobID uuid.UUID, meta OriginalMeta) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO job_originals (job_id, filename, content_hash, size_bytes, storage_path, uploaded_by, uploaded_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (job_id) DO UPDATE SET
		  filename = EXCLUDED.filename,
		  content_hash = EXCLUDED.content_hash,
		  size_bytes = EXCLUDED.size_bytes,
		  storage_path = EXCLUDED.storage_path,
		  uploaded_by = EXCLUDED.uploaded_by,
		  uploaded_at = EXCLUDED.uploaded_at
	`, jobID, meta.Filename, meta.ContentHash, meta.SizeBytes, meta.StoragePath, meta.UploadedBy, meta.UploadedAt)
	return err
}

func (s *Store) GetOriginalMeta(ctx context.Context, jobID uuid.UUID) (OriginalMeta, error) {
	var meta OriginalMeta
	err := s.pool.QueryRow(ctx, `
		SELECT filename, content_hash, size_bytes, storage_path, uploaded_by, uploaded_at
		FROM job_originals
		WHERE job_id = $1
	`, jobID).Scan(
		&meta.Filename,
		&meta.ContentHash,
		&meta.SizeBytes,
		&meta.StoragePath,
		&meta.UploadedBy,
		&meta.UploadedAt,
	)
	return meta, err
}

func (s *Store) DeleteOriginalMeta(ctx context.Context, jobID uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `
		DELETE FROM job_originals WHERE job_id = $1
	`, jobID)
	return err
}

func (s *Store) GetJobSourceHash(ctx context.Context, jobID uuid.UUID) (string, error) {
	var hash string
	err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(source_hash, '') FROM jobs WHERE id = $1
	`, jobID).Scan(&hash)
	return hash, err
}
