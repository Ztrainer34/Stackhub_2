-- name: GetProfile :one
SELECT
  id,
  username,
  display_name,
  bio,
  website,
  company,
  location,
  linkedin,
  twitter,
  email_hash,
  created_at,
  updated_at
FROM
  public.profiles
WHERE
  id = $1;


-- name: GetProfileWithUsername :one
SELECT
  id,
  username,
  display_name,
  bio,
  website,
  company,
  location,
  linkedin,
  twitter,
  email_hash,
  created_at,
  updated_at
FROM
  profiles
WHERE
  username = $1;

-- name: CreateProfile :one
INSERT INTO profiles (
  id,
  username,
  display_name
) VALUES (
  $1, $2, $3
) RETURNING id, username, display_name;

-- name: CheckUsernameAvailable :one
SELECT COUNT(*) = 0 as available
FROM profiles
WHERE username = $1;

-- name: UpdateProfile :exec
UPDATE profiles
SET
  username = COALESCE(sqlc.narg(username), username),
  bio = COALESCE(sqlc.narg(bio), bio),
  website = COALESCE(sqlc.narg(website), website),
  company = COALESCE(sqlc.narg(company), company),
  location = COALESCE(sqlc.narg(location), location),
  linkedin = COALESCE(sqlc.narg(linkedin), linkedin),
  twitter = COALESCE(sqlc.narg(twitter), twitter),
  updated_at = now()
WHERE id = $1;

-- name: GetPost :one
SELECT *
FROM posts_with_tools_and_tickets
WHERE id = $1;

-- name: GetPostContent :one
SELECT id, content FROM posts
WHERE id = $1 LIMIT 1;

-- name: GetPostDraftContent :one
SELECT id, draft_content FROM posts
WHERE id = $1 AND author_id = sqlc.arg(authenticated_id) LIMIT 1;

-- name: ListPosts :many
SELECT id, name, description FROM posts
ORDER BY name
LIMIT 5; -- FIXME

-- name: CreatePost :one
INSERT INTO posts (
  author_id, type, name, slug, description
) VALUES (
  $1, $2, $3, $4, $5
)
RETURNING id, slug;

-- name: AddPostTools :copyfrom
INSERT INTO post_tools (post_id, tool_id)
VALUES ($1, $2);

-- name: GetUserPost :one
SELECT 
  *,
  sqlc.arg(is_authenticated)::boolean AND EXISTS(SELECT 1 FROM post_stars ps WHERE ps.post_id = pwt.id AND ps.liker_id = sqlc.arg(authenticated_id)) AS is_starred
FROM posts_with_tools_and_tickets pwt
WHERE author_username = $1 AND slug = $2 AND ((sqlc.arg(is_authenticated)::boolean AND author_id = sqlc.arg(authenticated_id)) OR is_published);

-- name: GetUserPostDirect :one
SELECT 
  *,
  sqlc.arg(is_authenticated)::boolean AND EXISTS(SELECT 1 FROM post_stars ps WHERE ps.post_id = pwt.id AND ps.liker_id = sqlc.arg(authenticated_id)) AS is_starred
FROM posts_with_tools_and_tickets pwt
WHERE author_username = $1 AND slug = $2 AND ((sqlc.arg(is_authenticated)::boolean AND author_id = sqlc.arg(authenticated_id)) OR is_published);

-- name: GetUserPostByOldSlug :one  
SELECT 
  p.*,
  sqlc.arg(is_authenticated)::boolean AND EXISTS(SELECT 1 FROM post_stars ps WHERE ps.post_id = p.id AND ps.liker_id = sqlc.arg(authenticated_id)) AS is_starred
FROM post_slug_history h
JOIN posts_with_tools_and_tickets p ON h.post_id = p.id
WHERE h.old_slug = $1 AND p.author_username = $2
  AND ((sqlc.arg(is_authenticated)::boolean AND p.author_id = sqlc.arg(authenticated_id)) OR p.is_published);

