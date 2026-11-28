-- +goose Up
-- +goose StatementBegin
-- Two-level tool categories. Nothing changes for visitors until
-- frontend/scripts/import-categories.mjs runs: with no parents, no retired
-- categories and every position 0, the site behaves as before.
-- Safe to run twice.
--
--   parent_id    NULL = a parent (or an old, flat category); otherwise a subcategory.
--   sort_order   order of parents, and of subcategories inside a parent.
--   retired_at   an old category that can no longer be picked. Its row stays:
--                hidden tools and old tickets still point at it.
--   replaced_by  where a retired category went. NULL = nowhere (its page goes to /tools).
--   tool_categories.position   0 = the tool's main category, shown first.
--
-- PASTE ONLY THIS UP SECTION into the Supabase SQL editor. The Down section at
-- the bottom is plain SQL: pasted, it runs and undoes this.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES categories(id);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS replaced_by INTEGER REFERENCES categories(id);
ALTER TABLE tool_categories ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS categories_parent_id_idx ON categories (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS categories_replaced_by_idx ON categories (replaced_by) WHERE replaced_by IS NOT NULL;

-- Same columns and types as before. The category list is now ordered (main one
-- first) and carries each category's slug and parent name.
CREATE OR REPLACE VIEW tools_with_details WITH (security_invoker='on') AS
    SELECT t.id,
        t.name,
        t.description,
        t.logo_url,
        t.created_at,
        t.updated_at,
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'parent', p.name)
                ORDER BY tc.position, c.id)
            FROM tool_categories tc
            JOIN categories c ON c.id = tc.category_id
            LEFT JOIN categories p ON p.id = c.parent_id
            WHERE tc.tool_id = t.id
        ), '[]'::jsonb) AS categories,
        jsonb_build_object('id', v.id, 'website', v.website, 'x_profile', v.x_profile, 'linkedin_profile', v.linkedin_profile, 'head_office', v.head_office, 'year_of_foundation', v.year_of_foundation) AS vendor,
        t.description_rich
    FROM tools t
        LEFT JOIN vendors v ON t.vendor_id = v.id;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Undo the import first (UNDO=<backup> node scripts/import-categories.mjs): this
-- drops the order, the parents and the redirects.
CREATE OR REPLACE VIEW tools_with_details WITH (security_invoker='on') AS
    SELECT t.id,
        t.name,
        t.description,
        t.logo_url,
        t.created_at,
        t.updated_at,
        COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', c.id, 'name', c.name)) FILTER (WHERE (c.id IS NOT NULL)), '[]'::jsonb) AS categories,
        jsonb_build_object('id', v.id, 'website', v.website, 'x_profile', v.x_profile, 'linkedin_profile', v.linkedin_profile, 'head_office', v.head_office, 'year_of_foundation', v.year_of_foundation) AS vendor,
        t.description_rich
    FROM (((tools t
        LEFT JOIN tool_categories tc ON ((t.id = tc.tool_id)))
        LEFT JOIN categories c ON ((tc.category_id = c.id)))
        LEFT JOIN vendors v ON ((t.vendor_id = v.id)))
    GROUP BY t.id, t.name, t.description, t.logo_url, t.created_at, t.updated_at, v.id;
ALTER TABLE tool_categories DROP COLUMN IF EXISTS position;
ALTER TABLE categories DROP COLUMN IF EXISTS replaced_by;
ALTER TABLE categories DROP COLUMN IF EXISTS retired_at;
ALTER TABLE categories DROP COLUMN IF EXISTS sort_order;
ALTER TABLE categories DROP COLUMN IF EXISTS parent_id;
-- +goose StatementEnd
