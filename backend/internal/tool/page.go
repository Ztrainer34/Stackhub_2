package tool

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"stackhub.com/stackhub/internal/httpx"
	"stackhub.com/stackhub/internal/storage"
	"stackhub.com/stackhub/pkg/db"
)

// requireToolOwner resolves the tool in the URL and checks the caller owns its
// page. It writes the error response itself; ok == false means stop.
func (h *Handler) requireToolOwner(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	toolID, err := h.resolveToolID(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "Tool not found", http.StatusNotFound)
		return uuid.Nil, false
	}

	owner, err := h.Queries.IsToolOwner(r.Context(), db.IsToolOwnerParams{
		ToolID:    toolID,
		ProfileID: httpx.UserID(r),
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
func (h *Handler) UpdateToolPage(w http.ResponseWriter, r *http.Request) {
	toolID, ok := h.requireToolOwner(w, r)
	if !ok {
		return
	}

	var form UpdateToolPageRequest
	if err := json.NewDecoder(r.Body).Decode(&form); err != nil {
		http.Error(w, "Malformed request", http.StatusBadRequest)
		return
	}

	if err := (toolService{db: h.DB}).updatePage(r.Context(), toolID, form); err != nil {
		httpx.WriteError(w, err)
		return
	}

	// Hand back the whole tool so the client can drop it straight into its cache.
	tool, err := h.Queries.GetToolAuthenticated(r.Context(), db.GetToolAuthenticatedParams{
		ID:        toolID,
		ProfileID: httpx.UserID(r),
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
func (h *Handler) UploadToolLogo(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	toolID, ok := h.requireToolOwner(w, r)
	if !ok {
		return
	}

	img, ok := storage.ReceiveImage(w, r, 5<<20) // 5 MB
	if !ok {
		return
	}
	defer img.File.Close()

	filename := fmt.Sprintf("tool-logos/%s%s", uuid.NewString(), img.Ext)

	uploader := manager.NewUploader(h.Bucket.Client)
	_, err := uploader.Upload(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(h.Bucket.Name),
		Key:         aws.String(filename),
		Body:        img.File,
		ContentType: aws.String(img.ContentType),
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to upload the image", http.StatusInternalServerError)
		return
	}

	fileURL := h.Bucket.PublicURL(filename)

	err = h.Queries.UpdateToolPageContent(ctx, db.UpdateToolPageContentParams{
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
