-- +goose Up

-- Uploaded profile picture. NULL means the user hasn't uploaded one, in which
-- case the UI falls back to their Gravatar (via email_hash), then to initials.
ALTER TABLE profiles ADD COLUMN avatar_url TEXT;

-- +goose Down

ALTER TABLE profiles DROP COLUMN IF EXISTS avatar_url;