-- name: GetPostMetadataForUser :one
SELECT 
  EXISTS(SELECT 1 FROM post_stars WHERE post_id = $1 AND liker_id = $2) AS is_starred;

-- name: ListUserPosts :many
SELECT
  *,
  COUNT(*) OVER() AS total_count
FROM posts_with_tools
WHERE
  author_username = $1 AND ((sqlc.arg(is_authenticated)::boolean = true AND author_id = sqlc.arg(authenticated_id)) OR is_published)
  AND (sqlc.arg(use_post_filter)::boolean = false OR type = sqlc.arg(post_filter))
  -- Hide posts whose suggested tool is still pending or was rejected. They live
  -- in the dedicated "waiting for approval" / "rejected" tabs until approved.
  AND NOT EXISTS (
    SELECT 1 FROM tool_tickets tt
    WHERE tt.post_id = posts_with_tools.id AND tt.status IN ('pending', 'rejected')
  )
ORDER BY updated_at DESC
LIMIT $2 OFFSET $3;

-- name: ListUserPostsByApprovalStatus :many
SELECT
  *,
  COUNT(*) OVER() AS total_count
FROM posts_with_tools
WHERE
  author_username = $1
  AND author_id = sqlc.arg(authenticated_id)
  AND (
    (sqlc.arg(approval_status)::text = 'waiting'
      AND EXISTS (SELECT 1 FROM tool_tickets tt WHERE tt.post_id = posts_with_tools.id AND tt.status = 'pending'))
    OR
    (sqlc.arg(approval_status)::text = 'rejected'
      AND EXISTS (SELECT 1 FROM tool_tickets tt WHERE tt.post_id = posts_with_tools.id AND tt.status = 'rejected')
      AND NOT EXISTS (SELECT 1 FROM tool_tickets tt WHERE tt.post_id = posts_with_tools.id AND tt.status = 'pending'))
  )
ORDER BY updated_at DESC
LIMIT $2 OFFSET $3;

-- name: UpdatePost :exec
UPDATE posts
SET name = $2, description = $3, updated_at = now()
WHERE id = $1 AND author_id = $4;

-- name: RenamePostWithSlugHistory :exec
WITH old_post AS (
  SELECT p.id, p.slug, p.author_id
  FROM posts p
  WHERE p.id = $1 AND p.author_id = $2
),
post_update AS (
  UPDATE posts 
  SET name = $3, slug = $4, description = $5, updated_at = now()
  WHERE id = $1 AND author_id = $2
  RETURNING id, slug
),
history_insert AS (
  INSERT INTO post_slug_history (post_id, old_slug, current_slug)
  SELECT old_post.id, old_post.slug, post_update.slug
  FROM old_post, post_update
  WHERE old_post.slug != post_update.slug
  RETURNING post_id
)
UPDATE post_slug_history AS h
SET current_slug = $4
WHERE h.post_id = $1 AND h.current_slug != $4;

-- name: DeletePost :execrows
DELETE FROM posts
WHERE id = $1 AND author_id = $2;

-- name: SavePostDraft :execrows
UPDATE posts
SET draft_content = $2, draft_content_text = $3, updated_at = now(), last_draft_update = now()
WHERE id = $1 AND author_id = $4;

-- name: PublishPost :exec
UPDATE posts
SET content = draft_content, content_text = draft_content_text, is_published = true, updated_at = now(), last_publish = now()
WHERE id = $1 AND author_id = $2;

-- name: UnpublishPost :execrows
UPDATE posts
SET is_published = false, updated_at = now()
WHERE id = $1 AND author_id = $2;

-- name: SaveDraftAndPublishPost :execrows
UPDATE posts
SET draft_content = $2, draft_content_text = $3, content = $2, content_text = $3, is_published = true, updated_at = now(), last_publish = now(), last_draft_update = now()
WHERE id = $1 AND author_id = $4;

