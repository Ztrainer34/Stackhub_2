package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"stackhub.com/stackhub/pkg/db"
)

func (app *App) getAuthenticatedUser(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	user, err := app.queries.GetProfile(r.Context(), userID)

	if err != nil {
		log.Println(err)
		http.Error(w, "User not found", http.StatusNotFound)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

type UpdateProfileForm struct {
	Username *string `json:"username"`
	Bio      *string `json:"bio"`
	Website  *string `json:"website"`
	Company  *string `json:"company"`
	Location *string `json:"location"`
	Linkedin *string `json:"linkedin"`
	Twitter  *string `json:"twitter"`
}

func (app *App) updateProfile(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	defer r.Body.Close()

	var form UpdateProfileForm
	if err := json.NewDecoder(r.Body).Decode(&form); err != nil {
		log.Println(err)
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	// Validate username if provided
	if form.Username != nil {
		// Usernames are case-insensitive: normalize before validating/storing.
		normalized := strings.ToLower(strings.TrimSpace(*form.Username))
		form.Username = &normalized

		username := normalized
		if len(username) < 3 {
			http.Error(w, "Username must be at least 3 characters long", http.StatusBadRequest)
			return
		}

		// Get current user to check if username is the same
		currentUser, err := app.queries.GetProfile(r.Context(), userID)
		if err != nil {
			log.Println(err)
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}

		// Only check availability if username is different from current
		if username != currentUser.Username {
			available, err := app.queries.CheckUsernameAvailable(r.Context(), username)
			if err != nil {
				log.Println(err)
				http.Error(w, "Failed to check username availability", http.StatusInternalServerError)
				return
			}

			if !available {
				http.Error(w, "Username is already taken", http.StatusConflict)
				return
			}
		}
	}

	// Validate website if provided
	if form.Website != nil {
		website := *form.Website
		if website != "" && !strings.HasPrefix(website, "http://") && !strings.HasPrefix(website, "https://") {
			http.Error(w, "Website must start with http:// or https://", http.StatusBadRequest)
			return
		}
	}

	// Validate bio length if provided
	if form.Bio != nil {
		bio := *form.Bio
		if len(bio) > 500 {
			http.Error(w, "Bio must be less than 500 characters", http.StatusBadRequest)
			return
		}
	}

	// Update profile
	params := db.UpdateProfileParams{
		ID:       userID,
		Username: ToPgText(form.Username),
		Bio:      ToPgText(form.Bio),
		Website:  ToPgText(form.Website),
		Company:  ToPgText(form.Company),
		Location: ToPgText(form.Location),
		Linkedin: ToPgText(form.Linkedin),
		Twitter:  ToPgText(form.Twitter),
	}

	err := app.queries.UpdateProfile(r.Context(), params)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to update profile", http.StatusInternalServerError)
		return
	}

	// Return updated profile
	updatedUser, err := app.queries.GetProfile(r.Context(), userID)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to fetch updated profile", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(updatedUser)
}

func (app *App) getTopRecommendedUsers(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	params := db.GetTopRecommendedUsersParams{
		ID:    userID,
		Limit: 12,
	}

	profiles, err := app.queries.GetTopRecommendedUsers(r.Context(), params)

	if err != nil {
		log.Println(err)
		http.Error(w, "User not found", http.StatusNotFound)
	}

	if profiles == nil {
		profiles = []db.GetTopRecommendedUsersRow{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(profiles)
}

func (app *App) getUser(w http.ResponseWriter, r *http.Request) {
	slug := strings.ToLower(chi.URLParam(r, "slug"))

	if slug == "" {
		http.Error(w, "User cannot be empty", http.StatusBadRequest)
		return
	}

	// A signed-in viewer also gets is_following, so the profile page's Follow
	// button renders in the right state rather than always starting at "Follow".
	if viewerID := extractUserIDFromRequestIfPresent(r); viewerID != uuid.Nil {
		user, err := app.queries.GetProfileWithUsernameAuthenticated(
			r.Context(),
			db.GetProfileWithUsernameAuthenticatedParams{Username: slug, ViewerID: viewerID},
		)
		if err != nil {
			http.Error(w, "Unknown user", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(user)
		return
	}

	user, err := app.queries.GetProfileWithUsername(r.Context(), slug)

	if err != nil {
		http.Error(w, "Unknown user", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// uploadAvatar stores a profile picture in the bucket and points the profile at
// it. Uploading replaces whatever was there; removing falls back to Gravatar.
func (app *App) uploadAvatar(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := extractUserIDFromRequest(r)

	if err := r.ParseMultipartForm(5 << 20); err != nil { // 5 MB
		http.Error(w, "Image must be smaller than 5MB", http.StatusBadRequest)
		return
	}

	file, fileHeader, err := r.FormFile("image")
	if err != nil {
		http.Error(w, "No image supplied", http.StatusBadRequest)
		return
	}
	defer file.Close()

	ok, err := isImage(file)
	if err != nil {
		http.Error(w, "Could not read the image", http.StatusBadRequest)
		return
	}
	if !ok {
		http.Error(w, "That file type isn't supported. Use a PNG, JPEG or GIF.", http.StatusBadRequest)
		return
	}

	filename := fmt.Sprintf("avatars/%s%s", uuid.NewString(), filepath.Ext(fileHeader.Filename))

	uploader := manager.NewUploader(app.bucket)
	_, err = uploader.Upload(ctx, &s3.PutObjectInput{
		Bucket:      app.bucketName,
		Key:         aws.String(filename),
		Body:        file,
		ContentType: aws.String(fileHeader.Header.Get("Content-Type")),
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to upload the image", http.StatusInternalServerError)
		return
	}

	fileURL := getPublicSupabaseBucketURL(*app.supabaseProjectRef, *app.bucketName, filename)

	err = app.queries.SetProfileAvatar(ctx, db.SetProfileAvatarParams{
		ID:        userID,
		AvatarUrl: pgtype.Text{String: fileURL, Valid: true},
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to save the picture", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		AvatarURL string `json:"avatar_url"`
	}{AvatarURL: fileURL})
}

// removeAvatar clears the uploaded picture. The stored object is left in the
// bucket; the profile simply stops pointing at it and falls back to Gravatar.
func (app *App) removeAvatar(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	err := app.queries.SetProfileAvatar(r.Context(), db.SetProfileAvatarParams{
		ID:        userID,
		AvatarUrl: pgtype.Text{Valid: false},
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to remove the picture", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (app *App) getUserStats(w http.ResponseWriter, r *http.Request) {
	username := strings.ToLower(chi.URLParam(r, "slug"))
	if username == "" {
		http.Error(w, "Username cannot be empty", http.StatusBadRequest)
		return
	}

	user, err := app.queries.GetProfileWithUsername(r.Context(), username)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	stats, err := app.queries.GetUserStats(r.Context(), user.ID)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to fetch user stats", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// parseFollowPagination parses page/limit query params and returns limit and offset.
func parseFollowPagination(r *http.Request) (limit int, offset int) {
	page := 1
	limit = 20
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
	offset = (page - 1) * limit
	return limit, offset
}

// writeFollowList renders one page of followers or followees.
//
// Generic because sqlc emits a separate row type per query — ListFollowersRow
// and ListFollowingRow — even though their fields and JSON are identical. A
// type parameter cannot reach a struct field, so each caller passes the total
// from its own first row.
func writeFollowList[T any](w http.ResponseWriter, users []T, totalCount int64, limit int) {
	if users == nil {
		users = []T{}
	}

	totalPages := (totalCount + int64(limit) - 1) / int64(limit)

	response := struct {
		Users      []T   `json:"users"`
		TotalCount int64 `json:"total_count"`
		TotalPages int64 `json:"total_pages"`
	}{
		Users:      users,
		TotalCount: totalCount,
		TotalPages: totalPages,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (app *App) listFollowers(w http.ResponseWriter, r *http.Request) {
	username := strings.ToLower(chi.URLParam(r, "slug"))
	if username == "" {
		http.Error(w, "Username cannot be empty", http.StatusBadRequest)
		return
	}

	user, err := app.queries.GetProfileWithUsername(r.Context(), username)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	viewerID := extractUserIDFromRequestIfPresent(r)
	limit, offset := parseFollowPagination(r)

	users, err := app.queries.ListFollowers(r.Context(), db.ListFollowersParams{
		IsAuthenticated: viewerID != uuid.Nil,
		ViewerID:        viewerID,
		TargetID:        user.ID,
		Lim:             int32(limit),
		Off:             int32(offset),
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to fetch followers", http.StatusInternalServerError)
		return
	}

	var total int64
	if len(users) > 0 {
		total = users[0].TotalCount
	}
	writeFollowList(w, users, total, limit)
}

func (app *App) listFollowing(w http.ResponseWriter, r *http.Request) {
	username := strings.ToLower(chi.URLParam(r, "slug"))
	if username == "" {
		http.Error(w, "Username cannot be empty", http.StatusBadRequest)
		return
	}

	user, err := app.queries.GetProfileWithUsername(r.Context(), username)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	viewerID := extractUserIDFromRequestIfPresent(r)
	limit, offset := parseFollowPagination(r)

	users, err := app.queries.ListFollowing(r.Context(), db.ListFollowingParams{
		IsAuthenticated: viewerID != uuid.Nil,
		ViewerID:        viewerID,
		TargetID:        user.ID,
		Lim:             int32(limit),
		Off:             int32(offset),
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to fetch following", http.StatusInternalServerError)
		return
	}

	var total int64
	if len(users) > 0 {
		total = users[0].TotalCount
	}
	writeFollowList(w, users, total, limit)
}

func (app *App) followUser(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	userIDString := chi.URLParam(r, "user_id")
	followeeID, err := uuid.Parse(userIDString)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed user id", http.StatusBadRequest)
		return
	}

	// Prevent users from following themselves
	if userID == followeeID {
		http.Error(w, "Cannot follow yourself", http.StatusBadRequest)
		return
	}

	// Use transaction for follow + notification
	tx, err := app.db.Begin(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	qtx := app.queries.WithTx(tx)

	// Follow the user
	followUserParams := db.FollowUserParams{
		FollowerID: userID,
		FolloweeID: followeeID,
	}

	err = qtx.FollowUser(r.Context(), followUserParams)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to follow user", http.StatusInternalServerError)
		return
	}

	// Create notification (with spam protection built-in)
	actorName, actorUsername := actorNameAndUsername(qtx, r.Context(), userID)
	notificationParams := db.CreateNotificationParams{
		RecipientID: followeeID,
		ActorID:     ToPgUUID(userID),
		Type:        "follow",
		EntityID:    pgtype.UUID{Valid: false},
		EntityType:  pgtype.Text{Valid: false},
		Title:       "New follower",
		Message:     fmt.Sprintf("%s is now following you", actorName),
	}

	emailNotify := false
	rows, nerr := qtx.CreateNotification(r.Context(), notificationParams)
	if nerr != nil {
		log.Println(nerr)
		// Don't fail the follow if notification fails
	} else if rows > 0 {
		emailNotify = true
	}

	err = tx.Commit(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to commit transaction", http.StatusInternalServerError)
		return
	}

	if emailNotify && app.mailer != nil {
		go func(rid uuid.UUID, actor, username string) {
			email, eerr := app.queries.GetUserEmail(context.Background(), rid)
			if eerr != nil || email == "" {
				log.Println("follow email: could not resolve recipient email:", eerr)
				return
			}
			if err := app.mailer.SendNewFollower(context.Background(), email, actor, username); err != nil {
				log.Println("follow email:", err)
			}
		}(followeeID, actorName, actorUsername)
	}

	w.WriteHeader(http.StatusOK)
}

func (app *App) unfollowUser(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	userIDString := chi.URLParam(r, "user_id")
	followeeID, err := uuid.Parse(userIDString)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed user id", http.StatusBadRequest)
		return
	}

	unfollowUserParams := db.UnfollowUserParams{
		FollowerID: userID,
		FolloweeID: followeeID,
	}

	err = app.queries.UnfollowUser(r.Context(), unfollowUserParams)
	if err != nil {
		http.Error(w, "Failed to unfollow user", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// UsernameAvailabilityRequest represents the request for checking username availability
type UsernameAvailabilityRequest struct {
	Username string `json:"username"`
}

// UsernameAvailabilityResponse represents the response for username availability
type UsernameAvailabilityResponse struct {
	Available bool `json:"available"`
}

func (app *App) checkUsernameAvailable(w http.ResponseWriter, r *http.Request) {
	// Usernames are case-insensitive.
	username := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("username")))

	if username == "" {
		http.Error(w, "Username parameter is required", http.StatusBadRequest)
		return
	}

	available, err := app.queries.CheckUsernameAvailable(r.Context(), username)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to check username availability", http.StatusInternalServerError)
		return
	}

	response := UsernameAvailabilityResponse{
		Available: available,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (app *App) welcomeEmailHook(w http.ResponseWriter, r *http.Request) {
	// 1. Check secret key
	// TODO

	// 2. Extract data
	// TODO

	// 3. Send mail
	// app.mailer.SendWelcome(r.Context(), )
}
