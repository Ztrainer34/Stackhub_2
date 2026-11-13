package search

import (
	"context"
	"math"
	"strconv"

	"github.com/google/uuid"
	"stackhub.com/stackhub/internal/apperr"
	"stackhub.com/stackhub/pkg/db"
)

// searchService runs the full-text search behind /search. The handler in
// search.go only reads the query string and writes the response.
type searchService struct {
	q *db.Queries
}

// searchPageSize is how many results one page of search holds.
const searchPageSize int32 = 10

// searchResults is the /search response. The fields are in alphabetical order
// because the response used to be a map, which encoding/json writes sorted —
// keeping the order keeps the bytes identical.
type searchResults struct {
	CurrentPage int32       `json:"current_page"`
	Data        interface{} `json:"data"`
	TotalCount  int64       `json:"total_count"`
	TotalPages  int32       `json:"total_pages"`
	Type        string      `json:"type"`
}

// maxSearchPage is the last page whose offset, searchPageSize*(page-1), still
// fits the int32 the queries take. Past it the offset wrapped negative and
// Postgres answered with an error, so a URL like ?p=2147483647 was a 500.
const maxSearchPage = math.MaxInt32/searchPageSize + 1

// parseSearchPage reads the p parameter. Absent means page 1.
func parseSearchPage(s string) (int32, error) {
	if s == "" {
		return 1, nil
	}
	n, err := strconv.ParseInt(s, 10, 32)
	if err != nil {
		return 0, apperr.Invalid("Invalid page number")
	}
	if n < 1 {
		return 0, apperr.Invalid("Page number must be >= 1")
	}
	if n > int64(maxSearchPage) {
		return 0, apperr.Invalid("Page number is too large")
	}
	return int32(n), nil
}

// searchPageCount is how many pages count results fill. No results is still
// one (empty) page, so the client always has a page 1 to show.
func searchPageCount(count int64) int32 {
	if count <= 0 {
		return 1
	}
	return int32((count + int64(searchPageSize) - 1) / int64(searchPageSize))
}

// search runs one page of a search over posts, tools or profiles. viewerID is
// uuid.Nil for an anonymous caller; post and tool results depend on who is
// asking (drafts, follow state), profile results do not.
func (s searchService) search(ctx context.Context, kind, query string, page int32, viewerID uuid.UUID) (searchResults, error) {
	res := searchResults{Type: kind, CurrentPage: page}
	limit := searchPageSize
	offset := searchPageSize * (page - 1) // pages are 1-based, offsets 0-based

	switch kind {
	case "post":
		params := db.SearchPostParams{WebsearchToTsquery: query, Limit: limit, Offset: offset}
		if viewerID != uuid.Nil {
			params.IsAuthenticated = true
			params.AuthenticatedID = viewerID
		}
		posts, err := s.q.SearchPost(ctx, params)
		if err != nil {
			return res, apperr.Internal("Could not search", err)
		}
		if posts == nil {
			posts = []db.SearchPostRow{}
		}
		if len(posts) > 0 {
			res.TotalCount = posts[0].TotalCount
		}
		res.Data = posts

	case "tool":
		params := db.SearchToolParams{WebsearchToTsquery: query, Limit: limit, Offset: offset}
		if viewerID != uuid.Nil {
			params.IsAuthenticated = true
			params.AuthenticatedID = viewerID
		}
		tools, err := s.q.SearchTool(ctx, params)
		if err != nil {
			return res, apperr.Internal("Could not search", err)
		}
		if tools == nil {
			tools = []db.SearchToolRow{}
		}
		if len(tools) > 0 {
			res.TotalCount = tools[0].TotalCount
		}
		res.Data = tools

	case "profile":
		profiles, err := s.q.SearchProfile(ctx, db.SearchProfileParams{WebsearchToTsquery: query, Limit: limit, Offset: offset})
		if err != nil {
			return res, apperr.Internal("Could not search", err)
		}
		if profiles == nil {
			profiles = []db.SearchProfileRow{}
		}
		if len(profiles) > 0 {
			res.TotalCount = profiles[0].TotalCount
		}
		res.Data = profiles

	default:
		return res, apperr.Invalid("Unknown category")
	}

	res.TotalPages = searchPageCount(res.TotalCount)
	return res, nil
}
