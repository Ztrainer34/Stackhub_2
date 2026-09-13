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
  avatar_url,
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
  avatar_url,
  created_at,
  updated_at
FROM
  profiles
WHERE
  username = $1;

-- name: GetProfileWithUsernameAuthenticated :one
-- Same as GetProfileWithUsername plus whether the viewer already follows this
-- profile, so the profile page's Follow button renders in the right state on
-- the first paint instead of always starting at "Follow".
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
  avatar_url,
  created_at,
  updated_at,
  EXISTS(
    SELECT 1 FROM user_follows uf
    WHERE uf.follower_id = $2 AND uf.followee_id = profiles.id
  ) AS is_following
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
-- Uses posts_with_tools_and_tickets (LEFT JOIN) so posts whose only tool is a
-- still-pending ticket are included. posts_with_tools INNER-JOINs post_tools and
-- would drop them entirely.
SELECT
  *,
  COUNT(*) OVER() AS total_count
FROM posts_with_tools_and_tickets
WHERE
  author_username = $1
  AND author_id = sqlc.arg(authenticated_id)
  AND (sqlc.arg(use_post_filter)::boolean = false OR type = sqlc.arg(post_filter))
  AND (
    sqlc.arg(approval_status)::text = 'all'
    OR
    (sqlc.arg(approval_status)::text = 'waiting'
      AND EXISTS (SELECT 1 FROM tool_tickets tt WHERE tt.post_id = posts_with_tools_and_tickets.id AND tt.status = 'pending'))
    OR
    (sqlc.arg(approval_status)::text = 'rejected'
      AND EXISTS (SELECT 1 FROM tool_tickets tt WHERE tt.post_id = posts_with_tools_and_tickets.id AND tt.status = 'rejected')
      AND NOT EXISTS (SELECT 1 FROM tool_tickets tt WHERE tt.post_id = posts_with_tools_and_tickets.id AND tt.status = 'pending'))
  )
ORDER BY updated_at DESC
LIMIT $2 OFFSET $3;

-- name: GetUserPostCounts :one
-- Owner-only counts for the profile status filters. Each category is mutually
-- exclusive: waiting = has a pending ticket; rejected = has a rejected ticket
-- and no pending; published/drafts = neither, split by publish state.
SELECT
  COUNT(*) FILTER (WHERE NOT sub.has_pending AND NOT sub.has_rejected AND sub.is_published)::int AS published,
  COUNT(*) FILTER (WHERE NOT sub.has_pending AND NOT sub.has_rejected AND NOT sub.is_published)::int AS drafts,
  COUNT(*) FILTER (WHERE sub.has_pending)::int AS waiting,
  COUNT(*) FILTER (WHERE sub.has_rejected AND NOT sub.has_pending)::int AS rejected
FROM (
  SELECT
    COALESCE(p.is_published, false) AS is_published,
    EXISTS (SELECT 1 FROM tool_tickets tt WHERE tt.post_id = p.id AND tt.status = 'pending') AS has_pending,
    EXISTS (SELECT 1 FROM tool_tickets tt WHERE tt.post_id = p.id AND tt.status = 'rejected') AS has_rejected
  FROM posts p
  WHERE p.author_id = sqlc.arg(author_id)
    AND (sqlc.arg(use_post_filter)::boolean = false OR p.type = sqlc.arg(post_filter))
) sub;

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

