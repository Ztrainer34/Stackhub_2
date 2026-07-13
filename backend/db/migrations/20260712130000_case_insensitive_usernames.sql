-- +goose Up

-- Usernames are case-insensitive: "Max" and "max" must be the same account.
-- Normalize everything that already exists to lowercase.
--
-- NOTE: this fails if two profiles already differ only by case. Check first:
--   SELECT lower(username), count(*) FROM profiles
--   GROUP BY lower(username) HAVING count(*) > 1;
UPDATE profiles SET username = lower(username) WHERE username <> lower(username);

-- Belt-and-braces: even if some code path forgets to normalize, the database
-- refuses two usernames differing only by case.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
ON profiles (lower(username));

-- +goose Down

DROP INDEX IF EXISTS idx_profiles_username_lower;
