package post

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"stackhub.com/stackhub/internal/apperr"
	"stackhub.com/stackhub/internal/notification"
	"stackhub.com/stackhub/internal/pg"
	"stackhub.com/stackhub/internal/ticket"
	"stackhub.com/stackhub/internal/validate"
	"stackhub.com/stackhub/pkg/db"
)

// postService holds the rules for creating and starring posts. The handlers in
// post_editing.go and post_social.go only read the request and write the
// response, so these rules can be exercised against a database without HTTP.
type postService struct {
	db pg.TxBeginner
}

// maxPostTools caps how many tools one post may reference. It replaced a
// per-type limit that lived inline in createPost, where the "combo" branch
// carried a FIXME asking for exactly this.
const maxPostTools = 10

const postSlugTakenMsg = "You already have a post with this slug. Please choose a different title."

// isPostSlugConflict reports whether err is the author already having a post
// with this slug (the posts_author_slug unique constraint).
func isPostSlugConflict(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" && strings.Contains(pgErr.ConstraintName, "posts_author_slug")
}

// newPost is a create request that passed validateNewPost.
type newPost struct {
	form            CreatePostWithSuggestedToolsForm
	experienceLevel pgtype.Text
}

// validateNewPost checks a create request and returns it trimmed, with every
// tool suggestion cleaned. The checks run in a fixed order and the first
// failure is the one reported. The caller's form is not modified.
func validateNewPost(form CreatePostWithSuggestedToolsForm) (newPost, error) {
	// An empty name makes an empty slug.
	form.Name = strings.TrimSpace(form.Name)
	if form.Name == "" {
		return newPost{}, apperr.Invalid("Post name cannot be empty")
	}
	if validate.TooLong(form.Name, maxPostNameLen) {
		return newPost{}, apperr.Invalid(fmt.Sprintf("Post name must be at most %d characters", maxPostNameLen))
	}
	if validate.TooLong(form.Description, maxPostDescriptionLen) {
		return newPost{}, apperr.Invalid(fmt.Sprintf("Goal must be at most %d characters", maxPostDescriptionLen))
	}

	suggestions := make([]ticket.Suggestion, len(form.SuggestedTools))
	for i, s := range form.SuggestedTools {
		name, website, err := ticket.CleanSuggestedTool(s.Name, s.Description, s.Website)
		if err != nil {
			return newPost{}, apperr.Invalid(err.Error())
		}
		s.Name, s.Website = name, website
		suggestions[i] = s
	}
	form.SuggestedTools = suggestions

	if len(form.Tools) == 0 && len(form.SuggestedTools) == 0 {
		return newPost{}, apperr.Invalid("Missing tools")
	}

	totalTools := len(form.Tools) + len(form.SuggestedTools)
	switch form.Type {
	case "playbook":
		// One or more. A playbook used to mean exactly one tool and a "combo"
		// meant several; combos were folded into playbooks because the split
		// made authors categorise their writing before they had written it.
	case "comparison":
		// A comparison of one thing is not a comparison.
		if totalTools < 2 {
			return newPost{}, apperr.Invalid("Comparisons require at least two tools or tool suggestions")
		}
	default:
		return newPost{}, apperr.Invalid("Unknown post type")
	}
	if totalTools > maxPostTools {
		return newPost{}, apperr.Invalid(fmt.Sprintf("Too many tools (maximum %d)", maxPostTools))
	}

	// Optional, so an empty string is "not answered" and stores NULL. Anything
	// else must be one of the three levels; rejecting it here turns a CHECK
	// constraint violation into a 400 that names the field.
	level := pgtype.Text{}
	if trimmed := strings.TrimSpace(strings.ToLower(form.ExperienceLevel)); trimmed != "" {
		if !ValidExperienceLevels[trimmed] {
			return newPost{}, apperr.Invalid("Unknown experience level")
		}
		level = pgtype.Text{String: trimmed, Valid: true}
	}

	return newPost{form: form, experienceLevel: level}, nil
}

