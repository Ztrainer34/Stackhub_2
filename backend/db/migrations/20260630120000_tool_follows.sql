-- +goose Up
CREATE TABLE tool_follows (
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, tool_id)
);

-- +goose Down
DROP TABLE IF EXISTS tool_follows;
