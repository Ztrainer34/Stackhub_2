package post

import (
	"net/url"
	"regexp"
	"strings"

	"github.com/google/uuid"
)

type CreatePostForm struct {
	Type        string      `json:"type"`
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Tools       []uuid.UUID `json:"tools"`
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

var safe_url_chars = regexp.MustCompile(`[^a-z0-9\-]`)

func NameToSlug(name string) string {
	name = strings.ToLower(name)
	name = strings.ReplaceAll(name, " ", "-")
	name = safe_url_chars.ReplaceAllString(name, "")

	// This is just for safety
	name = url.QueryEscape(name)

	return name
}
