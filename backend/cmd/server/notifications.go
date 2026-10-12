package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi"
	"github.com/google/uuid"
	"stackhub.com/stackhub/pkg/db"
)

// actorDisplayName returns a friendly name for the acting user (display name,
// falling back to username, then a generic label) for use in notifications and
// emails.
func actorDisplayName(q *db.Queries, ctx context.Context, userID uuid.UUID) string {
	name, _ := actorNameAndUsername(q, ctx, userID)
	return name
}

// actorNameAndUsername returns both a friendly display name and the username
// (for building a profile link) for the acting user.
func actorNameAndUsername(q *db.Queries, ctx context.Context, userID uuid.UUID) (string, string) {
	profile, err := q.GetProfile(ctx, userID)
	if err != nil {
		return "Someone", ""
	}
	name := profile.DisplayName
	if name == "" {
		name = profile.Username
	}
	if name == "" {
		name = "Someone"
	}
	return name, profile.Username
}

func (app *App) getUserNotifications(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	// Parse pagination parameters
	page := 1
	limit := 20
	if pageStr := r.URL.Query().Get("page"); pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p >= 1 {
			page = p
		}
	}
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	offset := (page - 1) * limit

	params := db.GetUserNotificationsParams{
		RecipientID: userID,
		Limit:       int32(limit),
		Offset:      int32(offset),
	}

	notifications, err := app.queries.GetUserNotifications(r.Context(), params)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to get notifications", http.StatusInternalServerError)
		return
	}

	if notifications == nil {
		notifications = []db.GetUserNotificationsRow{}
	}

	// Get unread count
	unreadCount, err := app.queries.GetUnreadNotificationCount(r.Context(), userID)
	if err != nil {
		log.Println(err)
		unreadCount = 0
	}

	response := struct {
		Notifications []db.GetUserNotificationsRow `json:"notifications"`
		Page          int                          `json:"page"`
		Limit         int                          `json:"limit"`
		UnreadCount   int32                        `json:"unread_count"`
	}{
		Notifications: notifications,
		Page:          page,
		Limit:         limit,
		UnreadCount:   unreadCount,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (app *App) markNotificationRead(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)
	notificationIDStr := chi.URLParam(r, "id")

	notificationID, err := uuid.Parse(notificationIDStr)
	if err != nil {
		http.Error(w, "Invalid notification ID", http.StatusBadRequest)
		return
	}

	params := db.MarkNotificationReadParams{
		ID:          notificationID,
		RecipientID: userID,
	}

	err = app.queries.MarkNotificationRead(r.Context(), params)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to mark notification as read", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (app *App) markAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	err := app.queries.MarkAllNotificationsRead(r.Context(), userID)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to mark all notifications as read", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (app *App) getUnreadNotificationCount(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	count, err := app.queries.GetUnreadNotificationCount(r.Context(), userID)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to get unread notification count", http.StatusInternalServerError)
		return
	}

	response := struct {
		Count int32 `json:"count"`
	}{
		Count: count,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
