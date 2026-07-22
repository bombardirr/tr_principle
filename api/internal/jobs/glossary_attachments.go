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

type GlossaryAttachment struct {
	ID             uuid.UUID `json:"id"`
	JobID          uuid.UUID `json:"jobId"`
	GlossaryBaseID string    `json:"glossaryBaseId"`
	Label          string    `json:"label"`
	Color          string    `json:"color"`
	OwnerID        uuid.UUID `json:"ownerId"`
	CanRead        bool      `json:"canRead"`
	CanWrite       bool      `json:"canWrite"`
	CanExport      bool      `json:"canExport"`
	CanClone       bool      `json:"canClone"`
	CreatedBy      uuid.UUID `json:"createdBy"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type GlossaryAttachmentFlags struct {
	CanRead   bool
	CanWrite  bool
	CanExport bool
	CanClone  bool
}

type GlossaryAttachmentPatch struct {
	CanRead   *bool
	CanWrite  *bool
	CanExport *bool
	CanClone  *bool
}

func (s *Store) ListGlossaryAttachments(
	ctx context.Context, jobID, requesterID uuid.UUID,
) ([]GlossaryAttachment, error) {
	if _, err := s.RoleOf(ctx, jobID, requesterID); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `
		SELECT a.id, a.job_id, a.glossary_base_id, b.label, b.color, j.owner_user_id,
		       a.can_read, a.can_write, a.can_export, a.can_clone,
		       a.created_by, a.created_at, a.updated_at
		FROM job_glossary_attachments a
		JOIN jobs j ON j.id = a.job_id
		JOIN glossary_bases b
		  ON b.owner_id = j.owner_user_id
		 AND b.id = a.glossary_base_id
		 AND b.deleted_at IS NULL
		WHERE a.job_id = $1
		ORDER BY a.created_at ASC, a.id ASC
	`, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	attachments := make([]GlossaryAttachment, 0)
	for rows.Next() {
		var attachment GlossaryAttachment
		if err := scanGlossaryAttachment(rows, &attachment); err != nil {
			return nil, err
		}
		attachments = append(attachments, attachment)
	}
	return attachments, rows.Err()
}

func (s *Store) CreateGlossaryAttachment(
	ctx context.Context, jobID, ownerID uuid.UUID, baseID string, flags GlossaryAttachmentFlags,
) (GlossaryAttachment, error) {
	owner, err := s.IsOwner(ctx, jobID, ownerID)
	if err != nil {
		return GlossaryAttachment{}, err
	}
	if !owner {
		return GlossaryAttachment{}, ErrNotMember
	}
	baseID = strings.TrimSpace(baseID)
	if baseID == "" {
		return GlossaryAttachment{}, ErrInvalidAttachment
	}

	var attachment GlossaryAttachment
	err = s.pool.QueryRow(ctx, `
		WITH attachment AS (
			INSERT INTO job_glossary_attachments (
				job_id, glossary_base_id, can_read, can_write, can_export, can_clone, created_by
			) VALUES ($1, $2, $3, $4, $5, $6, $7)
			RETURNING *
		)
		SELECT a.id, a.job_id, a.glossary_base_id, b.label, b.color, j.owner_user_id,
		       a.can_read, a.can_write, a.can_export, a.can_clone,
		       a.created_by, a.created_at, a.updated_at
		FROM attachment a
		JOIN jobs j ON j.id = a.job_id
		JOIN glossary_bases b
		  ON b.owner_id = j.owner_user_id
		 AND b.id = a.glossary_base_id
		 AND b.deleted_at IS NULL
	`, jobID, baseID, flags.CanRead, flags.CanWrite, flags.CanExport, flags.CanClone, ownerID).Scan(
		&attachment.ID, &attachment.JobID, &attachment.GlossaryBaseID,
		&attachment.Label, &attachment.Color, &attachment.OwnerID,
		&attachment.CanRead, &attachment.CanWrite, &attachment.CanExport, &attachment.CanClone,
		&attachment.CreatedBy, &attachment.CreatedAt, &attachment.UpdatedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return GlossaryAttachment{}, ErrAttachmentConflict
		}
		return GlossaryAttachment{}, err
	}
	return attachment, nil
}

func (s *Store) UpdateGlossaryAttachment(
	ctx context.Context, jobID, ownerID, attachmentID uuid.UUID, patch GlossaryAttachmentPatch,
) (GlossaryAttachment, error) {
	owner, err := s.IsOwner(ctx, jobID, ownerID)
	if err != nil {
		return GlossaryAttachment{}, err
	}
	if !owner {
		return GlossaryAttachment{}, ErrNotMember
	}
	var attachment GlossaryAttachment
	err = s.pool.QueryRow(ctx, `
		WITH attachment AS (
			UPDATE job_glossary_attachments SET
				can_read = COALESCE($3, can_read),
				can_write = COALESCE($4, can_write),
				can_export = COALESCE($5, can_export),
				can_clone = COALESCE($6, can_clone),
				updated_at = now()
			WHERE id = $1 AND job_id = $2
			RETURNING *
		)
		SELECT a.id, a.job_id, a.glossary_base_id, b.label, b.color, j.owner_user_id,
		       a.can_read, a.can_write, a.can_export, a.can_clone,
		       a.created_by, a.created_at, a.updated_at
		FROM attachment a
		JOIN jobs j ON j.id = a.job_id
		JOIN glossary_bases b
		  ON b.owner_id = j.owner_user_id
		 AND b.id = a.glossary_base_id
		 AND b.deleted_at IS NULL
	`, attachmentID, jobID, patch.CanRead, patch.CanWrite, patch.CanExport, patch.CanClone).Scan(
		&attachment.ID, &attachment.JobID, &attachment.GlossaryBaseID,
		&attachment.Label, &attachment.Color, &attachment.OwnerID,
		&attachment.CanRead, &attachment.CanWrite, &attachment.CanExport, &attachment.CanClone,
		&attachment.CreatedBy, &attachment.CreatedAt, &attachment.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return GlossaryAttachment{}, ErrAttachmentMissing
	}
	return attachment, err
}

func (s *Store) DeleteGlossaryAttachment(
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
		DELETE FROM job_glossary_attachments WHERE id = $1 AND job_id = $2
	`, attachmentID, jobID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrAttachmentMissing
	}
	return nil
}

func scanGlossaryAttachment(row interface{ Scan(dest ...any) error }, attachment *GlossaryAttachment) error {
	return row.Scan(
		&attachment.ID, &attachment.JobID, &attachment.GlossaryBaseID,
		&attachment.Label, &attachment.Color, &attachment.OwnerID,
		&attachment.CanRead, &attachment.CanWrite, &attachment.CanExport, &attachment.CanClone,
		&attachment.CreatedBy, &attachment.CreatedAt, &attachment.UpdatedAt,
	)
}
