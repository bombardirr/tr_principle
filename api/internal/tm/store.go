package tm

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func (s *Store) Pull(ctx context.Context, userID uuid.UUID, since time.Time, limit int) ([]Unit, bool, error) {
	if limit <= 0 {
		limit = pageSize
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, source, target, source_key, source_lang, target_lang,
		       created_at, updated_at, deleted_at, project_id, created_by, updated_by,
		       context_before, context_after, base_id
		FROM tm_units
		WHERE user_id = $1 AND updated_at > $2
		ORDER BY updated_at ASC, id ASC
		LIMIT $3`, userID, since, limit+1)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()

	var out []Unit
	for rows.Next() {
		u, err := scanUnit(rows)
		if err != nil {
			return nil, false, err
		}
		out = append(out, u)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	hasMore := len(out) > limit
	if hasMore {
		out = out[:limit]
	}
	return out, hasMore, nil
}

func (s *Store) PullByBase(ctx context.Context, ownerID uuid.UUID, baseID string, since time.Time, limit int) ([]Unit, bool, error) {
	if limit <= 0 {
		limit = pageSize
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, source, target, source_key, source_lang, target_lang,
		       created_at, updated_at, deleted_at, project_id, created_by, updated_by,
		       context_before, context_after, base_id
		FROM tm_units
		WHERE user_id = $1 AND base_id = $2 AND updated_at > $3
		ORDER BY updated_at ASC, id ASC
		LIMIT $4`, ownerID, baseID, since, limit+1)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()

	var out []Unit
	for rows.Next() {
		u, err := scanUnit(rows)
		if err != nil {
			return nil, false, err
		}
		out = append(out, u)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	hasMore := len(out) > limit
	if hasMore {
		out = out[:limit]
	}
	return out, hasMore, nil
}

func (s *Store) EnsureBase(ctx context.Context, ownerID uuid.UUID, id, label, color string) error {
	if color == "" {
		color = "#5b9fd4"
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO tm_bases (owner_id, id, label, color, created_at, updated_at)
		VALUES ($1, $2, $3, $4, now(), now())
		ON CONFLICT (owner_id, id) DO NOTHING`,
		ownerID, id, label, color)
	return err
}

func (s *Store) UpsertLWW(ctx context.Context, userID uuid.UUID, unit Unit) error {
	id, err := uuid.Parse(unit.ID)
	if err != nil {
		return err
	}
	createdAt, err := parseTime(unit.CreatedAt)
	if err != nil || createdAt.IsZero() {
		return errors.New("invalid createdAt")
	}
	updatedAt, err := parseTime(unit.UpdatedAt)
	if err != nil || updatedAt.IsZero() {
		return errors.New("invalid updatedAt")
	}
	var deletedAt *time.Time
	if unit.DeletedAt != nil && *unit.DeletedAt != "" {
		t, err := parseTime(*unit.DeletedAt)
		if err != nil {
			return errors.New("invalid deletedAt")
		}
		deletedAt = &t
	}

	baseID := unit.BaseID
	if baseID == "" {
		baseID = "personal-tm"
	}

	_, err = s.pool.Exec(ctx, `
		INSERT INTO tm_units (
			user_id, id, source, target, source_key, source_lang, target_lang,
			created_at, updated_at, deleted_at, project_id, created_by, updated_by,
			context_before, context_after, base_id
		) VALUES (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
		)
		ON CONFLICT (user_id, id) DO UPDATE SET
			source = EXCLUDED.source,
			target = EXCLUDED.target,
			source_key = EXCLUDED.source_key,
			source_lang = EXCLUDED.source_lang,
			target_lang = EXCLUDED.target_lang,
			created_at = EXCLUDED.created_at,
			updated_at = EXCLUDED.updated_at,
			deleted_at = EXCLUDED.deleted_at,
			project_id = EXCLUDED.project_id,
			created_by = EXCLUDED.created_by,
			updated_by = EXCLUDED.updated_by,
			context_before = EXCLUDED.context_before,
			context_after = EXCLUDED.context_after,
			base_id = EXCLUDED.base_id
		WHERE tm_units.updated_at < EXCLUDED.updated_at`,
		userID, id, unit.Source, unit.Target, unit.SourceKey,
		unit.SourceLang, unit.TargetLang,
		createdAt, updatedAt, deletedAt,
		unit.ProjectID, unit.CreatedBy, unit.UpdatedBy,
		unit.ContextBefore, unit.ContextAfter, baseID,
	)
	return err
}

func scanUnit(row interface{ Scan(dest ...any) error }) (Unit, error) {
	var (
		id                                              uuid.UUID
		source, target, sourceKey, baseID               string
		sourceLang, targetLang                          *string
		createdAt, updatedAt                            time.Time
		deletedAt                                       *time.Time
		projectID, createdBy, updatedBy                 *string
		contextBefore, contextAfter                     *string
	)
	err := row.Scan(
		&id, &source, &target, &sourceKey, &sourceLang, &targetLang,
		&createdAt, &updatedAt, &deletedAt, &projectID, &createdBy, &updatedBy,
		&contextBefore, &contextAfter, &baseID,
	)
	if err != nil {
		return Unit{}, err
	}
	u := Unit{
		ID:            id.String(),
		BaseID:        baseID,
		Source:        source,
		Target:        target,
		SourceKey:     sourceKey,
		SourceLang:    sourceLang,
		TargetLang:    targetLang,
		CreatedAt:     formatTime(createdAt),
		UpdatedAt:     formatTime(updatedAt),
		ProjectID:     projectID,
		CreatedBy:     createdBy,
		UpdatedBy:     updatedBy,
		ContextBefore: contextBefore,
		ContextAfter:  contextAfter,
	}
	if deletedAt != nil {
		s := formatTime(*deletedAt)
		u.DeletedAt = &s
	}
	return u, nil
}
