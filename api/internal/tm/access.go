package tm

import (
	"context"
	"errors"

	"github.com/google/uuid"
)

var (
	ErrForbidden     = errors.New("forbidden")
	ErrJobIDRequired = errors.New("jobId required")
)

// ResolveBaseAccess resolves the row owner and effective attachment permissions.
// An owner catalog row always grants the caller full access.
func (s *Store) ResolveBaseAccess(
	ctx context.Context,
	caller uuid.UUID,
	baseID string,
	jobID *uuid.UUID,
) (owner uuid.UUID, canRead, canWrite bool, err error) {
	if jobID == nil {
		owned, err := s.baseExists(ctx, caller, baseID)
		if err != nil {
			return uuid.Nil, false, false, err
		}
		if owned {
			return caller, true, true, nil
		}
	}
	if baseID == personalBaseID && jobID == nil {
		return uuid.Nil, false, false, ErrJobIDRequired
	}

	rows, err := s.pool.Query(ctx, `
		SELECT j.owner_user_id,
		       bool_or(a.can_read),
		       bool_or(a.can_write)
		FROM job_tm_attachments a
		JOIN jobs j ON j.id = a.job_id
		JOIN job_members m ON m.job_id = j.id AND m.user_id = $1
		WHERE a.tm_base_id = $2
		  AND ($3::uuid IS NULL OR j.id = $3)
		GROUP BY j.owner_user_id
		ORDER BY j.owner_user_id
	`, caller, baseID, jobID)
	if err != nil {
		return uuid.Nil, false, false, err
	}
	defer rows.Close()

	type access struct {
		owner             uuid.UUID
		canRead, canWrite bool
	}
	var matches []access
	for rows.Next() {
		var match access
		if err := rows.Scan(&match.owner, &match.canRead, &match.canWrite); err != nil {
			return uuid.Nil, false, false, err
		}
		matches = append(matches, match)
	}
	if err := rows.Err(); err != nil {
		return uuid.Nil, false, false, err
	}
	if len(matches) == 0 {
		return uuid.Nil, false, false, ErrForbidden
	}
	if len(matches) > 1 && jobID == nil {
		return uuid.Nil, false, false, ErrJobIDRequired
	}
	return matches[0].owner, matches[0].canRead, matches[0].canWrite, nil
}