-- name: CreateCategoryIfNotExist :one
INSERT INTO categories (
  name
) VALUES (
  $1
)
ON CONFLICT(name) DO UPDATE
SET name = categories.name
RETURNING *;

-- name: StarPost :exec
INSERT INTO post_stars (
  post_id, liker_id
) VALUES (
  $1, $2
)
ON CONFLICT (post_id, liker_id) DO NOTHING;

-- name: UnstarPost :exec
DELETE FROM post_stars 
WHERE post_id = $1 
AND liker_id = $2;

-- name: ListUserStarredPosts :many
SELECT
  pwt.*,
  COALESCE((
    SELECT jsonb_agg(DISTINCT jsonb_build_object('id', c.id, 'name', c.name))
    FROM post_tools pt
    JOIN tool_categories tc ON tc.tool_id = pt.tool_id
    JOIN categories c ON c.id = tc.category_id
    WHERE pt.post_id = pwt.id
  ), '[]'::jsonb) AS categories,
  COUNT(*) OVER() AS total_count
FROM posts_with_tools pwt
JOIN post_stars ps ON pwt.id = ps.post_id
WHERE ps.liker_id = $1 AND pwt.is_published
ORDER BY pwt.updated_at DESC
LIMIT $2 OFFSET $3;

-- name: CreatePostComment :exec
INSERT INTO post_comments (post_id, commenter_id, content)
VALUES ($1, $2, $3);

-- name: ListPostComments :many
SELECT c.id, c.commenter_id, c.content, c.created_at FROM post_comments c
JOIN posts p ON c.post_id = p.id
WHERE c.post_id = $1 AND ((sqlc.arg(is_authenticated)::boolean = true AND p.author_id = sqlc.arg(authenticated_id)) OR p.is_published);

-- name: EditPostComment :exec
UPDATE post_comments
SET content = $2,
    updated_at = now()
WHERE id = $1 AND commenter_id = $2;

-- name: RemovePostComment :exec
DELETE FROM post_comments
WHERE id = $1 AND commenter_id = $2;

-- name: CreatePostMedia :exec
INSERT INTO post_medias (post_id, file_name, s3_key)
VALUES ($1, $2, $3);

-- name: CreateTool :one
INSERT INTO tools (
  name, description, logo_url
) VALUES (
  $1, $2, $3
)
RETURNING id, name, description, logo_url;

-- name: AssignCategoryToTool :exec
INSERT INTO tool_categories (
  tool_id, category_id
) VALUES (
  $1, $2
);

-- name: AutocompleteTool :many
SELECT id, name, description, logo_url, similarity(name, $1) AS sml
FROM tools
WHERE name % $1 OR name ILIKE $1 || '%'
ORDER BY
  CASE
    WHEN LOWER(name) = LOWER($1) THEN 0           -- exact match first
    WHEN LOWER(name) LIKE LOWER($1) || '%' THEN 1 -- prefix match second
    ELSE 2
  END,
  sml DESC,
  name
LIMIT $2;

-- name: GetFacetCounts :one
WITH
  query AS (
    SELECT websearch_to_tsquery('english', $1) q
  )
SELECT
  (SELECT COUNT(*) FROM posts, query WHERE posts.content_vector @@ query.q AND posts.is_published = true) AS post_count,
  (SELECT COUNT(*) FROM tools, query WHERE tools.vector @@ query.q) AS tool_count,
  (SELECT COUNT(*) FROM profiles, query WHERE profiles.vector @@ query.q) AS profile_count;

-- name: SearchPost :many
SELECT 
  pwt.*,
  ts_rank_cd((SELECT content_vector FROM posts WHERE id = pwt.id), websearch_to_tsquery('english', $1)) AS rank,
  COUNT(*) OVER() AS total_count,
  -- User status
  sqlc.arg(is_authenticated)::boolean = true AND EXISTS(SELECT 1 FROM post_stars ps WHERE ps.post_id = pwt.id AND ps.liker_id = sqlc.arg(authenticated_id)) AS is_starred
