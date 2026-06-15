BEGIN;

CREATE TEMP TABLE tool_categories_temp (
  tool_id UUID,
  category TEXT
);

-- 1. Categories (if not already inserted)
\copy categories(name, slug) FROM 'data/csv/categories.csv' WITH CSV HEADER;

-- 2. Vendors
\copy vendors(id, name, website, x_profile, linkedin_profile, head_office, year_of_foundation) FROM 'data/csv/vendors.csv' WITH CSV HEADER;

-- 3. Tools
\copy tools(id, name, description, logo_url, vendor_id, embedding) FROM 'data/csv/tools.csv' WITH CSV HEADER;

-- 4. Load tool-category pairs into temp table
\copy tool_categories_temp(tool_id, category) FROM 'data/csv/tool_categories.csv' WITH CSV HEADER;

-- 5. Insert into tool_categories using JOIN to resolve category_id
INSERT INTO tool_categories (tool_id, category_id)
SELECT t.tool_id, c.id
FROM tool_categories_temp t
JOIN categories c ON LOWER(c.name) = LOWER(t.category);

COMMIT;
