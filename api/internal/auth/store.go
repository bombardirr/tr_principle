package auth

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/bombardirr/tr_principle/api/internal/emailvalidate"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type User struct {
	ID               uuid.UUID
	Email            string
	DisplayName      string
	PasswordHash     string
	SessionVersion   int
	IsAdmin          bool
	HasRecoveryCode  bool
	Subscription     Subscription
}

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

type scannedUser struct {
	User
	missingSub bool
}

func scanUserRow(row pgx.Row) (scannedUser, error) {
	var u User
	var displayName *string
	var plan, status *string
	var periodEnd *time.Time
	var recoveryHash *string
	err := row.Scan(
		&u.ID,
		&u.Email,
		&displayName,
		&u.PasswordHash,
		&u.SessionVersion,
		&u.IsAdmin,
		&recoveryHash,
		&plan,
		&status,
		&periodEnd,
	)
	if err != nil {
		return scannedUser{}, err
	}
	if displayName != nil {
		u.DisplayName = *displayName
	}
	u.HasRecoveryCode = recoveryHash != nil && *recoveryHash != ""
	out := scannedUser{User: u}
	if plan != nil && status != nil {
		out.Subscription = Subscription{
			Plan:             *plan,
			Status:           *status,
			CurrentPeriodEnd: periodEnd,
		}
	} else {
		out.Subscription = DefaultFreeSubscription()
		out.missingSub = true
	}
	return out, nil
}

const userSelect = `
	SELECT u.id, u.email, u.display_name, u.password_hash, u.session_version, u.is_admin,
	       u.recovery_code_hash, s.plan, s.status, s.current_period_end
	FROM users u
	LEFT JOIN subscriptions s ON s.user_id = u.id
`

func (s *Store) CreateUser(ctx context.Context, email, passwordHash, recoveryCodeHash string) (User, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback(ctx)

	var u User
	var displayName *string
	err = tx.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, recovery_code_hash)
		VALUES ($1, $2, $3)
		RETURNING id, email, display_name, password_hash, session_version, is_admin
	`, email, passwordHash, recoveryCodeHash).Scan(
		&u.ID, &u.Email, &displayName, &u.PasswordHash, &u.SessionVersion, &u.IsAdmin,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return User{}, ErrEmailTaken
		}
		return User{}, err
	}
	if displayName != nil {
		u.DisplayName = *displayName
	}
	u.HasRecoveryCode = recoveryCodeHash != ""

	_, err = tx.Exec(ctx, `
		INSERT INTO subscriptions (user_id, plan, status)
		VALUES ($1, $2, $3)
	`, u.ID, PlanFree, StatusActive)
	if err != nil {
		return User{}, err
	}
	u.Subscription = DefaultFreeSubscription()

	if err := tx.Commit(ctx); err != nil {
		return User{}, err
	}
	return u, nil
}

func (s *Store) FindByEmail(ctx context.Context, email string) (User, error) {
	sc, err := scanUserRow(s.pool.QueryRow(ctx, userSelect+`
		WHERE lower(u.email) = lower($1)
	`, email))
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrInvalidCredentials
	}
	if err != nil {
		return User{}, err
	}
	return s.ensureSubscription(ctx, sc)
}

func (s *Store) FindByID(ctx context.Context, id uuid.UUID) (User, error) {
	sc, err := scanUserRow(s.pool.QueryRow(ctx, userSelect+`
		WHERE u.id = $1
	`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrUnauthorized
	}
	if err != nil {
		return User{}, err
	}
	return s.ensureSubscription(ctx, sc)
}

func (s *Store) UpdateDisplayName(ctx context.Context, id uuid.UUID, displayName string) (User, error) {
	tag, err := s.pool.Exec(ctx, `
		UPDATE users SET display_name = NULLIF(trim($2), '')
		WHERE id = $1
	`, id, displayName)
	if err != nil {
		return User{}, err
	}
	if tag.RowsAffected() == 0 {
		return User{}, ErrUnauthorized
	}
	return s.FindByID(ctx, id)
}

func (s *Store) BumpSession(ctx context.Context, id uuid.UUID) (int, error) {
	var sv int
	err := s.pool.QueryRow(ctx, `
		UPDATE users SET session_version = session_version + 1
		WHERE id = $1
		RETURNING session_version
	`, id).Scan(&sv)
	return sv, err
}

func (s *Store) ensureSubscription(ctx context.Context, sc scannedUser) (User, error) {
	if sc.missingSub {
		_, err := s.pool.Exec(ctx, `
			INSERT INTO subscriptions (user_id, plan, status)
			VALUES ($1, $2, $3)
			ON CONFLICT (user_id) DO NOTHING
		`, sc.ID, PlanFree, StatusActive)
		if err != nil {
			return sc.User, err
		}
		sc.Subscription = DefaultFreeSubscription()
	}
	return s.expireSubscriptionIfNeeded(ctx, sc.User)
}

func (s *Store) SetRecoveryCodeHash(ctx context.Context, userID uuid.UUID, hash string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE users SET recovery_code_hash = $2 WHERE id = $1
	`, userID, hash)
	return err
}