-- name: GetToolIDBySlug :one
-- Resolves a URL slug back to a tool id. The slug is the tool name lowercased
-- with every run of non-alphanumeric characters collapsed to '-'. Must stay in
-- sync with toolSlug() on the frontend.
SELECT id FROM tools
WHERE btrim(lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')), '-') = $1
LIMIT 1;

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
  p.email_hash,
  p.avatar_url,
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
SELECT
  twd.*,
  EXISTS(SELECT 1 FROM tool_owners tow WHERE tow.tool_id = twd.id) AS is_claimed
FROM tools_with_details twd
WHERE id = $1;

-- name: GetToolAuthenticated :one
SELECT
  *,
  -- User status
  EXISTS(SELECT 1 FROM stack_items si WHERE si.profile_id = $2 AND si.tool_id = twd.id) AS is_in_stack,
  EXISTS(SELECT 1 FROM watchlist_items wi WHERE wi.profile_id = $2 AND wi.tool_id = twd.id) AS is_in_watchlist,
  EXISTS(SELECT 1 FROM old_stack_items oi WHERE oi.profile_id = $2 AND oi.tool_id = twd.id) AS is_in_old_stack,
  EXISTS(SELECT 1 FROM tool_follows tf WHERE tf.profile_id = $2 AND tf.tool_id = twd.id) AS is_followed,
  -- Page ownership: is_owner unlocks the inline editors, is_claimed hides the
  -- "Claim this page" call to action once somebody has taken the page over.
  EXISTS(SELECT 1 FROM tool_owners tow WHERE tow.profile_id = $2 AND tow.tool_id = twd.id) AS is_owner,
  EXISTS(SELECT 1 FROM tool_owners tow2 WHERE tow2.tool_id = twd.id) AS is_claimed
FROM tools_with_details twd
WHERE id = $1;

-- name: GetTopPosts :many
SELECT *
FROM posts_with_tools
WHERE is_published
ORDER BY updated_at DESC
LIMIT $1;

-- name: ListPublishedPosts :many
-- Public browse listing: published posts, optionally filtered by type and a
-- name/description search, with a selectable sort. Posts whose tool is still
-- pending (or was rejected) stay hidden, same as the profile listings.
SELECT
  pwt.*,
  COUNT(*) OVER() AS total_count
FROM posts_with_tools pwt
WHERE pwt.is_published
  AND (sqlc.arg(use_type_filter)::boolean = false OR pwt.type = sqlc.arg(type_filter))
  AND (
    sqlc.arg(search)::text = ''
    OR pwt.name ILIKE '%' || sqlc.arg(search)::text || '%'
    OR pwt.description ILIKE '%' || sqlc.arg(search)::text || '%'
  )
  AND (
    sqlc.arg(use_tool_filter)::boolean = false
    OR EXISTS (
      SELECT 1 FROM post_tools pt
      WHERE pt.post_id = pwt.id AND pt.tool_id = sqlc.arg(tool_filter)
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM tool_tickets tt
    WHERE tt.post_id = pwt.id AND tt.status IN ('pending', 'rejected')
  )
ORDER BY
  CASE WHEN sqlc.arg(sort)::text = 'name' THEN pwt.name END ASC,
  CASE WHEN sqlc.arg(sort)::text = 'created' THEN pwt.created_at END DESC,
  CASE WHEN sqlc.arg(sort)::text = 'stars'
    THEN (SELECT COUNT(*) FROM post_stars ps WHERE ps.post_id = pwt.id) END DESC,
  pwt.updated_at DESC
LIMIT $1 OFFSET $2;

-- name: GetPublishedPostToolFacets :many
-- Tools used across published posts, with how many posts use each — the "Tools"
-- facet on the /playbooks browse page.
SELECT
  t.id,
  t.name,
  COALESCE(t.logo_url, '') AS logo_url,
  COUNT(DISTINCT pt.post_id)::int AS post_count
FROM tools t
JOIN post_tools pt ON pt.tool_id = t.id
JOIN posts p ON p.id = pt.post_id
WHERE p.is_published
  AND NOT EXISTS (
    SELECT 1 FROM tool_tickets tt
    WHERE tt.post_id = p.id AND tt.status IN ('pending', 'rejected')
  )
GROUP BY t.id, t.name, t.logo_url
ORDER BY post_count DESC, t.name ASC
LIMIT $1;

-- name: GetPublishedPostTypeCounts :one
SELECT
  COUNT(*)::int AS all_count,
  COUNT(*) FILTER (WHERE p.type = 'playbook')::int AS playbook_count,
  COUNT(*) FILTER (WHERE p.type = 'combo')::int AS combo_count,
  COUNT(*) FILTER (WHERE p.type = 'comparison')::int AS comparison_count
FROM posts p
WHERE p.is_published
  AND NOT EXISTS (
    SELECT 1 FROM tool_tickets tt
    WHERE tt.post_id = p.id AND tt.status IN ('pending', 'rejected')
  );

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

-- name: ListTools :many
-- Public browse listing for /tools: all tools, optional name/description search
-- and category (slug) filter, with a selectable sort.
SELECT
  twd.id, twd.name, twd.description, twd.logo_url, twd.created_at, twd.updated_at, twd.categories, twd.vendor,
  COUNT(*) OVER() AS total_count
FROM tools_with_details twd
WHERE (
    sqlc.arg(search)::text = ''
    OR twd.name ILIKE '%' || sqlc.arg(search)::text || '%'
    OR twd.description ILIKE '%' || sqlc.arg(search)::text || '%'
  )
  AND (
    sqlc.arg(category_slug)::text = ''
    OR EXISTS (
      SELECT 1 FROM tool_categories tc
      JOIN categories c ON tc.category_id = c.id
      WHERE tc.tool_id = twd.id AND c.slug = sqlc.arg(category_slug)::text
    )
  )
ORDER BY
  CASE WHEN sqlc.arg(sort)::text = 'newest' THEN twd.created_at END DESC,
  CASE WHEN sqlc.arg(sort)::text = 'updated' THEN twd.updated_at END DESC,
  twd.name ASC
LIMIT $1 OFFSET $2;

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

-- name: CreateStandaloneToolTicket :one
-- A tool suggestion not tied to any playbook (from the /tools "Add tool" flow).
INSERT INTO tool_tickets (
  post_id, requested_by, tool_name, tool_description, tool_website
) VALUES (
  NULL, $1, $2, $3, $4
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
LEFT JOIN
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
LEFT JOIN
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

-- name: AddToOldStack :exec
INSERT INTO old_stack_items (profile_id, tool_id)
VALUES ($1, $2)
ON CONFLICT (profile_id, tool_id) DO NOTHING;

-- name: RemoveFromOldStack :exec
DELETE FROM old_stack_items
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

-- name: ListUserOldStack :many
SELECT
  twd.id, twd.name, twd.description, twd.logo_url, twd.created_at, twd.updated_at, twd.categories, twd.vendor, oi.added_at
FROM tools_with_details twd
JOIN old_stack_items oi ON oi.tool_id = twd.id
JOIN profiles p ON p.id = oi.profile_id
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
  p.avatar_url,
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
  p.avatar_url,
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

-- name: CreateNotification :execrows
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

-- name: GetUserEmail :one
SELECT email::text FROM auth.users WHERE id = $1;

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
-- name: GetUserFeed :many
-- Activity feed: playbooks from people and tools you follow, plus the follow
-- actions of people you follow. "latest" rows keep the feed useful before the
-- viewer follows anything. Events are deduped so a post that matches several
-- reasons appears once, keeping the strongest reason.
WITH followed_users AS (
  SELECT followee_id FROM user_follows WHERE follower_id = sqlc.arg(viewer_id)
), followed_tools AS (
  SELECT tool_id FROM tool_follows WHERE profile_id = sqlc.arg(viewer_id)
), events AS (
  -- A playbook published by someone the viewer follows.
  SELECT 'post'::text AS kind, 'following_user'::text AS reason, p.last_publish AS occurred_at,
         p.author_id AS actor_id, p.id AS post_id, NULL::uuid AS tool_id, NULL::uuid AS target_user_id
  FROM posts p
  WHERE p.is_published AND p.last_publish IS NOT NULL
    AND p.author_id IN (SELECT followee_id FROM followed_users)

  UNION ALL
  -- A playbook about a tool the viewer follows.
  SELECT 'post', 'following_tool', p.last_publish, p.author_id, p.id, pt.tool_id, NULL::uuid
  FROM posts p
  JOIN post_tools pt ON pt.post_id = p.id
  WHERE p.is_published AND p.last_publish IS NOT NULL
    AND pt.tool_id IN (SELECT tool_id FROM followed_tools)

  UNION ALL
  -- Someone the viewer follows started following a tool.
  SELECT 'tool_follow', 'following_user', tf.added_at, tf.profile_id, NULL::uuid, tf.tool_id, NULL::uuid
  FROM tool_follows tf
  WHERE tf.profile_id IN (SELECT followee_id FROM followed_users)

  UNION ALL
  -- Someone the viewer follows started following another user.
  SELECT 'user_follow', 'following_user', uf.created_at, uf.follower_id, NULL::uuid, NULL::uuid, uf.followee_id
  FROM user_follows uf
  WHERE uf.follower_id IN (SELECT followee_id FROM followed_users)
    AND uf.followee_id <> sqlc.arg(viewer_id)

  UNION ALL
  -- Recently published playbooks, so a new account still sees a feed.
  SELECT 'post', 'latest', p.last_publish, p.author_id, p.id, NULL::uuid, NULL::uuid
  FROM posts p
  WHERE p.is_published AND p.last_publish IS NOT NULL
), ranked AS (
  SELECT e.*, ROW_NUMBER() OVER (
      PARTITION BY e.kind,
        COALESCE(e.post_id::text,
                 e.actor_id::text || ':' || e.tool_id::text,
                 e.actor_id::text || ':' || e.target_user_id::text)
      ORDER BY CASE e.reason WHEN 'following_user' THEN 0 WHEN 'following_tool' THEN 1 ELSE 2 END
    ) AS rn
  FROM events e
)
SELECT
  r.kind, r.reason, r.occurred_at,
  r.actor_id, actor.username AS actor_username,
  r.post_id, p.name AS post_name, p.slug AS post_slug, p.type AS post_type, p.description AS post_description,
  r.tool_id, t.name AS tool_name, t.logo_url AS tool_logo_url,
  r.target_user_id, tu.username AS target_username,
  COUNT(*) OVER() AS total_count
FROM ranked r
JOIN profiles actor ON actor.id = r.actor_id
LEFT JOIN posts p ON p.id = r.post_id
LEFT JOIN tools t ON t.id = r.tool_id
LEFT JOIN profiles tu ON tu.id = r.target_user_id
WHERE r.rn = 1
  AND (r.kind = 'post' OR r.actor_id <> sqlc.arg(viewer_id))
ORDER BY r.occurred_at DESC
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: SetProfileAvatar :exec
-- Pass NULL to clear the uploaded picture and fall back to Gravatar.
UPDATE profiles
SET avatar_url = sqlc.narg(avatar_url), updated_at = now()
WHERE id = $1;

-- name: SetProfileFocusAreas :exec
-- Stores the GTM focus areas picked during onboarding and marks the multi-step
-- flow as finished so it is not shown again.
UPDATE profiles
SET focus_areas = sqlc.arg(focus_areas)::text[],
    onboarding_completed_at = now(),
    updated_at = now()
WHERE id = sqlc.arg(profile_id);

-- name: GetToolsByNames :many
-- Resolves a fixed list of catalog names (the onboarding "popular tools" grid)
-- to real tools, so the tiles can show the stored logo.
SELECT id, name, logo_url
FROM tools
WHERE lower(name) = ANY(sqlc.arg(names)::text[])
ORDER BY name;

-- name: GetToolsByCategoryKeywords :many
-- Loose match of tools whose categories look like one of the chosen onboarding
-- focus areas. Requires a logo so every onboarding tile renders properly.
SELECT DISTINCT t.id, t.name, t.logo_url
FROM tools t
JOIN tool_categories tc ON tc.tool_id = t.id
JOIN categories c ON c.id = tc.category_id
WHERE c.name ILIKE ANY(sqlc.arg(patterns)::text[])
  AND t.logo_url IS NOT NULL
  AND t.logo_url <> ''
ORDER BY t.name
LIMIT sqlc.arg(lim);

-- name: IsToolOwner :one
-- Gate for every tool-page edit. Ownership is granted out of band (see
-- scripts/grant-tool-owner.mjs), never through the API.
SELECT EXISTS(
  SELECT 1 FROM tool_owners WHERE tool_id = $1 AND profile_id = $2
) AS is_owner;

-- name: ListToolOwners :many
SELECT p.id, p.username, p.display_name, p.avatar_url, tow.granted_at
FROM tool_owners tow
JOIN profiles p ON p.id = tow.profile_id
WHERE tow.tool_id = $1
ORDER BY tow.granted_at;

-- name: ListOwnedTools :many
SELECT t.id, t.name, t.logo_url
FROM tool_owners tow
JOIN tools t ON t.id = tow.tool_id
WHERE tow.profile_id = $1
ORDER BY t.name;

-- name: UpdateToolPageContent :exec
-- Partial update: a NULL argument leaves the stored value alone, so each of the
-- page's edit icons can save just its own field.
UPDATE tools
SET description      = COALESCE($2, description),
    description_rich = COALESCE($3, description_rich),
    logo_url         = COALESCE($4, logo_url),
    updated_at       = now()
WHERE id = $1;

-- name: GetToolVendorID :one
SELECT vendor_id FROM tools WHERE id = $1;

-- name: CreateVendorForTool :one
-- Tools imported without vendor details have no vendors row at all; the owner
-- filling in the vendor card is what creates one.
INSERT INTO vendors (name)
SELECT name FROM tools WHERE id = $1
RETURNING id;

-- name: SetToolVendor :exec
UPDATE tools SET vendor_id = $2, updated_at = now() WHERE id = $1;

-- name: UpdateVendorDetails :exec
-- The vendor card is edited as one form, so blanks are written through —
-- clearing a field the owner emptied is the point.
UPDATE vendors
SET website            = $2,
    x_profile          = $3,
    linkedin_profile   = $4,
    head_office        = $5,
    year_of_foundation = $6
WHERE id = $1;

-- name: DeleteToolCategories :exec
DELETE FROM tool_categories WHERE tool_id = $1;

-- name: AddToolCategories :exec
INSERT INTO tool_categories (tool_id, category_id)
SELECT $1, unnest($2::int[])
ON CONFLICT DO NOTHING;
