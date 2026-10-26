package post

import (
	"net/url"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"stackhub.com/stackhub/internal/ticket"
)

// Field length caps, in characters. Each is at or above what the frontend form
// allows, so a user of the UI never meets them — they bound direct API calls.
const (
	maxPostNameLen        = 200
	maxPostDescriptionLen = 1000
	maxCommentLen         = 10000
)

// siteURL is the public site origin, used to build links inside emails.
const siteURL = "https://stackhub.me"

// CreatePostWithSuggestedToolsForm is the body of POST /post/create.
type CreatePostWithSuggestedToolsForm struct {
	Type           string              `json:"type"`
	Name           string              `json:"name"`
	Description    string              `json:"description"`
	Tools          []uuid.UUID         `json:"tools"`
	SuggestedTools []ticket.Suggestion `json:"suggested_tools"`
	// Optional. Empty string means "not answered" and is stored as NULL.
	// See ValidExperienceLevels for the accepted values.
	ExperienceLevel string `json:"experience_level"`
}

// ValidExperienceLevels mirrors the CHECK constraint on posts.experience_level.
// Anything else is rejected before it reaches the database, so a bad value
// comes back as a 400 naming the field rather than a 500 from a constraint
// violation.
var ValidExperienceLevels = map[string]bool{
	"beginner":     true,
	"intermediate": true,
	"advanced":     true,
}

type SavePostForm struct {
	Content string `json:"content"`
}

type PublishPostForm struct {
	Content *string `json:"content"`
}

type CreatePostCommentArgs struct {
	Content string `json:"content"`
}

type RenamePostForm struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// UploadImageFile is the uploaded image in an UploadImageResponse.
type UploadImageFile struct {
	URL string `json:"url"`
}

var safeURLChars = regexp.MustCompile(`[^a-z0-9\-]`)

// NameToSlug turns a post's name into the slug in its URL.
func NameToSlug(name string) string {
	name = strings.ToLower(name)
	name = strings.ReplaceAll(name, " ", "-")
	name = safeURLChars.ReplaceAllString(name, "")

	// This is just for safety
	name = url.QueryEscape(name)

	return name
}
