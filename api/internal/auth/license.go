package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var (
	ErrLicenseInvalid = errors.New("invalid license key")
	ErrLicenseUsed    = errors.New("license key already used")
	ErrLicenseRevoked = errors.New("license key revoked")
	ErrQuotaExceeded  = errors.New("storage quota exceeded")
	ErrUnknownSKU     = errors.New("unknown license sku")
)

// SKU → duration in days (calendar-ish; fixed day counts for predictable stacking).
var licenseSKUDays = map[string]int{
	"pro_1m":  30,
	"pro_3m":  90,
	"pro_6m":  182,
	"pro_12m": 365,
}

func LicenseSKUDays(sku string) (int, bool) {
	d, ok := licenseSKUDays[sku]
	return d, ok
}

func HashLicenseKey(raw string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(raw)))
	return hex.EncodeToString(sum[:])
}

func licenseHint(plaintext string) string {
	p := strings.TrimSpace(plaintext)
	if len(p) <= 10 {
		return p
	}
	return p[:7] + "…" + p[len(p)-4:]
}

// CloudStorageUsed sums project backups and originals for projects owned by the user.
func (s *Store) CloudStorageUsed(ctx context.Context, userID uuid.UUID) (int64, error) {
	var backups, originals int64
	err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(size_bytes), 0) FROM project_backups WHERE user_id = $1
	`, userID).Scan(&backups)
	if err != nil {
		return 0, err
	}
	err = s.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(o.size_bytes), 0)
		FROM project_originals o
		INNER JOIN projects j ON j.id = o.project_id
		WHERE j.owner_user_id = $1
	`, userID).Scan(&originals)
	if err != nil {
		return 0, err
	}
	return backups + originals, nil
}

// AllowCloudWrite returns ErrQuotaExceeded when adding deltaBytes would pass the limit.
// deltaBytes <= 0 (shrink / replace with smaller) always allowed.
func (s *Store) AllowCloudWrite(ctx context.Context, userID uuid.UUID, deltaBytes int64) error {
	if deltaBytes <= 0 {
		return nil
	}
	u, err := s.FindByID(ctx, userID)
	if err != nil {
		return err
	}
	used, err := s.CloudStorageUsed(ctx, userID)
	if err != nil {
		return err
	}
	limit := StorageLimitBytes(u.Subscription)
	if used+deltaBytes > limit {
		return ErrQuotaExceeded
	}
	return nil
}

