package jobs

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/bombardirr/tr_principle/api/internal/tm"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const (
	JobTMResourceKind = "job_tm"
	jobTMPageSize     = 500
)

var (
	ErrInvalidResource = errors.New("invalid job resource")
	ErrResourceMissing = errors.New("job resource not found")
)

type ResourceACL struct {
	CanRead   bool `json:"canRead"`
	CanWrite  bool `json:"canWrite"`
	CanExport bool `json:"canExport"`
	CanClone  bool `json:"canClone"`
}

type Resource struct {
	Kind    string `json:"kind"`
	Enabled bool   `json:"enabled"`
	ResourceACL
	Preset ResourceACL `json:"preset"`
}

type ResourcePatch struct {
	Enabled   *bool
	CanRead   *bool
	CanWrite  *bool
	CanExport *bool
	CanClone  *bool
}

func (p ResourcePatch) empty() bool {
	return p.Enabled == nil && p.CanRead == nil && p.CanWrite == nil &&
		p.CanExport == nil && p.CanClone == nil
}

func (s *Store) ListResources(ctx context.Context, jobID, userID uuid.UUID) ([]Resource, error) {
	rows, err := s.pool.Query(ctx, effectiveResourcesQuery+` ORDER BY p.kind`, jobID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	resources := make([]Resource, 0)
	for rows.Next() {
		resource, err := scanResource(rows)
		if err != nil {
			return nil, err
		}
		resources = append(resources, resource)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(resources) == 0 {
		if _, err := s.RoleOf(ctx, jobID, userID); err != nil {
			return nil, err
		}
	}
	return resources, nil
}

func (s *Store) EffectiveResource(ctx context.Context, jobID, userID uuid.UUID, kind string) (Resource, error) {
	resource, err := scanResource(s.pool.QueryRow(
		ctx, effectiveResourcesQuery+` AND p.kind = $3`, jobID, userID, kind,
	))
	if errors.Is(err, pgx.ErrNoRows) {
		if _, roleErr := s.RoleOf(ctx, jobID, userID); roleErr != nil {
			return Resource{}, roleErr
		}
		return Resource{}, ErrResourceMissing
	}
	return resource, err
}

const effectiveResourcesQuery = `
	SELECT p.kind,
	       CASE m.role
	         WHEN 'owner' THEN p.enabled
	         ELSE p.enabled AND COALESCE(o.enabled, true) END AS enabled,
	       CASE m.role
	         WHEN 'owner' THEN p.can_read
	         WHEN 'translator' THEN p.can_read AND COALESCE(o.can_read, true)
	         ELSE p.can_read AND COALESCE(o.can_read, true) END AS can_read,
	       CASE m.role
	         WHEN 'owner' THEN p.can_write
	         WHEN 'translator' THEN p.can_write AND COALESCE(o.can_write, true)
	         ELSE false END AS can_write,
	       CASE m.role
	         WHEN 'owner' THEN p.can_export
	         WHEN 'translator' THEN p.can_export AND COALESCE(o.can_export, true)
	         ELSE false END AS can_export,
	       CASE m.role
	         WHEN 'owner' THEN p.can_clone
	         WHEN 'translator' THEN p.can_clone AND COALESCE(o.can_clone, true)
	         ELSE false END AS can_clone,
	       p.can_read, p.can_write, p.can_export, p.can_clone
	FROM job_resource_presets p
	JOIN job_members m ON m.job_id = p.job_id AND m.user_id = $2
	LEFT JOIN job_member_resource_overrides o
	  ON o.job_id = p.job_id AND o.user_id = m.user_id AND o.kind = p.kind
	WHERE p.job_id = $1`

func scanResource(row interface{ Scan(dest ...any) error }) (Resource, error) {
	var resource Resource
	err := row.Scan(
		&resource.Kind, &resource.Enabled,
		&resource.CanRead, &resource.CanWrite, &resource.CanExport, &resource.CanClone,
		&resource.Preset.CanRead, &resource.Preset.CanWrite,
		&resource.Preset.CanExport, &resource.Preset.CanClone,
	)
	return resource, err
}

func (s *Store) PatchResourcePreset(
	ctx context.Context,
	jobID, userID uuid.UUID,
	kind string,
	patch ResourcePatch,
) (Resource, error) {
	if kind != JobTMResourceKind || patch.empty() {
		return Resource{}, ErrInvalidResource
	}
	var preset ResourceACL
	err := s.pool.QueryRow(ctx, `
		INSERT INTO job_resource_presets (
			job_id, kind, enabled, can_read, can_write, can_export, can_clone
		) VALUES (
			$1, $2, COALESCE($3, false), COALESCE($4, true), COALESCE($5, true),
			COALESCE($6, false), COALESCE($7, false)
		)
		ON CONFLICT (job_id, kind) DO UPDATE SET
			enabled = COALESCE($3, job_resource_presets.enabled),
			can_read = COALESCE($4, job_resource_presets.can_read),
			can_write = COALESCE($5, job_resource_presets.can_write),
			can_export = COALESCE($6, job_resource_presets.can_export),
			can_clone = COALESCE($7, job_resource_presets.can_clone),
			updated_at = now()
		RETURNING can_read, can_write, can_export, can_clone
	`, jobID, kind, patch.Enabled, patch.CanRead, patch.CanWrite, patch.CanExport, patch.CanClone).Scan(
		&preset.CanRead, &preset.CanWrite, &preset.CanExport, &preset.CanClone,
	)
	if err != nil {
		return Resource{}, err
	}
	return s.EffectiveResource(ctx, jobID, userID, kind)
}

func (s *Store) PatchMemberResource(
	ctx context.Context,
	jobID, userID uuid.UUID,
	kind string,
	patch ResourcePatch,
) (Resource, error) {
	if kind != JobTMResourceKind || patch.empty() {
		return Resource{}, ErrInvalidResource
	}
	if _, err := s.RoleOf(ctx, jobID, userID); err != nil {
		return Resource{}, err
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO job_member_resource_overrides (
			job_id, user_id, kind, enabled, can_read, can_write, can_export, can_clone
		) VALUES ($1, $2, $3, COALESCE($4, true), $5, $6, $7, $8)
		ON CONFLICT (job_id, user_id, kind) DO UPDATE SET
			enabled = COALESCE($4, job_member_resource_overrides.enabled),
			can_read = COALESCE($5, job_member_resource_overrides.can_read),
			can_write = COALESCE($6, job_member_resource_overrides.can_write),
			can_export = COALESCE($7, job_member_resource_overrides.can_export),
			can_clone = COALESCE($8, job_member_resource_overrides.can_clone),
			updated_at = now()
	`, jobID, userID, kind, patch.Enabled, patch.CanRead, patch.CanWrite, patch.CanExport, patch.CanClone)
	if err != nil {
		return Resource{}, err
	}
	return s.EffectiveResource(ctx, jobID, userID, kind)
}

func (s *Store) PullJobTM(
	ctx context.Context,
	jobID uuid.UUID,
	since time.Time,
	limit int,
) ([]tm.Unit, bool, error) {
	if limit <= 0 {
		limit = jobTMPageSize
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, source, target, source_key, source_lang, target_lang,
		       created_at, updated_at, deleted_at, job_id::text, created_by, updated_by,
		       context_before, context_after
		FROM job_tm_units
		WHERE job_id = $1 AND updated_at > $2
		ORDER BY updated_at, id
		LIMIT $3
	`, jobID, since, limit+1)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()

	units := make([]tm.Unit, 0)
	for rows.Next() {
		unit, err := scanJobTMUnit(rows)
		if err != nil {
			return nil, false, err
		}
		units = append(units, unit)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	hasMore := len(units) > limit
	if hasMore {
		units = units[:limit]
	}
	return units, hasMore, nil
}

func (s *Store) UpsertJobTM(ctx context.Context, jobID uuid.UUID, actor string, unit tm.Unit) error {
	id, err := uuid.Parse(unit.ID)
	if err != nil {
		return err
	}
	createdAt, err := parseJobTMTime(unit.CreatedAt)
	if err != nil || createdAt.IsZero() {
		return errors.New("invalid createdAt")
	}
	updatedAt, err := parseJobTMTime(unit.UpdatedAt)
	if err != nil || updatedAt.IsZero() {
		return errors.New("invalid updatedAt")
	}
	var deletedAt *time.Time
	if unit.DeletedAt != nil && *unit.DeletedAt != "" {
		value, err := parseJobTMTime(*unit.DeletedAt)
		if err != nil {
			return errors.New("invalid deletedAt")
		}
		deletedAt = &value
	}
	actor = strings.TrimSpace(actor)
	if actor == "" || strings.Contains(actor, "@") {
		return errors.New("invalid actor")
	}

	_, err = s.pool.Exec(ctx, `
		INSERT INTO job_tm_units (
			job_id, id, source, target, source_key, source_lang, target_lang,
			created_at, updated_at, deleted_at, created_by, updated_by,
			context_before, context_after
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12,$13)
		ON CONFLICT (job_id, id) DO UPDATE SET
			source = EXCLUDED.source,
			target = EXCLUDED.target,
			source_key = EXCLUDED.source_key,
			source_lang = EXCLUDED.source_lang,
			target_lang = EXCLUDED.target_lang,
			updated_at = EXCLUDED.updated_at,
			deleted_at = EXCLUDED.deleted_at,
			updated_by = EXCLUDED.updated_by,
			context_before = EXCLUDED.context_before,
			context_after = EXCLUDED.context_after
		WHERE job_tm_units.updated_at < EXCLUDED.updated_at
	`, jobID, id, unit.Source, unit.Target, unit.SourceKey, unit.SourceLang, unit.TargetLang,
		createdAt, updatedAt, deletedAt, actor, unit.ContextBefore, unit.ContextAfter)
	return err
}

func scanJobTMUnit(row interface{ Scan(dest ...any) error }) (tm.Unit, error) {
	var (
		id                                                       uuid.UUID
		source, target, sourceKey                                string
		sourceLang, targetLang                                   *string
		createdAt, updatedAt                                     time.Time
		deletedAt                                                *time.Time
		jobID, createdBy, updatedBy, contextBefore, contextAfter *string
	)
	err := row.Scan(
		&id, &source, &target, &sourceKey, &sourceLang, &targetLang,
		&createdAt, &updatedAt, &deletedAt, &jobID, &createdBy, &updatedBy,
		&contextBefore, &contextAfter,
	)
	if err != nil {
		return tm.Unit{}, err
	}
	unit := tm.Unit{
		ID: id.String(), Source: source, Target: target, SourceKey: sourceKey,
		SourceLang: sourceLang, TargetLang: targetLang,
		CreatedAt: createdAt.UTC().Format(time.RFC3339Nano),
		UpdatedAt: updatedAt.UTC().Format(time.RFC3339Nano),
		ProjectID: jobID, CreatedBy: createdBy, UpdatedBy: updatedBy,
		ContextBefore: contextBefore, ContextAfter: contextAfter,
	}
	if deletedAt != nil {
		value := deletedAt.UTC().Format(time.RFC3339Nano)
		unit.DeletedAt = &value
	}
	return unit, nil
}

func parseJobTMTime(value string) (time.Time, error) {
	if value == "" {
		return time.Time{}, nil
	}
	if parsed, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return parsed, nil
	}
	return time.Parse(time.RFC3339, value)
}
