-- +goose Up

CREATE TABLE key_tools (
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (profile_id, tool_id)
);

-- +goose Down

DROP TABLE IF EXISTS key_tools;
