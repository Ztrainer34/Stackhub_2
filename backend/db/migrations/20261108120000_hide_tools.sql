-- +goose Up

-- Hidden tools. A client curation keeps ~1,100 tools on show and hides the
-- rest WITHOUT deleting them: every post, stack, follow, owner and ticket that
-- points at a tool keeps pointing at it, and bringing a tool back is clearing
-- these two columns.
--
--   hidden_at     NULL = visible. When set, the tool is left out of search,
--                 autocomplete, the /tools and category listings, category
--                 counts, popular and recommended tools, and onboarding. Its
--                 own page still loads (old links keep working) but asks search
--                 engines not to index it.
--   hidden_batch  Label of the operation that hid it (e.g.
--                 '2026-11-client-curation'), so one batch can be restored
--                 without touching tools hidden for other reasons:
--
--     UPDATE tools SET hidden_at = NULL, hidden_batch = NULL
--     WHERE hidden_batch = '2026-11-client-curation';
--
-- Un-hiding is always done by hand (frontend/scripts/hide-tools.mjs): /admin has
-- no role check, so nothing reachable over HTTP may un-hide a tool.
-- Safe to run twice.
ALTER TABLE tools ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS hidden_batch TEXT;
CREATE INDEX IF NOT EXISTS tools_hidden_batch_idx ON tools (hidden_batch) WHERE hidden_batch IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS tools_hidden_batch_idx;
ALTER TABLE tools DROP COLUMN IF EXISTS hidden_batch;
ALTER TABLE tools DROP COLUMN IF EXISTS hidden_at;
