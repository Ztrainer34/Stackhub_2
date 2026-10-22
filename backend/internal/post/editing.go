package post

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"stackhub.com/stackhub/internal/content"
	"stackhub.com/stackhub/internal/httpx"
	"stackhub.com/stackhub/internal/storage"
	"stackhub.com/stackhub/internal/validate"
	"stackhub.com/stackhub/pkg/db"
)

func (h *Handler) CreatePost(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r)

	defer r.Body.Close()

	var form CreatePostWithSuggestedToolsForm
	if err := json.NewDecoder(r.Body).Decode(&form); err != nil {
		log.Println(err)
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	created, err := postService{db: h.DB}.create(r.Context(), userID, form)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(created)
}

func (h *Handler) SavePost(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r)

	slug := chi.URLParam(r, "id")

	defer r.Body.Close()

	var form SavePostForm
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

	if !content.IsJSONObject(form.Content) {
		http.Error(w, "Invalid encoding for post content", http.StatusBadRequest)
		return
	}

	savePostParams := db.SavePostDraftParams{
		ID:               id,
		DraftContent:     []byte(form.Content),
		DraftContentText: pgtype.Text{Valid: true, String: content.PlainText(form.Content)},
		AuthorID:         userID,
	}

	rowsAffected, err := h.Queries.SavePostDraft(r.Context(), savePostParams)

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
func (h *Handler) PublishPost(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r)

	slug := chi.URLParam(r, "id")

	id, err := uuid.Parse(slug)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	defer r.Body.Close()

	var form PublishPostForm
	// Decode the editor content sent with the publish request. Without this the
	// content stays nil and we fall through to PublishPost, which copies the
	// (possibly stale/empty) draft_content into content — wiping the post.
	//
	// An empty body (io.EOF) is the "publish the saved draft" form some callers
	// use. Any other decode failure is a 400: falling through to the draft
	// branch would publish stale content after an error the client never sees.
	if err := json.NewDecoder(r.Body).Decode(&form); err != nil && !errors.Is(err, io.EOF) {
		log.Println(err)
		http.Error(w, "Malformed request body", http.StatusBadRequest)
		return
	}

	if form.Content != nil {
		if !content.IsJSONObject(*form.Content) {
			http.Error(w, "Invalid encoding for post content", http.StatusBadRequest)
			return
		}

		saveAndPublishParams := db.SaveDraftAndPublishPostParams{
			ID:               id,
			AuthorID:         userID,
			DraftContent:     []byte(*form.Content),
			DraftContentText: pgtype.Text{Valid: true, String: content.PlainText(*form.Content)},
		}

		rowsAffected, err := h.Queries.SaveDraftAndPublishPost(r.Context(), saveAndPublishParams)

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

		err = h.Queries.PublishPost(r.Context(), publishPostParams)

		if err != nil {
			log.Println(err)
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}
	}

	w.WriteHeader(http.StatusOK)
}

func (h *Handler) RenamePost(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r)

	slug := chi.URLParam(r, "id")

	id, err := uuid.Parse(slug)
	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	defer r.Body.Close()

	var form RenamePostForm
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
	if validate.TooLong(form.Name, maxPostNameLen) {
		http.Error(w, fmt.Sprintf("Post name must be at most %d characters", maxPostNameLen), http.StatusBadRequest)
		return
	}
	if validate.TooLong(form.Description, maxPostDescriptionLen) {
		http.Error(w, fmt.Sprintf("Goal must be at most %d characters", maxPostDescriptionLen), http.StatusBadRequest)
		return
	}

	// The rename query scopes its writes by author, but on someone else's post
	// it still answered 200 with a new_slug. Refuse it up front instead.
	isAuthor, err := h.Queries.IsPostAuthor(r.Context(), db.IsPostAuthorParams{PostID: id, AuthorID: userID})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to rename post", http.StatusInternalServerError)
		return
	}
	if !isAuthor {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}

	// Generate new slug from name
	newSlug := NameToSlug(form.Name)

	renameParams := db.RenamePostWithSlugHistoryParams{
		PostID:      id,
		AuthorID:    userID,
		Name:        form.Name,
		CurrentSlug: newSlug,
		Description: form.Description,
	}

	err = h.Queries.RenamePostWithSlugHistory(r.Context(), renameParams)
	if err != nil {
		if isPostSlugConflict(err) {
			http.Error(w, postSlugTakenMsg, http.StatusConflict)
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

func (h *Handler) UnpublishPost(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r)

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

	count, err := h.Queries.UnpublishPost(r.Context(), params)
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

func (h *Handler) GetPostDraftContent(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r)

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

	res, err := h.Queries.GetPostDraftContent(r.Context(), params)

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

func (h *Handler) DeletePost(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r)

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

	count, err := h.Queries.DeletePost(r.Context(), params)
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

type UploadImageResponse struct {
	Success int             `json:"success"`
	File    UploadImageFile `json:"file"`
}

func (h *Handler) UploadImage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	slug := chi.URLParam(r, "id")

	id, err := uuid.Parse(slug)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	// Checked before reading the body, so a stranger's upload is refused
	// before a byte of it reaches the bucket.
	isAuthor, err := h.Queries.IsPostAuthor(ctx, db.IsPostAuthorParams{
		PostID:   id,
		AuthorID: httpx.UserID(r),
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not check post ownership", http.StatusInternalServerError)
		return
	}
	if !isAuthor {
		http.Error(w, "You can only add images to your own posts", http.StatusForbidden)
		return
	}

	img, ok := storage.ReceiveImage(w, r, 10<<20) // 10 MB
	if !ok {
		return
	}
	defer img.File.Close()

	// Create a unique filename
	filename := fmt.Sprintf("%s%s", uuid.NewString(), img.Ext)

	uploader := manager.NewUploader(h.Bucket.Client)

	// Upload the file
	_, err = uploader.Upload(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(h.Bucket.Name),
		Key:         aws.String(filename),
		Body:        img.File,
		ContentType: aws.String(img.ContentType),
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to upload to S3", http.StatusInternalServerError)
		return
	}

	createMediaParams := db.CreatePostMediaParams{
		PostID:   id,
		S3Key:    filename,
		FileName: img.Name,
	}

	err = h.Queries.CreatePostMedia(ctx, createMediaParams)
	if err != nil {
		http.Error(w, "Failed to upload to DB", http.StatusInternalServerError)
		return
	}

	fileURL := h.Bucket.PublicURL(filename)

	// Respond with the file URL
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(UploadImageResponse{Success: 1, File: UploadImageFile{URL: fileURL}})
}

func (h *Handler) handleUploadFileOptions(w http.ResponseWriter, r *http.Request) {
	// Set CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*") // Or specify your domain
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Access-Control-Max-Age", "86400") // Cache preflight for 24 hours

	// Respond with 200 OK for preflight
	w.WriteHeader(http.StatusOK)
}
