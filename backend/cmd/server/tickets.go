package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"stackhub.com/stackhub/pkg/db"
)

// sendToolApproved emails the requester that their suggested tool was
// approved. It runs after the resolution has committed, in the background, so
// a slow or failing mail provider never fails the request.
func (app *App) sendToolApproved(approval *toolApproval) {
	if approval == nil || app.mailer == nil {
		return
	}
	go func(rid uuid.UUID, toolName string) {
		email, eerr := app.queries.GetUserEmail(context.Background(), rid)
		if eerr != nil || email == "" {
			log.Println("tool approved email: could not resolve recipient email:", eerr)
			return
		}
		if err := app.mailer.SendToolApproved(context.Background(), email, toolName); err != nil {
			log.Println("tool approved email:", err)
		}
	}(approval.requesterID, approval.toolName)
}

type SuggestToolRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Website     string `json:"website"`
	Categories  []int  `json:"categories"`
}

// suggestTool creates a standalone tool suggestion (a tool ticket with no
// associated playbook) from the /tools "Add tool" flow. Admins resolve it the
// same way as playbook-originated tickets.
func (app *App) suggestTool(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)
	defer r.Body.Close()

	var req SuggestToolRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Println(err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	name, website, err := cleanSuggestedTool(req.Name, req.Description, req.Website)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	tx, err := app.db.Begin(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	qtx := app.queries.WithTx(tx)

	ticketID, err := qtx.CreateStandaloneToolTicket(r.Context(), db.CreateStandaloneToolTicketParams{
		RequestedBy:     userID,
		ToolName:        name,
		ToolDescription: pgtype.Text{String: req.Description, Valid: true},
		ToolWebsite:     pgtype.Text{String: website, Valid: true},
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to create tool suggestion", http.StatusInternalServerError)
		return
	}

	if len(req.Categories) > 0 {
		var categoryLinks []db.AddToolTicketCategoriesParams
		for _, categoryID := range req.Categories {
			categoryLinks = append(categoryLinks, db.AddToolTicketCategoriesParams{
				TicketID:   ticketID,
				CategoryID: int32(categoryID),
			})
		}
		if _, err := qtx.AddToolTicketCategories(r.Context(), categoryLinks); err != nil {
			log.Println(err)
			http.Error(w, "Failed to assign categories", http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		log.Println(err)
		http.Error(w, "Failed to commit transaction", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

// Admin routes for tool ticket management
func (app *App) listToolTickets(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")

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

	params := db.ListToolTicketsParams{
		Status:     status,
		PageLimit:  int32(limit),
		PageOffset: int32(offset),
	}

	tickets, err := app.queries.ListToolTickets(r.Context(), params)
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not list tool tickets", http.StatusInternalServerError)
		return
	}

	if tickets == nil {
		tickets = []db.ListToolTicketsRow{}
	}

	// Calculate pagination metadata
	totalCount := int32(0)
	if len(tickets) > 0 {
		totalCount = int32(tickets[0].TotalCount)
	}

	totalPages := (totalCount + int32(limit) - 1) / int32(limit)

	response := struct {
		Tickets    []db.ListToolTicketsRow `json:"tickets"`
		Page       int                     `json:"page"`
		Limit      int                     `json:"limit"`
		TotalCount int32                   `json:"total_count"`
		TotalPages int32                   `json:"total_pages"`
	}{
		Tickets:    tickets,
		Page:       page,
		Limit:      limit,
		TotalCount: totalCount,
		TotalPages: totalPages,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (app *App) getToolTicket(w http.ResponseWriter, r *http.Request) {
	ticketIDStr := chi.URLParam(r, "id")

	ticketID, err := uuid.Parse(ticketIDStr)
	if err != nil {
		http.Error(w, "Invalid ticket ID", http.StatusBadRequest)
		return
	}

	ticket, err := app.queries.GetToolTicket(r.Context(), ticketID)
	if err != nil {
		log.Println(err)
		http.Error(w, "Tool ticket not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ticket)
}

type ResolveTicketWithExistingRequest struct {
	ToolID uuid.UUID `json:"tool_id"`
}

func (app *App) resolveTicketWithExisting(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	ticketIDStr := chi.URLParam(r, "id")
	ticketID, err := uuid.Parse(ticketIDStr)
	if err != nil {
		http.Error(w, "Invalid ticket ID", http.StatusBadRequest)
		return
	}

	var req ResolveTicketWithExistingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	tickets := ticketService{db: app.db, q: app.queries}
	approval, err := tickets.resolveWithExisting(r.Context(), ticketID, userID, req.ToolID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	app.sendToolApproved(approval)

	w.WriteHeader(http.StatusNoContent)
}

type ResolveTicketWithNewRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	LogoURL     string `json:"logo_url"`
	Categories  []int  `json:"categories"`
}

func (app *App) resolveTicketWithNew(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	ticketIDStr := chi.URLParam(r, "id")
	ticketID, err := uuid.Parse(ticketIDStr)
	if err != nil {
		http.Error(w, "Invalid ticket ID", http.StatusBadRequest)
		return
	}

	var req ResolveTicketWithNewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	tickets := ticketService{db: app.db, q: app.queries}
	tool, approval, err := tickets.resolveWithNew(r.Context(), ticketID, userID, req)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	app.sendToolApproved(approval)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tool)
}

func (app *App) rejectTicket(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)

	ticketIDStr := chi.URLParam(r, "id")
	ticketID, err := uuid.Parse(ticketIDStr)
	if err != nil {
		http.Error(w, "Invalid ticket ID", http.StatusBadRequest)
		return
	}

	if err := (ticketService{db: app.db, q: app.queries}).reject(r.Context(), ticketID, userID); err != nil {
		writeServiceError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
