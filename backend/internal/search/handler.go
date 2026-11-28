package search

import (
	"encoding/json"
	"log"
	"net/http"

	"stackhub.com/stackhub/internal/httpx"
)

func (h *Handler) Search(w http.ResponseWriter, r *http.Request) {
	page, err := parseSearchPage(r.URL.Query().Get("p"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	res, err := searchService{q: h.Queries}.search(r.Context(),
		r.URL.Query().Get("t"), r.URL.Query().Get("q"), page, httpx.UserIDIfPresent(r))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

func (h *Handler) Facets(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")

	facet_counts, err := h.Queries.GetFacetCounts(r.Context(), query)

	if err != nil {
		log.Println(err)
		http.Error(w, "Could not fetch facet counts", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(facet_counts)
}
