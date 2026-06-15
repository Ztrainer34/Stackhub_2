package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi"
	"github.com/go-chi/chi/middleware"
	"github.com/go-chi/cors"
	"github.com/go-chi/jwtauth/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/resend/resend-go/v2"
	"golang.org/x/oauth2"
	"stackhub.com/stackhub/pkg/db"
	"stackhub.com/stackhub/pkg/mail"
	shmiddleware "stackhub.com/stackhub/pkg/middleware"
	"stackhub.com/stackhub/pkg/post"
)

type OAuthConfig struct {
	Github oauth2.Config
}

type App struct {
	bucket             *s3.Client
	bucketName         *string
	supabaseProjectRef *string
	db                 *pgxpool.Pool
	queries            *db.Queries
	mailer             *mail.Mailer
}

func ToPgText(s *string) pgtype.Text {
	if s == nil {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{
		String: *s,
		Valid:  true,
	}
}

func ToPgUUID(u uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: u, Valid: true}
}

func (app *App) createPost(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	defer r.Body.Close()

	var form post.CreatePostWithSuggestedToolsForm
	if err := json.NewDecoder(r.Body).Decode(&form); err != nil {
		log.Println(err)
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	log.Println(form)

	if len(form.Tools) == 0 && len(form.SuggestedTools) == 0 {
		http.Error(w, "Missing tools", http.StatusBadRequest)
		return
	}

	totalTools := len(form.Tools) + len(form.SuggestedTools)

	switch form.Type {
	case "playbook":
		if totalTools != 1 {
			http.Error(w, "Playbooks require exactly one tool or tool suggestion", http.StatusBadRequest)
			return
		}
	case "combo", "comparison":
		if totalTools < 2 {
			http.Error(w, "Combos and comparisons require at least two tools or tool suggestions", http.StatusBadRequest)
			return
		}
		// FIXME: Settle on a global limit
		if totalTools > 10 {
			http.Error(w, "Too many tools (maximum 10)", http.StatusBadRequest)
			return
		}
	default:
		http.Error(w, "Unknown post type", http.StatusBadRequest)
		return
	}

	createPostParams := db.CreatePostParams{
		AuthorID:    userID,
		Type:        form.Type,
		Name:        form.Name,
		Slug:        post.NameToSlug(form.Name),
		Description: form.Description,
	}

	tx, err := app.db.Begin(r.Context())
	defer tx.Rollback(r.Context())

	if err != nil {
		log.Println(err)
		http.Error(w, "", http.StatusInternalServerError)
		return
	}

	qtx := app.queries.WithTx(tx)

	post, err := qtx.CreatePost(r.Context(), createPostParams)

	if errors.Is(err, pgx.ErrNoRows) {
		log.Println(err)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	} else if err != nil {
		// Check for unique constraint violation on author_id, slug
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" && strings.Contains(pgErr.ConstraintName, "posts_author_slug") {
			http.Error(w, "You already have a post with this slug. Please choose a different title.", http.StatusConflict)
			return
		}
		log.Println(err)
		http.Error(w, "Failed to create post", http.StatusBadRequest)
		return
	}

	// Handle regular tools
	if len(form.Tools) > 0 {
		var toolLinks []db.AddPostToolsParams
		for _, toolID := range form.Tools {
			link := db.AddPostToolsParams{
				PostID: post.ID,
				ToolID: toolID,
			}
			toolLinks = append(toolLinks, link)
		}

		_, err = qtx.AddPostTools(r.Context(), toolLinks)
		if err != nil {
			log.Println(err)
			http.Error(w, "Failed to create post", http.StatusBadRequest)
			return
		}
	}

	// Handle suggested tools
	if len(form.SuggestedTools) > 0 {
		// var suggestedToolLinks []db

		for _, suggestedTool := range form.SuggestedTools {
			// Create the suggested tool
			toolTicketParams := db.CreateToolTicketParams{
				PostID:          post.ID,
				RequestedBy:     userID,
				ToolName:        suggestedTool.Name,
				ToolDescription: pgtype.Text{String: suggestedTool.Description, Valid: true},
				ToolWebsite:     pgtype.Text{String: suggestedTool.Website, Valid: true},
			}

			toolTicketID, err := qtx.CreateToolTicket(r.Context(), toolTicketParams)
			if err != nil {
				log.Println(err)
				http.Error(w, "Failed to create suggested tool", http.StatusBadRequest)
				return
			}

			// Add categories for the suggested tool
			if len(suggestedTool.Categories) > 0 {
				var categoryLinks []db.AddToolTicketCategoriesParams
				for _, categoryID := range suggestedTool.Categories {
					link := db.AddToolTicketCategoriesParams{
						TicketID:   toolTicketID,
						CategoryID: int32(categoryID),
					}
					categoryLinks = append(categoryLinks, link)
				}

				_, err = qtx.AddToolTicketCategories(r.Context(), categoryLinks)
				if err != nil {
					log.Println(err)
					http.Error(w, "Failed to add suggested tool categories", http.StatusBadRequest)
					return
				}
			}
		}
	}

	tx.Commit(r.Context())

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(post)
}

func extractTextFromPost(state map[string]interface{}) string {
	blocks, ok := state["blocks"].([]interface{})
	if !ok {
		return ""
	}

	var textSlice []string

	for _, block := range blocks {
		blockMap, ok := block.(map[string]interface{})
		if !ok {
			continue
		}

		data, ok := blockMap["data"].(map[string]interface{})
		if !ok {
			continue
		}

		text, ok := data["text"].(string)
		if ok && len(text) > 0 {
			textSlice = append(textSlice, text)
		}
	}

	return strings.Join(textSlice, "\n")
}

