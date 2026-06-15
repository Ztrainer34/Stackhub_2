BEGIN;

-- Create temp table
CREATE TEMP TABLE temp_tools (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  vendor_id UUID,
  embedding vector(384)
);

-- Copy data first
\copy temp_tools(id, name, description, logo_url, vendor_id, embedding) FROM 'data/csv/tools.csv' WITH CSV HEADER;

-- Add hash column for efficient matching
ALTER TABLE temp_tools ADD COLUMN match_hash TEXT;
UPDATE temp_tools SET match_hash = md5(name || COALESCE(description, ''));

-- Index the hash (much smaller)
CREATE INDEX idx_temp_tools_hash ON temp_tools(match_hash);

-- Analyze
ANALYZE temp_tools;

-- Perform the update using hash matching
UPDATE tools t
SET embedding = tt.embedding
FROM temp_tools tt
WHERE md5(t.name || COALESCE(t.description, '')) = tt.match_hash;

COMMIT;