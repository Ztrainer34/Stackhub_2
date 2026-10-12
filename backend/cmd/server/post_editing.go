package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"stackhub.com/stackhub/pkg/db"
	"stackhub.com/stackhub/pkg/post"
)

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
		// One or more. A playbook used to mean exactly one tool and a "combo"
		// meant several; combos were folded into playbooks because the split
		// made authors categorise their writing before they had written it.
		if totalTools > maxPostTools {
			http.Error(w, fmt.Sprintf("Too many tools (maximum %d)", maxPostTools), http.StatusBadRequest)
			return
		}
	case "comparison":
		// A comparison of one thing is not a comparison.
		if totalTools < 2 {
			http.Error(w, "Comparisons require at least two tools or tool suggestions", http.StatusBadRequest)
			return
		}
		if totalTools > maxPostTools {
			http.Error(w, fmt.Sprintf("Too many tools (maximum %d)", maxPostTools), http.StatusBadRequest)
			return
		}
	default:
		http.Error(w, "Unknown post type", http.StatusBadRequest)
		return
	}

	// Optional, so an empty string is "not answered" and stores NULL. Anything
	// else must be one of the three levels; rejecting it here turns a CHECK
	// constraint violation into a 400 that names the field.
	experienceLevel := pgtype.Text{}
	if trimmed := strings.TrimSpace(strings.ToLower(form.ExperienceLevel)); trimmed != "" {
		if !post.ValidExperienceLevels[trimmed] {
			http.Error(w, "Unknown experience level", http.StatusBadRequest)
			return
		}
		experienceLevel = pgtype.Text{String: trimmed, Valid: true}
	}

	createPostParams := db.CreatePostParams{
		AuthorID:        userID,
		Type:            form.Type,
		Name:            form.Name,
		Slug:            post.NameToSlug(form.Name),
		Description:     form.Description,
		ExperienceLevel: experienceLevel,
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
				// Nullable since tickets can be filed without a post (the
				// standalone-ticket migration); here a post always exists.
				PostID:          pgtype.UUID{Bytes: post.ID, Valid: true},
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
	// Decode the editor content sent with the publish request. Without this the
	// content stays nil and we fall through to PublishPost, which copies the
	// (possibly stale/empty) draft_content into content — wiping the post.
	decodeErr := json.NewDecoder(r.Body).Decode(&form)

	if form.Content != nil && decodeErr == nil {
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

// maxPostTools caps how many tools one post may reference. It replaced a
// per-type limit that lived inline in createPost, where the "combo" branch
// carried a FIXME asking for exactly this.
const maxPostTools = 10

type UploadImageResponse struct {
	Success int             `json:"success"`
	File    UploadImageFile `json:"file"`
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
