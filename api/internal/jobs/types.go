package jobs

import (
	"time"

	"github.com/google/uuid"
)

type Role string

const (
	RoleOwner      Role = "owner"
	RoleTranslator Role = "translator"
	RoleViewer     Role = "viewer"
)

type Langs struct {
	Source string `json:"source"`
	Target string `json:"target"`
}

type Job struct {
	ID               uuid.UUID  `json:"id"`
	OwnerUserID      uuid.UUID  `json:"ownerUserId"`
	Title            string     `json:"title"`
	SourceLang       string     `json:"sourceLang"`
	TargetLang       string     `json:"targetLang"`
	SourceFilename   string     `json:"sourceFilename"`
	SourceHash       string     `json:"sourceHash"`
	HasOriginal      bool       `json:"hasOriginal"`
	OriginalFilename string     `json:"originalFilename,omitempty"`
	CreatedAt        time.Time  `json:"createdAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`
	ArchivedAt       *time.Time `json:"archivedAt,omitempty"`
}

type Member struct {
	JobID          uuid.UUID  `json:"jobId"`
	UserID         uuid.UUID  `json:"userId"`
	Role           Role       `json:"role"`
	LocalProjectID *uuid.UUID `json:"localProjectId,omitempty"`
	PartDone       bool       `json:"partDone"`
	ProgressDone   int        `json:"progressDone"`
	ProgressTotal  int        `json:"progressTotal"`
	LastActiveAt   *time.Time `json:"lastActiveAt,omitempty"`
	JoinedAt       time.Time  `json:"joinedAt"`
}

type Invite struct {
	ID        uuid.UUID  `json:"id"`
	JobID     uuid.UUID  `json:"jobId"`
	Role      Role       `json:"role"`
	CreatedBy uuid.UUID  `json:"createdBy"`
	ExpiresAt *time.Time `json:"expiresAt,omitempty"`
	MaxUses   *int       `json:"maxUses,omitempty"`
	UsesCount int        `json:"usesCount"`
	RevokedAt *time.Time `json:"revokedAt,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
}
