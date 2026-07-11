-- +goose Up

-- Allow tool tickets that are not tied to a playbook (standalone "Add tool"
-- suggestions from the /tools browse page).
ALTER TABLE tool_tickets ALTER COLUMN post_id DROP NOT NULL;

-- +goose Down

-- Note: will fail if any standalone (post_id IS NULL) tickets exist.
ALTER TABLE tool_tickets ALTER COLUMN post_id SET NOT NULL;
