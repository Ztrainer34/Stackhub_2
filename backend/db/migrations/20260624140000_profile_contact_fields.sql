-- +goose Up

ALTER TABLE profiles ADD COLUMN company TEXT;
ALTER TABLE profiles ADD COLUMN location TEXT;
ALTER TABLE profiles ADD COLUMN linkedin TEXT;
ALTER TABLE profiles ADD COLUMN twitter TEXT;

-- +goose Down

ALTER TABLE profiles DROP COLUMN IF EXISTS company;
ALTER TABLE profiles DROP COLUMN IF EXISTS location;
ALTER TABLE profiles DROP COLUMN IF EXISTS linkedin;
ALTER TABLE profiles DROP COLUMN IF EXISTS twitter;
