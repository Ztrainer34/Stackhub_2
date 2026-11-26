package tool

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"stackhub.com/stackhub/internal/curation"
	"stackhub.com/stackhub/internal/httpx"
	"stackhub.com/stackhub/pkg/db"
)

// maxUsedByIDs caps how many tools one /rankings/used-by call may ask about: a
// ranking page shows 25 tools.
const maxUsedByIDs = 25

// GetRankingTools backs the /rankings pages: every visible tool with at least
// one active stack and its counts, plus how many distinct stacks each category
// scope has ("" = all). The frontend filters, sorts and paginates.
func (h *Handler) GetRankingTools(w http.ResponseWriter, r *http.Request) {
	excluded := curation.ExcludedUsernames()

	tools, err := h.Queries.GetRankingTools(r.Context(), excluded)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to get ranking tools", http.StatusInternalServerError)
		return
	}
	if tools == nil {
		tools = []db.GetRankingToolsRow{}
	}

	counts, err := h.Queries.GetRankingStackCounts(r.Context(), excluded)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to get ranking stack counts", http.StatusInternalServerError)
		return
	}
	stackCounts := make(map[string]int32, len(counts))
	for _, c := range counts {
		stackCounts[c.ScopeSlug] = c.Stacks
	}

	response := struct {
		Tools       []db.GetRankingToolsRow `json:"tools"`
		StackCounts map[string]int32        `json:"stack_counts"`
	}{
		Tools:       tools,
		StackCounts: stackCounts,
	}

	// Counts move slowly and are the same for everyone.
	httpx.CachePublic(w, 60, 300)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

type usedByPerson struct {
	Username    string      `json:"username"`
	DisplayName string      `json:"display_name"`
	AvatarURL   pgtype.Text `json:"avatar_url"`
}

// GetRankingUsedBy returns up to 3 people per tool for the "Used by" avatars.
// The order depends on who is asking (people they follow come first), so the
// response is never cached on the way.
func (h *Handler) GetRankingUsedBy(w http.ResponseWriter, r *http.Request) {
	ids, ok := parseToolIDs(r.URL.Query().Get("ids"))
	if !ok {
		http.Error(w, "ids must be 1 to 25 tool ids separated by commas", http.StatusBadRequest)
		return
	}

	viewerID := httpx.UserIDIfPresent(r)

	rows, err := h.Queries.GetRankingUsedBy(r.Context(), db.GetRankingUsedByParams{
		IsAuthenticated: viewerID != uuid.Nil,
		ViewerID:        viewerID,
		ToolIds:         ids,
		Excluded:        curation.ExcludedUsernames(),
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to get used-by", http.StatusInternalServerError)
		return
	}

	response := make(map[string][]usedByPerson, len(ids))
	for _, row := range rows {
		key := row.ToolID.String()
		response[key] = append(response[key], usedByPerson{
			Username:    row.Username,
			DisplayName: row.DisplayName,
			AvatarURL:   row.AvatarUrl,
		})
	}

	// Same answer for both, so no cache in between can hand one viewer's order to
	// another. The website caches the anonymous answer itself.
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Add("Vary", "Authorization")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// parseToolIDs reads a comma-separated list of tool ids: 1 to maxUsedByIDs
// distinct, well-formed ids. Duplicates are dropped; anything else is rejected.
func parseToolIDs(raw string) ([]uuid.UUID, bool) {
	if raw == "" {
		return nil, false
	}
	parts := strings.Split(raw, ",")
	if len(parts) > maxUsedByIDs {
		return nil, false
	}
	seen := make(map[uuid.UUID]bool, len(parts))
	ids := make([]uuid.UUID, 0, len(parts))
	for _, part := range parts {
		id, err := uuid.Parse(strings.TrimSpace(part))
		if err != nil {
			return nil, false
		}
		if seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
	}
	return ids, true
}
