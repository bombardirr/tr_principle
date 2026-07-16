package auth

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type User struct {
	ID             uuid.UUID
	Email          string
	DisplayName    string
	PasswordHash   string
	SessionVersion int
	IsAdmin        bool
	Subscription   Subscription
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
	err := row.Scan(
		&u.ID,
		&u.Email,
		&displayName,
		&u.PasswordHash,
		&u.SessionVersion,
		&u.IsAdmin,
		&plan,
		&status,
	)
	if err != nil {
		return scannedUser{}, err
	}
	if displayName != nil {
		u.DisplayName = *displayName
	}
	out := scannedUser{User: u}
	if plan != nil && status != nil {
		out.Subscription = Subscription{Plan: *plan, Status: *status}
	} else {
		out.Subscription = DefaultFreeSubscription()
		out.missingSub = true
	}
	return out, nil
}

const userSelect = `
	SELECT u.id, u.email, u.display_name, u.password_hash, u.session_version, u.is_admin,
	       s.plan, s.status
	FROM users u
	LEFT JOIN subscriptions s ON s.user_id = u.id
`

func (s *Store) CreateUser(ctx context.Context, email, passwordHash string) (User, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback(ctx)

	var u User
	var displayName *string
	err = tx.QueryRow(ctx, `
		INSERT INTO users (email, password_hash)
		VALUES ($1, $2)
		RETURNING id, email, display_name, password_hash, session_version, is_admin
	`, email, passwordHash).Scan(
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
	if !sc.missingSub {
		return sc.User, nil
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO subscriptions (user_id, plan, status)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id) DO NOTHING
	`, sc.ID, PlanFree, StatusActive)
	if err != nil {
		return sc.User, err
	}
	sc.Subscription = DefaultFreeSubscription()
	return sc.User, nil
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