type BackupListItem struct {
	ProjectID   string    `json:"project_id"`
	ProjectName string    `json:"project_name"`
	SizeBytes   int64     `json:"size_bytes"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (s *Store) ListProjectBackups(ctx context.Context, userID uuid.UUID) ([]BackupListItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT project_id, COALESCE(project_name, ''), size_bytes, updated_at
		FROM project_backups
		WHERE user_id = $1
		ORDER BY updated_at ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []BackupListItem
	for rows.Next() {
		var id uuid.UUID
		var item BackupListItem
		if err := rows.Scan(&id, &item.ProjectName, &item.SizeBytes, &item.UpdatedAt); err != nil {
			return nil, err
		}
		item.ProjectID = id.String()
		out = append(out, item)
	}
	return out, rows.Err()
}

// RedeemLicense activates an unused key and stacks Pro time onto the user.
func (s *Store) RedeemLicense(ctx context.Context, userID uuid.UUID, rawKey string) (User, error) {
	key := strings.TrimSpace(rawKey)
	if key == "" || len(key) > 200 {
		return User{}, ErrLicenseInvalid
	}
	hash := HashLicenseKey(key)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback(ctx)

	var sku, status string
	var durationDays int
	err = tx.QueryRow(ctx, `
		SELECT sku, duration_days, status FROM license_keys
		WHERE key_hash = $1
		FOR UPDATE
	`, hash).Scan(&sku, &durationDays, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrLicenseInvalid
	}
	if err != nil {
		return User{}, err
	}
	switch status {
	case "redeemed":
		return User{}, ErrLicenseUsed
	case "revoked":
		return User{}, ErrLicenseRevoked
	case "unused":
		// ok
	default:
		return User{}, ErrLicenseInvalid
	}
	if durationDays <= 0 {
		if d, ok := licenseSKUDays[sku]; ok {
			durationDays = d
		} else {
			return User{}, ErrLicenseInvalid
		}
	}

	now := time.Now().UTC()
	tag, err := tx.Exec(ctx, `
		UPDATE license_keys
		SET status = 'redeemed', redeemed_by = $2, redeemed_at = $3
		WHERE key_hash = $1 AND status = 'unused'
	`, hash, userID, now)
	if err != nil {
		return User{}, err
	}
	if tag.RowsAffected() != 1 {
		return User{}, ErrLicenseUsed
	}

	var plan, st string
	var periodEnd *time.Time
	err = tx.QueryRow(ctx, `
		SELECT plan, status, current_period_end FROM subscriptions WHERE user_id = $1 FOR UPDATE
	`, userID).Scan(&plan, &st, &periodEnd)
	if errors.Is(err, pgx.ErrNoRows) {
		_, err = tx.Exec(ctx, `
			INSERT INTO subscriptions (user_id, plan, status, current_period_end, updated_at)
			VALUES ($1, $2, $3, $4, $5)
		`, userID, PlanPro, StatusActive, now.AddDate(0, 0, durationDays), now)
		if err != nil {
			return User{}, err
		}
	} else if err != nil {
		return User{}, err
	} else {
		base := now
		// Stack from remaining Pro time only while still effectively Pro.
		if plan == PlanPro && (st == StatusActive || st == StatusTrialing) &&
			periodEnd != nil && periodEnd.After(now) {
			base = *periodEnd
		}
		newEnd := base.AddDate(0, 0, durationDays)
		_, err = tx.Exec(ctx, `
			UPDATE subscriptions
			SET plan = $2, status = $3, current_period_end = $4, updated_at = $5
			WHERE user_id = $1
		`, userID, PlanPro, StatusActive, newEnd, now)
		if err != nil {
			return User{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return User{}, err
	}
	return s.FindByID(ctx, userID)
}

// expireSubscriptionIfNeeded marks Pro canceled when current_period_end has passed.
func (s *Store) expireSubscriptionIfNeeded(ctx context.Context, u User) (User, error) {
	if u.Subscription.Plan != PlanPro {
		return u, nil
	}
	if u.Subscription.Status != StatusActive && u.Subscription.Status != StatusTrialing {
		return u, nil
	}
	end := u.Subscription.CurrentPeriodEnd
	if end == nil || end.After(time.Now().UTC()) {
		return u, nil
	}
	_, err := s.pool.Exec(ctx, `
		UPDATE subscriptions
		SET status = $2, updated_at = now()
		WHERE user_id = $1 AND plan = $3
		  AND status IN ($4, $5)
		  AND current_period_end IS NOT NULL
		  AND current_period_end <= now()
	`, u.ID, StatusCanceled, PlanPro, StatusActive, StatusTrialing)
	if err != nil {
		return u, err
	}
	u.Subscription.Status = StatusCanceled
	return u, nil
}

type LicenseKeyInfo struct {
	KeyHash       string
	KeyHint       string
	SKU           string
	DurationDays  int
	Status        string
	Note          string
	CreatedAt     time.Time
	RedeemedAt    *time.Time
	CreatedBy     *uuid.UUID
	CreatedEmail  string
	RedeemedBy    *uuid.UUID
	RedeemedEmail string
	// Plaintext is set only on create — never persisted / listed.
	Plaintext string
}

// CreateLicenseKey generates a random one-time key. Plaintext is returned once.
func (s *Store) CreateLicenseKey(ctx context.Context, sku, note string, createdBy uuid.UUID) (LicenseKeyInfo, error) {
	days, ok := licenseSKUDays[sku]
	if !ok {
		return LicenseKeyInfo{}, ErrUnknownSKU
	}
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return LicenseKeyInfo{}, err
	}
	plaintext := "AZ-" + hex.EncodeToString(raw[:])
	hash := HashLicenseKey(plaintext)
	hint := licenseHint(plaintext)
	note = strings.TrimSpace(note)
	if len(note) > 200 {
		note = note[:200]
	}
	now := time.Now().UTC()
	_, err := s.pool.Exec(ctx, `
		INSERT INTO license_keys (key_hash, key_hint, sku, duration_days, status, note, created_by, created_at)
		VALUES ($1, $2, $3, $4, 'unused', $5, $6, $7)
	`, hash, hint, sku, days, note, createdBy, now)
	if err != nil {
		return LicenseKeyInfo{}, err
	}
	return LicenseKeyInfo{
		KeyHash:      hash,
		KeyHint:      hint,
		SKU:          sku,
		DurationDays: days,
		Status:       "unused",
		Note:         note,
		CreatedAt:    now,
		CreatedBy:    &createdBy,
		Plaintext:    plaintext,
	}, nil
}

// ListLicenseKeys returns newest-first inventory for admins (no plaintext).
func (s *Store) ListLicenseKeys(ctx context.Context, limit int) ([]LicenseKeyInfo, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	rows, err := s.pool.Query(ctx, `
		SELECT k.key_hash, k.key_hint, k.sku, k.duration_days, k.status, k.note, k.created_at,
		       k.redeemed_at, k.created_by, k.redeemed_by,
		       COALESCE(cu.email, ''), COALESCE(ru.email, '')
		FROM license_keys k
		LEFT JOIN users cu ON cu.id = k.created_by
		LEFT JOIN users ru ON ru.id = k.redeemed_by
		ORDER BY k.created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LicenseKeyInfo
	for rows.Next() {
		var item LicenseKeyInfo
		var redeemedAt *time.Time
		var createdBy, redeemedBy *uuid.UUID
		if err := rows.Scan(
			&item.KeyHash, &item.KeyHint, &item.SKU, &item.DurationDays, &item.Status, &item.Note, &item.CreatedAt,
			&redeemedAt, &createdBy, &redeemedBy,
			&item.CreatedEmail, &item.RedeemedEmail,
		); err != nil {
			return nil, err
		}
		item.RedeemedAt = redeemedAt
		item.CreatedBy = createdBy
		item.RedeemedBy = redeemedBy
		out = append(out, item)
	}
	return out, rows.Err()
}

