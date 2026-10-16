package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"stackhub.com/stackhub/pkg/db"
)

// maxToolCategories caps what a page owner can attach, so the categories card
// stays a short list rather than a keyword dump.
const maxToolCategories = 12

// requireToolOwner resolves the tool in the URL and checks the caller owns its
// page. It writes the error response itself; ok == false means stop.
func (app *App) requireToolOwner(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	toolID, err := app.resolveToolID(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "Tool not found", http.StatusNotFound)
		return uuid.Nil, false
	}

	owner, err := app.queries.IsToolOwner(r.Context(), db.IsToolOwnerParams{
		ToolID:    toolID,
		ProfileID: extractUserIDFromRequest(r),
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Could not check page ownership", http.StatusInternalServerError)
		return uuid.Nil, false
	}
	if !owner {
		// Deliberately not a 404: the page exists, the caller just cannot edit it.
		http.Error(w, "You do not have edit rights on this tool's page", http.StatusForbidden)
		return uuid.Nil, false
	}

	return toolID, true
}

// ToolVendorInput is the vendor card as one form. Blank strings are written
// through — clearing a field the owner emptied is the point.
type ToolVendorInput struct {
	Website          string `json:"website"`
	XProfile         string `json:"x_profile"`
	LinkedinProfile  string `json:"linkedin_profile"`
	HeadOffice       string `json:"head_office"`
	YearOfFoundation *int32 `json:"year_of_foundation"`
}

// UpdateToolPageRequest mirrors the edit icons on a tool page. Every section is
// optional: each icon sends only the part it changed.
type UpdateToolPageRequest struct {
	DescriptionRich *string          `json:"description_rich"`
	LogoURL         *string          `json:"logo_url"`
	Vendor          *ToolVendorInput `json:"vendor"`
	CategoryIDs     *[]int32         `json:"category_ids"`
}

