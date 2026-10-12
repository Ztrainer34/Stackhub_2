package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"stackhub.com/stackhub/pkg/db"
)

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