FROM posts_with_tools pwt
WHERE 
  websearch_to_tsquery('english', $1) @@ (SELECT content_vector FROM posts WHERE id = pwt.id) AND ((sqlc.arg(is_authenticated)::boolean = true AND pwt.author_id = sqlc.arg(authenticated_id)) OR pwt.is_published)
ORDER BY 
  rank DESC
LIMIT $2 OFFSET $3;

-- name: SearchTool :many
SELECT
  *,
  sqlc.arg(is_authenticated)::boolean = true AND EXISTS(SELECT 1 FROM stack_items si WHERE si.profile_id = sqlc.arg(authenticated_id) AND si.tool_id = twd.id) AS is_in_stack,
  sqlc.arg(is_authenticated)::boolean = true AND EXISTS(SELECT 1 FROM watchlist_items wi WHERE wi.profile_id = sqlc.arg(authenticated_id) AND wi.tool_id = twd.id) AS is_in_watchlist,
  ts_rank_cd((SELECT vector FROM tools WHERE id = twd.id), websearch_to_tsquery('english', $1)) AS rank,
  COUNT(*) OVER() AS total_count
FROM tools_with_details twd
WHERE websearch_to_tsquery('english', $1) @@ (SELECT vector FROM tools WHERE id = twd.id)
ORDER BY rank DESC
LIMIT $2 OFFSET $3;

-- name: SearchProfile :many
SELECT
  p.id,
  p.username,
  p.display_name,
  p.created_at,
  p.updated_at,
  ts_rank_cd(p.vector, websearch_to_tsquery('simple', $1)) AS rank,
  COUNT(*) OVER() AS total_count
FROM
  profiles p
WHERE
  websearch_to_tsquery('simple', $1) @@ p.vector
ORDER BY
  rank DESC
LIMIT $2 OFFSET $3;

-- name: GetTool :one
SELECT *
FROM tools_with_details
WHERE id = $1;

-- name: GetToolAuthenticated :one
SELECT
  *,
  -- User status
  EXISTS(SELECT 1 FROM stack_items si WHERE si.profile_id = $2 AND si.tool_id = twd.id) AS is_in_stack,
  EXISTS(SELECT 1 FROM watchlist_items wi WHERE wi.profile_id = $2 AND wi.tool_id = twd.id) AS is_in_watchlist,
  EXISTS(SELECT 1 FROM tool_follows tf WHERE tf.profile_id = $2 AND tf.tool_id = twd.id) AS is_followed
FROM tools_with_details twd
WHERE id = $1;

-- name: GetTopPosts :many
SELECT *
FROM posts_with_tools
WHERE is_published
ORDER BY updated_at DESC
LIMIT $1;

-- name: GetTopCategories :many
SELECT 
  c.id,
  c.name,
  c.slug,
  COUNT(tc.tool_id) AS tool_count
FROM 
  categories c
LEFT JOIN 
  tool_categories tc ON c.id = tc.category_id
GROUP BY 
  c.id, c.name, c.slug
HAVING 
  COUNT(tc.tool_id) > 0
ORDER BY 
  tool_count DESC, c.name ASC
LIMIT $1;

-- name: GetToolsByCategory :many
SELECT
  *,
  COUNT(*) OVER() AS total_count
FROM tools_with_details twd
WHERE EXISTS (
  SELECT 1 
  FROM tool_categories tc2 
  JOIN categories c2 ON tc2.category_id = c2.id 
  WHERE tc2.tool_id = twd.id AND c2.slug = $1
)
ORDER BY name
LIMIT $2 OFFSET $3;

-- name: GetCategoryBySlug :one
SELECT id, name, slug
FROM categories
WHERE slug = $1;

