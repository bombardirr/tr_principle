package auth

// Subscription is the current billing entitlement row for a user.
type Subscription struct {
	Plan   string
	Status string
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

// EffectivePro reports whether the subscription currently grants Pro.
func EffectivePro(sub Subscription) bool {
	if sub.Plan != PlanPro {
		return false
	}
	return sub.Status == StatusActive || sub.Status == StatusTrialing
}

// EffectivePlan returns the product plan for API/clients (never "pro" unless active/trialing).
func EffectivePlan(sub Subscription) string {
	if EffectivePro(sub) {
		return PlanPro
	}
	return PlanFree
}

// DefaultFreeSubscription is used when no row exists yet (legacy repair path).
func DefaultFreeSubscription() Subscription {
	return Subscription{Plan: PlanFree, Status: StatusActive}
}
