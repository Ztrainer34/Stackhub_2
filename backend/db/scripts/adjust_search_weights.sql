-- Script to progressively favor name fields in search weights
-- Run this script multiple times to incrementally increase name field importance

-- Current weight system: A (highest) > B > C > D (lowest)
-- Strategy: Add multiple A-weighted name tokens to increase their relative importance

-- =======================
-- PROFILES: Favor username over display_name
-- =======================

CREATE OR REPLACE FUNCTION update_profiles_vector() RETURNS trigger AS $$
BEGIN
  NEW.vector :=
    -- Triple weight the username by adding it 3 times with 'A' weight
    setweight(to_tsvector('simple', coalesce(NEW.username, '')),         'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.username, '')),         'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.username, '')),         'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.display_name, '')),     'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =======================
-- VENDORS: Favor name field significantly
-- =======================

CREATE OR REPLACE FUNCTION update_vendors_vector() RETURNS trigger AS $$
BEGIN
  NEW.vector :=
    -- Triple weight the vendor name
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
-- TOOLS: Strongly favor tool name over description
-- =======================

CREATE OR REPLACE FUNCTION update_tools_vector() RETURNS trigger AS $$
BEGIN
  NEW.vector :=
    -- Triple weight the tool name
    setweight(to_tsvector('simple',  coalesce(NEW.name, '')),           'A') ||
    setweight(to_tsvector('simple',  coalesce(NEW.name, '')),           'A') ||
    setweight(to_tsvector('simple',  coalesce(NEW.name, '')),           'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')),    'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =======================
-- POSTS: Heavily favor post name over description and content
-- =======================

CREATE OR REPLACE FUNCTION update_content_vector() RETURNS trigger AS $$
BEGIN
  NEW.content_vector :=
    -- Triple weight the post name
    setweight(to_tsvector('english', coalesce(NEW.name, '')),         'A') ||
    setweight(to_tsvector('english', coalesce(NEW.name, '')),         'A') ||
    setweight(to_tsvector('english', coalesce(NEW.name, '')),         'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')),  'B') ||
    setweight(to_tsvector('english', coalesce(NEW.content_text, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =======================
-- REFRESH EXISTING VECTORS
-- =======================
-- Update all existing records to use the new weighting

-- Refresh profiles vectors
UPDATE profiles SET updated_at = now();

-- Refresh vendors vectors  
UPDATE vendors SET name = name;

-- Refresh tools vectors
UPDATE tools SET updated_at = now();

-- Refresh posts vectors
UPDATE posts SET updated_at = now();

-- =======================
-- VERIFICATION QUERIES
-- =======================
-- Use these to test that name matching is now more prominent

/*
-- Test tool search (should heavily favor exact name matches)
SELECT name, description,
       ts_rank(vector, to_tsquery('simple', 'docker')) as rank
FROM tools 
WHERE vector @@ to_tsquery('simple', 'docker')
ORDER BY rank DESC;

-- Test post search (should heavily favor title matches)
SELECT name, description,
       ts_rank(content_vector, to_tsquery('english', 'react')) as rank
FROM posts 
WHERE content_vector @@ to_tsquery('english', 'react')
ORDER BY rank DESC;

-- Test profile search (should heavily favor username matches)
SELECT username, display_name,
       ts_rank(vector, to_tsquery('simple', 'john')) as rank
FROM profiles 
WHERE vector @@ to_tsquery('simple', 'john')
ORDER BY rank DESC;
*/

COMMENT ON FUNCTION update_profiles_vector() IS 'Updated to triple-weight username field for better search relevance';
COMMENT ON FUNCTION update_vendors_vector() IS 'Updated to triple-weight vendor name field for better search relevance';
COMMENT ON FUNCTION update_tools_vector() IS 'Updated to triple-weight tool name field for better search relevance';
COMMENT ON FUNCTION update_content_vector() IS 'Updated to triple-weight post name field for better search relevance';