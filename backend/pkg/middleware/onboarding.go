package middleware

import (
	"net/http"
	"strings"
)

// OnboardingEnforcer middleware that ensures users are onboarded before accessing certain routes
func OnboardingEnforcer() func(http.Handler) http.Handler {
	// Routes that don't require onboarding
	skipRoutes := []string{
		"/profile/onboard",
		"/profile/username/available",
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Check if this route should skip onboarding check
			for _, route := range skipRoutes {
				if strings.HasSuffix(r.URL.Path, route) {
					next.ServeHTTP(w, r)
					return
				}
			}

			// Extract onboarded status from context
			onboardedVal := r.Context().Value(OnboardedKey{})
			if onboardedVal == nil {
				http.Error(w, "Authentication required", http.StatusUnauthorized)
				return
			}

			onboarded, ok := onboardedVal.(bool)
			if !ok || !onboarded {
				http.Error(w, "Onboarding required", http.StatusPreconditionRequired)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