-- name: GetToolFromTicket :one
SELECT
  tt.tool_name AS name,
  tt.tool_description AS description,
  '' AS logo_url,
  tt.created_at,
  tt.created_at AS updated_at,
  -- Aggregate categories into JSON array from ticket categories
  COALESCE(
    jsonb_agg(
      DISTINCT jsonb_build_object(
        'id', c.id,
        'name', c.name
      )
    ) FILTER (WHERE c.id IS NOT NULL),
    '[]'::jsonb
  ) AS categories,
  -- No vendor for ticket tools
  NULL AS vendor
FROM
  tool_tickets tt
LEFT JOIN
  tool_ticket_categories ttc ON tt.id = ttc.ticket_id
LEFT JOIN
  categories c ON ttc.category_id = c.id
WHERE
  tt.id = $1
GROUP BY
  tt.id, tt.tool_name, tt.tool_description, tt.created_at;

-- name: CreateToolTicket :one
INSERT INTO tool_tickets (
  post_id, requested_by, tool_name, tool_description, tool_website
) VALUES (
  $1, $2, $3, $4, $5
)
RETURNING id;

-- name: AddToolTicketCategories :copyfrom
INSERT INTO tool_ticket_categories (ticket_id, category_id)
VALUES ($1, $2);

-- name: ListToolTickets :many
SELECT
  tt.id,
  tt.post_id,
  tt.requested_by,
  tt.tool_name,
  tt.tool_description,
  tt.tool_website,
  tt.status,
  tt.resolved_tool_id,
  tt.resolved_by,
  tt.resolved_at,
  tt.created_at,
  tt.updated_at,
  p.name AS post_name,
  p.slug AS post_slug,
  requester.username AS requester_username,
  resolver.username AS resolver_username,
  COALESCE(
    jsonb_agg(
      DISTINCT jsonb_build_object(
        'id', c.id,
        'name', c.name
      )
    ) FILTER (WHERE c.id IS NOT NULL),
    '[]'::jsonb
  ) AS categories,
  COUNT(*) OVER() AS total_count
FROM
  tool_tickets tt
JOIN
  posts p ON tt.post_id = p.id
JOIN
  profiles requester ON tt.requested_by = requester.id
LEFT JOIN
  profiles resolver ON tt.resolved_by = resolver.id
LEFT JOIN
  tool_ticket_categories ttc ON tt.id = ttc.ticket_id
LEFT JOIN
  categories c ON ttc.category_id = c.id
WHERE
  ($1::text = '' OR tt.status = $1::text)
GROUP BY
  tt.id, p.name, p.slug, requester.username, resolver.username
ORDER BY
  tt.created_at DESC
LIMIT $2 OFFSET $3;

-- name: GetToolTicket :one
SELECT
  tt.id,
  tt.post_id,
  tt.requested_by,
  tt.tool_name,
  tt.tool_description,
  tt.tool_website,
  tt.status,
  tt.resolved_tool_id,
  tt.resolved_by,
  tt.resolved_at,
  tt.created_at,
  tt.updated_at,
  p.name AS post_name,
  p.slug AS post_slug,
  requester.username AS requester_username,
  resolver.username AS resolver_username,
  COALESCE(
    json_agg(
      DISTINCT jsonb_build_object(
        'id', c.id,
        'name', c.name
      )
    ) FILTER (WHERE c.id IS NOT NULL),
    '[]'
  ) AS categories
FROM
  tool_tickets tt
JOIN
  posts p ON tt.post_id = p.id
JOIN
  profiles requester ON tt.requested_by = requester.id
LEFT JOIN
  profiles resolver ON tt.resolved_by = resolver.id
LEFT JOIN
  tool_ticket_categories ttc ON tt.id = ttc.ticket_id
LEFT JOIN
  categories c ON ttc.category_id = c.id
WHERE
  tt.id = $1
GROUP BY
  tt.id, p.name, p.slug, requester.username, resolver.username;

