package collab

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Role string

const (
	RoleOwner  Role = "owner"
	RoleEditor Role = "editor"
	RoleViewer Role = "viewer"
)

type Project struct {
	ID          uuid.UUID
	OwnerUserID uuid.UUID
	Name        string
	SourceLang  string
	TargetLang  string
	Meta        json.RawMessage
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type Invite struct {
	ID            uuid.UUID
	ProjectID     uuid.UUID
	Role          Role
	CreatedBy     uuid.UUID
	ExpiresAt     *time.Time
	MaxUses       *int
	UsesCount     int
	InvitedUserID *uuid.UUID
	RevokedAt     *time.Time
	CreatedAt     time.Time
}
