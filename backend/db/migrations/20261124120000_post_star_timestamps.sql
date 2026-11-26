-- +goose Up
-- +goose StatementBegin
-- When a post was starred, so "trending" can count only recent stars.
-- Safe to run twice.
--
-- The column and its default are two separate statements ON PURPOSE. Adding a
-- column WITH a default would stamp every existing star with the time of this
-- migration, and all of them would look brand new. Added first without a
-- default, the existing stars stay NULL (undated) and never count as recent;
-- only stars made after the default is set get a date.
--
-- PASTE ONLY THIS UP SECTION into the Supabase SQL editor. The Down section at
-- the bottom is plain SQL: pasted, it runs and undoes this.
ALTER TABLE post_stars ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE post_stars ALTER COLUMN created_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS post_stars_created_at_idx ON post_stars (created_at);

-- The public ranking endpoints look these up by the second column of a primary
-- key, which the key cannot serve.
CREATE INDEX IF NOT EXISTS user_follows_followee_id_idx ON user_follows (followee_id);
CREATE INDEX IF NOT EXISTS stack_items_tool_id_idx ON stack_items (tool_id);
CREATE INDEX IF NOT EXISTS post_tools_tool_id_idx ON post_tools (tool_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS post_tools_tool_id_idx;
DROP INDEX IF EXISTS stack_items_tool_id_idx;
DROP INDEX IF EXISTS user_follows_followee_id_idx;
DROP INDEX IF EXISTS post_stars_created_at_idx;
ALTER TABLE post_stars DROP COLUMN IF EXISTS created_at;
-- +goose StatementEnd