-- name: ResolveToolTicketWithExisting :exec
UPDATE tool_tickets
SET
  status = 'resolved',
  resolved_tool_id = $2,
  resolved_by = $3,
  resolved_at = now(),
  updated_at = now()
WHERE id = $1;

-- name: ResolveToolTicketWithNew :exec
UPDATE tool_tickets
SET
  status = 'resolved',
  resolved_tool_id = $2,
  resolved_by = $3,
  resolved_at = now(),
  updated_at = now()
WHERE id = $1;

-- name: RejectToolTicket :exec
UPDATE tool_tickets
SET
  status = 'rejected',
  resolved_by = $2,
  resolved_at = now(),
  updated_at = now()
WHERE id = $1;

-- name: AddPostToolSafe :exec
INSERT INTO post_tools (post_id, tool_id)
VALUES ($1, $2)
ON CONFLICT (post_id, tool_id) DO NOTHING;

-- name: AddToWatchlist :exec
INSERT INTO watchlist_items (profile_id, tool_id)
VALUES ($1, $2)
ON CONFLICT (profile_id, tool_id) DO NOTHING;

-- name: AddToStack :exec
INSERT INTO stack_items (profile_id, tool_id)
VALUES ($1, $2)
ON CONFLICT (profile_id, tool_id) DO NOTHING;

-- name: RemoveFromWatchlist :exec
DELETE FROM watchlist_items 
WHERE profile_id = $1 AND tool_id = $2;

-- name: RemoveFromStack :exec
DELETE FROM stack_items
WHERE profile_id = $1 AND tool_id = $2;

-- name: FollowTool :exec
INSERT INTO tool_follows (profile_id, tool_id)
VALUES ($1, $2)
ON CONFLICT (profile_id, tool_id) DO NOTHING;

-- name: UnfollowTool :exec
DELETE FROM tool_follows
WHERE profile_id = $1 AND tool_id = $2;

-- name: ListUserFollowedTools :many
SELECT
  twd.id, twd.name, twd.description, twd.logo_url, twd.created_at, twd.updated_at, twd.categories, twd.vendor, tf.added_at
FROM tools_with_details twd
JOIN tool_follows tf ON tf.tool_id = twd.id
JOIN profiles p ON p.id = tf.profile_id
WHERE p.username = $1
ORDER BY twd.name;

-- name: ListUserStack :many
SELECT
  twd.id, twd.name, twd.description, twd.logo_url, twd.created_at, twd.updated_at, twd.categories, twd.vendor, si.added_at
FROM tools_with_details twd
JOIN stack_items si ON si.tool_id = twd.id
JOIN profiles p ON p.id = si.profile_id
WHERE p.username = $1
ORDER BY twd.name;

-- name: ListUserWatchlist :many
SELECT
  twd.id, twd.name, twd.description, twd.logo_url, twd.created_at, twd.updated_at, twd.categories, twd.vendor, wi.added_at
FROM tools_with_details twd
JOIN watchlist_items wi ON wi.tool_id = twd.id
JOIN profiles p ON p.id = wi.profile_id
WHERE p.username = $1
ORDER BY twd.name;

-- name: ListUserKeyTools :many
SELECT
  twd.id, twd.name, twd.description, twd.logo_url, twd.created_at, twd.updated_at, twd.categories, twd.vendor
FROM tools_with_details twd
JOIN key_tools kt ON kt.tool_id = twd.id
JOIN profiles p ON p.id = kt.profile_id
WHERE p.username = $1
ORDER BY kt.position;

-- name: RemoveAllKeyTools :exec
DELETE FROM key_tools
WHERE profile_id = $1;

-- name: AddKeyTool :exec
INSERT INTO key_tools (profile_id, tool_id, position)
VALUES ($1, $2, $3)
ON CONFLICT (profile_id, tool_id) DO UPDATE SET position = EXCLUDED.position;

