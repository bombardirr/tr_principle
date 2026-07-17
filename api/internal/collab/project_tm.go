package collab

import (
	"context"
	"errors"
	"time"

	"github.com/bombardirr/tr_principle/api/internal/tm"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var ErrAttachmentNotFound = errors.New("TM attachment not found")

type TmAttachment struct {
	ID        uuid.UUID
	ProjectID uuid.UUID
	Kind      string
	UserID    *uuid.UUID
	CanRead   bool
	CanWrite  bool
	CanExport bool
	CanClone  bool
	CreatedAt time.Time
	UpdatedAt time.Time
}

type TmAttachmentPatch struct {
	CanRead   *bool
	CanWrite  *bool
	CanExport *bool
	CanClone  *bool
}

func (s *Store) ListTmAttachments(ctx context.Context, projectID uuid.UUID) ([]TmAttachment, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, project_id, kind, user_id, can_read, can_write, can_export, can_clone, created_at, updated_at
		FROM project_tm_attachments WHERE project_id = $1 ORDER BY created_at, id
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var attachments []TmAttachment
	for rows.Next() {
		attachment, err := scanTmAttachment(rows)
		if err != nil {
			return nil, err
		}
		attachments = append(attachments, attachment)
	}
	return attachments, rows.Err()
}

func (s *Store) AttachPersonalTm(ctx context.Context, projectID, userID uuid.UUID) (TmAttachment, error) {
	return scanTmAttachment(s.pool.QueryRow(ctx, `
		INSERT INTO project_tm_attachments (project_id, kind, user_id, can_read)
		VALUES ($1, 'user', $2, true)
		ON CONFLICT (project_id, kind, user_id) DO UPDATE SET updated_at = now()
		RETURNING id, project_id, kind, user_id, can_read, can_write, can_export, can_clone, created_at, updated_at
	`, projectID, userID))
}

func (s *Store) PatchTmAttachment(ctx context.Context, projectID, attachmentID uuid.UUID, patch TmAttachmentPatch) (TmAttachment, error) {
	attachment, err := scanTmAttachment(s.pool.QueryRow(ctx, `
		UPDATE project_tm_attachments
		SET can_read = COALESCE($3, can_read), can_write = COALESCE($4, can_write),
		    can_export = COALESCE($5, can_export), can_clone = COALESCE($6, can_clone), updated_at = now()
		WHERE project_id = $1 AND id = $2
		RETURNING id, project_id, kind, user_id, can_read, can_write, can_export, can_clone, created_at, updated_at
	`, projectID, attachmentID, patch.CanRead, patch.CanWrite, patch.CanExport, patch.CanClone))
	if errors.Is(err, pgx.ErrNoRows) {
		return TmAttachment{}, ErrAttachmentNotFound
	}
	return attachment, err
}

func (s *Store) GetTmAttachment(ctx context.Context, projectID, attachmentID uuid.UUID) (TmAttachment, error) {
	attachment, err := scanTmAttachment(s.pool.QueryRow(ctx, `
		SELECT id, project_id, kind, user_id, can_read, can_write, can_export, can_clone, created_at, updated_at
		FROM project_tm_attachments WHERE project_id = $1 AND id = $2
	`, projectID, attachmentID))
	if errors.Is(err, pgx.ErrNoRows) {
		return TmAttachment{}, ErrAttachmentNotFound
	}
	return attachment, err
}

func (s *Store) PullProjectTm(ctx context.Context, projectID uuid.UUID, since time.Time) ([]tm.Unit, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, source, target, source_key, source_lang, target_lang, created_at, updated_at,
		       deleted_at, project_id::text, created_by, updated_by, context_before, context_after
		FROM project_tm_units WHERE project_id = $1 AND updated_at > $2 ORDER BY updated_at, id LIMIT $3
	`, projectID, since, 501)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanProjectTmUnits(rows)
}

func (s *Store) PullReadableTm(ctx context.Context, projectID uuid.UUID, since time.Time) ([]tm.Unit, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, source, target, source_key, source_lang, target_lang, created_at, updated_at,
		       deleted_at, project_id::text, created_by, updated_by, context_before, context_after
		FROM project_tm_units
		WHERE project_id = $1 AND updated_at > $2
		  AND EXISTS (
			SELECT 1 FROM project_tm_attachments a
			WHERE a.project_id = $1 AND a.kind = 'project' AND a.can_read
		  )
		UNION ALL
		SELECT u.id, u.source, u.target, u.source_key, u.source_lang, u.target_lang, u.created_at, u.updated_at,
		       u.deleted_at, u.project_id, u.created_by, u.updated_by, u.context_before, u.context_after
		FROM tm_units u
		JOIN project_tm_attachments a ON a.user_id = u.user_id
		WHERE a.project_id = $1 AND a.kind = 'user' AND a.can_read AND u.updated_at > $2
		ORDER BY updated_at, id LIMIT $3
	`, projectID, since, 501)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanProjectTmUnits(rows)
}

