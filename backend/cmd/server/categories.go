package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi"
	"stackhub.com/stackhub/pkg/db"
)

func (app *App) autocompleteCategory(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")

	if query == "" {
		http.Error(w, "Missing search query", http.StatusBadRequest)
		return
	}

	limit_string := r.URL.Query().Get("limit")

	limit, err := strconv.Atoi(limit_string)

	if err != nil || limit <= 0 {
		limit = 10
	}

	// Cap limit at 100
	if limit > 100 {
		limit = 100
	}

	autocompleteCategoryParams := db.AutocompleteCategoryParams{
		Similarity: query,
		Limit:      int32(limit),
	}

	results, err := app.queries.AutocompleteCategory(r.Context(), autocompleteCategoryParams)

	if err != nil {
		log.Println(err)
		http.Error(w, "Could not search categories", http.StatusInternalServerError)
		return
	}

	if results == nil {
		results = []db.AutocompleteCategoryRow{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func (app *App) getCategoryBySlug(w http.ResponseWriter, r *http.Request) {
	categorySlug := chi.URLParam(r, "categorySlug")
	if categorySlug == "" {
		http.Error(w, "Missing category slug", http.StatusBadRequest)
		return
	}

	category, err := app.queries.GetCategoryBySlug(r.Context(), categorySlug)
	if err != nil {
		log.Printf("Error getting category by slug: %v", err)
		http.Error(w, "Could not get category", http.StatusInternalServerError)
		return
	}

	// Categories change very rarely.
	cachePublic(w, 300, 900)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(category)
}

func (app *App) getTopCategories(w http.ResponseWriter, r *http.Request) {
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

	categories, err := app.queries.GetTopCategories(r.Context(), limit)
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not get top categories", http.StatusInternalServerError)
		return
	}

	if categories == nil {
		categories = []db.GetTopCategoriesRow{}
	}

	// A ranking that moves over weeks, not minutes.
	cachePublic(w, 300, 900)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(categories)
}