func (s *Store) ResetPasswordWithRecovery(ctx context.Context, email, recoveryCode, newPasswordHash string) error {
	normEmail, err := emailvalidate.NormalizeAndValidate(email)
	if err != nil {
		return ErrInvalidCredentials
	}
	if err := ValidateRecoveryCodeFormat(recoveryCode); err != nil {
		return ErrInvalidCredentials
	}
	codeHash := HashRecoveryCode(recoveryCode)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var userID uuid.UUID
	var storedHash *string
	err = tx.QueryRow(ctx, `
		SELECT id, recovery_code_hash FROM users WHERE lower(email) = lower($1) FOR UPDATE
	`, normEmail).Scan(&userID, &storedHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInvalidCredentials
	}
	if err != nil {
		return err
	}
	if storedHash == nil || *storedHash == "" || *storedHash != codeHash {
		return ErrInvalidCredentials
	}
	_, err = tx.Exec(ctx, `
		UPDATE users
		SET password_hash = $2, session_version = session_version + 1
		WHERE id = $1
	`, userID, newPasswordHash)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// SyncStorageGrace sets/clears the 90-day over-quota clock for free users.
func (s *Store) SyncStorageGrace(ctx context.Context, userID uuid.UUID) error {
	u, err := s.FindByID(ctx, userID)
	if err != nil {
		return err
	}
	used, err := s.CloudStorageUsed(ctx, userID)
	if err != nil {
		return err
	}
	over := !EffectivePro(u.Subscription) && used > FreeStorageBytes
	if over {
		_, err = s.pool.Exec(ctx, `
			UPDATE subscriptions
			SET storage_grace_started_at = COALESCE(storage_grace_started_at, now()), updated_at = now()
			WHERE user_id = $1
		`, userID)
		return err
	}
	_, err = s.pool.Exec(ctx, `
		UPDATE subscriptions
		SET storage_grace_started_at = NULL, updated_at = now()
		WHERE user_id = $1 AND storage_grace_started_at IS NOT NULL
	`, userID)
	return err
}

const StorageGraceDays = 90

type graceCandidate struct {
	UserID uuid.UUID
}

func (s *Store) ListUsersPastStorageGrace(ctx context.Context) ([]uuid.UUID, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT user_id FROM subscriptions
		WHERE storage_grace_started_at IS NOT NULL
		  AND storage_grace_started_at <= now() - interval '90 days'
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// CancelProForUser forces free after admin key revoke.
func (s *Store) CancelProForUser(ctx context.Context, userID uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE subscriptions
		SET plan = $2, status = $3, current_period_end = now(), updated_at = now()
		WHERE user_id = $1
	`, userID, PlanFree, StatusCanceled)
	return err
}

func (s *Store) Pool() *pgxpool.Pool {
	return s.pool
}

type RateLimiter struct {
	mu     sync.Mutex
	hits   map[string][]time.Time
	limit  int
	window time.Duration
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		hits:   make(map[string][]time.Time),
		limit:  limit,
		window: window,
	}
}

func (r *RateLimiter) Allow(key string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-r.window)
	list := r.hits[key]
	kept := list[:0]
	for _, t := range list {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= r.limit {
		r.hits[key] = kept
		return false
	}
	kept = append(kept, now)
	r.hits[key] = kept
	return true
}
