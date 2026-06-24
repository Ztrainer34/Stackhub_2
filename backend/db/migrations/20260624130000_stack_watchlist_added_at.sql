-- +goose Up

ALTER TABLE stack_items ADD COLUMN added_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE watchlist_items ADD COLUMN added_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- +goose Down

ALTER TABLE stack_items DROP COLUMN IF EXISTS added_at;
ALTER TABLE watchlist_items DROP COLUMN IF EXISTS added_at;
