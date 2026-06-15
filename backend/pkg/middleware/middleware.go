package middleware

import (
	"context"
	"net/http"

	"github.com/go-chi/jwtauth/v5"
	"github.com/google/uuid"
)

type UserIDKey struct{}
type OnboardedKey struct{}

func Authenticator(ja *jwtauth.JWTAuth) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		hfn := func(w http.ResponseWriter, r *http.Request) {
			token, claims, err := jwtauth.FromContext(r.Context())

			if err != nil {
				http.Error(w, err.Error(), http.StatusUnauthorized)
				return
			}

			if token == nil {
				http.Error(w, http.StatusText(http.StatusUnauthorized), http.StatusUnauthorized)
				return
			}

			rawVal, exists := claims["sub"]

			if !exists {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			val, ok := rawVal.(string)

			if !ok {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			id, err := uuid.Parse(val)

			if err != nil {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			// Extract user metadata from app_metadata
			onboarded := false

			if appMetadata, ok := claims["app_metadata"].(map[string]interface{}); ok {
				if onboardedVal, exists := appMetadata["onboarded"]; exists {
					if onboardedBool, ok := onboardedVal.(bool); ok {
						onboarded = onboardedBool
					}
				}
			}

			ctx := context.WithValue(r.Context(), UserIDKey{}, id)
			ctx = context.WithValue(ctx, OnboardedKey{}, onboarded)

			next.ServeHTTP(w, r.WithContext(ctx))
		}
		return http.HandlerFunc(hfn)
	}
}

func OptionalAuthenticator(ja *jwtauth.JWTAuth) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		hfn := func(w http.ResponseWriter, r *http.Request) {
			token, claims, err := jwtauth.FromContext(r.Context())

			if err != nil || token == nil {
				ctx := context.WithValue(r.Context(), UserIDKey{}, uuid.Nil)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			rawVal, exists := claims["sub"]

			if !exists {
				ctx := context.WithValue(r.Context(), UserIDKey{}, uuid.Nil)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			val, ok := rawVal.(string)

			if !ok {
				ctx := context.WithValue(r.Context(), UserIDKey{}, uuid.Nil)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			id, err := uuid.Parse(val)

			if err != nil {
				ctx := context.WithValue(r.Context(), UserIDKey{}, uuid.Nil)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			ctx := context.WithValue(r.Context(), UserIDKey{}, id)

			next.ServeHTTP(w, r.WithContext(ctx))
		}
		return http.HandlerFunc(hfn)
	}
}
