package post

import "github.com/google/uuid"

type CreateSuggestedToolForm struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Website     string `json:"website"`
	Categories  []int  `json:"categories"`
}

type CreatePostWithSuggestedToolsForm struct {
	Type           string                    `json:"type"`
	Name           string                    `json:"name"`
	Description    string                    `json:"description"`
	Tools          []uuid.UUID               `json:"tools"`
	SuggestedTools []CreateSuggestedToolForm `json:"suggested_tools"`
}

type ApproveSuggestedToolForm struct {
	ToolID uuid.UUID `json:"tool_id"`
}

type RejectSuggestedToolForm struct {
	Reason string `json:"reason"`
}
