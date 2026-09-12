-- +goose Up

-- Vendor-side ownership of a tool page. Several people from the same company
-- may own one tool, and one person may own several, so this is a join table
-- rather than a column on tools. Ownership is granted by hand once a claim
-- submitted through the "Claim this page" form has been verified — there is
-- deliberately no HTTP endpoint that grants it.
CREATE TABLE tool_owners (
    tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tool_id, profile_id)
);

-- "Which tools does this person own?" for profile pages and the claim script.
CREATE INDEX idx_tool_owners_profile ON tool_owners (profile_id);

ALTER TABLE tool_owners ENABLE ROW LEVEL SECURITY;

-- Owner-written page copy, stored as Tiptap JSON — the same editor playbooks
-- use. tools.description stays a plain-text projection of it, so search,
-- embeddings and the catalogue cards keep working untouched.
ALTER TABLE tools ADD COLUMN description_rich TEXT;

-- Appending a column is all CREATE OR REPLACE VIEW allows; the existing ones
-- keep their names, types and order. t.id is the primary key, so the extra
-- column is functionally dependent on the GROUP BY and needs no entry there.
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

-- +goose Down

-- The column cannot be dropped while the view still selects it, and
-- CREATE OR REPLACE cannot remove a column, so the view is rebuilt outright.
DROP VIEW IF EXISTS tools_with_details;

CREATE VIEW tools_with_details WITH (security_invoker='on') AS
    SELECT t.id,
        t.name,
        t.description,
        t.logo_url,
        t.created_at,
        t.updated_at,
        COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', c.id, 'name', c.name)) FILTER (WHERE (c.id IS NOT NULL)), '[]'::jsonb) AS categories,
        jsonb_build_object('id', v.id, 'website', v.website, 'x_profile', v.x_profile, 'linkedin_profile', v.linkedin_profile, 'head_office', v.head_office, 'year_of_foundation', v.year_of_foundation) AS vendor
    FROM (((tools t
        LEFT JOIN tool_categories tc ON ((t.id = tc.tool_id)))
        LEFT JOIN categories c ON ((tc.category_id = c.id)))
        LEFT JOIN vendors v ON ((t.vendor_id = v.id)))
    GROUP BY t.id, t.name, t.description, t.logo_url, t.created_at, t.updated_at, v.id;

ALTER TABLE tools DROP COLUMN IF EXISTS description_rich;
DROP TABLE IF EXISTS tool_owners;
