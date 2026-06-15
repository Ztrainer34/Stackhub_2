-- Create fake notifications for user 005d3e31-3b3e-43ff-9d57-d758c87ed6fc
-- This script will select random users as actors and random posts for post-related notifications

DO $$
DECLARE
    recipient_user_id UUID := '6b61ac6a-e914-480d-abc6-68a54fec7a74';
    random_actor_id UUID;
    random_post_id UUID;
    random_post_name TEXT;
BEGIN
    -- Notification 1: Recent follow (unread)
    SELECT id INTO random_actor_id FROM profiles WHERE id != recipient_user_id ORDER BY RANDOM() LIMIT 1;
    
    INSERT INTO notifications (recipient_id, actor_id, type, entity_id, entity_type, title, message, is_read, created_at) 
    VALUES (
        recipient_user_id,
        random_actor_id,
        'follow',
        NULL,
        NULL,
        'New follower',
        'Someone started following you',
        false,
        NOW() - INTERVAL '30 minutes'
    );

    -- Notification 2: Post star (unread)
    SELECT id INTO random_actor_id FROM profiles WHERE id != recipient_user_id ORDER BY RANDOM() LIMIT 1;
    SELECT id, name INTO random_post_id, random_post_name FROM posts WHERE is_published = true ORDER BY RANDOM() LIMIT 1;
    
    INSERT INTO notifications (recipient_id, actor_id, type, entity_id, entity_type, title, message, is_read, created_at) 
    VALUES (
        recipient_user_id,
        random_actor_id,
        'post_star',
        random_post_id,
        'post',
        'Post starred',
        'Someone starred your post "' || COALESCE(random_post_name, 'Your Post') || '"',
        false,
        NOW() - INTERVAL '1 hour'
    );

    -- Notification 3: Post comment (unread)
    SELECT id INTO random_actor_id FROM profiles WHERE id != recipient_user_id ORDER BY RANDOM() LIMIT 1;
    SELECT id, name INTO random_post_id, random_post_name FROM posts WHERE is_published = true ORDER BY RANDOM() LIMIT 1;
    
    INSERT INTO notifications (recipient_id, actor_id, type, entity_id, entity_type, title, message, is_read, created_at) 
    VALUES (
        recipient_user_id,
        random_actor_id,
        'post_comment',
        random_post_id,
        'post',
        'New comment',
        'Someone commented on your post "' || COALESCE(random_post_name, 'Your Post') || '"',
        false,
        NOW() - INTERVAL '15 minutes'
    );

    -- Notification 4: Older follow (read)
    SELECT id INTO random_actor_id FROM profiles WHERE id != recipient_user_id ORDER BY RANDOM() LIMIT 1;
    
    INSERT INTO notifications (recipient_id, actor_id, type, entity_id, entity_type, title, message, is_read, created_at) 
    VALUES (
        recipient_user_id,
        random_actor_id,
        'follow',
        NULL,
        NULL,
        'New follower',
        'Someone started following you',
        true,
        NOW() - INTERVAL '2 days'
    );

    -- Notification 5: Another post star (read)
    SELECT id INTO random_actor_id FROM profiles WHERE id != recipient_user_id ORDER BY RANDOM() LIMIT 1;
    SELECT id, name INTO random_post_id, random_post_name FROM posts WHERE is_published = true ORDER BY RANDOM() LIMIT 1;
    
    INSERT INTO notifications (recipient_id, actor_id, type, entity_id, entity_type, title, message, is_read, created_at) 
    VALUES (
        recipient_user_id,
        random_actor_id,
        'post_star',
        random_post_id,
        'post',
        'Post starred',
        'Someone starred your post "' || COALESCE(random_post_name, 'Your Post') || '"',
        true,
        NOW() - INTERVAL '1 day'
    );

    -- Notification 6: Another comment (read)
    SELECT id INTO random_actor_id FROM profiles WHERE id != recipient_user_id ORDER BY RANDOM() LIMIT 1;
    SELECT id, name INTO random_post_id, random_post_name FROM posts WHERE is_published = true ORDER BY RANDOM() LIMIT 1;
    
    INSERT INTO notifications (recipient_id, actor_id, type, entity_id, entity_type, title, message, is_read, created_at) 
    VALUES (
        recipient_user_id,
        random_actor_id,
        'post_comment',
        random_post_id,
        'post',
        'New comment',
        'Someone commented on your post "' || COALESCE(random_post_name, 'Your Post') || '"',
        true,
        NOW() - INTERVAL '3 days'
    );

    -- Notification 7: Very recent star (unread) 
    SELECT id INTO random_actor_id FROM profiles WHERE id != recipient_user_id ORDER BY RANDOM() LIMIT 1;
    SELECT id, name INTO random_post_id, random_post_name FROM posts WHERE is_published = true ORDER BY RANDOM() LIMIT 1;
    
    INSERT INTO notifications (recipient_id, actor_id, type, entity_id, entity_type, title, message, is_read, created_at) 
    VALUES (
        recipient_user_id,
        random_actor_id,
        'post_star',
        random_post_id,
        'post',
        'Post starred',
        'Someone starred your post "' || COALESCE(random_post_name, 'Your Post') || '"',
        false,
        NOW() - INTERVAL '5 minutes'
    );

    -- Notification 8: Very recent comment (unread)
    SELECT id INTO random_actor_id FROM profiles WHERE id != recipient_user_id ORDER BY RANDOM() LIMIT 1;
    SELECT id, name INTO random_post_id, random_post_name FROM posts WHERE is_published = true ORDER BY RANDOM() LIMIT 1;
    
    INSERT INTO notifications (recipient_id, actor_id, type, entity_id, entity_type, title, message, is_read, created_at) 
    VALUES (
        recipient_user_id,
        random_actor_id,
        'post_comment',
        random_post_id,
        'post',
        'New comment',
        'Someone commented on your post "' || COALESCE(random_post_name, 'Your Post') || '"',
        false,
        NOW() - INTERVAL '2 minutes'
    );

    RAISE NOTICE 'Created 8 fake notifications for user %', recipient_user_id;
END $$;