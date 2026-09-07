-- +goose Up

-- GTM focus areas chosen during onboarding ("What's your focus?").
-- These are a curated taxonomy owned by the app, not rows in `categories`
-- (which holds the much more granular vendor-directory categories), so they are
-- stored as plain text keys rather than foreign keys.
ALTER TABLE profiles ADD COLUMN focus_areas TEXT[] NOT NULL DEFAULT '{}';

-- Marks that the user has been through the multi-step onboarding, so the flow
-- is not shown again to people who already have a profile.
ALTER TABLE profiles ADD COLUMN onboarding_completed_at TIMESTAMPTZ;

-- +goose Down

ALTER TABLE profiles DROP COLUMN IF EXISTS onboarding_completed_at;
ALTER TABLE profiles DROP COLUMN IF EXISTS focus_areas;