-- name: ListUserKeyPlaybooks :many
SELECT
  pwt.id, pwt.type, pwt.name, pwt.slug, pwt.description, pwt.updated_at, pwt.created_at, pwt.last_draft_update, pwt.last_publish, pwt.author_id, pwt.is_published, pwt.author_username, pwt.tools
FROM posts_with_tools pwt
JOIN key_playbooks kp ON kp.post_id = pwt.id
JOIN profiles p ON p.id = kp.profile_id
WHERE p.username = $1 AND pwt.is_published
ORDER BY kp.position;

-- name: RemoveAllKeyPlaybooks :exec
DELETE FROM key_playbooks
WHERE profile_id = $1;

-- name: AddKeyPlaybook :exec
INSERT INTO key_playbooks (profile_id, post_id, position)
SELECT $1, $2, $3
WHERE EXISTS (SELECT 1 FROM posts WHERE id = $2 AND author_id = $1)
ON CONFLICT (profile_id, post_id) DO UPDATE SET position = EXCLUDED.position;

-- name: AutocompleteCategory :many
SELECT
  id,
  name,
  slug,
  similarity(name, $1) AS rank
FROM
  categories
WHERE
  name % $1 OR name ILIKE $1 || '%'
ORDER BY
  rank DESC, name ASC
LIMIT $2;

-- name: GetTopRecommendedUsers :many
WITH user_embedding AS (
  SELECT embedding FROM profiles WHERE id = $1
)
SELECT
  p.id,
  p.username,
  p.display_name,
  (1 - (user_embedding.embedding <=> p.embedding))::REAL AS cosine_similarity,
  COALESCE(
    (SELECT COUNT(*) 
     FROM posts 
     WHERE author_id = p.id 
     AND is_published = true), 
    0
  )::INTEGER AS post_count
FROM
  profiles p,
  user_embedding
WHERE
  p.id != $1 
  AND p.embedding IS NOT NULL 
  AND user_embedding.embedding IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_follows 
    WHERE follower_id = $1 AND followee_id = p.id
  )
ORDER BY
  cosine_similarity DESC
LIMIT $2;

-- name: GetTopRecommendedTools :many
WITH user_embedding AS (
  SELECT embedding FROM profiles WHERE id = $1
)
SELECT
  twd.*,
  (1 - (user_embedding.embedding <=> t.embedding))::REAL AS cosine_similarity
FROM
  tools_with_details twd
  JOIN tools t ON twd.id = t.id,
  user_embedding
WHERE
  t.embedding IS NOT NULL 
  AND user_embedding.embedding IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM stack_items si
    WHERE si.profile_id = $1 AND si.tool_id = t.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM watchlist_items wi
    WHERE wi.profile_id = $1 AND wi.tool_id = t.id
  )
ORDER BY
  cosine_similarity DESC
LIMIT $2;

-- name: GetTopRecommendedPosts :many
WITH user_embedding AS (
  SELECT embedding FROM profiles WHERE id = $1
)
SELECT
  pwt.*,
  (1 - (user_embedding.embedding <=> p.embedding))::REAL AS cosine_similarity,
  sqlc.arg(is_authenticated)::boolean AND EXISTS(SELECT 1 FROM post_stars ps WHERE ps.post_id = pwt.id AND ps.liker_id = $1) AS is_starred
FROM
  posts_with_tools_and_tickets pwt
  JOIN posts p ON pwt.id = p.id,
  user_embedding
WHERE
  p.embedding IS NOT NULL 
  AND user_embedding.embedding IS NOT NULL
  AND p.is_published = true
  AND p.author_id != $1
  AND NOT EXISTS (
    SELECT 1 FROM post_stars ps 
    WHERE ps.post_id = p.id AND ps.liker_id = $1
  )
ORDER BY
  cosine_similarity DESC
LIMIT $2;

