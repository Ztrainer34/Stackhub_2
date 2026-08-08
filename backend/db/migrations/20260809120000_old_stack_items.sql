-- +goose Up

-- Tools a user used to run but no longer actively uses (e.g. HubSpot at a
-- previous company). Mirrors stack_items / watchlist_items. A tool lives in at
-- most one of the three lists; the add handlers enforce that mutual exclusivity.
CREATE TABLE old_stack_items (
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, tool_id)
);

ALTER TABLE old_stack_items ENABLE ROW LEVEL SECURITY;

-- +goose Down

DROP TABLE IF EXISTS old_stack_items;
