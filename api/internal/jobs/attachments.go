package jobs

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var (
	ErrAttachmentMissing  = errors.New("attachment not found")
	ErrAttachmentConflict = errors.New("attachment already exists")
	ErrInvalidAttachment  = errors.New("invalid attachment")
)

type Attachment struct {
	ID        uuid.UUID `json:"id"`
	JobID     uuid.UUID `json:"jobId"`
	TmBaseID  string    `json:"tmBaseId"`
	CanRead   bool      `json:"canRead"`
	CanWrite  bool      `json:"canWrite"`
	CanExport bool      `json:"canExport"`
	CanClone  bool      `json:"canClone"`
	CreatedBy uuid.UUID `json:"createdBy"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type AttachmentFlags struct {
	CanRead   bool
	CanWrite  bool
	CanExport bool
	CanClone  bool
}

type AttachmentPatch struct {
	CanRead   *bool
	CanWrite  *bool
	CanExport *bool
	CanClone  *bool
}

func (s *Store) ListAttachments(
	ctx context.Context, jobID, requesterID uuid.UUID,
) ([]Attachment, error) {
	if _, err := s.RoleOf(ctx, jobID, requesterID); err != nil {
		return nil, err
	}

	rows, err := s.pool.Query(ctx, `
		SELECT id, job_id, tm_base_id, can_read, can_write, can_export, can_clone,
		       created_by, created_at, updated_at
		FROM job_tm_attachments
		WHERE job_id = $1
		ORDER BY created_at ASC, id ASC
	`, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	attachments := make([]Attachment, 0)
	for rows.Next() {
		var attachment Attachment
		if err := scanAttachment(rows, &attachment); err != nil {
			return nil, err
		}
		attachments = append(attachments, attachment)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return attachments, nil
}

func (s *Store) CreateAttachment(
	ctx context.Context,
	jobID, ownerID uuid.UUID,
	tmBaseID string,
	flags AttachmentFlags,
) (Attachment, error) {
	owner, err := s.IsOwner(ctx, jobID, ownerID)
	if err != nil {
		return Attachment{}, err
	}
	if !owner {
		return Attachment{}, ErrNotMember
	}

	tmBaseID = strings.TrimSpace(tmBaseID)
	if tmBaseID == "" {
		return Attachment{}, ErrInvalidAttachment
	}

	var attachment Attachment
	err = s.pool.QueryRow(ctx, `
		INSERT INTO job_tm_attachments (
			job_id, tm_base_id, can_read, can_write, can_export, can_clone, created_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, job_id, tm_base_id, can_read, can_write, can_export, can_clone,
		          created_by, created_at, updated_at
	`, jobID, tmBaseID, flags.CanRead, flags.CanWrite, flags.CanExport, flags.CanClone, ownerID,
	).Scan(
		&attachment.ID,
		&attachment.JobID,
		&attachment.TmBaseID,
		&attachment.CanRead,
		&attachment.CanWrite,
		&attachment.CanExport,
		&attachment.CanClone,
		&attachment.CreatedBy,
		&attachment.CreatedAt,
		&attachment.UpdatedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return Attachment{}, ErrAttachmentConflict
		}
		return Attachment{}, err
	}
	return attachment, nil
}

func (s *Store) UpdateAttachment(
	ctx context.Context,
	jobID, ownerID, attachmentID uuid.UUID,
	patch AttachmentPatch,
) (Attachment, error) {
	owner, err := s.IsOwner(ctx, jobID, ownerID)
	if err != nil {
		return Attachment{}, err
	}
	if !owner {
		return Attachment{}, ErrNotMember
	}

	var attachment Attachment
	err = s.pool.QueryRow(ctx, `
		UPDATE job_tm_attachments SET
			can_read = COALESCE($3, can_read),
			can_write = COALESCE($4, can_write),
			can_export = COALESCE($5, can_export),
			can_clone = COALESCE($6, can_clone),
			updated_at = now()
		WHERE id = $1 AND job_id = $2
		RETURNING id, job_id, tm_base_id, can_read, can_write, can_export, can_clone,
		          created_by, created_at, updated_at
	`, attachmentID, jobID, patch.CanRead, patch.CanWrite, patch.CanExport, patch.CanClone).Scan(
		&attachment.ID,
		&attachment.JobID,
		&attachment.TmBaseID,
		&attachment.CanRead,
		&attachment.CanWrite,
		&attachment.CanExport,
		&attachment.CanClone,
		&attachment.CreatedBy,
		&attachment.CreatedAt,
		&attachment.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Attachment{}, ErrAttachmentMissing
	}
	return attachment, err
}

func (s *Store) DeleteAttachment(
	ctx context.Context, jobID, ownerID, attachmentID uuid.UUID,
) error {
	owner, err := s.IsOwner(ctx, jobID, ownerID)
	if err != nil {
		return err
	}
	if !owner {
		return ErrNotMember
	}

	tag, err := s.pool.Exec(ctx, `
		DELETE FROM job_tm_attachments
		WHERE id = $1 AND job_id = $2
	`, attachmentID, jobID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrAttachmentMissing
	}
	return nil
}

func scanAttachment(row interface{ Scan(dest ...any) error }, attachment *Attachment) error {
	return row.Scan(
		&attachment.ID,
		&attachment.JobID,
		&attachment.TmBaseID,
		&attachment.CanRead,
		&attachment.CanWrite,
		&attachment.CanExport,
		&attachment.CanClone,
		&attachment.CreatedBy,
		&attachment.CreatedAt,
		&attachment.UpdatedAt,
	)
}