// updateToolPage applies an owner's edit to a tool page. Copy, logo, vendor
// details and categories go through one endpoint so a single edit is atomic.
func (app *App) updateToolPage(w http.ResponseWriter, r *http.Request) {
	toolID, ok := app.requireToolOwner(w, r)
	if !ok {
		return
	}

	var form UpdateToolPageRequest
	if err := json.NewDecoder(r.Body).Decode(&form); err != nil {
		http.Error(w, "Malformed request", http.StatusBadRequest)
		return
	}

	if form.CategoryIDs != nil && len(*form.CategoryIDs) > maxToolCategories {
		http.Error(w, fmt.Sprintf("A tool can have at most %d categories", maxToolCategories), http.StatusBadRequest)
		return
	}

	// These three are rendered as a link or an image source on the public
	// page, so they must be http(s). x_profile is a handle the page turns into
	// a twitter.com URL itself, so it is free text.
	if form.LogoURL != nil {
		logo, ok := normalizeWebURL(*form.LogoURL)
		if !ok {
			http.Error(w, "Logo URL must be an http or https address", http.StatusBadRequest)
			return
		}
		form.LogoURL = &logo
	}
	if form.Vendor != nil {
		website, ok := normalizeWebURL(form.Vendor.Website)
		if !ok {
			http.Error(w, "Website must be an http or https address", http.StatusBadRequest)
			return
		}
		linkedin, ok := normalizeWebURL(form.Vendor.LinkedinProfile)
		if !ok {
			http.Error(w, "LinkedIn profile must be an http or https address", http.StatusBadRequest)
			return
		}
		form.Vendor.Website, form.Vendor.LinkedinProfile = website, linkedin
	}

	tx, err := app.db.Begin(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	qtx := app.queries.WithTx(tx)

	// A NULL argument leaves the stored value alone, so each icon saves only
	// its own field.
	content := db.UpdateToolPageContentParams{ID: toolID}
	if form.DescriptionRich != nil {
		content.DescriptionRich = pgtype.Text{String: *form.DescriptionRich, Valid: true}
		content.Description = pgtype.Text{String: tiptapPlainText(*form.DescriptionRich), Valid: true}
	}
	if form.LogoURL != nil {
		content.LogoUrl = pgtype.Text{String: strings.TrimSpace(*form.LogoURL), Valid: true}
	}
	if content.DescriptionRich.Valid || content.LogoUrl.Valid {
		if err := qtx.UpdateToolPageContent(r.Context(), content); err != nil {
			log.Println(err)
			http.Error(w, "Failed to save the page", http.StatusInternalServerError)
			return
		}
	}

	if form.Vendor != nil {
		vendorID, err := qtx.GetToolVendorID(r.Context(), toolID)
		if err != nil {
			log.Println(err)
			http.Error(w, "Failed to save the vendor details", http.StatusInternalServerError)
			return
		}

		// A vendors row can be shared between tools. Editing a shared row would
		// rewrite another tool's public vendor card, which this owner does not
		// own — so a shared row is left alone and this tool gets its own. The
		// card is always sent whole, so nothing is lost by starting fresh.
		shared := false
		if vendorID.Valid {
			users, err := qtx.CountToolsUsingVendor(r.Context(), vendorID)
			if err != nil {
				log.Println(err)
				http.Error(w, "Failed to save the vendor details", http.StatusInternalServerError)
				return
			}
			shared = users > 1
		}

		var vid uuid.UUID
		if vendorID.Valid && !shared {
			vid = uuid.UUID(vendorID.Bytes)
		} else {
			vid, err = qtx.CreateVendorForTool(r.Context(), toolID)
			if err != nil {
				log.Println(err)
				http.Error(w, "Failed to save the vendor details", http.StatusInternalServerError)
				return
			}
			err = qtx.SetToolVendor(r.Context(), db.SetToolVendorParams{
				ID:       toolID,
				VendorID: pgtype.UUID{Bytes: vid, Valid: true},
			})
			if err != nil {
				log.Println(err)
				http.Error(w, "Failed to save the vendor details", http.StatusInternalServerError)
				return
			}
		}

		year := pgtype.Int4{}
		if form.Vendor.YearOfFoundation != nil {
			year = pgtype.Int4{Int32: *form.Vendor.YearOfFoundation, Valid: true}
		}
		err = qtx.UpdateVendorDetails(r.Context(), db.UpdateVendorDetailsParams{
			ID:               vid,
			Website:          optionalText(form.Vendor.Website),
			XProfile:         optionalText(form.Vendor.XProfile),
			LinkedinProfile:  optionalText(form.Vendor.LinkedinProfile),
			HeadOffice:       optionalText(form.Vendor.HeadOffice),
			YearOfFoundation: year,
		})
		if err != nil {
			log.Println(err)
			http.Error(w, "Failed to save the vendor details", http.StatusInternalServerError)
			return
		}
	}

	if form.CategoryIDs != nil {
		// Replace wholesale: the card is edited as a set, not item by item.
		if err := qtx.DeleteToolCategories(r.Context(), toolID); err != nil {
			log.Println(err)
			http.Error(w, "Failed to save the categories", http.StatusInternalServerError)
			return
		}
		if len(*form.CategoryIDs) > 0 {
			err := qtx.AddToolCategories(r.Context(), db.AddToolCategoriesParams{
				ToolID:      toolID,
				CategoryIds: *form.CategoryIDs,
			})
			if err != nil {
				log.Println(err)
				http.Error(w, "Failed to save the categories", http.StatusInternalServerError)
				return
			}
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		log.Println(err)
		http.Error(w, "Failed to commit", http.StatusInternalServerError)
		return
	}

	// Hand back the whole tool so the client can drop it straight into its cache.
	tool, err := app.queries.GetToolAuthenticated(r.Context(), db.GetToolAuthenticatedParams{
		ID:        toolID,
		ProfileID: extractUserIDFromRequest(r),
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Saved, but could not read the page back", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tool)
}

// uploadToolLogo replaces a tool's logo with an image the page owner uploads,
// the same way profile pictures work.
func (app *App) uploadToolLogo(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	toolID, ok := app.requireToolOwner(w, r)
	if !ok {
		return
	}

	img, ok := receiveImage(w, r, 5<<20) // 5 MB
	if !ok {
		return
	}
	defer img.File.Close()

	filename := fmt.Sprintf("tool-logos/%s%s", uuid.NewString(), img.Ext)

	uploader := manager.NewUploader(app.bucket)
	_, err := uploader.Upload(ctx, &s3.PutObjectInput{
		Bucket:      app.bucketName,
		Key:         aws.String(filename),
		Body:        img.File,
		ContentType: aws.String(img.ContentType),
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to upload the image", http.StatusInternalServerError)
		return
	}

	fileURL := getPublicSupabaseBucketURL(*app.supabaseProjectRef, *app.bucketName, filename)

	err = app.queries.UpdateToolPageContent(ctx, db.UpdateToolPageContentParams{
		ID:      toolID,
		LogoUrl: pgtype.Text{String: fileURL, Valid: true},
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to save the logo", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		LogoURL string `json:"logo_url"`
	}{LogoURL: fileURL})
}
