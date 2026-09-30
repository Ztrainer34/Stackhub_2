-- Backfill for the auto-follow rules (Sept 2026).
--
-- The handlers apply these rules from now on, but existing rows predate them:
-- people who saved a tool for later are not following it, and people who
-- archived one still are. This reconciles what is already in the database with
-- what the handlers would have done.
--
-- Rules, matching addToStack / addToWatchlist / addToOldStack:
--   stack      -> followed
--   watchlist  -> followed
--   old stack  -> NOT followed
--
-- Idempotent: safe to run more than once.
--
-- Run the SELECT at the bottom FIRST to see what will change, then the
-- statements above it.

BEGIN;

-- 1. Follow every tool sitting in someone's active stack.
--    (Should already hold from the earlier auto-follow backfill; included so
--    this script alone is sufficient on a fresh database.)
INSERT INTO tool_follows (profile_id, tool_id)
SELECT si.profile_id, si.tool_id
FROM stack_items si
ON CONFLICT (profile_id, tool_id) DO NOTHING;

-- 2. Follow every tool sitting in someone's watchlist.
INSERT INTO tool_follows (profile_id, tool_id)
SELECT wi.profile_id, wi.tool_id
FROM watchlist_items wi
ON CONFLICT (profile_id, tool_id) DO NOTHING;

-- 3. Unfollow every tool sitting in someone's old stack.
--    A tool lives in at most one list, so this cannot fight steps 1 and 2.
DELETE FROM tool_follows tf
USING old_stack_items oi
WHERE tf.profile_id = oi.profile_id
  AND tf.tool_id = oi.tool_id;

COMMIT;

-- Verification — all three counts must be 0 afterwards.
SELECT
  (SELECT count(*) FROM stack_items si
     WHERE NOT EXISTS (SELECT 1 FROM tool_follows tf
                       WHERE tf.profile_id = si.profile_id AND tf.tool_id = si.tool_id))
    AS stack_tools_not_followed,
  (SELECT count(*) FROM watchlist_items wi
     WHERE NOT EXISTS (SELECT 1 FROM tool_follows tf
                       WHERE tf.profile_id = wi.profile_id AND tf.tool_id = wi.tool_id))
    AS watchlist_tools_not_followed,
  (SELECT count(*) FROM old_stack_items oi
     WHERE EXISTS (SELECT 1 FROM tool_follows tf
                   WHERE tf.profile_id = oi.profile_id AND tf.tool_id = oi.tool_id))
    AS archived_tools_still_followed;
