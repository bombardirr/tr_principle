package auth

import "testing"

func TestEffectivePlan(t *testing.T) {
	cases := []struct {
		name string
		sub  Subscription
		plan string
		pro  bool
	}{
		{"free active", Subscription{PlanFree, StatusActive}, PlanFree, false},
		{"pro active", Subscription{PlanPro, StatusActive}, PlanPro, true},
		{"pro trialing", Subscription{PlanPro, StatusTrialing}, PlanPro, true},
		{"pro canceled", Subscription{PlanPro, StatusCanceled}, PlanFree, false},
		{"pro past_due", Subscription{PlanPro, StatusPastDue}, PlanFree, false},
		{"pro inactive", Subscription{PlanPro, StatusInactive}, PlanFree, false},
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
