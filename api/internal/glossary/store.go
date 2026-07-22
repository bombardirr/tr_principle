package glossary

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

func (s *Store) Pull(ctx context.Context, userID uuid.UUID, since time.Time, limit int) ([]Term, bool, error) {
	if limit <= 0 {
		limit = pageSize
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, base_id, source_lang, target_lang, source_term, target_term, status, note,
		       case_sensitive, created_at, updated_at, deleted_at, created_by
		FROM glossary_terms
		WHERE user_id = $1 AND updated_at > $2
		ORDER BY updated_at ASC, id ASC
		LIMIT $3`, userID, since, limit+1)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()

	var out []Term
	for rows.Next() {
		t, err := scanTerm(rows)
		if err != nil {
			return nil, false, err
		}
		out = append(out, t)
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

func (s *Store) PullByBase(ctx context.Context, ownerID uuid.UUID, baseID string, since time.Time, limit int) ([]Term, bool, error) {
	if limit <= 0 {
		limit = pageSize
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, base_id, source_lang, target_lang, source_term, target_term, status, note,
		       case_sensitive, created_at, updated_at, deleted_at, created_by
		FROM glossary_terms
		WHERE user_id = $1 AND base_id = $2 AND updated_at > $3
		ORDER BY updated_at ASC, id ASC
		LIMIT $4`, ownerID, baseID, since, limit+1)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()

	var out []Term
	for rows.Next() {
		term, err := scanTerm(rows)
		if err != nil {
			return nil, false, err
		}
		out = append(out, term)
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

func (s *Store) UpsertLWW(ctx context.Context, userID uuid.UUID, term Term) error {
	id, err := uuid.Parse(term.ID)
	if err != nil {
		return err
	}
	if term.SourceLang == "" || term.TargetLang == "" || term.SourceTerm == "" || term.TargetTerm == "" {
		return errors.New("invalid term")
	}
	status := term.Status
	if status != "approved" && status != "forbidden" {
		status = "approved"
	}
	createdAt, err := parseTime(term.CreatedAt)
	if err != nil || createdAt.IsZero() {
		return errors.New("invalid createdAt")
	}
	updatedAt, err := parseTime(term.UpdatedAt)
	if err != nil || updatedAt.IsZero() {
		return errors.New("invalid updatedAt")
	}
	var deletedAt *time.Time
	if term.DeletedAt != nil && *term.DeletedAt != "" {
		t, err := parseTime(*term.DeletedAt)
		if err != nil {
			return errors.New("invalid deletedAt")
		}
		deletedAt = &t
	}
	baseID := term.BaseID
	if baseID == "" {
		baseID = personalBaseID
	}

	_, err = s.pool.Exec(ctx, `
		INSERT INTO glossary_terms (
			user_id, id, base_id, source_lang, target_lang, source_term, target_term, status, note,
			case_sensitive, created_at, updated_at, deleted_at, created_by
		) VALUES (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
		)
		ON CONFLICT (user_id, id) DO UPDATE SET
			source_lang = EXCLUDED.source_lang,
			target_lang = EXCLUDED.target_lang,
			source_term = EXCLUDED.source_term,
			target_term = EXCLUDED.target_term,
			status = EXCLUDED.status,
			note = EXCLUDED.note,
			case_sensitive = EXCLUDED.case_sensitive,
			created_at = EXCLUDED.created_at,
			updated_at = EXCLUDED.updated_at,
			deleted_at = EXCLUDED.deleted_at,
			created_by = EXCLUDED.created_by,
			base_id = EXCLUDED.base_id
		WHERE glossary_terms.updated_at < EXCLUDED.updated_at`,
		userID, id, baseID, term.SourceLang, term.TargetLang, term.SourceTerm, term.TargetTerm,
		status, term.Note, term.CaseSensitive, createdAt, updatedAt, deletedAt, term.CreatedBy,
	)
	return err
}

func scanTerm(row interface{ Scan(dest ...any) error }) (Term, error) {
	var (
		id                             uuid.UUID
		baseID                         string
		sourceLang, targetLang         string
		sourceTerm, targetTerm, status string
		note, createdBy                *string
		caseSensitive                  bool
		createdAt, updatedAt           time.Time
		deletedAt                      *time.Time
	)
	err := row.Scan(
		&id, &baseID, &sourceLang, &targetLang, &sourceTerm, &targetTerm, &status, &note,
		&caseSensitive, &createdAt, &updatedAt, &deletedAt, &createdBy,
	)
	if err != nil {
		return Term{}, err
	}
	t := Term{
		ID:            id.String(),
		BaseID:        baseID,
		SourceLang:    sourceLang,
		TargetLang:    targetLang,
		SourceTerm:    sourceTerm,
		TargetTerm:    targetTerm,
		Status:        status,
		Note:          note,
		CaseSensitive: caseSensitive,
		CreatedAt:     formatTime(createdAt),
		UpdatedAt:     formatTime(updatedAt),
		CreatedBy:     createdBy,
	}
	if deletedAt != nil {
		s := formatTime(*deletedAt)
		t.DeletedAt = &s
	}
	return t, nil
}
