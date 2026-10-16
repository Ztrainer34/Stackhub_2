package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"stackhub.com/stackhub/pkg/db"
	"stackhub.com/stackhub/pkg/post"
)

func (app *App) starPost(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	slug := chi.URLParam(r, "id")

	id, err := uuid.Parse(slug)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	// Use transaction for star + notification
	tx, err := app.db.Begin(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	qtx := app.queries.WithTx(tx)

	// Looked up before starring, with the caller as viewer: a post they cannot
	// see — someone else's draft — is a 404, not a star and an email to its
	// author.
	post, err := qtx.GetPost(r.Context(), db.GetPostParams{ID: id, ViewerID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	} else if err != nil {
		log.Println(err)
		http.Error(w, "Failed to star post", http.StatusInternalServerError)
		return
	}

	starPostParams := db.StarPostParams{
		PostID:  id,
		LikerID: userID,
	}

	err = qtx.StarPost(r.Context(), starPostParams)
	if err != nil {
		log.Println(err)
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	var (
		emailNotify   bool
		recipientID   uuid.UUID
		actorName     string
		actorUsername string
		playbookName  string
		playbookURL   string
	)
	if post.AuthorID != userID { // Don't notify if starring own post
		actorName, actorUsername = actorNameAndUsername(qtx, r.Context(), userID)

		// Create notification (with spam protection built-in)
		entityType := "post"
		notificationParams := db.CreateNotificationParams{
			RecipientID: post.AuthorID,
			ActorID:     ToPgUUID(userID),
			Type:        "post_star",
			EntityID:    ToPgUUID(id),
			EntityType:  ToPgText(&entityType),
			Title:       "New star",
			Message:     fmt.Sprintf("%s starred “%s”", actorName, post.Name),
		}

		rows, nerr := qtx.CreateNotification(r.Context(), notificationParams)
		if nerr != nil {
			log.Println(nerr)
			// Don't fail the star if notification fails
		} else if rows > 0 {
			// New notification (not deduped) → also send the email.
			emailNotify = true
			recipientID = post.AuthorID
			playbookName = post.Name
			playbookURL = fmt.Sprintf("%s/%s/%s", siteURL, post.AuthorUsername, post.Slug)
		}
	}

	err = tx.Commit(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to commit transaction", http.StatusInternalServerError)
		return
	}

	if emailNotify && app.mailer != nil {
		go func(rid uuid.UUID, actor, username, playbook, playbookLink string) {
			email, eerr := app.queries.GetUserEmail(context.Background(), rid)
			if eerr != nil || email == "" {
				log.Println("star email: could not resolve recipient email:", eerr)
				return
			}
			if err := app.mailer.SendPlaybookStarred(context.Background(), email, actor, username, playbook, playbookLink); err != nil {
				log.Println("star email:", err)
			}
		}(recipientID, actorName, actorUsername, playbookName, playbookURL)
	}

	w.WriteHeader(http.StatusOK)
}

func (app *App) unstarPost(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	slug := chi.URLParam(r, "id")

	id, err := uuid.Parse(slug)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	unstarPostParams := db.UnstarPostParams{
		PostID:  id,
		LikerID: userID,
	}

	err = app.queries.UnstarPost(r.Context(), unstarPostParams)

	if err != nil {
		log.Println(err)
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (app *App) createPostComment(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	slug := chi.URLParam(r, "id")

	postID, err := uuid.Parse(slug)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	defer r.Body.Close()

	var args post.CreatePostCommentArgs
	if err := json.NewDecoder(r.Body).Decode(&args); err != nil {
		log.Println(err)
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(args.Content) == "" {
		http.Error(w, "Comment cannot be empty", http.StatusBadRequest)
		return
	}
	if tooLong(args.Content, maxCommentLen) {
		http.Error(w, fmt.Sprintf("Comment must be at most %d characters", maxCommentLen), http.StatusBadRequest)
		return
	}

	// Use transaction for comment + notification
	tx, err := app.db.Begin(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	qtx := app.queries.WithTx(tx)

	// Same rule as starPost: no commenting on a post the caller cannot see.
	post, err := qtx.GetPost(r.Context(), db.GetPostParams{ID: postID, ViewerID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	} else if err != nil {
		log.Println(err)
		http.Error(w, "Failed to create comment", http.StatusInternalServerError)
		return
	}

	createPostCommentParams := db.CreatePostCommentParams{
		PostID:      postID,
		CommenterID: userID,
		Content:     args.Content,
	}

	err = qtx.CreatePostComment(r.Context(), createPostCommentParams)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to create comment", http.StatusInternalServerError)
		return
	}

	if post.AuthorID != userID { // Don't notify if commenting on own post
		// Create notification (with spam protection built-in)
		entityType := "post"
		notificationParams := db.CreateNotificationParams{
			RecipientID: post.AuthorID,
			ActorID:     ToPgUUID(userID),
			Type:        "post_comment",
			EntityID:    ToPgUUID(postID),
			EntityType:  ToPgText(&entityType),
			Title:       "New comment",
			Message:     fmt.Sprintf("Someone commented on your post \"%s\"", post.Name),
		}

		_, err = qtx.CreateNotification(r.Context(), notificationParams)
		if err != nil {
			log.Println(err)
			// Don't fail the comment if notification fails
		}
	}

	err = tx.Commit(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to commit transaction", http.StatusInternalServerError)
		return
	}
}

func (app *App) listPostComments(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "id")

	postID, err := uuid.Parse(slug)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	params := db.ListPostCommentsParams{
		PostID: postID,
	}

	posts, err := app.queries.ListPostComments(r.Context(), params)

	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusNotFound)
		return
	}

	if posts == nil {
		posts = []db.ListPostCommentsRow{}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(posts)
}

func (app *App) listUserStarredPosts(w http.ResponseWriter, r *http.Request) {
	username := strings.ToLower(chi.URLParam(r, "slug"))

	if username == "" {
		http.Error(w, "Username cannot be empty", http.StatusBadRequest)
		return
	}

	// Get user ID from username
	user, err := app.queries.GetProfileWithUsername(r.Context(), username)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

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

	params := db.ListUserStarredPostsParams{
		LikerID: user.ID,
		Limit:   int32(limit),
		Offset:  int32(offset),
	}

	res, err := app.queries.ListUserStarredPosts(r.Context(), params)

	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	if res == nil {
		res = []db.ListUserStarredPostsRow{}
	}

	// Calculate pagination metadata
	totalCount := int32(0)
	if len(res) > 0 {
		totalCount = int32(res[0].TotalCount)
	}

	totalPages := (totalCount + int32(limit) - 1) / int32(limit)

	response := struct {
		Posts      []db.ListUserStarredPostsRow `json:"posts"`
		Page       int                          `json:"page"`
		Limit      int                          `json:"limit"`
		TotalCount int32                        `json:"total_count"`
		TotalPages int32                        `json:"total_pages"`
	}{
		Posts:      res,
		Page:       page,
		Limit:      limit,
		TotalCount: totalCount,
		TotalPages: totalPages,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
