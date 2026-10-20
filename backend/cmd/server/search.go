package main

import (
	"encoding/json"
	"log"
	"net/http"
)

func (app *App) search(w http.ResponseWriter, r *http.Request) {
	page, err := parseSearchPage(r.URL.Query().Get("p"))
	if err != nil {
		writeServiceError(w, err)
		return
	}

	res, err := searchService{q: app.queries}.search(r.Context(),
		r.URL.Query().Get("t"), r.URL.Query().Get("q"), page, extractUserIDFromRequestIfPresent(r))
	if err != nil {
		writeServiceError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
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
