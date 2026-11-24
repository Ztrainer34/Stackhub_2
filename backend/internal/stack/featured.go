package stack

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
	defaultFeaturedLimit    = 8
	maxFeaturedLimit        = 24
	defaultFeaturedMinTools = 15
	maxFeaturedMinTools     = 100
)

// intParam reads a query parameter as an int in [min, max]; a missing, invalid
// or out-of-range value gives fallback.
func intParam(r *http.Request, name string, fallback, min, max int) int {
	raw := r.URL.Query().Get(name)
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < min || n > max {
		return fallback
	}
	return n
}

// GetFeaturedStacks backs the logged-out homepage's "GTM stacks": people and
// company pages whose active stack holds at least min_tools visible tools.
// Public: it shows only what their public profiles already show.
func (h *Handler) GetFeaturedStacks(w http.ResponseWriter, r *http.Request) {
	limit := intParam(r, "limit", defaultFeaturedLimit, 1, maxFeaturedLimit)
	minTools := intParam(r, "min_tools", defaultFeaturedMinTools, 1, maxFeaturedMinTools)

	rows, err := h.Queries.GetFeaturedStacks(r.Context(), db.GetFeaturedStacksParams{
		Excluded:  curation.ExcludedUsernames(),
		MinTools:  int32(minTools),
		PageLimit: int32(limit),
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to get featured stacks", http.StatusInternalServerError)
		return
	}
	if rows == nil {
		rows = []db.GetFeaturedStacksRow{}
	}

	httpx.CachePublic(w, 60, 300)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rows)
}
