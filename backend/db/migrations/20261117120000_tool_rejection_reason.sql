-- +goose Up

-- Rejecting a tool suggestion now needs a reason, which is stored on the ticket
-- (admin-only: no requester or public query reads it) and sent to the requester
-- in a new "tool_rejected" notification and email. Safe to run twice.
--
-- PASTE ONLY THIS UP SECTION into the Supabase SQL editor. The Down section at
-- the bottom is plain SQL: pasted, it runs and drops the column.
ALTER TABLE tool_tickets ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Allow the new "tool_rejected" notification type.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('follow', 'post_star', 'post_comment', 'tool_approved', 'tool_rejected'));

-- +goose Down

DELETE FROM notifications WHERE type = 'tool_rejected';
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('follow', 'post_star', 'post_comment', 'tool_approved'));
ALTER TABLE tool_tickets DROP COLUMN IF EXISTS rejection_reason;
