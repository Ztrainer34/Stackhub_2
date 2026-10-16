package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi"
	"github.com/google/uuid"
	"stackhub.com/stackhub/pkg/db"
)

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

	// Unpublished posts are visible only to their author; everyone else gets the
	// same 404 as for a post that does not exist.
	res, err := app.queries.GetPost(r.Context(), db.GetPostParams{
		ID:       id,
		ViewerID: extractUserIDFromRequestIfPresent(r),
	})

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

	res, err := app.queries.GetPostContent(r.Context(), db.GetPostContentParams{
		ID:       id,
		ViewerID: extractUserIDFromRequestIfPresent(r),
	})

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

func (app *App) listUserPosts(w http.ResponseWriter, r *http.Request) {
	slug := strings.ToLower(chi.URLParam(r, "slug"))

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

// listUserPostsByApprovalStatus returns the authenticated user's own posts that
// are waiting for tool approval or were rejected. It is owner-only: the query
// filters on author_id = the authenticated user, so requesting another user's
// slug yields no results.
func (app *App) listUserPostsByApprovalStatus(w http.ResponseWriter, r *http.Request) {
	slug := strings.ToLower(chi.URLParam(r, "slug"))

	status := r.URL.Query().Get("status")
	if status != "waiting" && status != "rejected" && status != "all" {
		http.Error(w, "status must be 'waiting', 'rejected' or 'all'", http.StatusBadRequest)
		return
	}

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

	params := db.ListUserPostsByApprovalStatusParams{
		AuthorUsername:  slug,
		Limit:           int32(limit),
		Offset:          int32(offset),
		AuthenticatedID: extractUserIDFromRequest(r),
		ApprovalStatus:  status,
	}

	if typeStr := r.URL.Query().Get("type"); typeStr != "" {
		params.UsePostFilter = true
		params.PostFilter = typeStr
	}

	res, err := app.queries.ListUserPostsByApprovalStatus(r.Context(), params)

	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to list posts", http.StatusInternalServerError)
		return
	}

	if res == nil {
		res = []db.ListUserPostsByApprovalStatusRow{}
	}

	totalCount := int32(0)
	if len(res) > 0 {
		totalCount = int32(res[0].TotalCount)
	}

	totalPages := (totalCount + int32(limit) - 1) / int32(limit)

	response := struct {
		Posts      []db.ListUserPostsByApprovalStatusRow `json:"posts"`
		Page       int                                   `json:"page"`
		Limit      int                                   `json:"limit"`
		TotalCount int32                                 `json:"total_count"`
		TotalPages int32                                 `json:"total_pages"`
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

// getUserPostCounts returns the authenticated user's own post counts per status
// filter (published / drafts / waiting / rejected), optionally scoped to a post
// type. Owner-only: it always counts the authenticated user's posts.
func (app *App) getUserPostCounts(w http.ResponseWriter, r *http.Request) {
	params := db.GetUserPostCountsParams{
		AuthorID: extractUserIDFromRequest(r),
	}
	if typeStr := r.URL.Query().Get("type"); typeStr != "" {
		params.UsePostFilter = true
		params.PostFilter = typeStr
	}

	counts, err := app.queries.GetUserPostCounts(r.Context(), params)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to get post counts", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(counts)
}

// listPublishedPosts powers the public /playbooks browse page: paginated
// published posts with a type filter, search and sort, plus per-type counts for
// the filter tabs.
func (app *App) listPublishedPosts(w http.ResponseWriter, r *http.Request) {
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

	sort := r.URL.Query().Get("sort")
	switch sort {
	case "name", "created", "stars", "updated":
	default:
		sort = "updated"
	}

	params := db.ListPublishedPostsParams{
		Limit:  int32(limit),
		Offset: int32(offset),
		Search: r.URL.Query().Get("q"),
		Sort:   sort,
	}

	if typeStr := r.URL.Query().Get("type"); typeStr != "" && typeStr != "all" {
		params.UseTypeFilter = true
		params.TypeFilter = typeStr
	}

	if toolStr := r.URL.Query().Get("tool"); toolStr != "" {
		if toolID, err := uuid.Parse(toolStr); err == nil {
			params.UseToolFilter = true
			params.ToolFilter = toolID
		}
	}

	res, err := app.queries.ListPublishedPosts(r.Context(), params)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to list posts", http.StatusInternalServerError)
		return
	}

	if res == nil {
		res = []db.ListPublishedPostsRow{}
	}

	counts, err := app.queries.GetPublishedPostTypeCounts(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to get post counts", http.StatusInternalServerError)
		return
	}

	totalCount := int32(0)
	if len(res) > 0 {
		totalCount = int32(res[0].TotalCount)
	}

	totalPages := (totalCount + int32(limit) - 1) / int32(limit)

	response := struct {
		Posts      []db.ListPublishedPostsRow       `json:"posts"`
		Page       int                              `json:"page"`
		Limit      int                              `json:"limit"`
		TotalCount int32                            `json:"total_count"`
		TotalPages int32                            `json:"total_pages"`
		Counts     db.GetPublishedPostTypeCountsRow `json:"counts"`
	}{
		Posts:      res,
		Page:       page,
		Limit:      limit,
		TotalCount: totalCount,
		TotalPages: totalPages,
		Counts:     counts,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (app *App) getUserPost(w http.ResponseWriter, r *http.Request) {
	slug := strings.ToLower(chi.URLParam(r, "slug"))
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

func (app *App) listUserKeyPlaybooks(w http.ResponseWriter, r *http.Request) {
	username := strings.ToLower(chi.URLParam(r, "slug"))

	if username == "" {
		http.Error(w, "Username cannot be empty", http.StatusBadRequest)
		return
	}

	playbooks, err := app.queries.ListUserKeyPlaybooks(r.Context(), username)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to fetch key playbooks", http.StatusInternalServerError)
		return
	}

	if playbooks == nil {
		playbooks = []db.PostsWithTool{}
	}

	response := struct {
		Posts []db.PostsWithTool `json:"posts"`
	}{
		Posts: playbooks,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (app *App) setKeyPlaybooks(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	var form struct {
		PostIDs []string `json:"post_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&form); err != nil {
		http.Error(w, "Malformed request body", http.StatusBadRequest)
		return
	}

	if len(form.PostIDs) > 6 {
		http.Error(w, "You can pin at most 6 playbooks", http.StatusBadRequest)
		return
	}

	// Parse and de-duplicate post ids while preserving order.
	seen := make(map[uuid.UUID]bool)
	postIDs := make([]uuid.UUID, 0, len(form.PostIDs))
	for _, idStr := range form.PostIDs {
		postID, err := uuid.Parse(idStr)
		if err != nil {
			http.Error(w, "Malformed post id", http.StatusBadRequest)
			return
		}
		if seen[postID] {
			continue
		}
		seen[postID] = true
		postIDs = append(postIDs, postID)
	}

	tx, err := app.db.Begin(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	qtx := app.queries.WithTx(tx)

	// Replace the user's pinned playbooks with the new set.
	if err := qtx.RemoveAllKeyPlaybooks(r.Context(), userID); err != nil {
		log.Println(err)
		http.Error(w, "Failed to update key playbooks", http.StatusInternalServerError)
		return
	}

	for i, postID := range postIDs {
		err := qtx.AddKeyPlaybook(r.Context(), db.AddKeyPlaybookParams{
			ProfileID: userID,
			PostID:    postID,
			Position:  int32(i),
		})
		if err != nil {
			log.Println(err)
			http.Error(w, "Failed to update key playbooks", http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		log.Println(err)
		http.Error(w, "Failed to commit", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}
