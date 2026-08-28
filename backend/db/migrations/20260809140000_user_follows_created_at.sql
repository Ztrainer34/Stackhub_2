-- +goose Up

-- The activity feed orders follow events chronologically; user_follows had no
-- timestamp (tool_follows already has added_at). Existing rows collapse to the
-- migration time, which is fine — they simply appear as the oldest events.
ALTER TABLE user_follows ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS user_follows_follower_created_idx
    ON user_follows (follower_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tool_follows_profile_added_idx
    ON tool_follows (profile_id, added_at DESC);

-- +goose Down

DROP INDEX IF EXISTS tool_follows_profile_added_idx;
DROP INDEX IF EXISTS user_follows_follower_created_idx;
ALTER TABLE user_follows DROP COLUMN IF EXISTS created_at;
