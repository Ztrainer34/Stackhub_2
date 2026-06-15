BEGIN;

-- Add slug column to categories table
ALTER TABLE categories 
ADD COLUMN slug VARCHAR(255);

-- Create function to generate slug from name (similar to nameToSlug in post.go)
CREATE OR REPLACE FUNCTION generate_slug(input_name TEXT) 
RETURNS TEXT AS $$
BEGIN
    RETURN LOWER(
        REGEXP_REPLACE(
            REGEXP_REPLACE(
                REGEXP_REPLACE(
                    TRIM(input_name),
                    '[^\w\s-]', '', 'g'  -- Remove non-word characters except spaces and hyphens
                ),
                '\s+', '-', 'g'  -- Replace spaces with hyphens
            ),
            '-+', '-', 'g'  -- Replace multiple hyphens with single hyphen
        )
    );
END;
$$ LANGUAGE plpgsql;

-- Update existing categories with generated slugs
UPDATE categories 
SET slug = generate_slug(name);

-- Add unique constraint on slug
ALTER TABLE categories 
ADD CONSTRAINT categories_slug_unique UNIQUE (slug);

-- Make slug NOT NULL
ALTER TABLE categories 
ALTER COLUMN slug SET NOT NULL;

-- Drop the temporary function
DROP FUNCTION generate_slug(TEXT);

COMMIT;