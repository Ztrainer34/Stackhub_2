package feed

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"stackhub.com/stackhub/internal/httpx"
	"stackhub.com/stackhub/pkg/db"
)

func (h *Handler) GetTopPosts(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserIDIfPresent(r)

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
		posts, err := h.Queries.GetTopPosts(r.Context(), limit)
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
		// Ranked against the viewer's own tool graph — stack, follows, starred
		// playbooks, then people they follow. This replaced an embedding
		// similarity ranking that returned nothing at all for anyone whose
		// profile embedding was still null, i.e. every new account.
		posts, err := h.Queries.GetTrendingPlaybooksForUser(r.Context(), db.GetTrendingPlaybooksForUserParams{
			ViewerID:  userID,
			PageLimit: limit,
		})
		if err != nil {
			log.Println(err)
			http.Error(w, "Could not get top posts", http.StatusInternalServerError)
			return
		}

		// A viewer with an empty tool graph — no stack, no follows, no stars —
		// matches no tier at all. Fall back to the public listing rather than
		// showing them an empty dashboard.
		if len(posts) == 0 {
			fallback, err := h.Queries.GetTopPosts(r.Context(), limit)
			if err != nil {
				log.Println(err)
				http.Error(w, "Could not get top posts", http.StatusInternalServerError)
				return
			}
			if fallback == nil {
				fallback = []db.PostsWithTool{}
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(fallback)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(posts)
	}
}

func (h *Handler) GetFeed(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r)

	limit := 20
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 50 {
			limit = n
		}
	}
	page := 1
	if v := r.URL.Query().Get("page"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			page = n
		}
	}

	items, err := h.Queries.GetUserFeed(r.Context(), db.GetUserFeedParams{
		ViewerID:   userID,
		PageLimit:  int32(limit),
		PageOffset: int32((page - 1) * limit),
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to fetch feed", http.StatusInternalServerError)
		return
	}

	if items == nil {
		items = []db.GetUserFeedRow{}
	}

	var totalCount int64
	if len(items) > 0 {
		totalCount = items[0].TotalCount
	}

	response := struct {
		Items      []db.GetUserFeedRow `json:"items"`
		Page       int                 `json:"page"`
		Limit      int                 `json:"limit"`
		TotalCount int64               `json:"total_count"`
	}{
		Items:      items,
		Page:       page,
		Limit:      limit,
		TotalCount: totalCount,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
