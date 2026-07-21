package jobs

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var (
	ErrJobNotFound  = errors.New("job not found")
	ErrMemberAbsent = errors.New("job member not found")
	ErrOwnerMember  = errors.New("owner cannot be removed")
	ErrJobArchived  = errors.New("job archived")
	ErrOwnerLeave   = errors.New("owner cannot leave")
)

type JobPatch struct {
	Title          *string
	SourceLang     *string
	TargetLang     *string
	SourceFilename *string
	SourceHash     *string
}

type MemberPatch struct {
	PartDone       *bool
	ProgressDone   *int
	ProgressTotal  *int
	ProgressTm     *int
	LocalProjectID *uuid.UUID
}

type RosterMember struct {
	UserID         uuid.UUID  `json:"userId"`
	DisplayName    string     `json:"displayName"`
	Role           Role       `json:"role"`
	PartDone       bool       `json:"partDone"`
	ProgressDone   int        `json:"progressDone"`
	ProgressTotal  int        `json:"progressTotal"`
	ProgressTm     int        `json:"progressTm"`
	LastActiveAt   *time.Time `json:"lastActiveAt"`
	LocalProjectID *uuid.UUID `json:"-"`
	JoinedAt       time.Time  `json:"-"`
}

func (s *Store) ListJobs(ctx context.Context, userID uuid.UUID) ([]Job, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT j.id, j.owner_user_id, j.title,
		       COALESCE(j.source_lang, ''), COALESCE(j.target_lang, ''),
		       COALESCE(j.source_filename, ''), COALESCE(j.source_hash, ''),
		       j.created_at, j.updated_at, j.archived_at,
		       EXISTS(SELECT 1 FROM job_originals o WHERE o.job_id = j.id) AS has_original,
		       COALESCE((SELECT o.filename FROM job_originals o WHERE o.job_id = j.id), '') AS original_filename
		FROM jobs j
		JOIN job_members m ON m.job_id = j.id
		WHERE m.user_id = $1
		ORDER BY j.archived_at NULLS FIRST, j.updated_at DESC, j.id
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]Job, 0)
	for rows.Next() {
		job, err := scanJob(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, job)
	}
	return result, rows.Err()
}

func (s *Store) GetJob(ctx context.Context, jobID, userID uuid.UUID) (Job, error) {
	job, err := scanJob(s.pool.QueryRow(ctx, `
		SELECT j.id, j.owner_user_id, j.title,
		       COALESCE(j.source_lang, ''), COALESCE(j.target_lang, ''),
		       COALESCE(j.source_filename, ''), COALESCE(j.source_hash, ''),
		       j.created_at, j.updated_at, j.archived_at,
		       EXISTS(SELECT 1 FROM job_originals o WHERE o.job_id = j.id) AS has_original,
		       COALESCE((SELECT o.filename FROM job_originals o WHERE o.job_id = j.id), '') AS original_filename
		FROM jobs j
		JOIN job_members m ON m.job_id = j.id
		WHERE j.id = $1 AND m.user_id = $2
	`, jobID, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, ErrJobNotFound
	}
	return job, err
}

func (s *Store) ArchiveJob(ctx context.Context, jobID, ownerID uuid.UUID) (Job, error) {
	job, err := scanJob(s.pool.QueryRow(ctx, `
		UPDATE jobs
		SET archived_at = COALESCE(archived_at, now()),
		    updated_at = now()
		WHERE id = $1 AND owner_user_id = $2
		RETURNING id, owner_user_id, title,
		          COALESCE(source_lang, ''), COALESCE(target_lang, ''),
		          COALESCE(source_filename, ''), COALESCE(source_hash, ''),
		          created_at, updated_at, archived_at,
		          EXISTS(SELECT 1 FROM job_originals o WHERE o.job_id = jobs.id) AS has_original,
		          COALESCE((SELECT o.filename FROM job_originals o WHERE o.job_id = jobs.id), '') AS original_filename
	`, jobID, ownerID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, ErrJobNotFound
	}
	return job, err
}

func (s *Store) LeaveJob(ctx context.Context, jobID, userID uuid.UUID) error {
	var role Role
	err := s.pool.QueryRow(ctx, `
		SELECT role FROM job_members WHERE job_id = $1 AND user_id = $2
	`, jobID, userID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrMemberAbsent
	}
	if err != nil {
		return err
	}
	if role == RoleOwner {
		return ErrOwnerLeave
	}
	tag, err := s.pool.Exec(ctx, `
		DELETE FROM job_members WHERE job_id = $1 AND user_id = $2 AND role <> 'owner'
	`, jobID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrMemberAbsent
	}
	return nil
}

func (s *Store) DeleteJob(ctx context.Context, jobID, ownerID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `
		DELETE FROM jobs WHERE id = $1 AND owner_user_id = $2
	`, jobID, ownerID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrJobNotFound
	}
	return nil
}

func (s *Store) IsArchived(ctx context.Context, jobID uuid.UUID) (bool, error) {
	var archived bool
	err := s.pool.QueryRow(ctx, `
		SELECT archived_at IS NOT NULL FROM jobs WHERE id = $1
	`, jobID).Scan(&archived)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, ErrJobNotFound
	}
	return archived, err
}

