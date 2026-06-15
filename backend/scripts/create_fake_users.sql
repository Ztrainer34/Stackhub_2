-- Script to create fake users and add random likes
-- This creates 100 fake users, random posts, and random likes

BEGIN;
CREATE OR REPLACE FUNCTION create_fake_user(
    user_email TEXT,
    user_username TEXT,
    user_display_name TEXT
) RETURNS UUID AS $$
DECLARE
    new_user_id UUID;
BEGIN
    new_user_id := gen_random_uuid();
    
    -- Insert into auth.users
    INSERT INTO auth.users (
        id, email, encrypted_password, email_confirmed_at,
        created_at, updated_at, confirmation_token, recovery_token,
        email_change_token_new, email_change
    ) VALUES (
        new_user_id, user_email, crypt('password123', gen_salt('bf')), NOW(),
        NOW(), NOW(), '', '', '', ''
    );
    
    -- Insert into profiles
    INSERT INTO profiles (id, username, display_name, created_at, updated_at)
    VALUES (new_user_id, user_username, user_display_name, NOW(), NOW());
    
    RETURN new_user_id;
END;
$$ LANGUAGE plpgsql;

-- Generate 100 fake users
DO $$
DECLARE
    i INTEGER;
    user_id UUID;
    fake_email TEXT;
    fake_username TEXT;
    fake_display_name TEXT;
    usernames TEXT[] := ARRAY[
        'john_dev', 'sarah_data', 'mike_design', 'emma_marketing', 'alex_product',
        'lisa_engineer', 'david_analyst', 'anna_creator', 'tom_manager', 'julia_writer',
        'mark_developer', 'sophia_designer', 'james_admin', 'olivia_consultant', 'daniel_lead',
        'grace_specialist', 'ryan_expert', 'maya_strategist', 'noah_architect', 'zoe_advisor'
    ];
    display_names TEXT[] := ARRAY[
        'John Smith', 'Sarah Johnson', 'Mike Brown', 'Emma Davis', 'Alex Wilson',
        'Lisa Garcia', 'David Miller', 'Anna Rodriguez', 'Tom Anderson', 'Julia Taylor',
        'Mark Thomas', 'Sophia Jackson', 'James White', 'Olivia Harris', 'Daniel Martin',
        'Grace Thompson', 'Ryan Garcia', 'Maya Martinez', 'Noah Robinson', 'Zoe Clark'
    ];
BEGIN
    FOR i IN 1..100 LOOP
        -- Generate fake data
        fake_username := usernames[((i - 1) % array_length(usernames, 1)) + 1] || '_' || i;
        fake_display_name := display_names[((i - 1) % array_length(display_names, 1)) + 1] || ' ' || i;
        fake_email := fake_username || '@example.com';
        
        BEGIN
            user_id := create_fake_user(fake_email, fake_username, fake_display_name);
            
            IF i % 10 = 0 THEN
                RAISE NOTICE 'Created % users...', i;
            END IF;
            
        EXCEPTION
            WHEN unique_violation THEN
                -- Skip if username already exists
                CONTINUE;
            WHEN OTHERS THEN
                RAISE NOTICE 'Error creating user %: %', fake_username, SQLERRM;
                CONTINUE;
        END;
    END LOOP;
    
    RAISE NOTICE 'Finished creating fake users!';
END $$;

-- Create random posts for fake users
DO $$
DECLARE
    fake_user RECORD;
    i INTEGER;
    post_count INTEGER := 0;
    post_id UUID;
    post_name TEXT;
    post_slug TEXT;
    post_description TEXT;
    post_types TEXT[] := ARRAY['playbook', 'combo', 'comparison'];
    
    -- Sample post templates
    playbook_names TEXT[] := ARRAY[
        'My Development Workflow', 'Data Science Pipeline', 'Content Creation Process',
        'DevOps Best Practices', 'Project Management Guide', 'Design System Setup',
        'Marketing Strategy', 'Customer Support Workflow', 'Sales Process Guide',
        'Remote Work Setup', 'Team Collaboration Tools', 'Quality Assurance Process',
        'Security Checklist', 'Performance Optimization', 'Database Management',
        'API Development Guide', 'Mobile App Workflow', 'Web Development Stack',
        'Cloud Infrastructure Setup', 'Monitoring and Alerting'
    ];
    
    descriptions TEXT[] := ARRAY[
        'A comprehensive guide to streamline your daily workflow',
        'Step-by-step process for efficient project delivery',
        'Best practices and tools for optimal results',
        'Complete methodology for professional excellence',
        'Essential steps to achieve consistent outcomes',
        'Proven strategies for maximum productivity',
        'Expert techniques and recommended approaches',
        'Detailed framework for systematic execution',
        'Professional standards and quality guidelines',
        'Advanced methods for superior performance'
    ];
