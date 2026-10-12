package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi"
	"github.com/google/uuid"
	"stackhub.com/stackhub/pkg/db"
)

// getPublishedPostToolFacets returns the tools used across published posts with
// per-tool post counts — the "Tools" facet on the /playbooks browse page.
func (app *App) getPublishedPostToolFacets(w http.ResponseWriter, r *http.Request) {
	limit := 20
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	facets, err := app.queries.GetPublishedPostToolFacets(r.Context(), int32(limit))
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to get tool facets", http.StatusInternalServerError)
		return
	}

	if facets == nil {
		facets = []db.GetPublishedPostToolFacetsRow{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(facets)
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

	// Typeahead over the same catalogue; heavily repeated.
	cachePublic(w, 60, 300)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func (app *App) getTool(w http.ResponseWriter, r *http.Request) {
	id, err := app.resolveToolID(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "Tool not found", http.StatusNotFound)
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

// resolveToolID turns the {id} URL segment into a tool id. The segment is
// normally a slug ("brevo-marketing-platform"), but links made before slugs
// existed used the raw UUID — both still work.
func (app *App) resolveToolID(ctx context.Context, segment string) (uuid.UUID, error) {
	if id, err := uuid.Parse(segment); err == nil {
		return id, nil
	}
	return app.queries.GetToolIDBySlug(ctx, strings.ToLower(segment))
}

// listTools powers the public /tools browse page: paginated tools with an
// optional name/description search, a category (slug) filter and a sort.
func (app *App) listTools(w http.ResponseWriter, r *http.Request) {
	page := 1
	limit := 24
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
	case "name", "updated", "newest":
	default:
		sort = "name"
	}

	category := r.URL.Query().Get("category")
	if category == "all" {
		category = ""
	}

	res, err := app.queries.ListTools(r.Context(), db.ListToolsParams{
		Limit:        int32(limit),
		Offset:       int32(offset),
		Search:       r.URL.Query().Get("q"),
		CategorySlug: category,
		Sort:         sort,
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to list tools", http.StatusInternalServerError)
		return
	}

	if res == nil {
		res = []db.ListToolsRow{}
	}

	totalCount := int32(0)
	if len(res) > 0 {
		totalCount = int32(res[0].TotalCount)
	}

	totalPages := (totalCount + int32(limit) - 1) / int32(limit)

	response := struct {
		Tools      []db.ListToolsRow `json:"tools"`
		Page       int               `json:"page"`
		Limit      int               `json:"limit"`
		TotalCount int32             `json:"total_count"`
		TotalPages int32             `json:"total_pages"`
	}{
		Tools:      res,
		Page:       page,
		Limit:      limit,
		TotalCount: totalCount,
		TotalPages: totalPages,
	}

	// The catalogue changes only when a tool is added or edited.
	cachePublic(w, 60, 300)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
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

	// Same data as the catalogue, filtered.
	cachePublic(w, 60, 300)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// getPopularTools backs the dashboard's "Popular tools" section. Public: the
// ranking is the same for everyone, so it needs no viewer.
func (app *App) getPopularTools(w http.ResponseWriter, r *http.Request) {
	limit := int32(6) // The dashboard shows six.

	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if parsedLimit, err := strconv.ParseInt(limitStr, 10, 32); err == nil && parsedLimit > 0 {
			limit = int32(parsedLimit)
			if limit > 100 { // Upper bound
				limit = 100
			}
		}
	}

	tools, err := app.queries.GetPopularTools(r.Context(), limit)
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not get popular tools", http.StatusInternalServerError)
		return
	}

	if tools == nil {
		tools = []db.GetPopularToolsRow{}
	}

	// Ranked over a 7-day window; a 15-minute shared cache cannot skew it.
	cachePublic(w, 300, 900)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tools)
}

func (app *App) followTool(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	toolIDString := chi.URLParam(r, "tool_id")
	toolID, err := uuid.Parse(toolIDString)
	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	err = app.queries.FollowTool(r.Context(), db.FollowToolParams{
		ProfileID: userID,
		ToolID:    toolID,
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to follow tool", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (app *App) unfollowTool(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	toolIDString := chi.URLParam(r, "tool_id")
	toolID, err := uuid.Parse(toolIDString)
	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	err = app.queries.UnfollowTool(r.Context(), db.UnfollowToolParams{
		ProfileID: userID,
		ToolID:    toolID,
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to unfollow tool", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (app *App) listUserFollowedTools(w http.ResponseWriter, r *http.Request) {
	username := strings.ToLower(chi.URLParam(r, "slug"))

	if username == "" {
		http.Error(w, "Username cannot be empty", http.StatusBadRequest)
		return
	}

	tools, err := app.queries.ListUserFollowedTools(r.Context(), username)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to fetch followed tools", http.StatusInternalServerError)
		return
	}

	if tools == nil {
		tools = []db.ListUserFollowedToolsRow{}
	}

	response := struct {
		Tools []db.ListUserFollowedToolsRow `json:"tools"`
	}{
		Tools: tools,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (app *App) listUserKeyTools(w http.ResponseWriter, r *http.Request) {
	username := strings.ToLower(chi.URLParam(r, "slug"))

	if username == "" {
		http.Error(w, "Username cannot be empty", http.StatusBadRequest)
		return
	}

	tools, err := app.queries.ListUserKeyTools(r.Context(), username)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to fetch key tools", http.StatusInternalServerError)
		return
	}

	if tools == nil {
		tools = []db.ListUserKeyToolsRow{}
	}

	response := struct {
		Tools []db.ListUserKeyToolsRow `json:"tools"`
	}{
		Tools: tools,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (app *App) setKeyTools(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	var form struct {
		ToolIDs []string `json:"tool_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&form); err != nil {
		http.Error(w, "Malformed request body", http.StatusBadRequest)
		return
	}

	if len(form.ToolIDs) > 3 {
		http.Error(w, "You can pin at most 3 key tools", http.StatusBadRequest)
		return
	}

	// Parse and de-duplicate tool ids while preserving order.
	seen := make(map[uuid.UUID]bool)
	toolIDs := make([]uuid.UUID, 0, len(form.ToolIDs))
	for _, idStr := range form.ToolIDs {
		toolID, err := uuid.Parse(idStr)
		if err != nil {
			http.Error(w, "Malformed tool id", http.StatusBadRequest)
			return
		}
		if seen[toolID] {
			continue
		}
		seen[toolID] = true
		toolIDs = append(toolIDs, toolID)
	}

	tx, err := app.db.Begin(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	qtx := app.queries.WithTx(tx)

	// Replace the user's key tools with the new set.
	if err := qtx.RemoveAllKeyTools(r.Context(), userID); err != nil {
		log.Println(err)
		http.Error(w, "Failed to update key tools", http.StatusInternalServerError)
		return
	}

	for i, toolID := range toolIDs {
		err := qtx.AddKeyTool(r.Context(), db.AddKeyToolParams{
			ProfileID: userID,
			ToolID:    toolID,
			Position:  int32(i),
		})
		if err != nil {
			log.Println(err)
			http.Error(w, "Failed to update key tools", http.StatusInternalServerError)
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
