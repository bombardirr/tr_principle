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
}

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func scanUser(row pgx.Row) (User, error) {
	var u User
	var displayName *string
	err := row.Scan(&u.ID, &u.Email, &displayName, &u.PasswordHash, &u.SessionVersion, &u.IsAdmin)
	if err != nil {
		return User{}, err
	}
	if displayName != nil {
		u.DisplayName = *displayName
	}
	return u, nil
}

func (s *Store) CreateUser(ctx context.Context, email, passwordHash string) (User, error) {
	u, err := scanUser(s.pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash)
		VALUES ($1, $2)
		RETURNING id, email, display_name, password_hash, session_version, is_admin
	`, email, passwordHash))
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return User{}, ErrEmailTaken
		}
		return User{}, err
	}
	return u, nil
}

func (s *Store) FindByEmail(ctx context.Context, email string) (User, error) {
	u, err := scanUser(s.pool.QueryRow(ctx, `
		SELECT id, email, display_name, password_hash, session_version, is_admin
		FROM users WHERE lower(email) = lower($1)
	`, email))
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrInvalidCredentials
	}
	return u, err
}

func (s *Store) FindByID(ctx context.Context, id uuid.UUID) (User, error) {
	u, err := scanUser(s.pool.QueryRow(ctx, `
		SELECT id, email, display_name, password_hash, session_version, is_admin
		FROM users WHERE id = $1
	`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrUnauthorized
	}
	return u, err
}

func (s *Store) UpdateDisplayName(ctx context.Context, id uuid.UUID, displayName string) (User, error) {
	u, err := scanUser(s.pool.QueryRow(ctx, `
		UPDATE users SET display_name = NULLIF(trim($2), '')
		WHERE id = $1
		RETURNING id, email, display_name, password_hash, session_version, is_admin
	`, id, displayName))
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrUnauthorized
	}
	return u, err
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