func (s *Store) UpsertProjectTm(ctx context.Context, projectID uuid.UUID, actor string, unit tm.Unit) error {
	id, err := uuid.Parse(unit.ID)
	if err != nil {
		return err
	}
	createdAt, err := parseTmTime(unit.CreatedAt)
	if err != nil || createdAt.IsZero() {
		return errors.New("invalid createdAt")
	}
	updatedAt, err := parseTmTime(unit.UpdatedAt)
	if err != nil || updatedAt.IsZero() {
		return errors.New("invalid updatedAt")
	}
	var deletedAt *time.Time
	if unit.DeletedAt != nil && *unit.DeletedAt != "" {
		value, err := parseTmTime(*unit.DeletedAt)
		if err != nil {
			return errors.New("invalid deletedAt")
		}
		deletedAt = &value
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO project_tm_units (
			id, project_id, source, target, source_key, source_lang, target_lang, created_at, updated_at,
			deleted_at, created_by, updated_by, context_before, context_after
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
		ON CONFLICT (id) DO UPDATE SET source=EXCLUDED.source, target=EXCLUDED.target, source_key=EXCLUDED.source_key,
			source_lang=EXCLUDED.source_lang, target_lang=EXCLUDED.target_lang, created_at=EXCLUDED.created_at,
			updated_at=EXCLUDED.updated_at, deleted_at=EXCLUDED.deleted_at, created_by=EXCLUDED.created_by,
			updated_by=EXCLUDED.updated_by, context_before=EXCLUDED.context_before, context_after=EXCLUDED.context_after
		WHERE project_tm_units.project_id = EXCLUDED.project_id AND project_tm_units.updated_at < EXCLUDED.updated_at
	`, id, projectID, unit.Source, unit.Target, unit.SourceKey, unit.SourceLang, unit.TargetLang, createdAt, updatedAt,
		deletedAt, actor, actor, unit.ContextBefore, unit.ContextAfter)
	return err
}

func (s *Store) CloneTmAttachment(ctx context.Context, attachment TmAttachment, userID uuid.UUID) ([]tm.Unit, error) {
	units, err := s.TmAttachmentUnits(ctx, attachment)
	if err != nil {
		return nil, err
	}
	for i := range units {
		units[i].ID = uuid.NewString()
		if err := s.insertPersonalTm(ctx, userID, units[i]); err != nil {
			return nil, err
		}
	}
	return units, nil
}

func (s *Store) TmAttachmentUnits(ctx context.Context, attachment TmAttachment) ([]tm.Unit, error) {
	var query string
	var arg uuid.UUID
	if attachment.Kind == "project" {
		query, arg = `SELECT id, source, target, source_key, source_lang, target_lang, created_at, updated_at, deleted_at,
			project_id::text, created_by, updated_by, context_before, context_after FROM project_tm_units
			WHERE project_id = $1 AND deleted_at IS NULL`, attachment.ProjectID
	} else {
		query, arg = `SELECT id, source, target, source_key, source_lang, target_lang, created_at, updated_at, deleted_at,
			project_id, created_by, updated_by, context_before, context_after FROM tm_units
			WHERE user_id = $1 AND deleted_at IS NULL`, *attachment.UserID
	}
	rows, err := s.pool.Query(ctx, query, arg)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanProjectTmUnits(rows)
}

func (s *Store) insertPersonalTm(ctx context.Context, userID uuid.UUID, unit tm.Unit) error {
	id := uuid.MustParse(unit.ID)
	createdAt, _ := parseTmTime(unit.CreatedAt)
	updatedAt, _ := parseTmTime(unit.UpdatedAt)
	_, err := s.pool.Exec(ctx, `INSERT INTO tm_units (
		user_id, id, source, target, source_key, source_lang, target_lang, created_at, updated_at,
		deleted_at, project_id, created_by, updated_by, context_before, context_after
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,$10,$11,$12,$13,$14)`,
		userID, id, unit.Source, unit.Target, unit.SourceKey, unit.SourceLang, unit.TargetLang, createdAt, updatedAt,
		unit.ProjectID, unit.CreatedBy, unit.UpdatedBy, unit.ContextBefore, unit.ContextAfter)
	return err
}

func scanTmAttachment(row interface{ Scan(...any) error }) (TmAttachment, error) {
	var attachment TmAttachment
	err := row.Scan(&attachment.ID, &attachment.ProjectID, &attachment.Kind, &attachment.UserID, &attachment.CanRead,
		&attachment.CanWrite, &attachment.CanExport, &attachment.CanClone, &attachment.CreatedAt, &attachment.UpdatedAt)
	return attachment, err
}

func scanProjectTmUnits(rows pgx.Rows) ([]tm.Unit, error) {
	var units []tm.Unit
	for rows.Next() {
		var (
			id                                                           uuid.UUID
			source, target, sourceKey                                    string
			sourceLang, targetLang                                       *string
			createdAt, updatedAt                                         time.Time
			deletedAt                                                    *time.Time
			projectID, createdBy, updatedBy, contextBefore, contextAfter *string
		)
		if err := rows.Scan(&id, &source, &target, &sourceKey, &sourceLang, &targetLang, &createdAt, &updatedAt,
			&deletedAt, &projectID, &createdBy, &updatedBy, &contextBefore, &contextAfter); err != nil {
			return nil, err
		}
		unit := tm.Unit{ID: id.String(), Source: source, Target: target, SourceKey: sourceKey, SourceLang: sourceLang, TargetLang: targetLang,
			CreatedAt: createdAt.UTC().Format(time.RFC3339Nano), UpdatedAt: updatedAt.UTC().Format(time.RFC3339Nano),
			ProjectID: projectID, CreatedBy: createdBy, UpdatedBy: updatedBy, ContextBefore: contextBefore, ContextAfter: contextAfter}
		if deletedAt != nil {
			value := deletedAt.UTC().Format(time.RFC3339Nano)
			unit.DeletedAt = &value
		}
		units = append(units, unit)
	}
	return units, rows.Err()
}

func parseTmTime(value string) (time.Time, error) {
	if value == "" {
		return time.Time{}, nil
	}
	if parsed, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return parsed, nil
	}
	return time.Parse(time.RFC3339, value)
}
