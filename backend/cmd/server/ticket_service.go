package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"stackhub.com/stackhub/pkg/db"
	"stackhub.com/stackhub/pkg/post"
)

// ticketService holds the rules for resolving and rejecting tool tickets. The
// handlers in tickets.go only read the request and write the response.
//
// /admin has no role check (see CLAUDE.md), so everything here is reachable by
// any signed-in user. Nothing here may grant more than a ticket resolution.
type ticketService struct {
	db txBeginner
	q  *db.Queries
}

// ticketResolvedMsg is the answer to any change to a resolved ticket.
// Resolved is final: resolving again changed nothing useful but re-sent the
// "tool approved" email every time.
const ticketResolvedMsg = "This ticket has already been resolved"

// toolApproval is the "your tool was approved" email to send once a resolution
// has committed.
type toolApproval struct {
	requesterID uuid.UUID
	toolName    string
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

// createPostTickets files a tool ticket for each tool suggested while creating
// a post, inside the post's transaction. The suggestions must already have
// been through cleanSuggestedTool.
func createPostTickets(ctx context.Context, q *db.Queries, postID, requester uuid.UUID, suggestions []post.CreateSuggestedToolForm) error {
	for _, s := range suggestions {
		ticketID, err := q.CreateToolTicket(ctx, db.CreateToolTicketParams{
			// Nullable since tickets can be filed without a post (the
			// standalone-ticket migration); here a post always exists.
			PostID:          pgtype.UUID{Bytes: postID, Valid: true},
			RequestedBy:     requester,
			ToolName:        s.Name,
			ToolDescription: pgtype.Text{String: s.Description, Valid: true},
			ToolWebsite:     pgtype.Text{String: s.Website, Valid: true},
		})
		if err != nil {
			return invalidFrom("Failed to create suggested tool", err)
		}

		if len(s.Categories) == 0 {
			continue
		}
		links := make([]db.AddToolTicketCategoriesParams, 0, len(s.Categories))
		for _, categoryID := range s.Categories {
			links = append(links, db.AddToolTicketCategoriesParams{TicketID: ticketID, CategoryID: int32(categoryID)})
		}
		if _, err := q.AddToolTicketCategories(ctx, links); err != nil {
			return invalidFrom("Failed to add suggested tool categories", err)
		}
	}
	return nil
}

// notifyToolApproved creates an in-app notification telling the ticket
// requester their suggested tool was approved. Returns whether a new
// notification was created (so the caller can also send an email). No-op when
// the admin resolved their own ticket.
//
// The entity is the approved tool. It used to be the ticket's post (NULL for a
// standalone suggestion), and since notifications are deduplicated per
// (recipient, actor, type, entity) for an hour, approving a second tool from
// the same post — or any second standalone suggestion — notified nobody.
// Keyed on the tool, each approved tool notifies once.
func notifyToolApproved(ctx context.Context, q *db.Queries, ticket db.GetToolTicketRow, resolverID, toolID uuid.UUID) bool {
	if ticket.RequestedBy == resolverID {
		return false
	}

	entityType := "tool"
	rows, err := q.CreateNotification(ctx, db.CreateNotificationParams{
		RecipientID: ticket.RequestedBy,
		ActorID:     ToPgUUID(resolverID),
		Type:        "tool_approved",
		EntityID:    ToPgUUID(toolID),
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

// resolve runs the steps both resolutions share, in one transaction: load the
// ticket and refuse a resolved one, let settle pick the tool and mark the
// ticket resolved, add that tool to the ticket's post, and notify the
// requester. It returns the approval email to send, or nil.
func (s ticketService) resolve(ctx context.Context, ticketID, resolverID uuid.UUID, settle func(q *db.Queries) (uuid.UUID, error)) (*toolApproval, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, internal("Could not start transaction", err)
	}
	defer tx.Rollback(ctx)
	q := db.New(tx)

	ticket, err := q.GetToolTicket(ctx, ticketID)
	if err != nil {
		return nil, notFoundFrom("Tool ticket not found", err)
	}
	if ticket.Status == "resolved" {
		return nil, conflict(ticketResolvedMsg)
	}

	toolID, err := settle(q)
	if err != nil {
		return nil, err
	}

	// Add the tool to the post (if not already there). Standalone suggestions
	// have no post, so this step is skipped for them.
	if ticket.PostID.Valid {
		err := q.AddPostToolSafe(ctx, db.AddPostToolSafeParams{
			PostID: uuid.UUID(ticket.PostID.Bytes),
			ToolID: toolID,
		})
		if err != nil {
			return nil, internal("Could add tool to post", err)
		}
	}

	notified := notifyToolApproved(ctx, q, ticket, resolverID, toolID)

	if err := tx.Commit(ctx); err != nil {
		return nil, internal("Could not commit transaction", err)
	}
	if !notified {
		return nil, nil
	}
	return &toolApproval{requesterID: ticket.RequestedBy, toolName: ticket.ToolName}, nil
}

// settled turns the row count of a resolve UPDATE into the resolve outcome.
// The UPDATE refuses to touch a resolved ticket, so 0 rows means it was
// resolved by a concurrent request since resolve read it.
func settled(updated int64, err error) error {
	if err != nil {
		return internal("Could not resolve ticket", err)
	}
	if updated == 0 {
		return conflict(ticketResolvedMsg)
	}
	return nil
}

// resolveWithExisting resolves a ticket with a tool already in the catalog.
func (s ticketService) resolveWithExisting(ctx context.Context, ticketID, resolverID, toolID uuid.UUID) (*toolApproval, error) {
	return s.resolve(ctx, ticketID, resolverID, func(q *db.Queries) (uuid.UUID, error) {
		err := settled(q.ResolveToolTicketWithExisting(ctx, db.ResolveToolTicketWithExistingParams{
			ID:             ticketID,
			ResolvedToolID: ToPgUUID(toolID),
			ResolvedBy:     ToPgUUID(resolverID),
		}))
		return toolID, err
	})
}

// validateNewTool checks the tool a ticket is about to be resolved with and
// returns it trimmed. It becomes a public tool page, and /admin has no role
// check, so this is effectively any signed-in user's input: the same name and
// description limits as a suggestion, and an http(s) logo.
func validateNewTool(req ResolveTicketWithNewRequest) (ResolveTicketWithNewRequest, error) {
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return req, invalid("Tool name is required")
	}
	if tooLong(req.Name, maxToolNameLen) {
		return req, invalid(fmt.Sprintf("Tool name must be at most %d characters", maxToolNameLen))
	}
	if tooLong(req.Description, maxToolDescriptionLen) {
		return req, invalid(fmt.Sprintf("Tool description must be at most %d characters", maxToolDescriptionLen))
	}

	logoURL, ok := normalizeWebURL(req.LogoURL)
	if !ok {
		return req, invalid("Logo URL must be an http or https address")
	}
	req.LogoURL = logoURL
	return req, nil
}

// resolveWithNew creates the tool (with its categories) and resolves the
// ticket with it. The tool is created inside the resolve transaction, so a
// refused or failed resolution leaves no tool behind.
func (s ticketService) resolveWithNew(ctx context.Context, ticketID, resolverID uuid.UUID, req ResolveTicketWithNewRequest) (db.CreateToolRow, *toolApproval, error) {
	req, err := validateNewTool(req)
	if err != nil {
		return db.CreateToolRow{}, nil, err
	}

	var tool db.CreateToolRow
	approval, err := s.resolve(ctx, ticketID, resolverID, func(q *db.Queries) (uuid.UUID, error) {
		var err error
		tool, err = q.CreateTool(ctx, db.CreateToolParams{
			Name:        req.Name,
			Description: ToPgText(&req.Description),
			LogoUrl:     ToPgText(&req.LogoURL),
		})
		if err != nil {
			return uuid.Nil, internal("Could not create tool", err)
		}

		for _, categoryID := range req.Categories {
			err := q.AssignCategoryToTool(ctx, db.AssignCategoryToToolParams{ToolID: tool.ID, CategoryID: int32(categoryID)})
			if err != nil {
				return uuid.Nil, internal("Could not assign categories to tool", err)
			}
		}

		return tool.ID, settled(q.ResolveToolTicketWithNew(ctx, db.ResolveToolTicketWithNewParams{
			ID:             ticketID,
			ResolvedToolID: pgtype.UUID{Bytes: tool.ID, Valid: true},
			ResolvedBy:     pgtype.UUID{Bytes: resolverID, Valid: true},
		}))
	})
	if err != nil {
		return db.CreateToolRow{}, nil, err
	}
	return tool, approval, nil
}

// reject marks a ticket rejected. A rejected ticket can still be resolved
// later (a reviewer may change their mind); a resolved one cannot be rejected.
func (s ticketService) reject(ctx context.Context, ticketID, resolverID uuid.UUID) error {
	updated, err := s.q.RejectToolTicket(ctx, db.RejectToolTicketParams{
		ID:         ticketID,
		ResolvedBy: pgtype.UUID{Bytes: resolverID, Valid: true},
	})
	if err != nil {
		return internal("Could not reject ticket", err)
	}
	if updated == 0 {
		return conflict(ticketResolvedMsg)
	}
	return nil
}