-- name: FollowUser :exec
INSERT INTO user_follows (follower_id, followee_id)
VALUES ($1, $2)
ON CONFLICT (follower_id, followee_id) DO NOTHING;

-- name: UnfollowUser :exec
DELETE FROM user_follows
WHERE follower_id = $1 AND followee_id = $2;

-- name: IsFollowing :one
SELECT EXISTS(
  SELECT 1 FROM user_follows
  WHERE follower_id = $1 AND followee_id = $2
) AS is_following;

-- name: GetUserStats :one
SELECT
  (SELECT COUNT(*) FROM posts WHERE author_id = $1 AND is_published = true)::int AS post_count,
  (SELECT COUNT(*) FROM user_follows WHERE followee_id = $1)::int AS follower_count,
  (SELECT COUNT(*) FROM user_follows WHERE follower_id = $1)::int AS following_count,
  (SELECT COUNT(*) FROM tool_follows WHERE profile_id = $1)::int AS tools_followed_count;

-- name: ListFollowers :many
SELECT
  p.id,
  p.username,
  p.display_name,
  p.bio,
  p.email_hash,
  (sqlc.arg(is_authenticated)::bool AND EXISTS(
    SELECT 1 FROM user_follows uf2
    WHERE uf2.follower_id = sqlc.arg(viewer_id) AND uf2.followee_id = p.id
  )) AS is_following,
  COUNT(*) OVER() AS total_count
FROM user_follows uf
JOIN profiles p ON p.id = uf.follower_id
WHERE uf.followee_id = sqlc.arg(target_id)
ORDER BY p.username
LIMIT sqlc.arg(lim) OFFSET sqlc.arg(off);

-- name: ListFollowing :many
SELECT
  p.id,
  p.username,
  p.display_name,
  p.bio,
  p.email_hash,
  (sqlc.arg(is_authenticated)::bool AND EXISTS(
    SELECT 1 FROM user_follows uf2
    WHERE uf2.follower_id = sqlc.arg(viewer_id) AND uf2.followee_id = p.id
  )) AS is_following,
  COUNT(*) OVER() AS total_count
FROM user_follows uf
JOIN profiles p ON p.id = uf.followee_id
WHERE uf.follower_id = sqlc.arg(target_id)
ORDER BY p.username
LIMIT sqlc.arg(lim) OFFSET sqlc.arg(off);

-- name: CreateNotification :exec
INSERT INTO notifications (recipient_id, actor_id, type, entity_id, entity_type, title, message)
SELECT $1, $2, $3, $4, $5, $6, $7
WHERE NOT EXISTS (
  SELECT 1 FROM notifications 
  WHERE recipient_id = $1 
  AND actor_id = $2 
  AND type = $3 
  AND entity_id = $4
  AND created_at > NOW() - INTERVAL '1 hour'
);

-- name: GetUserNotifications :many
SELECT 
  n.id,
  n.recipient_id,
  n.actor_id,
  n.type,
  n.entity_id,
  n.entity_type,
  n.title,
  n.message,
  n.is_read,
  n.created_at,
  actor.username as actor_username,
  actor.display_name as actor_display_name
FROM notifications n
LEFT JOIN profiles actor ON n.actor_id = actor.id
WHERE n.recipient_id = $1
ORDER BY n.created_at DESC
LIMIT $2 OFFSET $3;

-- name: MarkNotificationRead :exec
UPDATE notifications 
SET is_read = true 
WHERE id = $1 AND recipient_id = $2;

-- name: MarkAllNotificationsRead :exec
UPDATE notifications 
SET is_read = true 
WHERE recipient_id = $1 AND is_read = false;

-- name: GetUnreadNotificationCount :one
SELECT COUNT(*)::INTEGER as count
FROM notifications 
WHERE recipient_id = $1 AND is_read = false;

-- name: DeleteNotification :exec
DELETE FROM notifications 
WHERE id = $1 AND recipient_id = $2;