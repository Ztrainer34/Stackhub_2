-- Simple script to increase name field weights in search
-- Run this script to make name fields more prominent in search results

-- =======================
-- PROFILES: Increase username weight
-- =======================
CREATE OR REPLACE FUNCTION update_profiles_vector() RETURNS trigger AS $$
BEGIN
  NEW.vector :=
    setweight(to_tsvector('simple', coalesce(NEW.username, '')),         'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.username, '')),         'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.username, '')),         'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.display_name, '')),     'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =======================
-- VENDORS: Increase name weight
-- =======================
CREATE OR REPLACE FUNCTION update_vendors_vector() RETURNS trigger AS $$
BEGIN
  NEW.vector :=
    setweight(to_tsvector('simple', coalesce(NEW.name, '')),    'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.name, '')),    'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.name, '')),    'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.website, '')), 'B') ||
    setweight(
      to_tsvector('simple',
        coalesce(NEW.x_profile, '') || ' ' || coalesce(NEW.linkedin_profile, '')
      ),
      'C'
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =======================
-- TOOLS: Increase name weight
-- =======================
CREATE OR REPLACE FUNCTION update_tools_vector() RETURNS trigger AS $$
BEGIN
  NEW.vector :=
    setweight(to_tsvector('simple',  coalesce(NEW.name, '')),           'A') ||
    setweight(to_tsvector('simple',  coalesce(NEW.name, '')),           'A') ||
    setweight(to_tsvector('simple',  coalesce(NEW.name, '')),           'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')),    'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =======================
-- POSTS: Increase name weight
-- =======================
CREATE OR REPLACE FUNCTION update_content_vector() RETURNS trigger AS $$
BEGIN
  NEW.content_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')),         'A') ||
    setweight(to_tsvector('english', coalesce(NEW.name, '')),         'A') ||
    setweight(to_tsvector('english', coalesce(NEW.name, '')),         'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')),  'B') ||
    setweight(to_tsvector('english', coalesce(NEW.content_text, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update existing records to use new weights
UPDATE profiles SET updated_at = now();
UPDATE vendors SET name = name;
UPDATE tools SET updated_at = now();
UPDATE posts SET updated_at = now();