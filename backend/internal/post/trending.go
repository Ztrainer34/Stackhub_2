package post

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"stackhub.com/stackhub/internal/curation"
	"stackhub.com/stackhub/internal/httpx"
	"stackhub.com/stackhub/pkg/db"
)

const (
	defaultTrendingLimit = 6
	maxTrendingLimit     = 24
	defaultTrendingDays  = 14
	maxTrendingDays      = 90
)

// trendingParam reads a query parameter as an int in [1, max]; a missing,
// invalid or out-of-range value gives fallback.
func trendingParam(r *http.Request, name string, fallback, max int) int {
	raw := r.URL.Query().Get(name)
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 || n > max {
		return fallback
	}
	return n
}

// GetTrendingPosts backs the logged-out homepage's "Trending playbooks":
// published playbooks and comparisons with the most stars in the last `days`
// days. The same for every visitor (it is not the personal "for you" ranking),
// and it returns the same public post fields as the /posts listing.
func (h *Handler) GetTrendingPosts(w http.ResponseWriter, r *http.Request) {
	limit := trendingParam(r, "limit", defaultTrendingLimit, maxTrendingLimit)
	days := trendingParam(r, "days", defaultTrendingDays, maxTrendingDays)

	posts, err := h.Queries.GetTrendingPosts(r.Context(), db.GetTrendingPostsParams{
		Excluded:  curation.ExcludedUsernames(),
		Days:      int32(days),
		PageLimit: int32(limit),
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to get trending posts", http.StatusInternalServerError)
		return
	}
	if posts == nil {
		posts = []db.PostsWithTool{}
	}

	httpx.CachePublic(w, 60, 300)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(posts)
}
