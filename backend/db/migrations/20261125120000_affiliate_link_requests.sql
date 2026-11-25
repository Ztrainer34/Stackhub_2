-- +goose Up

-- "Ask for my affiliate link" on tool pages. Each row is one signed-in user
-- asking for a personal affiliate link for one tool. StackHub collects these and
-- contacts the vendor once a tool has enough requests, so the count per tool is
-- what matters. One request per user per tool; cancelling deletes the row.
-- Safe to run twice.
--
-- Apply it BEFORE the backend: every signed-in tool page reads this table, so
-- without it those pages break.
--
-- PASTE ONLY THIS UP SECTION into the Supabase SQL editor. The Down section at
-- the bottom is plain SQL: pasted, it runs and drops the table.
CREATE TABLE IF NOT EXISTS affiliate_link_requests (
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, tool_id)
);

-- Per-tool counts and the admin export read by tool.
CREATE INDEX IF NOT EXISTS affiliate_link_requests_tool_idx
    ON affiliate_link_requests (tool_id, created_at);

-- Only the Go backend (service connection) touches this table. No policies:
-- the Supabase client in the browser can neither read nor write it.
ALTER TABLE affiliate_link_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE affiliate_link_requests FROM PUBLIC, anon, authenticated;

-- +goose Down

DROP TABLE IF EXISTS affiliate_link_requests;
