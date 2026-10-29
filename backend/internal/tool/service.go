package tool

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"stackhub.com/stackhub/internal/apperr"
	"stackhub.com/stackhub/internal/content"
	"stackhub.com/stackhub/internal/pg"
	"stackhub.com/stackhub/internal/validate"
	"stackhub.com/stackhub/pkg/db"
)

// toolService holds the rules for editing a tool page. The handlers in
// tool_page.go check ownership, read the request and write the response.
type toolService struct {
	db pg.TxBeginner
}

// maxToolCategories caps what a page owner can attach, so the categories card
// stays a short list rather than a keyword dump.
const maxToolCategories = 12

// validateToolPageUpdate checks an owner's edit and returns it with its URLs
// normalised. The caller's form is not modified.
func validateToolPageUpdate(form UpdateToolPageRequest) (UpdateToolPageRequest, error) {
	if form.CategoryIDs != nil && len(*form.CategoryIDs) > maxToolCategories {
		return form, apperr.Invalid(fmt.Sprintf("A tool can have at most %d categories", maxToolCategories))
	}

	// These three are rendered as a link or an image source on the public
	// page, so they must be http(s). x_profile is a handle the page turns into
	// a twitter.com URL itself, so it is free text.
	if form.LogoURL != nil {
		logo, ok := validate.WebURL(*form.LogoURL)
		if !ok {
			return form, apperr.Invalid("Logo URL must be an http or https address")
		}
		form.LogoURL = &logo
	}
	if form.Vendor != nil {
		vendor := *form.Vendor
		website, ok := validate.WebURL(vendor.Website)
		if !ok {
			return form, apperr.Invalid("Website must be an http or https address")
		}
		linkedin, ok := validate.WebURL(vendor.LinkedinProfile)
		if !ok {
			return form, apperr.Invalid("LinkedIn profile must be an http or https address")
		}
		vendor.Website, vendor.LinkedinProfile = website, linkedin
		form.Vendor = &vendor
	}
	return form, nil
}

// updatePage applies an owner's edit to a tool page. Copy, logo, vendor
// details and categories are saved in one transaction so a single edit is
// atomic. The caller must already have checked that the editor owns the page
// (requireToolOwner); this does not check it again.
func (s toolService) updatePage(ctx context.Context, toolID uuid.UUID, form UpdateToolPageRequest) error {
	form, err := validateToolPageUpdate(form)
	if err != nil {
		return err
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return apperr.Internal("Failed to start transaction", err)
	}
	defer tx.Rollback(ctx)
	q := db.New(tx)

	// A NULL argument leaves the stored value alone, so each icon saves only
	// its own field.
	page := db.UpdateToolPageContentParams{ID: toolID}
	if form.DescriptionRich != nil {
		page.DescriptionRich = pgtype.Text{String: *form.DescriptionRich, Valid: true}
		page.Description = pgtype.Text{String: content.PlainText(*form.DescriptionRich), Valid: true}
	}
	if form.LogoURL != nil {
		page.LogoUrl = pgtype.Text{String: strings.TrimSpace(*form.LogoURL), Valid: true}
	}
	if page.DescriptionRich.Valid || page.LogoUrl.Valid {
		if err := q.UpdateToolPageContent(ctx, page); err != nil {
			return apperr.Internal("Failed to save the page", err)
		}
	}

	if form.Vendor != nil {
		if err := saveToolVendor(ctx, q, toolID, *form.Vendor); err != nil {
			return apperr.Internal("Failed to save the vendor details", err)
		}
	}

	if form.CategoryIDs != nil {
		// Replace wholesale: the card is edited as a set, not item by item.
		if err := q.DeleteToolCategories(ctx, toolID); err != nil {
			return apperr.Internal("Failed to save the categories", err)
		}
		if len(*form.CategoryIDs) > 0 {
			err := q.AddToolCategories(ctx, db.AddToolCategoriesParams{
				ToolID:      toolID,
				CategoryIds: *form.CategoryIDs,
			})
			if err != nil {
				return apperr.Internal("Failed to save the categories", err)
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return apperr.Internal("Failed to commit", err)
	}
	return nil
}

// saveToolVendor writes the vendor card for one tool. The card is always sent
// whole, so blank fields are written through as NULL.
//
// A vendors row can be shared between tools. Editing a shared row would
// rewrite another tool's public vendor card, which this owner does not own —
// so a shared row is left alone and this tool gets its own. Nothing is lost by
// starting fresh, because the whole card is written next.
func saveToolVendor(ctx context.Context, q *db.Queries, toolID uuid.UUID, v ToolVendorInput) error {
	vendorID, err := q.GetToolVendorID(ctx, toolID)
	if err != nil {
		return err
	}

	shared := false
	if vendorID.Valid {
		users, err := q.CountToolsUsingVendor(ctx, vendorID)
		if err != nil {
			return err
		}
		shared = users > 1
	}

	var vid uuid.UUID
	if vendorID.Valid && !shared {
		vid = uuid.UUID(vendorID.Bytes)
	} else {
		vid, err = q.CreateVendorForTool(ctx, toolID)
		if err != nil {
			return err
		}
		err = q.SetToolVendor(ctx, db.SetToolVendorParams{
			ID:       toolID,
			VendorID: pgtype.UUID{Bytes: vid, Valid: true},
		})
		if err != nil {
			return err
		}
	}

	year := pgtype.Int4{}
	if v.YearOfFoundation != nil {
		year = pgtype.Int4{Int32: *v.YearOfFoundation, Valid: true}
	}
	return q.UpdateVendorDetails(ctx, db.UpdateVendorDetailsParams{
		ID:               vid,
		Website:          pg.OptionalText(v.Website),
		XProfile:         pg.OptionalText(v.XProfile),
		LinkedinProfile:  pg.OptionalText(v.LinkedinProfile),
		HeadOffice:       pg.OptionalText(v.HeadOffice),
		YearOfFoundation: year,
	})
}
