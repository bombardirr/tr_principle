package auth

import (
	"time"
)

// Subscription is the current billing entitlement row for a user.
type Subscription struct {
	Plan               string
	Status             string
	CurrentPeriodEnd   *time.Time
}

const (
	PlanFree = "free"
	PlanPro  = "pro"
)

const (
	StatusActive   = "active"
	StatusTrialing = "trialing"
	StatusPastDue  = "past_due"
	StatusCanceled = "canceled"
	StatusInactive = "inactive"
)

// Cloud storage quotas (DOCX backups + job originals owned by the user).
const (
	FreeStorageBytes int64 = 50 << 20  // 50 MiB
	ProStorageBytes  int64 = 50 << 30  // 50 GiB soft cap
)

// EffectivePro reports whether the subscription currently grants Pro.
func EffectivePro(sub Subscription) bool {
	if sub.Plan != PlanPro {
		return false
	}
	if sub.Status != StatusActive && sub.Status != StatusTrialing {
		return false
	}
	if sub.CurrentPeriodEnd != nil && !sub.CurrentPeriodEnd.After(time.Now().UTC()) {
		return false
	}
	return true
}

// EffectivePlan returns the product plan for API/clients (never "pro" unless active/trialing).
func EffectivePlan(sub Subscription) string {
	if EffectivePro(sub) {
		return PlanPro
	}
	return PlanFree
}

// StorageLimitBytes is the cloud file quota for the current effective plan.
func StorageLimitBytes(sub Subscription) int64 {
	if EffectivePro(sub) {
		return ProStorageBytes
	}
	return FreeStorageBytes
}

// DefaultFreeSubscription is used when no row exists yet (legacy repair path).
func DefaultFreeSubscription() Subscription {
	return Subscription{Plan: PlanFree, Status: StatusActive}
}
