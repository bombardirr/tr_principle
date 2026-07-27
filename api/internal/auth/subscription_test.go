package auth

import (
	"testing"
	"time"
)

func TestEffectivePlan(t *testing.T) {
	future := mustParseTime("2099-01-01T00:00:00Z")
	past := mustParseTime("2000-01-01T00:00:00Z")
	cases := []struct {
		name string
		sub  Subscription
		plan string
		pro  bool
	}{
		{"free active", Subscription{PlanFree, StatusActive, nil}, PlanFree, false},
		{"pro active no end", Subscription{PlanPro, StatusActive, nil}, PlanPro, true},
		{"pro active future", Subscription{PlanPro, StatusActive, &future}, PlanPro, true},
		{"pro active expired", Subscription{PlanPro, StatusActive, &past}, PlanFree, false},
		{"pro trialing", Subscription{PlanPro, StatusTrialing, &future}, PlanPro, true},
		{"pro canceled", Subscription{PlanPro, StatusCanceled, &future}, PlanFree, false},
		{"pro past_due", Subscription{PlanPro, StatusPastDue, nil}, PlanFree, false},
		{"pro inactive", Subscription{PlanPro, StatusInactive, nil}, PlanFree, false},
		{"empty", Subscription{}, PlanFree, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := EffectivePlan(tc.sub); got != tc.plan {
				t.Fatalf("EffectivePlan=%q want %q", got, tc.plan)
			}
			if got := EffectivePro(tc.sub); got != tc.pro {
				t.Fatalf("EffectivePro=%v want %v", got, tc.pro)
			}
		})
	}
}

func TestStorageLimitBytes(t *testing.T) {
	future := mustParseTime("2099-01-01T00:00:00Z")
	past := mustParseTime("2000-01-01T00:00:00Z")
	if StorageLimitBytes(Subscription{PlanFree, StatusActive, nil}) != FreeStorageBytes {
		t.Fatal("free limit")
	}
	if StorageLimitBytes(Subscription{PlanPro, StatusActive, &future}) != ProStorageBytes {
		t.Fatal("pro limit")
	}
	if StorageLimitBytes(Subscription{PlanPro, StatusActive, &past}) != FreeStorageBytes {
		t.Fatal("expired pro uses free limit")
	}
}

func mustParseTime(s string) time.Time {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		panic(err)
	}
	return t
}
