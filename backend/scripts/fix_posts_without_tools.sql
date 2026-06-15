-- Script to fix posts that don't have tool associations
-- This adds tools to posts created by fake users that currently have no tools

BEGIN;

-- Associate random tools with posts that have no tools
DO $$
DECLARE
    post RECORD;
    tool RECORD;
    association_count INTEGER := 0;
    tool_limit INTEGER;
BEGIN
    RAISE NOTICE 'Fixing posts without tool associations...';
    
    -- For each post created by fake users that has no tools
    FOR post IN 
        SELECT p.id, p.name, p.author_id, p.type
        FROM posts p 
        JOIN profiles pr ON p.author_id = pr.id 
        JOIN auth.users u ON pr.id = u.id 
        WHERE u.email LIKE '%@example.com'
        AND NOT EXISTS (SELECT 1 FROM post_tools pt WHERE pt.post_id = p.id)
    LOOP
        -- Determine tool count based on post type
        IF post.type = 'playbook' THEN
            tool_limit := 1;  -- Playbooks get exactly 1 tool
        ELSE
            tool_limit := 2 + (RANDOM() * 2)::INTEGER;  -- Other types get 2-3 tools
        END IF;
        
        -- Associate tools with the post
        FOR tool IN 
            SELECT id 
            FROM tools 
            ORDER BY RANDOM() 
            LIMIT tool_limit
        LOOP
            BEGIN
                INSERT INTO post_tools (post_id, tool_id)
                VALUES (post.id, tool.id);
                
                association_count := association_count + 1;
                
            EXCEPTION
                WHEN unique_violation THEN
                    -- Skip if already associated
                    CONTINUE;
            END;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Fixed % posts by adding % post-tool associations!', 
        (SELECT COUNT(*) FROM (
            SELECT DISTINCT p.id
            FROM posts p 
            JOIN profiles pr ON p.author_id = pr.id 
            JOIN auth.users u ON pr.id = u.id 
            WHERE u.email LIKE '%@example.com'
        ) fixed_posts),
        association_count;
END $$;

-- Show summary of fixed posts
DO $$
DECLARE
    posts_with_tools INTEGER;
    posts_without_tools INTEGER;
    total_fake_posts INTEGER;
BEGIN
    -- Count fake user posts with tools
    SELECT COUNT(DISTINCT p.id) INTO posts_with_tools
    FROM posts p 
    JOIN profiles pr ON p.author_id = pr.id 
    JOIN auth.users u ON pr.id = u.id 
    JOIN post_tools pt ON p.id = pt.post_id
    WHERE u.email LIKE '%@example.com';
    
    -- Count fake user posts without tools
    SELECT COUNT(DISTINCT p.id) INTO posts_without_tools
    FROM posts p 
    JOIN profiles pr ON p.author_id = pr.id 
    JOIN auth.users u ON pr.id = u.id 
    WHERE u.email LIKE '%@example.com'
    AND NOT EXISTS (SELECT 1 FROM post_tools pt WHERE pt.post_id = p.id);
    
    -- Total fake posts
    SELECT COUNT(*) INTO total_fake_posts
    FROM posts p 
    JOIN profiles pr ON p.author_id = pr.id 
    JOIN auth.users u ON pr.id = u.id 
    WHERE u.email LIKE '%@example.com';
    
    RAISE NOTICE '=== POST FIX SUMMARY ===';
    RAISE NOTICE 'Total fake user posts: %', total_fake_posts;
    RAISE NOTICE 'Posts with tools: %', posts_with_tools;
    RAISE NOTICE 'Posts still without tools: %', posts_without_tools;
END $$;

COMMIT;