func (s *Store) UpdateJob(ctx context.Context, jobID, ownerID uuid.UUID, patch JobPatch) (Job, bool, error) {
	if patch.Title != nil && strings.TrimSpace(*patch.Title) == "" {
		return Job{}, false, ErrInvalidJob
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Job{}, false, err
	}
	defer tx.Rollback(ctx)

	var currentSourceHash string
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(source_hash, '')
		FROM jobs
		WHERE id = $1 AND owner_user_id = $2
		FOR UPDATE
	`, jobID, ownerID).Scan(&currentSourceHash); errors.Is(err, pgx.ErrNoRows) {
		return Job{}, false, ErrJobNotFound
	} else if err != nil {
		return Job{}, false, err
	}

	if _, err := tx.Exec(ctx, `
		UPDATE jobs
		SET title = COALESCE($3, title),
		    source_lang = COALESCE($4, source_lang),
		    target_lang = COALESCE($5, target_lang),
		    source_filename = COALESCE($6, source_filename),
		    source_hash = COALESCE($7, source_hash),
		    updated_at = now()
		WHERE id = $1 AND owner_user_id = $2
	`, jobID, ownerID, patch.Title, patch.SourceLang, patch.TargetLang, patch.SourceFilename, patch.SourceHash); err != nil {
		return Job{}, false, err
	}

	originalRevoked := false
	if patch.SourceHash != nil &&
		strings.TrimSpace(*patch.SourceHash) != "" &&
		*patch.SourceHash != currentSourceHash {
		tag, err := tx.Exec(ctx, `DELETE FROM job_originals WHERE job_id = $1`, jobID)
		if err != nil {
			return Job{}, false, err
		}
		originalRevoked = tag.RowsAffected() > 0
	}

	job, err := scanJob(tx.QueryRow(ctx, `
		SELECT j.id, j.owner_user_id, j.title,
		       COALESCE(j.source_lang, ''), COALESCE(j.target_lang, ''),
		       COALESCE(j.source_filename, ''), COALESCE(j.source_hash, ''),
		       j.created_at, j.updated_at, j.archived_at,
		       EXISTS(SELECT 1 FROM job_originals o WHERE o.job_id = j.id) AS has_original,
		       COALESCE((SELECT o.filename FROM job_originals o WHERE o.job_id = j.id), '') AS original_filename
		FROM jobs j
		WHERE j.id = $1
	`, jobID))
	if err != nil {
		return Job{}, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Job{}, false, err
	}
	return job, originalRevoked, nil
}

func (s *Store) ListMembers(ctx context.Context, jobID, requesterID uuid.UUID) ([]RosterMember, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT m.user_id, COALESCE(u.display_name, ''), m.role, m.part_done,
		       m.progress_done, m.progress_total, m.progress_tm, m.last_active_at,
		       m.local_project_id, m.joined_at
		FROM job_members m
		JOIN users u ON u.id = m.user_id
		WHERE m.job_id = $1
		  AND EXISTS (
			SELECT 1 FROM job_members requester
			WHERE requester.job_id = $1 AND requester.user_id = $2
		  )
		ORDER BY m.joined_at, m.user_id
	`, jobID, requesterID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]RosterMember, 0)
	for rows.Next() {
		var member RosterMember
		if err := rows.Scan(
			&member.UserID,
			&member.DisplayName,
			&member.Role,
			&member.PartDone,
			&member.ProgressDone,
			&member.ProgressTotal,
			&member.ProgressTm,
			&member.LastActiveAt,
			&member.LocalProjectID,
			&member.JoinedAt,
		); err != nil {
			return nil, err
		}
		result = append(result, member)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(result) == 0 {
		return nil, ErrJobNotFound
	}
	return result, nil
}

func (s *Store) PatchMemberMe(ctx context.Context, jobID, userID uuid.UUID, patch MemberPatch) (RosterMember, error) {
	if (patch.ProgressDone != nil && *patch.ProgressDone < 0) ||
		(patch.ProgressTotal != nil && *patch.ProgressTotal < 0) ||
		(patch.ProgressTm != nil && *patch.ProgressTm < 0) {
		return RosterMember{}, ErrInvalidJob
	}

	var member RosterMember
	err := s.pool.QueryRow(ctx, `
		UPDATE job_members m
		SET part_done = COALESCE($3, m.part_done),
		    progress_done = COALESCE($4, m.progress_done),
		    progress_total = COALESCE($5, m.progress_total),
		    progress_tm = COALESCE($6, m.progress_tm),
		    local_project_id = COALESCE($7, m.local_project_id),
		    last_active_at = now()
		FROM users u
		WHERE m.job_id = $1 AND m.user_id = $2 AND u.id = m.user_id
		RETURNING m.user_id, COALESCE(u.display_name, ''), m.role, m.part_done,
		          m.progress_done, m.progress_total, m.progress_tm, m.last_active_at,
		          m.local_project_id, m.joined_at
	`, jobID, userID, patch.PartDone, patch.ProgressDone, patch.ProgressTotal, patch.ProgressTm, patch.LocalProjectID).Scan(
		&member.UserID,
		&member.DisplayName,
		&member.Role,
		&member.PartDone,
		&member.ProgressDone,
		&member.ProgressTotal,
		&member.ProgressTm,
		&member.LastActiveAt,
		&member.LocalProjectID,
		&member.JoinedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return RosterMember{}, ErrMemberAbsent
	}
	return member, err
}

