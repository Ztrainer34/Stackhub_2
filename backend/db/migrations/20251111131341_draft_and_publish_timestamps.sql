-- +goose Up

ALTER TABLE posts
ADD last_publish TIMESTAMPTZ;

ALTER TABLE posts
ADD last_draft_update TIMESTAMPTZ;

DROP VIEW posts_with_tools;
DROP VIEW posts_with_tools_and_tickets;

CREATE VIEW posts_with_tools WITH (security_invoker='on') AS
    SELECT p.id,
        p.type,
        p.name,
        p.slug,
        p.description,
        p.updated_at,
        p.created_at,
        p.last_draft_update,
        p.last_publish,
        p.author_id,
        p.is_published,
        u.username AS author_username,
        json_agg(json_build_object('id', t.id, 'name', t.name, 'logo_url', t.logo_url)) AS tools
    FROM (((posts p
        JOIN profiles u ON ((p.author_id = u.id)))
        JOIN post_tools pt ON ((p.id = pt.post_id)))
        JOIN tools t ON ((t.id = pt.tool_id)))
    GROUP BY p.id, u.username, p.type, p.name, p.slug, p.description, p.updated_at, p.author_id, p.is_published;

CREATE VIEW posts_with_tools_and_tickets WITH (security_invoker='on') AS
    SELECT p.id,
        p.type,
        p.name,
        p.slug,
        p.description,
        p.updated_at,
        p.created_at,
        p.last_draft_update,
        p.last_publish,
        p.author_id,
        p.is_published,
        u.username AS author_username,
        COALESCE(jsonb_agg(jsonb_build_object('id', combined.id, 'name', combined.name, 'logo_url', combined.logo_url, 'is_ticket', combined.is_ticket)), '[]'::jsonb) AS tools
    FROM ((posts p
        JOIN profiles u ON ((p.author_id = u.id)))
        LEFT JOIN ( SELECT pt.post_id,
                (t.id)::text AS id,
                t.name,
                COALESCE(t.logo_url, ''::text) AS logo_url,
                false AS is_ticket
            FROM (post_tools pt
                JOIN tools t ON ((t.id = pt.tool_id)))
            UNION ALL
            SELECT tt.post_id,
                (tt.id)::text AS id,
                tt.tool_name AS name,
                ''::text AS logo_url,
                true AS is_ticket
            FROM tool_tickets tt
            WHERE (tt.status = 'pending'::text)) combined ON ((combined.post_id = p.id)))
    GROUP BY p.id, u.username, p.type, p.name, p.slug, p.description, p.updated_at, p.author_id, p.is_published;

-- +goose Down

DROP VIEW IF EXISTS posts_with_tools;
DROP VIEW IF EXISTS posts_with_tools_and_tickets;

CREATE VIEW posts_with_tools WITH (security_invoker='on') AS
    SELECT p.id,
        p.type,
        p.name,
        p.slug,
        p.description,
        p.updated_at,
        p.author_id,
        p.is_published,
        u.username AS author_username,
        json_agg(json_build_object('id', t.id, 'name', t.name, 'logo_url', t.logo_url)) AS tools
    FROM (((posts p
        JOIN profiles u ON ((p.author_id = u.id)))
        JOIN post_tools pt ON ((p.id = pt.post_id)))
        JOIN tools t ON ((t.id = pt.tool_id)))
    GROUP BY p.id, u.username, p.type, p.name, p.slug, p.description, p.updated_at, p.author_id, p.is_published;

CREATE VIEW posts_with_tools_and_tickets WITH (security_invoker='on') AS
    SELECT p.id,
        p.type,
        p.name,
        p.slug,
        p.description,
        p.updated_at,
        p.author_id,
        p.is_published,
        u.username AS author_username,
        COALESCE(jsonb_agg(jsonb_build_object('id', combined.id, 'name', combined.name, 'logo_url', combined.logo_url, 'is_ticket', combined.is_ticket)), '[]'::jsonb) AS tools
    FROM ((posts p
        JOIN profiles u ON ((p.author_id = u.id)))
        LEFT JOIN ( SELECT pt.post_id,
                (t.id)::text AS id,
                t.name,
                COALESCE(t.logo_url, ''::text) AS logo_url,
                false AS is_ticket
            FROM (post_tools pt
                JOIN tools t ON ((t.id = pt.tool_id)))
            UNION ALL
            SELECT tt.post_id,
                (tt.id)::text AS id,
                tt.tool_name AS name,
                ''::text AS logo_url,
                true AS is_ticket
            FROM tool_tickets tt
            WHERE (tt.status = 'pending'::text)) combined ON ((combined.post_id = p.id)))
    GROUP BY p.id, u.username, p.type, p.name, p.slug, p.description, p.updated_at, p.author_id, p.is_published;

ALTER TABLE posts
DROP last_publish;

ALTER TABLE posts
DROP last_draft_update;

