package post

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
	"stackhub.com/stackhub/internal/httpx"
	"stackhub.com/stackhub/internal/pg"
	"stackhub.com/stackhub/internal/validate"
	"stackhub.com/stackhub/pkg/db"
)

func (h *Handler) StarPost(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r)

	slug := chi.URLParam(r, "id")

	id, err := uuid.Parse(slug)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	email, err := postService{db: h.DB}.star(r.Context(), userID, id)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	if email != nil && h.Mailer != nil {
		go func(e starEmail) {
			address, eerr := h.Queries.GetUserEmail(context.Background(), e.recipientID)
			if eerr != nil || address == "" {
				log.Println("star email: could not resolve recipient email:", eerr)
				return
			}
			if err := h.Mailer.SendPlaybookStarred(context.Background(), address, e.actorName, e.actorUsername, e.postName, e.postURL); err != nil {
				log.Println("star email:", err)
			}
		}(*email)
	}

	w.WriteHeader(http.StatusOK)
}

func (h *Handler) UnstarPost(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r)

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

	err = h.Queries.UnstarPost(r.Context(), unstarPostParams)

	if err != nil {
		log.Println(err)
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *Handler) CreatePostComment(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r)

	slug := chi.URLParam(r, "id")

	postID, err := uuid.Parse(slug)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	defer r.Body.Close()

	var args CreatePostCommentArgs
	if err := json.NewDecoder(r.Body).Decode(&args); err != nil {
		log.Println(err)
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(args.Content) == "" {
		http.Error(w, "Comment cannot be empty", http.StatusBadRequest)
		return
	}
	if validate.TooLong(args.Content, maxCommentLen) {
		http.Error(w, fmt.Sprintf("Comment must be at most %d characters", maxCommentLen), http.StatusBadRequest)
		return
	}

	// Use transaction for comment + notification
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	qtx := h.Queries.WithTx(tx)

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
			ActorID:     pg.UUID(userID),
			Type:        "post_comment",
			EntityID:    pg.UUID(postID),
			EntityType:  pg.Text(&entityType),
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

func (h *Handler) ListPostComments(w http.ResponseWriter, r *http.Request) {
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

	posts, err := h.Queries.ListPostComments(r.Context(), params)

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

func (h *Handler) ListUserStarredPosts(w http.ResponseWriter, r *http.Request) {
	username := strings.ToLower(chi.URLParam(r, "slug"))

	if username == "" {
		http.Error(w, "Username cannot be empty", http.StatusBadRequest)
		return
	}

	// Get user ID from username
	user, err := h.Queries.GetProfileWithUsername(r.Context(), username)
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

	res, err := h.Queries.ListUserStarredPosts(r.Context(), params)

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
