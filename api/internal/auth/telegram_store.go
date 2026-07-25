package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const (
	linkTokenTTL  = 15 * time.Minute
	resetCodeTTL  = 15 * time.Minute
	linkTokenBytes = 24
)

func hashSecret(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func randomToken() (string, error) {
	b := make([]byte, linkTokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func randomResetCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func (s *Store) CreateLinkToken(ctx context.Context, userID uuid.UUID) (raw string, expiresAt time.Time, err error) {
	raw, err = randomToken()
	if err != nil {
		return "", time.Time{}, err
	}
	expiresAt = time.Now().UTC().Add(linkTokenTTL)
	_, err = s.pool.Exec(ctx, `
		DELETE FROM telegram_link_tokens WHERE user_id = $1 OR expires_at < now()
	`, userID)
	if err != nil {
		return "", time.Time{}, err
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO telegram_link_tokens (token_hash, user_id, expires_at)
		VALUES ($1, $2, $3)
	`, hashSecret(raw), userID, expiresAt)
	if err != nil {
		return "", time.Time{}, err
	}
	return raw, expiresAt, nil
}

func (s *Store) ConsumeLinkToken(ctx context.Context, raw string, telegramID int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var userID uuid.UUID
	err = tx.QueryRow(ctx, `
		SELECT user_id FROM telegram_link_tokens
		WHERE token_hash = $1 AND expires_at > now()
		FOR UPDATE
	`, hashSecret(raw)).Scan(&userID)
	if errorsIsNoRows(err) {
		return ErrUnauthorized
	}
	if err != nil {
		return err
	}

	// One Telegram chat → one user
	_, err = tx.Exec(ctx, `
		UPDATE users SET telegram_id = NULL WHERE telegram_id = $1 AND id <> $2
	`, telegramID, userID)
	if err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, `
		UPDATE users SET telegram_id = $2 WHERE id = $1
	`, userID, telegramID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUnauthorized
	}
	_, err = tx.Exec(ctx, `DELETE FROM telegram_link_tokens WHERE user_id = $1`, userID)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) ClearTelegramID(ctx context.Context, userID uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE users SET telegram_id = NULL WHERE id = $1
	`, userID)
	return err
}

func (s *Store) CreateResetCode(ctx context.Context, userID uuid.UUID) (code string, err error) {
	code, err = randomResetCode()
	if err != nil {
		return "", err
	}
	expiresAt := time.Now().UTC().Add(resetCodeTTL)
	_, err = s.pool.Exec(ctx, `
		DELETE FROM password_reset_codes WHERE user_id = $1 OR expires_at < now()
	`, userID)
	if err != nil {
		return "", err
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO password_reset_codes (user_id, code_hash, expires_at)
		VALUES ($1, $2, $3)
	`, userID, hashSecret(code), expiresAt)
	if err != nil {
		return "", err
	}
	return code, nil
}

func (s *Store) ConsumeResetCodeAndSetPassword(ctx context.Context, userID uuid.UUID, code, passwordHash string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var id uuid.UUID
	err = tx.QueryRow(ctx, `
		SELECT id FROM password_reset_codes
		WHERE user_id = $1 AND code_hash = $2 AND expires_at > now()
		ORDER BY created_at DESC
		LIMIT 1
		FOR UPDATE
	`, userID, hashSecret(code)).Scan(&id)
	if errorsIsNoRows(err) {
		return ErrInvalidCredentials
	}
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		UPDATE users SET password_hash = $2, session_version = session_version + 1
		WHERE id = $1
	`, userID, passwordHash)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `DELETE FROM password_reset_codes WHERE user_id = $1`, userID)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func errorsIsNoRows(err error) bool {
	return err == pgx.ErrNoRows
}
