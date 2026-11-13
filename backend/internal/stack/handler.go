package stack

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi"
	"github.com/google/uuid"
	"stackhub.com/stackhub/internal/httpx"
	"stackhub.com/stackhub/pkg/db"
)

func (h *Handler) AddToStack(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r)

	toolIDString := chi.URLParam(r, "tool_id")
	toolID, err := uuid.Parse(toolIDString)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	// A tool belongs to at most one list. Adding to the stack removes it from
	// the watchlist and the old stack.
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	qtx := h.Queries.WithTx(tx)

	err = qtx.AddToStack(r.Context(), db.AddToStackParams{
		ProfileID: userID,
		ToolID:    toolID,
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to add to stack", http.StatusInternalServerError)
		return
	}

	// Using a tool implies wanting its updates, so adding to the stack also
	// follows it. Unfollowing stays manual — removing from the stack does not
	// undo this.
	err = qtx.FollowTool(r.Context(), db.FollowToolParams{
		ProfileID: userID,
		ToolID:    toolID,
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to add to stack", http.StatusInternalServerError)
		return
	}

	err = qtx.RemoveFromWatchlist(r.Context(), db.RemoveFromWatchlistParams{
		ProfileID: userID,
		ToolID:    toolID,
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to add to stack", http.StatusInternalServerError)
		return
	}

	err = qtx.RemoveFromOldStack(r.Context(), db.RemoveFromOldStackParams{
		ProfileID: userID,
		ToolID:    toolID,
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to add to stack", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		log.Println(err)
		http.Error(w, "Failed to commit", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *Handler) RemoveFromStack(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r)

	toolIDString := chi.URLParam(r, "tool_id")
	toolID, err := uuid.Parse(toolIDString)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	removeFromStack := db.RemoveFromStackParams{
		ProfileID: userID,
		ToolID:    toolID,
	}

	err = h.Queries.RemoveFromStack(r.Context(), removeFromStack)
	if err != nil {
		http.Error(w, "Failed to remove from stack", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *Handler) AddToWatchlist(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r)

	toolIDString := chi.URLParam(r, "tool_id")
	toolID, err := uuid.Parse(toolIDString)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	// A tool belongs to at most one list. Adding to the watchlist removes it
	// from the stack and the old stack.
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	qtx := h.Queries.WithTx(tx)

	err = qtx.AddToWatchlist(r.Context(), db.AddToWatchlistParams{
		ProfileID: userID,
		ToolID:    toolID,
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to add to watchlist", http.StatusInternalServerError)
		return
	}

	// Saving a tool for later implies wanting its updates, same as adding it to
	// the stack. The feed ranks these below stack tools rather than treating the
	// two follows as equal — see the tiers in GetUserFeed.
	err = qtx.FollowTool(r.Context(), db.FollowToolParams{
		ProfileID: userID,
		ToolID:    toolID,
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to add to watchlist", http.StatusInternalServerError)
		return
	}

	err = qtx.RemoveFromStack(r.Context(), db.RemoveFromStackParams{
		ProfileID: userID,
		ToolID:    toolID,
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to add to watchlist", http.StatusInternalServerError)
		return
	}

	err = qtx.RemoveFromOldStack(r.Context(), db.RemoveFromOldStackParams{
		ProfileID: userID,
		ToolID:    toolID,
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to add to watchlist", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		log.Println(err)
		http.Error(w, "Failed to commit", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *Handler) RemoveFromWatchlist(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r)

	toolIDString := chi.URLParam(r, "tool_id")
	toolID, err := uuid.Parse(toolIDString)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	removeFromWatchlistParams := db.RemoveFromWatchlistParams{
		ProfileID: userID,
		ToolID:    toolID,
	}

	err = h.Queries.RemoveFromWatchlist(r.Context(), removeFromWatchlistParams)
	if err != nil {
		http.Error(w, "Failed to remove from watchlist", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// addToOldStack archives a tool: one the user used to run but no longer does.
func (h *Handler) AddToOldStack(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r)

	toolIDString := chi.URLParam(r, "tool_id")
	toolID, err := uuid.Parse(toolIDString)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	// A tool belongs to at most one list. Archiving removes it from the active
	// stack and the watchlist.
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	qtx := h.Queries.WithTx(tx)

	err = qtx.AddToOldStack(r.Context(), db.AddToOldStackParams{
		ProfileID: userID,
		ToolID:    toolID,
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to add to old stack", http.StatusInternalServerError)
		return
	}

	// Archiving a tool means you have stopped using it, so stop following it
	// too — the inverse of the auto-follow on stack and watchlist. This is the
	// one place a follow is removed automatically; unfollowing is otherwise a
	// deliberate act.
	err = qtx.UnfollowTool(r.Context(), db.UnfollowToolParams{
		ProfileID: userID,
		ToolID:    toolID,
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to add to old stack", http.StatusInternalServerError)
		return
	}

	err = qtx.RemoveFromStack(r.Context(), db.RemoveFromStackParams{
		ProfileID: userID,
		ToolID:    toolID,
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to add to old stack", http.StatusInternalServerError)
		return
	}

	err = qtx.RemoveFromWatchlist(r.Context(), db.RemoveFromWatchlistParams{
		ProfileID: userID,
		ToolID:    toolID,
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to add to old stack", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		log.Println(err)
		http.Error(w, "Failed to commit", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *Handler) RemoveFromOldStack(w http.ResponseWriter, r *http.Request) {
	userID := httpx.UserID(r)

	toolIDString := chi.URLParam(r, "tool_id")
	toolID, err := uuid.Parse(toolIDString)

	if err != nil {
		log.Println(err)
		http.Error(w, "Malformed id", http.StatusBadRequest)
		return
	}

	err = h.Queries.RemoveFromOldStack(r.Context(), db.RemoveFromOldStackParams{
		ProfileID: userID,
		ToolID:    toolID,
	})
	if err != nil {
		http.Error(w, "Failed to remove from old stack", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *Handler) ListUserStack(w http.ResponseWriter, r *http.Request) {
	username := strings.ToLower(chi.URLParam(r, "slug"))

	if username == "" {
		http.Error(w, "Username cannot be empty", http.StatusBadRequest)
		return
	}

	tools, err := h.Queries.ListUserStack(r.Context(), username)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to fetch stack", http.StatusInternalServerError)
		return
	}

	if tools == nil {
		tools = []db.ListUserStackRow{}
	}

	response := struct {
		Tools []db.ListUserStackRow `json:"tools"`
	}{
		Tools: tools,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *Handler) ListUserWatchlist(w http.ResponseWriter, r *http.Request) {
	username := strings.ToLower(chi.URLParam(r, "slug"))

	if username == "" {
		http.Error(w, "Username cannot be empty", http.StatusBadRequest)
		return
	}

	tools, err := h.Queries.ListUserWatchlist(r.Context(), username)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to fetch watchlist", http.StatusInternalServerError)
		return
	}

	if tools == nil {
		tools = []db.ListUserWatchlistRow{}
	}

	response := struct {
		Tools []db.ListUserWatchlistRow `json:"tools"`
	}{
		Tools: tools,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *Handler) ListUserOldStack(w http.ResponseWriter, r *http.Request) {
	username := strings.ToLower(chi.URLParam(r, "slug"))

	if username == "" {
		http.Error(w, "Username cannot be empty", http.StatusBadRequest)
		return
	}

	tools, err := h.Queries.ListUserOldStack(r.Context(), username)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to fetch old stack", http.StatusInternalServerError)
		return
	}

	if tools == nil {
		tools = []db.ListUserOldStackRow{}
	}

	response := struct {
		Tools []db.ListUserOldStackRow `json:"tools"`
	}{
		Tools: tools,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
