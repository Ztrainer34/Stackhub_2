package main

import (
	"net/http"

	"github.com/google/uuid"
	shmiddleware "stackhub.com/stackhub/pkg/middleware"
)

func extractUserIDFromRequest(r *http.Request) uuid.UUID {
	return r.Context().Value(shmiddleware.UserIDKey{}).(uuid.UUID)
}

func extractUserIDFromRequestIfPresent(r *http.Request) uuid.UUID {
	if val := r.Context().Value(shmiddleware.UserIDKey{}); val != nil {
		if userID, ok := val.(uuid.UUID); ok {
			return userID
		}
	}
	return uuid.Nil
}