func (s *Store) RemoveMember(ctx context.Context, jobID, ownerID, memberID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `
		DELETE FROM job_members m
		USING jobs j
		WHERE m.job_id = $1
		  AND m.user_id = $3
		  AND m.role <> 'owner'
		  AND j.id = m.job_id
		  AND j.owner_user_id = $2
	`, jobID, ownerID, memberID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		var role Role
		err := s.pool.QueryRow(ctx, `
			SELECT role FROM job_members WHERE job_id = $1 AND user_id = $2
		`, jobID, memberID).Scan(&role)
		if err == nil && role == RoleOwner {
			return ErrOwnerMember
		}
		return ErrMemberAbsent
	}
	return nil
}

func (s *Store) ListInvites(ctx context.Context, jobID, ownerID uuid.UUID) ([]Invite, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT i.id, i.job_id, i.role, i.created_by, i.expires_at,
		       i.max_uses, i.uses_count, i.revoked_at, i.created_at
		FROM job_invites i
		JOIN jobs j ON j.id = i.job_id
		WHERE i.job_id = $1 AND j.owner_user_id = $2
		ORDER BY i.created_at DESC, i.id
	`, jobID, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]Invite, 0)
	for rows.Next() {
		var invite Invite
		if err := rows.Scan(
			&invite.ID,
			&invite.JobID,
			&invite.Role,
			&invite.CreatedBy,
			&invite.ExpiresAt,
			&invite.MaxUses,
			&invite.UsesCount,
			&invite.RevokedAt,
			&invite.CreatedAt,
		); err != nil {
			return nil, err
		}
		result = append(result, invite)
	}
	return result, rows.Err()
}

func (s *Store) RevokeInvite(ctx context.Context, jobID, inviteID, ownerID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE job_invites i
		SET revoked_at = COALESCE(i.revoked_at, now())
		FROM jobs j
		WHERE i.id = $1 AND i.job_id = $2
		  AND j.id = i.job_id AND j.owner_user_id = $3
	`, inviteID, jobID, ownerID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrInvalidInvite
	}
	return nil
}

func (s *Store) TransferOwner(ctx context.Context, jobID, currentOwnerID, nextOwnerID uuid.UUID) (Job, error) {
	if nextOwnerID == uuid.Nil || nextOwnerID == currentOwnerID {
		return Job{}, ErrInvalidJob
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Job{}, err
	}
	defer tx.Rollback(ctx)

	var actualOwner uuid.UUID
	if err := tx.QueryRow(ctx, `
		SELECT owner_user_id FROM jobs WHERE id = $1 FOR UPDATE
	`, jobID).Scan(&actualOwner); errors.Is(err, pgx.ErrNoRows) {
		return Job{}, ErrJobNotFound
	} else if err != nil {
		return Job{}, err
	}
	if actualOwner != currentOwnerID {
		return Job{}, ErrJobNotFound
	}

	tag, err := tx.Exec(ctx, `
		UPDATE job_members SET role = 'owner'
		WHERE job_id = $1 AND user_id = $2
	`, jobID, nextOwnerID)
	if err != nil {
		return Job{}, err
	}
	if tag.RowsAffected() == 0 {
		return Job{}, ErrMemberAbsent
	}
	if _, err := tx.Exec(ctx, `
		UPDATE job_members SET role = 'translator'
		WHERE job_id = $1 AND user_id = $2
	`, jobID, currentOwnerID); err != nil {
		return Job{}, err
	}

	job, err := scanJob(tx.QueryRow(ctx, `
		UPDATE jobs
		SET owner_user_id = $2, updated_at = now()
		WHERE id = $1
		RETURNING id, owner_user_id, title,
		          COALESCE(source_lang, ''), COALESCE(target_lang, ''),
		          COALESCE(source_filename, ''), COALESCE(source_hash, ''),
		          created_at, updated_at, archived_at,
		          EXISTS(SELECT 1 FROM job_originals o WHERE o.job_id = jobs.id) AS has_original,
		          COALESCE((SELECT o.filename FROM job_originals o WHERE o.job_id = jobs.id), '') AS original_filename
	`, jobID, nextOwnerID))
	if err != nil {
		return Job{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Job{}, err
	}
	return job, nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanJob(row rowScanner) (Job, error) {
	var job Job
	err := row.Scan(
		&job.ID,
		&job.OwnerUserID,
		&job.Title,
		&job.SourceLang,
		&job.TargetLang,
		&job.SourceFilename,
		&job.SourceHash,
		&job.CreatedAt,
		&job.UpdatedAt,
		&job.ArchivedAt,
		&job.HasOriginal,
		&job.OriginalFilename,
	)
	return job, err
}
