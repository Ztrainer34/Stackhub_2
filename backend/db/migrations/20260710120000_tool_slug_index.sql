-- +goose Up

-- Functional index backing GetToolIDBySlug. The expression must match the query
-- exactly for the planner to use it.
CREATE INDEX IF NOT EXISTS idx_tools_name_slug
ON tools (btrim(lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')), '-'));

-- +goose Down

DROP INDEX IF EXISTS idx_tools_name_slug;
