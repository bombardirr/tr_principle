package httpapi

import (
	"net/http"
	"strings"
)

// AdminFromRequest reports whether the request has a valid user JWT and whether that user is admin.
// authed=false means no usable JWT (or invalid); isAdmin is only meaningful when authed=true.
type AdminFromRequest func(r *http.Request) (authed bool, isAdmin bool)

// MetricsAuth allows scrape token OR authenticated admin JWT.
// Empty metricsToken disables the token path (JWT admin still works).
func MetricsAuth(metricsToken string, lookup AdminFromRequest, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if strings.HasPrefix(header, "Bearer ") {
			bearer := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
			if metricsToken != "" && bearer == metricsToken {
				next.ServeHTTP(w, r)
				return
			}
			if lookup != nil {
				authed, isAdmin := lookup(r)
				if authed && isAdmin {
					next.ServeHTTP(w, r)
					return
				}
				if authed && !isAdmin {
					http.Error(w, "forbidden", http.StatusForbidden)
					return
				}
			}
		}
		http.Error(w, "unauthorized", http.StatusUnauthorized)
	})
}
