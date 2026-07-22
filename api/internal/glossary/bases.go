package glossary

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const (
	personalBaseID = "personal-glossary"
	defaultColor   = "#5b9fd4"
)

var (
	ErrBaseNotFound     = errors.New("base not found")
	ErrCannotDeleteBase = errors.New("personal-glossary cannot be deleted")
	ErrInvalidBase      = errors.New("invalid base")
)

type Base struct {
	ID        string  `json:"id"`
	Label     string  `json:"label"`
	Color     string  `json:"color"`
	CreatedAt string  `json:"createdAt"`
	UpdatedAt string  `json:"updatedAt"`
	DeletedAt *string `json:"deletedAt,omitempty"`
}

func (s *Store) EnsureBase(ctx context.Context, ownerID uuid.UUID, id, label, color string) error {
	id, label, color = strings.TrimSpace(id), strings.TrimSpace(label), strings.TrimSpace(color)
	if id == "" {
		return ErrInvalidBase
	}
	if label == "" {
		if id == personalBaseID {
			label = "Personal glossary"
		} else {
			label = id
		}
	}
	if color == "" {
		color = defaultColor
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO glossary_bases (owner_id, id, label, color, created_at, updated_at)
		VALUES ($1, $2, $3, $4, now(), now())
		ON CONFLICT (owner_id, id) DO UPDATE SET
			label = EXCLUDED.label, color = EXCLUDED.color, updated_at = now(), deleted_at = NULL
		WHERE glossary_bases.deleted_at IS NOT NULL`,
		ownerID, id, label, color)
	return err
}

func (s *Store) ListBases(ctx context.Context, ownerID uuid.UUID) ([]Base, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, label, color, created_at, updated_at, deleted_at
		FROM glossary_bases WHERE owner_id = $1 AND deleted_at IS NULL
		ORDER BY created_at ASC, id ASC`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	bases := make([]Base, 0)
	for rows.Next() {
		var base Base
		var createdAt, updatedAt time.Time
		var deletedAt *time.Time
		if err := rows.Scan(&base.ID, &base.Label, &base.Color, &createdAt, &updatedAt, &deletedAt); err != nil {
			return nil, err
		}
		base.CreatedAt, base.UpdatedAt = formatTime(createdAt), formatTime(updatedAt)
		if deletedAt != nil {
			value := formatTime(*deletedAt)
			base.DeletedAt = &value
		}
		bases = append(bases, base)
	}
	return bases, rows.Err()
}

func (s *Store) UpsertBase(ctx context.Context, ownerID uuid.UUID, id, label, color string) error {
	id, label, color = strings.TrimSpace(id), strings.TrimSpace(label), strings.TrimSpace(color)
	if id == "" || label == "" {
		return ErrInvalidBase
	}
	if color == "" {
		color = defaultColor
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO glossary_bases (owner_id, id, label, color, created_at, updated_at)
		VALUES ($1, $2, $3, $4, now(), now())
		ON CONFLICT (owner_id, id) DO UPDATE SET
			label = EXCLUDED.label, color = EXCLUDED.color, updated_at = now(), deleted_at = NULL`,
		ownerID, id, label, color)
	return err
}

func (s *Store) PatchBase(ctx context.Context, ownerID uuid.UUID, id string, label, color *string) error {
	if label == nil && color == nil {
		return ErrInvalidBase
	}
	var cleanLabel, cleanColor *string
	if label != nil {
		value := strings.TrimSpace(*label)
		if value == "" {
			return ErrInvalidBase
		}
		cleanLabel = &value
	}
	if color != nil {
		value := strings.TrimSpace(*color)
		if value == "" {
			return ErrInvalidBase
		}
		cleanColor = &value
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE glossary_bases SET label = COALESCE($3, label), color = COALESCE($4, color), updated_at = now()
		WHERE owner_id = $1 AND id = $2 AND deleted_at IS NULL`, ownerID, id, cleanLabel, cleanColor)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrBaseNotFound
	}
	return nil
}

func (s *Store) SoftDeleteBase(ctx context.Context, ownerID uuid.UUID, id string) error {
	if id == personalBaseID {
		return ErrCannotDeleteBase
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE glossary_bases SET deleted_at = now(), updated_at = now()
		WHERE owner_id = $1 AND id = $2 AND deleted_at IS NULL`, ownerID, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrBaseNotFound
	}
	return nil
}

func (s *Store) baseExists(ctx context.Context, ownerID uuid.UUID, id string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM glossary_bases WHERE owner_id = $1 AND id = $2 AND deleted_at IS NULL)`,
		ownerID, id).Scan(&exists)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return exists, err
}
