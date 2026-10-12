-- +goose Up

-- The experience someone should already have to get value out of a playbook.
--
-- Nullable and unconstrained by default: the field is optional in the compose
-- screen, and every post that exists today predates it. A CHECK rather than an
-- enum type keeps it cheap to add a level later — altering a Postgres enum is a
-- migration, adding a value to a CHECK is one ALTER.
ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS experience_level TEXT;

ALTER TABLE posts
    DROP CONSTRAINT IF EXISTS posts_experience_level_check;

ALTER TABLE posts
    ADD CONSTRAINT posts_experience_level_check
    CHECK (experience_level IS NULL
           OR experience_level IN ('beginner', 'intermediate', 'advanced'));

-- +goose Down

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_experience_level_check;
ALTER TABLE posts DROP COLUMN IF EXISTS experience_level;
