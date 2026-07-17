package collab

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var ErrInvalidSync = errors.New("invalid sync payload")

type SyncState struct {
	Meta      json.RawMessage
	Segments  json.RawMessage
	DocxHash  *string
	UpdatedAt time.Time
}

func (s *Store) PullSyncState(ctx context.Context, projectID uuid.UUID) (SyncState, error) {
	var state SyncState
	err := s.pool.QueryRow(ctx, `
		SELECT meta, segments, docx_hash, updated_at
		FROM project_sync_state WHERE project_id = $1
	`, projectID).Scan(&state.Meta, &state.Segments, &state.DocxHash, &state.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return SyncState{Meta: json.RawMessage("{}"), Segments: json.RawMessage("[]"), UpdatedAt: time.Time{}}, nil
	}
	return state, err
}

func (s *Store) PushSyncState(ctx context.Context, projectID uuid.UUID, meta, segments json.RawMessage, docxHash *string) (SyncState, error) {
	if len(meta) == 0 {
		meta = json.RawMessage("{}")
	}
	if len(segments) == 0 || !json.Valid(meta) || !json.Valid(segments) {
		return SyncState{}, ErrInvalidSync
	}
	var state SyncState
	err := s.pool.QueryRow(ctx, `
		INSERT INTO project_sync_state (project_id, meta, segments, docx_hash, updated_at)
		VALUES ($1, $2, $3, $4, now())
		ON CONFLICT (project_id) DO UPDATE SET
			meta = EXCLUDED.meta,
			segments = EXCLUDED.segments,
			docx_hash = EXCLUDED.docx_hash,
			updated_at = now()
		RETURNING meta, segments, docx_hash, updated_at
	`, projectID, meta, segments, docxHash).Scan(
		&state.Meta, &state.Segments, &state.DocxHash, &state.UpdatedAt,
	)
	return state, err
}