// RevokeLicenseKey revokes an unused or redeemed key.
// For redeemed keys, stripPro cancels Pro on the redeeming account.
func (s *Store) RevokeLicenseKey(ctx context.Context, keyHash string, stripPro bool) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var status string
	var redeemedBy *uuid.UUID
	err = tx.QueryRow(ctx, `
		SELECT status, redeemed_by FROM license_keys WHERE key_hash = $1 FOR UPDATE
	`, keyHash).Scan(&status, &redeemedBy)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrLicenseInvalid
	}
	if err != nil {
		return err
	}
	if status == "revoked" {
		return nil
	}
	if status != "unused" && status != "redeemed" {
		return ErrLicenseInvalid
	}
	_, err = tx.Exec(ctx, `
		UPDATE license_keys SET status = 'revoked' WHERE key_hash = $1
	`, keyHash)
	if err != nil {
		return err
	}
	if stripPro && status == "redeemed" && redeemedBy != nil {
		_, err = tx.Exec(ctx, `
			UPDATE subscriptions
			SET plan = $2, status = $3, current_period_end = now(), updated_at = now()
			WHERE user_id = $1
		`, *redeemedBy, PlanFree, StatusCanceled)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// UpdateLicenseNote sets the admin note on a key.
func (s *Store) UpdateLicenseNote(ctx context.Context, keyHash, note string) error {
	note = strings.TrimSpace(note)
	if len(note) > 200 {
		note = note[:200]
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE license_keys SET note = $2 WHERE key_hash = $1
	`, keyHash, note)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrLicenseInvalid
	}
	return nil
}
