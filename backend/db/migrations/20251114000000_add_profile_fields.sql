-- +goose Up
ALTER TABLE profiles
ADD COLUMN bio TEXT,
ADD COLUMN website TEXT;

-- +goose Down
ALTER TABLE profiles
DROP COLUMN bio,
DROP COLUMN website;
