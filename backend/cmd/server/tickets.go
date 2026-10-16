package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"stackhub.com/stackhub/pkg/db"
)

// notifyToolApproved creates an in-app notification telling the ticket
// requester their suggested tool was approved. Returns whether a new
// notification was created (so the caller can also send an email). No-op when
// the admin resolved their own ticket.
func (app *App) notifyToolApproved(ctx context.Context, qtx *db.Queries, ticket db.GetToolTicketRow, resolverID uuid.UUID) bool {
	if ticket.RequestedBy == resolverID {
		return false
	}

	entityType := "tool"
	rows, err := qtx.CreateNotification(ctx, db.CreateNotificationParams{
		RecipientID: ticket.RequestedBy,
		ActorID:     ToPgUUID(resolverID),
		Type:        "tool_approved",
		EntityID:    ticket.PostID, // may be null for standalone suggestions
		EntityType:  ToPgText(&entityType),
		Title:       "Tool approved",
		Message:     fmt.Sprintf("Your suggested tool “%s” was approved and added to StackHub.", ticket.ToolName),
	})
	if err != nil {
		log.Println(err)
		return false
	}
	return rows > 0
}

type SuggestToolRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Website     string `json:"website"`
	Categories  []int  `json:"categories"`
}

// cleanSuggestedTool checks a tool suggestion and returns its name and website
// trimmed and normalised. Shared by the standalone "Add tool" flow and the
// suggestions made while creating a post, which both end up as tool tickets.
//
// The website is rendered as a link in the admin ticket list — which any
// signed-in user can open — so only http(s) gets through.
func cleanSuggestedTool(name, description, website string) (string, string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", "", errors.New("Tool name is required")
	}
	if tooLong(name, maxToolNameLen) {
		return "", "", fmt.Errorf("Tool name must be at most %d characters", maxToolNameLen)
	}
	if tooLong(description, maxToolDescriptionLen) {
		return "", "", fmt.Errorf("Tool description must be at most %d characters", maxToolDescriptionLen)
	}
	website, ok := normalizeWebURL(website)
	if !ok {
		return "", "", errors.New("Tool website must be an http or https address")
	}
	return name, website, nil
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
		Column1: status,
		Limit:   int32(limit),
		Offset:  int32(offset),
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

	// Start transaction to handle both resolving ticket and adding tool to post
	tx, err := app.db.Begin(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	qtx := app.queries.WithTx(tx)

	// Get the ticket to find the post ID
	ticket, err := qtx.GetToolTicket(r.Context(), ticketID)
	if err != nil {
		log.Println(err)
		http.Error(w, "Tool ticket not found", http.StatusNotFound)
		return
	}
	if ticket.Status == "resolved" {
		// Resolving again changed nothing useful but re-sent the "tool
		// approved" email every time — and /admin has no role check.
		http.Error(w, "This ticket has already been resolved", http.StatusConflict)
		return
	}

	// Resolve the ticket
	resolveParams := db.ResolveToolTicketWithExistingParams{
		ID:             ticketID,
		ResolvedToolID: ToPgUUID(req.ToolID),
		ResolvedBy:     ToPgUUID(userID),
	}

	updated, err := qtx.ResolveToolTicketWithExisting(r.Context(), resolveParams)
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not resolve ticket", http.StatusInternalServerError)
		return
	}
	if updated == 0 {
		// Already resolved (the query refuses to touch a resolved ticket), or
		// resolved by a concurrent request since it was read above.
		http.Error(w, "This ticket has already been resolved", http.StatusConflict)
		return
	}

	// Add the tool to the post (if not already there). Standalone suggestions
	// have no post, so this step is skipped for them.
	if ticket.PostID.Valid {
		addPostToolParams := db.AddPostToolSafeParams{
			PostID: uuid.UUID(ticket.PostID.Bytes),
			ToolID: req.ToolID,
		}

		err = qtx.AddPostToolSafe(r.Context(), addPostToolParams)
		if err != nil {
			log.Println(err)
			http.Error(w, "Could add tool to post", http.StatusInternalServerError)
			return
		}
	}

	// Notify the requester that their suggested tool was approved.
	shouldEmail := app.notifyToolApproved(r.Context(), qtx, ticket, userID)

	err = tx.Commit(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not commit transaction", http.StatusInternalServerError)
		return
	}

	if shouldEmail && app.mailer != nil {
		go func(rid uuid.UUID, toolName string) {
			email, eerr := app.queries.GetUserEmail(context.Background(), rid)
			if eerr != nil || email == "" {
				log.Println("tool approved email: could not resolve recipient email:", eerr)
				return
			}
			if err := app.mailer.SendToolApproved(context.Background(), email, toolName); err != nil {
				log.Println("tool approved email:", err)
			}
		}(ticket.RequestedBy, ticket.ToolName)
	}

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

	// The logo is shown on the public tool page, and /admin has no role check,
	// so this is effectively any signed-in user's input.
	logoURL, ok := normalizeWebURL(req.LogoURL)
	if !ok {
		http.Error(w, "Logo URL must be an http or https address", http.StatusBadRequest)
		return
	}
	req.LogoURL = logoURL

	tx, err := app.db.Begin(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	qtx := app.queries.WithTx(tx)

	// Get the ticket to find the post ID
	ticket, err := qtx.GetToolTicket(r.Context(), ticketID)
	if err != nil {
		log.Println(err)
		http.Error(w, "Tool ticket not found", http.StatusNotFound)
		return
	}
	if ticket.Status == "resolved" {
		// Resolving again changed nothing useful but re-sent the "tool
		// approved" email every time — and /admin has no role check.
		http.Error(w, "This ticket has already been resolved", http.StatusConflict)
		return
	}

	// Create the new tool
	createToolParams := db.CreateToolParams{
		Name:        req.Name,
		Description: ToPgText(&req.Description),
		LogoUrl:     ToPgText(&req.LogoURL),
	}

	tool, err := qtx.CreateTool(r.Context(), createToolParams)
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not create tool", http.StatusInternalServerError)
		return
	}

	// Assign categories to the new tool
	if len(req.Categories) > 0 {
		var categoryLinks []db.AssignCategoryToToolParams
		for _, categoryID := range req.Categories {
			link := db.AssignCategoryToToolParams{
				ToolID:     tool.ID,
				CategoryID: int32(categoryID),
			}
			categoryLinks = append(categoryLinks, link)
		}

		for _, link := range categoryLinks {
			err = qtx.AssignCategoryToTool(r.Context(), link)
			if err != nil {
				log.Println(err)
				http.Error(w, "Could not assign categories to tool", http.StatusInternalServerError)
				return
			}
		}
	}

	// Resolve the ticket with the new tool
	resolveParams := db.ResolveToolTicketWithNewParams{
		ID:             ticketID,
		ResolvedToolID: pgtype.UUID{Bytes: tool.ID, Valid: true},
		ResolvedBy:     pgtype.UUID{Bytes: userID, Valid: true},
	}

	updated, err := qtx.ResolveToolTicketWithNew(r.Context(), resolveParams)
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not resolve ticket", http.StatusInternalServerError)
		return
	}
	if updated == 0 {
		// Already resolved (the query refuses to touch a resolved ticket), or
		// resolved by a concurrent request since it was read above.
		http.Error(w, "This ticket has already been resolved", http.StatusConflict)
		return
	}

	// Add the new tool to the post. Standalone suggestions have no post.
	if ticket.PostID.Valid {
		addPostToolParams := db.AddPostToolSafeParams{
			PostID: uuid.UUID(ticket.PostID.Bytes),
			ToolID: tool.ID,
		}

		err = qtx.AddPostToolSafe(r.Context(), addPostToolParams)
		if err != nil {
			log.Println(err)
			http.Error(w, "Could add tool to post", http.StatusInternalServerError)
			return
		}
	}

	// Notify the requester that their suggested tool was approved.
	shouldEmail := app.notifyToolApproved(r.Context(), qtx, ticket, userID)

	err = tx.Commit(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not commit transaction", http.StatusInternalServerError)
		return
	}

	if shouldEmail && app.mailer != nil {
		go func(rid uuid.UUID, toolName string) {
			email, eerr := app.queries.GetUserEmail(context.Background(), rid)
			if eerr != nil || email == "" {
				log.Println("tool approved email: could not resolve recipient email:", eerr)
				return
			}
			if err := app.mailer.SendToolApproved(context.Background(), email, toolName); err != nil {
				log.Println("tool approved email:", err)
			}
		}(ticket.RequestedBy, ticket.ToolName)
	}

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

	params := db.RejectToolTicketParams{
		ID:         ticketID,
		ResolvedBy: pgtype.UUID{Bytes: userID, Valid: true},
	}

	updated, err := app.queries.RejectToolTicket(r.Context(), params)
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not reject ticket", http.StatusInternalServerError)
		return
	}
	if updated == 0 {
		// Already resolved (the query refuses to touch a resolved ticket), or
		// resolved by a concurrent request since it was read above.
		http.Error(w, "This ticket has already been resolved", http.StatusConflict)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
