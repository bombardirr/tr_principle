package projects

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/bombardirr/tr_principle/api/internal/auth"
	"github.com/google/uuid"
)

// QuotaPurger deletes oldest cloud backups for users past the free-tier grace window.
type QuotaPurger struct {
	Auth      *auth.Store
	Store     *Store
	BackupDir string
}

func (p *QuotaPurger) RunOnce(ctx context.Context) {
	if p == nil || p.Auth == nil || p.Store == nil || p.BackupDir == "" {
		return
	}
	ids, err := p.Auth.ListUsersPastStorageGrace(ctx)
	if err != nil {
		log.Printf("storage purge list: %v", err)
		return
	}
	for _, id := range ids {
		if err := p.purgeUser(ctx, id); err != nil {
			log.Printf("storage purge user %s: %v", id, err)
		}
	}
}

func (p *QuotaPurger) purgeUser(ctx context.Context, userID uuid.UUID) error {
	_ = p.Auth.SyncStorageGrace(ctx, userID)
	u, err := p.Auth.FindByID(ctx, userID)
	if err != nil {
		return err
	}
	if auth.EffectivePro(u.Subscription) {
		return p.Auth.SyncStorageGrace(ctx, userID)
	}
	for {
		used, err := p.Auth.CloudStorageUsed(ctx, userID)
		if err != nil {
			return err
		}
		if used <= auth.FreeStorageBytes {
			return p.Auth.SyncStorageGrace(ctx, userID)
		}
		backups, err := p.Auth.ListProjectBackups(ctx, userID)
		if err != nil {
			return err
		}
		if len(backups) == 0 {
			// Only job originals left — cannot trim without deleting jobs; stop grace clock update.
			return p.Auth.SyncStorageGrace(ctx, userID)
		}
		oldest := backups[0]
		projectID, err := uuid.Parse(oldest.ProjectID)
		if err != nil {
			return err
		}
		abs := filepath.Clean(filepath.Join(p.BackupDir, userID.String(), projectID.String()+".tcat.zip"))
		_ = os.Remove(abs)
		if err := p.Store.DeleteBackupMeta(ctx, userID, projectID); err != nil {
			return err
		}
	}
}

// StartQuotaPurgeLoop runs RunOnce immediately and then on interval until ctx is done.
func StartQuotaPurgeLoop(ctx context.Context, p *QuotaPurger, every time.Duration) {
	if p == nil {
		return
	}
	if every < time.Minute {
		every = time.Hour
	}
	go func() {
		p.RunOnce(ctx)
		t := time.NewTicker(every)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				p.RunOnce(context.Background())
			}
		}
	}()
}
