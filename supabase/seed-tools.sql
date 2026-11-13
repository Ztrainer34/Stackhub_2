-- Local-only tool catalogue. scripts/seed.mjs is deliberately lookup-only for
-- tools — it links seeded playbooks to the real catalogue and never invents
-- rows — which means a fresh local database has no tools for it to find. This
-- supplies them.
--
--   docker exec -i supabase_db_Stackhub_2 psql -U postgres -d postgres < supabase/seed-tools.sql
--
-- Re-runnable: every insert is ON CONFLICT DO NOTHING.

BEGIN;

-- Vendors ---------------------------------------------------------------------
INSERT INTO vendors (name, website, head_office, year_of_foundation, linkedin_profile, x_profile)
VALUES
  ('Clay',    'https://clay.com',    'New York, United States',   2017, 'https://www.linkedin.com/company/clay-run',  '@clayrun'),
  ('HubSpot', 'https://hubspot.com', 'Cambridge, Massachusetts',  2006, 'https://www.linkedin.com/company/hubspot',   '@HubSpot'),
  ('Lemlist', 'https://lemlist.com', 'Paris, France',             2018, 'https://www.linkedin.com/company/lemlist',   '@lemlist'),
  ('Apollo',  'https://apollo.io',   'San Francisco, United States', 2015, 'https://www.linkedin.com/company/apolloio', '@MeetApollo'),
  ('Notion',  'https://notion.so',   'San Francisco, United States', 2013, 'https://www.linkedin.com/company/notionhq','@NotionHQ'),
  ('Brevo',   'https://brevo.com',   'Paris, France',             2012, 'https://www.linkedin.com/company/brevo',     '@brevo_official')
ON CONFLICT DO NOTHING;

-- Categories ------------------------------------------------------------------
INSERT INTO categories (name, slug) VALUES
  ('Data Enrichment',      'data-enrichment'),
  ('Sales Workflow',       'sales-workflow'),
  ('CRM',                  'crm'),
  ('Marketing Automation', 'marketing-automation'),
  ('Email',                'email'),
  ('Productivity',         'productivity')
ON CONFLICT (name) DO NOTHING;

-- Tools -----------------------------------------------------------------------
-- Two deliberate edge cases at the end: one with no logo (exercises the initials
-- fallback and the owner's "Change logo" dialog) and one with no description
-- (exercises the empty-state copy on the About card).
INSERT INTO tools (name, description, logo_url, vendor_id)
SELECT t.name, t.description, t.logo_url, v.id
FROM (VALUES
  ('Clay',
   'Clay helps go-to-market teams access unique data from 100+ sources and AI agents, enabling them to automate growth workflows. Grant yourself ownership of this one to test the four edit pencils.',
   'https://www.google.com/s2/favicons?domain=clay.com&sz=128', 'Clay'),
  ('HubSpot',
   'All-in-one CRM and marketing platform covering marketing, sales, service and CMS.',
   'https://www.google.com/s2/favicons?domain=hubspot.com&sz=128', 'HubSpot'),
  ('Lemlist',
   'Cold email outreach and automation with deliverability tooling built in.',
   'https://www.google.com/s2/favicons?domain=lemlist.com&sz=128', 'Lemlist'),
  ('Apollo',
   'B2B database and sales engagement platform with contact and company data.',
   'https://www.google.com/s2/favicons?domain=apollo.io&sz=128', 'Apollo'),
  ('Notion',
   'Connected workspace for notes, docs, wikis and lightweight project tracking.',
   'https://www.google.com/s2/favicons?domain=notion.so&sz=128', 'Notion'),
  ('Brevo',
   'Affordable all-in-one marketing and CRM stack — email, SMS, WhatsApp and chat.',
   'https://www.google.com/s2/favicons?domain=brevo.com&sz=128', 'Brevo'),
  ('Toolwithnologo',
   'Deliberately has no logo, so the initials fallback and the owner Change logo dialog can both be checked.',
   NULL, NULL),
  ('Toolwithnodescription', NULL, NULL, NULL)
) AS t(name, description, logo_url, vendor_name)
LEFT JOIN vendors v ON v.name = t.vendor_name
WHERE NOT EXISTS (SELECT 1 FROM tools x WHERE lower(x.name) = lower(t.name));

-- Tool → category links --------------------------------------------------------
INSERT INTO tool_categories (tool_id, category_id)
SELECT tl.id, c.id
FROM (VALUES
  ('Clay', 'Data Enrichment'), ('Clay', 'Sales Workflow'),
  ('HubSpot', 'CRM'), ('HubSpot', 'Marketing Automation'),
  ('Lemlist', 'Email'), ('Lemlist', 'Sales Workflow'),
  ('Apollo', 'Data Enrichment'), ('Apollo', 'Sales Workflow'),
  ('Notion', 'Productivity'),
  ('Brevo', 'Email'), ('Brevo', 'Marketing Automation'),
  ('Toolwithnologo', 'Productivity'),
  ('Toolwithnodescription', 'Productivity')
) AS m(tool_name, category_name)
JOIN tools tl ON lower(tl.name) = lower(m.tool_name)
JOIN categories c ON c.name = m.category_name
ON CONFLICT DO NOTHING;

-- Link the already-seeded playbooks to their tools -----------------------------
-- seed.mjs created the posts but could not attach tools, because none existed.
INSERT INTO post_tools (post_id, tool_id)
SELECT p.id, tl.id
FROM (VALUES
  ('Enrich inbound leads with Clay before they hit the CRM', 'Clay'),
  ('Capture visitors in HubSpot and follow up with Lemlist', 'HubSpot'),
  ('Capture visitors in HubSpot and follow up with Lemlist', 'Lemlist'),
  ('Apollo vs Clay for outbound data', 'Apollo'),
  ('Apollo vs Clay for outbound data', 'Clay')
) AS m(post_name, tool_name)
JOIN posts p ON p.name = m.post_name
JOIN tools tl ON lower(tl.name) = lower(m.tool_name)
ON CONFLICT DO NOTHING;

COMMIT;

SELECT
  (SELECT count(*) FROM tools)           AS tools,
  (SELECT count(*) FROM vendors)         AS vendors,
  (SELECT count(*) FROM categories)      AS categories,
  (SELECT count(*) FROM tool_categories) AS tool_links,
  (SELECT count(*) FROM post_tools)      AS post_links,
  (SELECT count(*) FROM profiles)        AS profiles,
  (SELECT count(*) FROM posts)           AS posts;