BEGIN
    RAISE NOTICE 'Creating random posts for fake users...';
    
    -- For each fake user, create 1-5 random posts
    FOR fake_user IN 
        SELECT p.id, p.username, p.display_name
        FROM profiles p 
        JOIN auth.users u ON p.id = u.id 
        WHERE u.email LIKE '%@example.com'
    LOOP
        -- Each user creates 1-5 posts
        FOR i IN 1..(1 + (RANDOM() * 4)::INTEGER) LOOP
            post_id := gen_random_uuid();
            post_name := playbook_names[1 + (RANDOM() * array_length(playbook_names, 1))::INTEGER] || ' - ' || fake_user.display_name;
            post_slug := lower(regexp_replace(post_name, '[^a-zA-Z0-9\s]', '', 'g'));
            post_slug := regexp_replace(post_slug, '\s+', '-', 'g');
            post_slug := substring(post_slug from 1 for 100);
            post_description := descriptions[1 + (RANDOM() * array_length(descriptions, 1))::INTEGER];
            
            BEGIN
                INSERT INTO posts (
                    id, author_id, type, name, slug, description,
                    content, content_text, is_published, created_at, updated_at
                ) VALUES (
                    post_id,
                    fake_user.id,
                    post_types[1 + (RANDOM() * array_length(post_types, 1))::INTEGER],
                    post_name,
                    post_slug,
                    post_description,
                    '{"version": "1.0", "steps": []}',  -- Empty content as requested
                    post_description,
                    true,
                    NOW() - (RANDOM() * INTERVAL '30 days'),  -- Random creation date within last 30 days
                    NOW()
                );
                
                post_count := post_count + 1;
                
            EXCEPTION
                WHEN unique_violation THEN
                    -- Skip if slug already exists
                    CONTINUE;
                WHEN OTHERS THEN
                    RAISE NOTICE 'Error creating post for user %: %', fake_user.username, SQLERRM;
                    CONTINUE;
            END;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Created % random posts!', post_count;
END $$;

-- Associate random tools with posts
DO $$
DECLARE
    post RECORD;
    tool RECORD;
    association_count INTEGER := 0;
    tool_limit INTEGER;
BEGIN
    RAISE NOTICE 'Associating random tools with posts...';
    
    -- For each post created by fake users
    FOR post IN 
        SELECT p.id, p.name, p.author_id, p.type
        FROM posts p 
        JOIN profiles pr ON p.author_id = pr.id 
        JOIN auth.users u ON pr.id = u.id 
        WHERE u.email LIKE '%@example.com'
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
    
    RAISE NOTICE 'Created % post-tool associations!', association_count;
END $$;

-- Add random likes from fake users to all posts (including newly created ones)
DO $$
DECLARE
    fake_user RECORD;
    post RECORD;
    like_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Adding random likes...';
    
    -- For each fake user (those with @example.com emails)
    FOR fake_user IN 
        SELECT p.id, p.username 
        FROM profiles p 
        JOIN auth.users u ON p.id = u.id 
        WHERE u.email LIKE '%@example.com'
    LOOP
        -- Each user likes 1-8 random posts
        FOR post IN 
            SELECT id, name 
            FROM posts 
            WHERE is_published = true 
                AND author_id != fake_user.id  -- Don't like own posts
            ORDER BY RANDOM() 
            LIMIT (1 + (RANDOM() * 7)::INTEGER)  -- 1-8 posts
        LOOP
            BEGIN
                INSERT INTO post_stars (post_id, liker_id)
                VALUES (post.id, fake_user.id);
                
                like_count := like_count + 1;
                
            EXCEPTION
                WHEN unique_violation THEN
                    -- Skip if already liked
                    CONTINUE;
            END;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Added % random likes!', like_count;
END $$;

-- Clean up the helper function
DROP FUNCTION create_fake_user(TEXT, TEXT, TEXT);

-- Show summary
DO $$
DECLARE
    fake_user_count INTEGER;
    total_likes INTEGER;
    total_posts INTEGER;
BEGIN
    SELECT COUNT(*) INTO fake_user_count 
    FROM profiles p 
    JOIN auth.users u ON p.id = u.id 
    WHERE u.email LIKE '%@example.com';
    
    SELECT COUNT(*) INTO total_likes FROM post_stars;
    SELECT COUNT(*) INTO total_posts FROM posts WHERE is_published = true;
    
    RAISE NOTICE '=== SUMMARY ===';
    RAISE NOTICE 'Fake users created: %', fake_user_count;
    RAISE NOTICE 'Total published posts: %', total_posts;
    RAISE NOTICE 'Total likes in system: %', total_likes;
END $$;

COMMIT;