// create validates a new post and stores it with its tools and its tool
// suggestions in one transaction: a post never exists without everything it
// was created with.
func (s postService) create(ctx context.Context, authorID uuid.UUID, form CreatePostWithSuggestedToolsForm) (db.CreatePostRow, error) {
	p, err := validateNewPost(form)
	if err != nil {
		return db.CreatePostRow{}, err
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return db.CreatePostRow{}, apperr.Internal("Failed to start transaction", err)
	}
	// After the error check: on a failed Begin, tx is nil and Rollback panics.
	defer tx.Rollback(ctx)
	q := db.New(tx)

	created, err := q.CreatePost(ctx, db.CreatePostParams{
		AuthorID:        authorID,
		Type:            p.form.Type,
		Name:            p.form.Name,
		Slug:            NameToSlug(p.form.Name),
		Description:     p.form.Description,
		ExperienceLevel: p.experienceLevel,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.CreatePostRow{}, apperr.UnauthorizedFrom("Unauthorized", err)
	} else if err != nil {
		if isPostSlugConflict(err) {
			return db.CreatePostRow{}, apperr.Conflict(postSlugTakenMsg)
		}
		return db.CreatePostRow{}, apperr.InvalidFrom("Failed to create post", err)
	}

	if len(p.form.Tools) > 0 {
		links := make([]db.AddPostToolsParams, 0, len(p.form.Tools))
		for _, toolID := range p.form.Tools {
			links = append(links, db.AddPostToolsParams{PostID: created.ID, ToolID: toolID})
		}
		if _, err := q.AddPostTools(ctx, links); err != nil {
			return db.CreatePostRow{}, apperr.InvalidFrom("Failed to create post", err)
		}
	}

	if err := ticket.CreatePostTickets(ctx, q, created.ID, authorID, p.form.SuggestedTools); err != nil {
		return db.CreatePostRow{}, err
	}

	// Unchecked, a failed commit still answered 200 with a post that was never
	// saved, and the client redirected to an edit page that 404'd.
	if err := tx.Commit(ctx); err != nil {
		return db.CreatePostRow{}, apperr.Internal("Failed to create post", err)
	}
	return created, nil
}

// starEmail is the email to send the author once a star has committed.
type starEmail struct {
	recipientID   uuid.UUID
	actorName     string
	actorUsername string
	postName      string
	postURL       string
}

// star records userID's star on a post and notifies its author. It returns the
// email to send, or nil when there is none: the post is the caller's own, or
// the notification was deduplicated (a repeat star within the hour).
func (s postService) star(ctx context.Context, userID, postID uuid.UUID) (*starEmail, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, apperr.Internal("Failed to start transaction", err)
	}
	defer tx.Rollback(ctx)
	q := db.New(tx)

	// Looked up before starring, with the caller as viewer: a post they cannot
	// see — someone else's draft — is a 404, not a star and an email to its
	// author.
	p, err := q.GetPost(ctx, db.GetPostParams{ID: postID, ViewerID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.NotFound("Post not found")
	} else if err != nil {
		return nil, apperr.Internal("Failed to star post", err)
	}

	if err := q.StarPost(ctx, db.StarPostParams{PostID: postID, LikerID: userID}); err != nil {
		return nil, apperr.InvalidFrom("Bad request", err)
	}

	var email *starEmail
	if p.AuthorID != userID { // Don't notify if starring own post
		actorName, actorUsername := notification.ActorNameAndUsername(q, ctx, userID)

		// Create notification (with spam protection built-in)
		entityType := "post"
		rows, err := q.CreateNotification(ctx, db.CreateNotificationParams{
			RecipientID: p.AuthorID,
			ActorID:     pg.UUID(userID),
			Type:        "post_star",
			EntityID:    pg.UUID(postID),
			EntityType:  pg.Text(&entityType),
			Title:       "New star",
			Message:     fmt.Sprintf("%s starred “%s”", actorName, p.Name),
		})
		if err != nil {
			log.Println(err) // a failed notification does not fail the star
		} else if rows > 0 {
			// New notification (not deduped) → also send the email.
			email = &starEmail{
				recipientID:   p.AuthorID,
				actorName:     actorName,
				actorUsername: actorUsername,
				postName:      p.Name,
				postURL:       fmt.Sprintf("%s/%s/%s", siteURL, p.AuthorUsername, p.Slug),
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, apperr.Internal("Failed to commit transaction", err)
	}
	return email, nil
}