func (app *App) savePost(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	slug := chi.URLParam(r, "id")

	defer r.Body.Close()

	var form post.SavePostForm
	if err := json.NewDecoder(r.Body).Decode(&form); err != nil {
		log.Println(err)
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	id, err := uuid.Parse(slug)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	var contentJson map[string]interface{}
	err = json.Unmarshal([]byte(form.Content), &contentJson)
	if err != nil {
		log.Println(err)
		http.Error(w, "Invalid encoding for post content", http.StatusBadRequest)
		return
	}

	savePostParams := db.SavePostDraftParams{
		ID:               id,
		DraftContent:     []byte(form.Content),
		DraftContentText: pgtype.Text{Valid: true, String: extractTextFromPost(contentJson)},
		AuthorID:         userID,
	}

	rowsAffected, err := app.queries.SavePostDraft(r.Context(), savePostParams)

	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to save", http.StatusBadRequest)
		return
	}

	if rowsAffected != 1 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// FIXME: Split into two endpoints for clarity
func (app *App) publishPost(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	slug := chi.URLParam(r, "id")

	id, err := uuid.Parse(slug)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	defer r.Body.Close()

	var form post.PublishPostForm

	if form.Content != nil && err == nil {
		var contentJson map[string]interface{}
		err = json.Unmarshal([]byte(*form.Content), &contentJson)
		if err != nil {
			log.Println(err)
			http.Error(w, "Invalid encoding for post content", http.StatusBadRequest)
			return
		}

		saveAndPublishParams := db.SaveDraftAndPublishPostParams{
			ID:               id,
			AuthorID:         userID,
			DraftContent:     []byte(*form.Content),
			DraftContentText: pgtype.Text{Valid: true, String: extractTextFromPost(contentJson)},
		}

		rowsAffected, err := app.queries.SaveDraftAndPublishPost(r.Context(), saveAndPublishParams)

		if err != nil {
			log.Println(err)
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}

		if rowsAffected != 1 {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
	} else {
		publishPostParams := db.PublishPostParams{
			ID:       id,
			AuthorID: userID,
		}

		err = app.queries.PublishPost(r.Context(), publishPostParams)

		if err != nil {
			log.Println(err)
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}
	}

	w.WriteHeader(http.StatusOK)
}

func (app *App) renamePost(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	slug := chi.URLParam(r, "id")

	id, err := uuid.Parse(slug)
	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	defer r.Body.Close()

	var form post.RenamePostForm
	if err := json.NewDecoder(r.Body).Decode(&form); err != nil {
		log.Println(err)
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	// Validate input
	if strings.TrimSpace(form.Name) == "" {
		http.Error(w, "Post name cannot be empty", http.StatusBadRequest)
		return
	}

	// Generate new slug from name
	newSlug := post.NameToSlug(form.Name)

	renameParams := db.RenamePostWithSlugHistoryParams{
		PostID:      id,
		AuthorID:    userID,
		Name:        form.Name,
		CurrentSlug: newSlug,
		Description: form.Description,
	}

	err = app.queries.RenamePostWithSlugHistory(r.Context(), renameParams)
	if err != nil {
		// Check for unique constraint violation on author_id, slug
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" && strings.Contains(pgErr.ConstraintName, "posts_author_slug") {
			http.Error(w, "You already have a post with this slug. Please choose a different title.", http.StatusConflict)
			return
		}
		log.Println(err)
		http.Error(w, "Failed to rename post", http.StatusInternalServerError)
		return
	}

	// Return the new slug for frontend to redirect if needed
	response := map[string]string{
		"new_slug": newSlug,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (app *App) unpublishPost(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	slug := chi.URLParam(r, "id")

	id, err := uuid.Parse(slug)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	params := db.UnpublishPostParams{
		ID:       id,
		AuthorID: userID,
	}

	count, err := app.queries.UnpublishPost(r.Context(), params)
	if count == 0 {
		http.Error(w, "Not enough permissions to remove post", http.StatusUnauthorized)
		return
	}
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not unpublish post", http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
}

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

	// Get post info for notification
	post, err := qtx.GetPost(r.Context(), id)
	if err != nil {
		log.Println(err)
		// Continue even if we can't get post info
	} else if post.AuthorID != userID { // Don't notify if starring own post
		// Create notification (with spam protection built-in)
		entityType := "post"
		notificationParams := db.CreateNotificationParams{
			RecipientID: post.AuthorID,
			ActorID:     ToPgUUID(userID),
			Type:        "post_star",
			EntityID:    ToPgUUID(id),
			EntityType:  ToPgText(&entityType),
			Title:       "Post starred",
			Message:     fmt.Sprintf("Someone starred your post \"%s\"", post.Name),
		}

		err = qtx.CreateNotification(r.Context(), notificationParams)
		if err != nil {
			log.Println(err)
			// Don't fail the star if notification fails
		}
	}

	err = tx.Commit(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to commit transaction", http.StatusInternalServerError)
		return
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

	// Use transaction for comment + notification
	tx, err := app.db.Begin(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	qtx := app.queries.WithTx(tx)

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

	// Get post info for notification
	post, err := qtx.GetPost(r.Context(), postID)
	if err != nil {
		log.Println(err)
		// Continue even if we can't get post info
	} else if post.AuthorID != userID { // Don't notify if commenting on own post
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

		err = qtx.CreateNotification(r.Context(), notificationParams)
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

func (app *App) listPosts(w http.ResponseWriter, r *http.Request) {
	res, err := app.queries.ListPosts(r.Context())

	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusNotFound)
		return
	}

	if res == nil {
		res = []db.ListPostsRow{}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(res)
}

func (app *App) getPost(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	id, err := uuid.Parse(slug)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	res, err := app.queries.GetPost(r.Context(), id)

	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(res)
}

func (app *App) getPostContent(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	id, err := uuid.Parse(slug)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	res, err := app.queries.GetPostContent(r.Context(), id)

	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if res.Content == nil {
		w.WriteHeader(http.StatusNoContent)
	} else {
		w.WriteHeader(http.StatusOK)
		w.Write(res.Content)
	}
}

func (app *App) getPostDraftContent(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	slug := chi.URLParam(r, "slug")

	id, err := uuid.Parse(slug)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	params := db.GetPostDraftContentParams{
		ID:              id,
		AuthenticatedID: userID,
	}

	res, err := app.queries.GetPostDraftContent(r.Context(), params)

	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if res.DraftContent == nil {
		w.WriteHeader(http.StatusNoContent)
	} else {
		w.WriteHeader(http.StatusOK)
		w.Write(res.DraftContent)
	}
}

func (app *App) deletePost(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	slug := chi.URLParam(r, "id")

	id, err := uuid.Parse(slug)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	params := db.DeletePostParams{
		ID:       id,
		AuthorID: userID,
	}

	count, err := app.queries.DeletePost(r.Context(), params)
	if count == 0 {
		http.Error(w, "Not enough permissions to remove post", http.StatusUnauthorized)
		return
	}

	if err != nil {
		log.Println(err)
		http.Error(w, "Could not delete post", http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)

}

func (app *App) listUserPosts(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

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

	params := db.ListUserPostsParams{
		AuthorUsername: slug,
		Limit:          int32(limit),
		Offset:         int32(offset),
	}

	userID := extractUserIDFromRequestIfPresent(r)
	if userID != uuid.Nil {
		params.IsAuthenticated = true
		params.AuthenticatedID = userID
	}

	if typeStr := r.URL.Query().Get("type"); typeStr != "" {
		params.UsePostFilter = true
		params.PostFilter = typeStr
	}

	res, err := app.queries.ListUserPosts(r.Context(), params)

	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusNotFound)
		return
	}

	if res == nil {
		res = []db.ListUserPostsRow{}
	}

	// Calculate pagination metadata
	totalCount := int32(0)
	if len(res) > 0 {
		totalCount = int32(res[0].TotalCount)
	}

	totalPages := (totalCount + int32(limit) - 1) / int32(limit)

	response := struct {
		Posts      []db.ListUserPostsRow `json:"posts"`
		Page       int                   `json:"page"`
		Limit      int                   `json:"limit"`
		TotalCount int32                 `json:"total_count"`
		TotalPages int32                 `json:"total_pages"`
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

func (app *App) listUserStarredPosts(w http.ResponseWriter, r *http.Request) {
	username := chi.URLParam(r, "slug")

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

func (app *App) getUserPost(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	post_slug := chi.URLParam(r, "post_slug")

	// Avoid spamming db if request contains empty slugs
	if slug == "" || post_slug == "" {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}

	// Check if user is authenticated
	userID := extractUserIDFromRequestIfPresent(r)

	// Try direct lookup first (99% of cases)
	directParams := db.GetUserPostDirectParams{
		AuthorUsername: slug,
		Slug:           post_slug,
	}

	if userID != uuid.Nil {
		directParams.IsAuthenticated = true
		directParams.AuthenticatedID = userID
	}

	post, err := app.queries.GetUserPostDirect(r.Context(), directParams)
	if err == nil {
		// Direct hit - no redirect needed
		response := map[string]interface{}{
			"post":       post,
			"redirected": false,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	// Fallback to redirect lookup
	redirectParams := db.GetUserPostByOldSlugParams{
		OldSlug:        post_slug,
		AuthorUsername: slug,
	}

	if userID != uuid.Nil {
		redirectParams.IsAuthenticated = true
		redirectParams.AuthenticatedID = userID
	}

	redirectPost, redirectErr := app.queries.GetUserPostByOldSlug(r.Context(), redirectParams)
	if redirectErr == nil {
		// Found via old slug - indicate redirect needed
		response := map[string]interface{}{
			"post":           redirectPost,
			"redirected":     true,
			"canonical_slug": redirectPost.Slug,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	log.Println(err)
	http.Error(w, "Post not found", http.StatusNotFound)
}

func (app *App) autocompleteTool(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")

	if query == "" {
		http.Error(w, "Missing search query", http.StatusBadRequest)
		return
	}

	limit_string := r.URL.Query().Get("limit")

	limit, err := strconv.Atoi(limit_string)

	if err != nil || limit <= 0 {
		limit = 5
	}

	// Cap limit at 50
	if limit > 50 {
		limit = 50
	}

	autocompleteToolParams := db.AutocompleteToolParams{
		Similarity: query,
		Limit:      int32(limit),
	}

	results, err := app.queries.AutocompleteTool(r.Context(), autocompleteToolParams)

	if err != nil {
		log.Println(err)
		http.Error(w, "Could not search tool", http.StatusInternalServerError)
		return
	}

	if results == nil {
		results = []db.AutocompleteToolRow{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func (app *App) autocompleteCategory(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")

	if query == "" {
		http.Error(w, "Missing search query", http.StatusBadRequest)
		return
	}

	limit_string := r.URL.Query().Get("limit")

	limit, err := strconv.Atoi(limit_string)

	if err != nil || limit <= 0 {
		limit = 10
	}

	// Cap limit at 100
	if limit > 100 {
		limit = 100
	}

	autocompleteCategoryParams := db.AutocompleteCategoryParams{
		Similarity: query,
		Limit:      int32(limit),
	}

	results, err := app.queries.AutocompleteCategory(r.Context(), autocompleteCategoryParams)

	if err != nil {
		log.Println(err)
		http.Error(w, "Could not search categories", http.StatusInternalServerError)
		return
	}

	if results == nil {
		results = []db.AutocompleteCategoryRow{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func (app *App) getTool(w http.ResponseWriter, r *http.Request) {
	idUnparsed := chi.URLParam(r, "id")

	id, err := uuid.Parse(idUnparsed)

	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	// Check if user is authenticated
	userID := extractUserIDFromRequestIfPresent(r)

	if userID != uuid.Nil {
		// Use authenticated version with status
		params := db.GetToolAuthenticatedParams{
			ID:        id,
			ProfileID: userID,
		}
		tool, err := app.queries.GetToolAuthenticated(r.Context(), params)
		if err != nil {
			http.Error(w, "Could not get tool", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(tool)
	} else {
		// Use regular version without status
		tool, err := app.queries.GetTool(r.Context(), id)
		if err != nil {
			http.Error(w, "Could not get tool", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(tool)
	}
}

func (app *App) getToolsByCategory(w http.ResponseWriter, r *http.Request) {
	categorySlug := chi.URLParam(r, "categorySlug")
	if categorySlug == "" {
		http.Error(w, "Missing category slug", http.StatusBadRequest)
		return
	}

	// Parse pagination parameters
	page := 1
	limit := 12 // Default page size

	if pageStr := r.URL.Query().Get("page"); pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}

	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	offset := (page - 1) * limit

	tools, err := app.queries.GetToolsByCategory(r.Context(), db.GetToolsByCategoryParams{
		Slug:   categorySlug,
		Limit:  int32(limit),
		Offset: int32(offset),
	})
	if err != nil {
		log.Printf("Error getting tools by category: %v", err)
		http.Error(w, "Could not get tools by category", http.StatusInternalServerError)
		return
	}

	if tools == nil {
		tools = []db.GetToolsByCategoryRow{}
	}

	// Calculate pagination info
	totalCount := int64(0)
	if len(tools) > 0 {
		totalCount = tools[0].TotalCount
	}

	totalPages := int((totalCount + int64(limit) - 1) / int64(limit))

	response := map[string]interface{}{
		"data":        tools,
		"page":        page,
		"limit":       limit,
		"total_count": totalCount,
		"total_pages": totalPages,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (app *App) getCategoryBySlug(w http.ResponseWriter, r *http.Request) {
	categorySlug := chi.URLParam(r, "categorySlug")
	if categorySlug == "" {
		http.Error(w, "Missing category slug", http.StatusBadRequest)
		return
	}

	category, err := app.queries.GetCategoryBySlug(r.Context(), categorySlug)
	if err != nil {
		log.Printf("Error getting category by slug: %v", err)
		http.Error(w, "Could not get category", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(category)
}

type GithubUser struct {
	Login string `json:"login"`
	Email string `json:"email"`
}

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
		username := *form.Username
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
	slug := chi.URLParam(r, "slug")

	if slug == "" {
		http.Error(w, "User cannot be empty", http.StatusBadRequest)
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

type SearchParams struct {
	WebsearchToTsquery string
	Limit              int32
	Offset             int32
}

func (app *App) search(w http.ResponseWriter, r *http.Request) {
	category := r.URL.Query().Get("t")
	query := r.URL.Query().Get("q")
	pageString := r.URL.Query().Get("p")

	var page int32 = 1

	if pageString != "" {
		pageNum, err := strconv.ParseInt(pageString, 10, 32)

		if err != nil {
			http.Error(w, "Invalid page number", http.StatusBadRequest)
			return
		}

		if pageNum < 1 {
			http.Error(w, "Page number must be >= 1", http.StatusBadRequest)
			return
		}

		page = int32(pageNum)
	}

	var items_per_page int32 = 10

	result := make(map[string]interface{})

	result["type"] = category

	searchParams := SearchParams{
		WebsearchToTsquery: query,
		Limit:              items_per_page,
		Offset:             items_per_page * (page - 1), // Convert to 0-based for database offset
	}

	var totalCount int64 = 0

	switch category {
	case "post":
		userID := extractUserIDFromRequestIfPresent(r)

		params := db.SearchPostParams{
			WebsearchToTsquery: searchParams.WebsearchToTsquery,
			Limit:              searchParams.Limit,
			Offset:             searchParams.Offset,
		}

		if userID != uuid.Nil {
			params.IsAuthenticated = true
			params.AuthenticatedID = userID
		}

		posts, err := app.queries.SearchPost(r.Context(), db.SearchPostParams(params))

		if err != nil {
			log.Println(err)
			http.Error(w, "Could not search", http.StatusInternalServerError)
			return
		}

		if posts == nil {
			posts = []db.SearchPostRow{}
		}

		if len(posts) > 0 {
			totalCount = posts[0].TotalCount
		}

		result["data"] = posts

	case "tool":
		userID := extractUserIDFromRequestIfPresent(r)

		// Use authenticated query for logged-in users
		params := db.SearchToolParams{
			WebsearchToTsquery: searchParams.WebsearchToTsquery,
			Limit:              searchParams.Limit,
			Offset:             searchParams.Offset,
		}

		if userID != uuid.Nil {
			params.IsAuthenticated = true
			params.AuthenticatedID = userID
		}

		tools, err := app.queries.SearchTool(r.Context(), params)

		if err != nil {
			log.Println(err)
			http.Error(w, "Could not search", http.StatusInternalServerError)
			return
		}

		if tools == nil {
			tools = []db.SearchToolRow{}
		}

		if len(tools) > 0 {
			totalCount = tools[0].TotalCount
		}

		result["data"] = tools

	case "profile":
		profiles, err := app.queries.SearchProfile(r.Context(), db.SearchProfileParams(searchParams))

		if err != nil {
			log.Println(err)
			http.Error(w, "Could not search", http.StatusInternalServerError)
			return
		}

		if profiles == nil {
			profiles = []db.SearchProfileRow{}
		}

		if len(profiles) > 0 {
			totalCount = profiles[0].TotalCount
		}

		result["data"] = profiles

	default:
		http.Error(w, "Unknown category", http.StatusBadRequest)
		return
	}

	// Calculate pagination metadata
	totalPages := int32(1)
	if totalCount > 0 {
		totalPages = int32((totalCount + int64(items_per_page) - 1) / int64(items_per_page))
	}

	result["total_pages"] = totalPages
	result["current_page"] = page
	result["total_count"] = totalCount

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (app *App) getTopPosts(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequestIfPresent(r)

	limitStr := r.URL.Query().Get("limit")
	limit := int32(10) // Default limit

	if limitStr != "" {
		if parsedLimit, err := strconv.ParseInt(limitStr, 10, 32); err == nil && parsedLimit > 0 {
			limit = int32(parsedLimit)
			if limit > 100 { // Upper bound
				limit = 100
			}
		}
	}

	if userID == uuid.Nil {
		posts, err := app.queries.GetTopPosts(r.Context(), limit)
		if err != nil {
			log.Println(err)
			http.Error(w, "Could not get top posts", http.StatusInternalServerError)
			return
		}

		if posts == nil {
			posts = []db.PostsWithTool{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(posts)
	} else {
		params := db.GetTopRecommendedPostsParams{
			LikerID:         userID,
			Limit:           100,
			IsAuthenticated: true,
		}

		posts, err := app.queries.GetTopRecommendedPosts(r.Context(), params)
		if err != nil {
			log.Println(err)
			http.Error(w, "Could not get top posts", http.StatusInternalServerError)
			return
		}

		if posts == nil {
			posts = []db.GetTopRecommendedPostsRow{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(posts)
	}
}

func (app *App) getTopCategories(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	limit := int32(10) // Default limit

	if limitStr != "" {
		if parsedLimit, err := strconv.ParseInt(limitStr, 10, 32); err == nil && parsedLimit > 0 {
			limit = int32(parsedLimit)
			if limit > 100 { // Upper bound
				limit = 100
			}
		}
	}

	categories, err := app.queries.GetTopCategories(r.Context(), limit)
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not get top categories", http.StatusInternalServerError)
		return
	}

	if categories == nil {
		categories = []db.GetTopCategoriesRow{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(categories)
}

func (app *App) facets(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")

	facet_counts, err := app.queries.GetFacetCounts(r.Context(), query)

	if err != nil {
		log.Println(err)
		http.Error(w, "Could not fetch facet counts", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(facet_counts)
}

// Admin routes for tool ticket management
func (app *App) listToolTickets(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")

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

	params := db.ListToolTicketsParams{
		Column1: status,
		Limit:   int32(limit),
		Offset:  int32(offset),
	}

	tickets, err := app.queries.ListToolTickets(r.Context(), params)
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not list tool tickets", http.StatusInternalServerError)
		return
	}

	if tickets == nil {
		tickets = []db.ListToolTicketsRow{}
	}

	// Calculate pagination metadata
	totalCount := int32(0)
	if len(tickets) > 0 {
		totalCount = int32(tickets[0].TotalCount)
	}

	totalPages := (totalCount + int32(limit) - 1) / int32(limit)

	response := struct {
		Tickets    []db.ListToolTicketsRow `json:"tickets"`
		Page       int                     `json:"page"`
		Limit      int                     `json:"limit"`
		TotalCount int32                   `json:"total_count"`
		TotalPages int32                   `json:"total_pages"`
	}{
		Tickets:    tickets,
		Page:       page,
		Limit:      limit,
		TotalCount: totalCount,
		TotalPages: totalPages,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (app *App) getToolTicket(w http.ResponseWriter, r *http.Request) {
	ticketIDStr := chi.URLParam(r, "id")

	ticketID, err := uuid.Parse(ticketIDStr)
	if err != nil {
		http.Error(w, "Invalid ticket ID", http.StatusBadRequest)
		return
	}

	ticket, err := app.queries.GetToolTicket(r.Context(), ticketID)
	if err != nil {
		log.Println(err)
		http.Error(w, "Tool ticket not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ticket)
}

type ResolveTicketWithExistingRequest struct {
	ToolID uuid.UUID `json:"tool_id"`
}

func (app *App) resolveTicketWithExisting(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	ticketIDStr := chi.URLParam(r, "id")
	ticketID, err := uuid.Parse(ticketIDStr)
	if err != nil {
		http.Error(w, "Invalid ticket ID", http.StatusBadRequest)
		return
	}

	var req ResolveTicketWithExistingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Start transaction to handle both resolving ticket and adding tool to post
	tx, err := app.db.Begin(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	qtx := app.queries.WithTx(tx)

	// Get the ticket to find the post ID
	ticket, err := qtx.GetToolTicket(r.Context(), ticketID)
	if err != nil {
		log.Println(err)
		http.Error(w, "Tool ticket not found", http.StatusNotFound)
		return
	}

	// Resolve the ticket
	resolveParams := db.ResolveToolTicketWithExistingParams{
		ID:             ticketID,
		ResolvedToolID: ToPgUUID(req.ToolID),
		ResolvedBy:     ToPgUUID(userID),
	}

	err = qtx.ResolveToolTicketWithExisting(r.Context(), resolveParams)
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not resolve ticket", http.StatusInternalServerError)
		return
	}

	// Add the tool to the post (if not already there)
	addPostToolParams := db.AddPostToolSafeParams{
		PostID: ticket.PostID,
		ToolID: req.ToolID,
	}

	err = qtx.AddPostToolSafe(r.Context(), addPostToolParams)
	if err != nil {
		log.Println(err)
		http.Error(w, "Could add tool to post", http.StatusInternalServerError)
		return
	}

	err = tx.Commit(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not commit transaction", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

type ResolveTicketWithNewRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	LogoURL     string `json:"logo_url"`
	Categories  []int  `json:"categories"`
}

func (app *App) resolveTicketWithNew(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	ticketIDStr := chi.URLParam(r, "id")
	ticketID, err := uuid.Parse(ticketIDStr)
	if err != nil {
		http.Error(w, "Invalid ticket ID", http.StatusBadRequest)
		return
	}

	var req ResolveTicketWithNewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	tx, err := app.db.Begin(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	qtx := app.queries.WithTx(tx)

	// Get the ticket to find the post ID
	ticket, err := qtx.GetToolTicket(r.Context(), ticketID)
	if err != nil {
		log.Println(err)
		http.Error(w, "Tool ticket not found", http.StatusNotFound)
		return
	}

	// Create the new tool
	createToolParams := db.CreateToolParams{
		Name:        req.Name,
		Description: ToPgText(&req.Description),
		LogoUrl:     ToPgText(&req.LogoURL),
	}

	tool, err := qtx.CreateTool(r.Context(), createToolParams)
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not create tool", http.StatusInternalServerError)
		return
	}

	// Assign categories to the new tool
	if len(req.Categories) > 0 {
		var categoryLinks []db.AssignCategoryToToolParams
		for _, categoryID := range req.Categories {
			link := db.AssignCategoryToToolParams{
				ToolID:     tool.ID,
				CategoryID: int32(categoryID),
			}
			categoryLinks = append(categoryLinks, link)
		}

		for _, link := range categoryLinks {
			err = qtx.AssignCategoryToTool(r.Context(), link)
			if err != nil {
				log.Println(err)
				http.Error(w, "Could not assign categories to tool", http.StatusInternalServerError)
				return
			}
		}
	}

	// Resolve the ticket with the new tool
	resolveParams := db.ResolveToolTicketWithNewParams{
		ID:             ticketID,
		ResolvedToolID: pgtype.UUID{Bytes: tool.ID, Valid: true},
		ResolvedBy:     pgtype.UUID{Bytes: userID, Valid: true},
	}

	err = qtx.ResolveToolTicketWithNew(r.Context(), resolveParams)
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not resolve ticket", http.StatusInternalServerError)
		return
	}

	// Add the new tool to the post
	addPostToolParams := db.AddPostToolSafeParams{
		PostID: ticket.PostID,
		ToolID: tool.ID,
	}

	err = qtx.AddPostToolSafe(r.Context(), addPostToolParams)
	if err != nil {
		log.Println(err)
		http.Error(w, "Could add tool to post", http.StatusInternalServerError)
		return
	}

	err = tx.Commit(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not commit transaction", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tool)
}

func (app *App) rejectTicket(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	ticketIDStr := chi.URLParam(r, "id")
	ticketID, err := uuid.Parse(ticketIDStr)
	if err != nil {
		http.Error(w, "Invalid ticket ID", http.StatusBadRequest)
		return
	}

	params := db.RejectToolTicketParams{
		ID:         ticketID,
		ResolvedBy: pgtype.UUID{Bytes: userID, Valid: true},
	}

	err = app.queries.RejectToolTicket(r.Context(), params)
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not reject ticket", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func isImage(file multipart.File) (bool, error) {
	// Read first 512 bytes to sniff the content type
	buffer := make([]byte, 512)
	_, err := file.Read(buffer)
	if err != nil {
		return false, err
	}
	// Reset the read pointer
	file.Seek(0, io.SeekStart)

	contentType := http.DetectContentType(buffer)

	return strings.HasPrefix(contentType, "image/"), nil
}

type UploadImageFile struct {
	URL string `json:"url"`
}

type UploadImageResponse struct {
	Success int             `json:"success"`
	File    UploadImageFile `json:"file"`
}

func getPublicSupabaseBucketURL(projectRef, bucketName, filePath string) string {
	return fmt.Sprintf("https://%s.supabase.co/storage/v1/object/public/%s/%s",
		projectRef, bucketName, filePath)
}

func (app *App) uploadImage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	slug := chi.URLParam(r, "id")

	id, err := uuid.Parse(slug)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	err = r.ParseMultipartForm(10 << 20) // 10 MB
	if err != nil {
		http.Error(w, "Could not parse multipart form", http.StatusBadRequest)
		return
	}

	file, fileHeader, err := r.FormFile("image")
	if err != nil {
		http.Error(w, "Could not get uploaded file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	ok, err := isImage(file)

	if !ok {
		http.Error(w, "Unsupported file type", http.StatusBadRequest)
		return
	}

	if err != nil {
		http.Error(w, "Could not read multipart form", http.StatusBadRequest)
		return
	}

	// Create a unique filename
	filename := fmt.Sprintf("%s%s", uuid.NewString(), filepath.Ext(fileHeader.Filename))

	uploader := manager.NewUploader(app.bucket)

	// Upload the file
	_, err = uploader.Upload(ctx, &s3.PutObjectInput{
		Bucket:      app.bucketName,
		Key:         aws.String(filename),
		Body:        file,
		ContentType: aws.String(fileHeader.Header.Get("Content-Type")),
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to upload to S3", http.StatusInternalServerError)
		return
	}

	createMediaParams := db.CreatePostMediaParams{
		PostID:   id,
		S3Key:    filename,
		FileName: fileHeader.Filename,
	}

	err = app.queries.CreatePostMedia(ctx, createMediaParams)
	if err != nil {
		http.Error(w, "Failed to upload to DB", http.StatusInternalServerError)
		return
	}

	fileURL := getPublicSupabaseBucketURL(*app.supabaseProjectRef, *app.bucketName, filename)

	// Respond with the file URL
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(UploadImageResponse{Success: 1, File: UploadImageFile{URL: fileURL}})
}

func (app *App) handleUploadFileOptions(w http.ResponseWriter, r *http.Request) {
	// Set CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*") // Or specify your domain
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Access-Control-Max-Age", "86400") // Cache preflight for 24 hours

	// Respond with 200 OK for preflight
	w.WriteHeader(http.StatusOK)
}

func (app *App) addToStack(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	toolIDString := chi.URLParam(r, "tool_id")
	toolID, err := uuid.Parse(toolIDString)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	addToStackParams := db.AddToStackParams{
		ProfileID: userID,
		ToolID:    toolID,
	}

	err = app.queries.AddToStack(r.Context(), addToStackParams)
	if err != nil {
		http.Error(w, "Failed to add to stack", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (app *App) removeFromStack(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	toolIDString := chi.URLParam(r, "tool_id")
	toolID, err := uuid.Parse(toolIDString)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	removeFromStack := db.RemoveFromStackParams{
		ProfileID: userID,
		ToolID:    toolID,
	}

	err = app.queries.RemoveFromStack(r.Context(), removeFromStack)
	if err != nil {
		http.Error(w, "Failed to remove from stack", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}
func (app *App) addToWatchlist(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	toolIDString := chi.URLParam(r, "tool_id")
	toolID, err := uuid.Parse(toolIDString)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	addToWatchlistParams := db.AddToWatchlistParams{
		ProfileID: userID,
		ToolID:    toolID,
	}

	err = app.queries.AddToWatchlist(r.Context(), addToWatchlistParams)
	if err != nil {
		http.Error(w, "Failed to add to watchlist", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (app *App) removeFromWatchlist(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	toolIDString := chi.URLParam(r, "tool_id")
	toolID, err := uuid.Parse(toolIDString)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	removeFromWatchlistParams := db.RemoveFromWatchlistParams{
		ProfileID: userID,
		ToolID:    toolID,
	}

	err = app.queries.RemoveFromWatchlist(r.Context(), removeFromWatchlistParams)
	if err != nil {
		http.Error(w, "Failed to remove from watchlist", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
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
	notificationParams := db.CreateNotificationParams{
		RecipientID: followeeID,
		ActorID:     ToPgUUID(userID),
		Type:        "follow",
		EntityID:    pgtype.UUID{Valid: false},
		EntityType:  pgtype.Text{Valid: false},
		Title:       "New follower",
		Message:     "Someone started following you",
	}

	err = qtx.CreateNotification(r.Context(), notificationParams)
	if err != nil {
		log.Println(err)
		// Don't fail the follow if notification fails
	}

	err = tx.Commit(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to commit transaction", http.StatusInternalServerError)
		return
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

// OnboardingRequest represents the request payload for onboarding
type OnboardingRequest struct {
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
}

// UsernameAvailabilityRequest represents the request for checking username availability
type UsernameAvailabilityRequest struct {
	Username string `json:"username"`
}

// UsernameAvailabilityResponse represents the response for username availability
type UsernameAvailabilityResponse struct {
	Available bool `json:"available"`
}

func (app *App) completeOnboarding(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)
	defer r.Body.Close()

	var req OnboardingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Println(err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate username
	if req.Username == "" {
		http.Error(w, "Username is required", http.StatusBadRequest)
		return
	}

	// Check if username is available
	available, err := app.queries.CheckUsernameAvailable(r.Context(), req.Username)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to check username availability", http.StatusInternalServerError)
		return
	}

	if !available {
		http.Error(w, "Username is already taken", http.StatusConflict)
		return
	}

	// Update profile with onboarding completion
	displayName := req.DisplayName
	if displayName == "" {
		displayName = req.Username
	}

	profile, err := app.queries.CreateProfile(r.Context(), db.CreateProfileParams{
		ID:          userID,
		Username:    req.Username,
		DisplayName: displayName,
	})

	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to complete onboarding", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(profile)
}

func (app *App) checkUsernameAvailable(w http.ResponseWriter, r *http.Request) {
	username := r.URL.Query().Get("username")

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

func (app *App) welcomeEmailHook(w http.ResponseWriter, r *http.Request) {
	// 1. Check secret key
	// TODO

	// 2. Extract data
	// TODO

	// 3. Send mail
	// app.mailer.SendWelcome(r.Context(), )
}

func getEnvOrPanic(key string) string {
	env, set := os.LookupEnv(key)

	if !set {
		log.Panicln("Missing env:", key)
	}

	return env
}

func main() {
	// Setup logger to show line numbers
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	ctx := context.Background()

	customResolver := aws.EndpointResolverWithOptionsFunc(
		func(service, region string, options ...interface{}) (aws.Endpoint, error) {
			if service == s3.ServiceID {
				return aws.Endpoint{
					URL:               getEnvOrPanic("S3_ENDPOINT"),
					SigningRegion:     region,
					HostnameImmutable: true,
				}, nil
			}
			return aws.Endpoint{}, fmt.Errorf("unknown endpoint requested")
		})

	// Load AWS config with custom settings
	cfg, err := config.LoadDefaultConfig(context.TODO(),
		config.WithRegion(getEnvOrPanic("S3_REGION")),
		config.WithEndpointResolverWithOptions(customResolver),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			getEnvOrPanic("S3_ACCESS_KEY"),
			getEnvOrPanic("S3_SECRET_ACCESS_KEY"),
			"",
		)),
	)

	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	bucket := s3.NewFromConfig(cfg)

	config, err := pgxpool.ParseConfig(getEnvOrPanic("DB_CONNECTION"))
	if err != nil {
		log.Panicln(err)
	}

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		log.Panicln(err)
	}

	queries := db.New(pool)

	jwtSecret := []byte(getEnvOrPanic("JWT_SECRET"))

	tokenAuth := jwtauth.New("HS256", jwtSecret, jwtSecret)

	resendClient := resend.NewClient(getEnvOrPanic("RESEND_API_KEY"))

	mailer, err := mail.NewMailer(resendClient, "updates.stackhub.me")
	if err != nil {
		log.Panicln(err)
	}

	supabaseProjectRef := getEnvOrPanic("SUPABASE_PROJECT_REF")

	app := App{
		db:                 pool,
		queries:            queries,
		bucket:             bucket,
		supabaseProjectRef: &supabaseProjectRef,
		bucketName:         aws.String(getEnvOrPanic("S3_BUCKET_NAME")),
		mailer:             mailer,
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.AllowContentType("application/json", "multipart/form-data"))
	r.Use(cors.Handler(cors.Options{
		AllowOriginFunc: func(r *http.Request, origin string) bool {
			if origin == "https://stackhub.me" {
				return true
			}

			// Allow localhost or 127.0.0.1 with any port

			// FIXME: Precompile to avoid bottleneck
			matched, _ := regexp.MatchString(`^http://(localhost|127\.0\.0\.1):\d+$`, origin)

			return matched
		},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "X-Requested-With"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300, // Maximum value not ignored by any of major browsers
	}))

	// Private routes
	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(tokenAuth))
		r.Use(shmiddleware.Authenticator(tokenAuth))
		r.Use(shmiddleware.OnboardingEnforcer())

		// Authenticated user routes
		r.Get("/me", app.getAuthenticatedUser)
		r.Put("/me", app.updateProfile)

		r.Get("/top-recommended-users", app.getTopRecommendedUsers)

		// Profile/Onboarding routes
		r.Post("/profile/onboard", app.completeOnboarding)
		r.Get("/profile/username/available", app.checkUsernameAvailable)

		// Post routes
		// r.Get("/post", app.listPosts)
		r.Post("/post/create", app.createPost)
		r.Post("/post/{id}/save", app.savePost)
		r.Post("/post/{id}/publish", app.publishPost)
		r.Get("/post/{id}/unpublish", app.unpublishPost)
		r.Put("/post/{id}/rename", app.renamePost)
		r.Put("/post/{id}/star", app.starPost)
		r.Delete("/post/{id}/star", app.unstarPost)
		r.Post("/post/{id}/comment", app.createPostComment)
		r.Post("/post/{id}/upload_file", app.uploadImage)
		r.Get("/post/{slug}/draft", app.getPostDraftContent)
		r.Delete("/post/{id}", app.deletePost)

		r.Post("/post/{id}/upload_url", app.uploadImage)

		r.Put("/user/stack/{tool_id}", app.addToStack)
		r.Delete("/user/stack/{tool_id}", app.removeFromStack)
		r.Put("/user/watchlist/{tool_id}", app.addToWatchlist)
		r.Delete("/user/watchlist/{tool_id}", app.removeFromWatchlist)

		r.Put("/user/follow/{user_id}", app.followUser)
		r.Delete("/user/follow/{user_id}", app.unfollowUser)

		// Notification routes
		r.Get("/notifications", app.getUserNotifications)
		r.Get("/notifications/unread-count", app.getUnreadNotificationCount)
		r.Put("/notifications/{id}/read", app.markNotificationRead)
		r.Put("/notifications/read-all", app.markAllNotificationsRead)

		// Admin routes for tool ticket management
		r.Route("/admin", func(r chi.Router) {
			// Tool ticket management
			r.Get("/tool-tickets", app.listToolTickets)
			r.Get("/tool-tickets/{id}", app.getToolTicket)
			r.Post("/tool-tickets/{id}/resolve-existing", app.resolveTicketWithExisting)
			r.Post("/tool-tickets/{id}/resolve-new", app.resolveTicketWithNew)
			r.Post("/tool-tickets/{id}/reject", app.rejectTicket)
		})
	})

	// Routes that are different if authenticated
	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(tokenAuth))
		r.Use(shmiddleware.OptionalAuthenticator(tokenAuth))

		r.Get("/tool/{id}", app.getTool)

		r.Get("/post/{slug}", app.getPost)
		r.Get("/user/{slug}/posts/{post_slug}", app.getUserPost)
		r.Get("/user/{slug}/starred", app.listUserStarredPosts)
		r.Get("/post/{slug}/content", app.getPostContent)
		r.Get("/post/{id}/comment", app.listPostComments)
		r.Get("/homepage/top-posts", app.getTopPosts)

		r.Get("/user/{slug}/posts", app.listUserPosts)

		r.Get("/search", app.search)
	})

	// Public routes
	r.Group(func(r chi.Router) {

		// Tool routes
		r.Get("/tool/autocomplete", app.autocompleteTool)
		r.Get("/tools/category/{categorySlug}", app.getToolsByCategory)
		r.Get("/category/{categorySlug}", app.getCategoryBySlug)
		r.Get("/category/autocomplete", app.autocompleteCategory)

		// User routes
		r.Get("/user/{slug}", app.getUser)

		// Homepage routes
		r.Get("/homepage/top-categories", app.getTopCategories)
		r.Get("/search/facets", app.facets)
	})

	err = http.ListenAndServe("localhost:8080", r)

	if err != nil {
		log.Panicln(err)
	}
}
