-- +goose Up

-- Allow the new "tool_approved" notification type (sent when an admin resolves
-- a user's tool ticket).
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('follow', 'post_star', 'post_comment', 'tool_approved'));

-- +goose Down

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('follow', 'post_star', 'post_comment'));
