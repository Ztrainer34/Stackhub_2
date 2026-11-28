-- +goose Up

-- Posts are written in Tiptap, but content_text and draft_content_text were
-- extracted by code written for Editor.js documents (blocks[].data.text). That
-- finds nothing in a Tiptap document, so every post was saved with an empty
-- content_text — and since content_vector is built from it, full-text search
-- has never matched a word in a post's body, only its name and goal.
--
-- The backend now extracts with tiptapPlainText. This fills in the rows saved
-- before that. It does not reproduce tiptapPlainText's paragraph breaks — text
-- nodes are joined with spaces — which is fine for search, and each post gets
-- the exact projection the next time its author saves or publishes it.
--
-- The jsonpath is strict on purpose: in lax mode `.**` also unwraps arrays,
-- which yields every text node more than once. The filter keeps only Tiptap
-- text nodes; on anything that is not an object, `@.type` errors, and a filter
-- treats an error as false.
--
-- Only documents whose root is a Tiptap "doc" are touched, so a row in any
-- other shape keeps whatever content_text it already had.
--
-- posts_content_vector_trigger recomputes content_vector on each UPDATE. No
-- trigger touches updated_at, so the feed's ordering is unaffected.

UPDATE posts
SET content_text = (
    SELECT coalesce(string_agg(t #>> '{}', ' '), '')
    FROM jsonb_path_query(content, 'strict $.**?(@.type == "text").text') AS t
)
WHERE content IS NOT NULL
  AND content->>'type' = 'doc';

UPDATE posts
SET draft_content_text = (
    SELECT coalesce(string_agg(t #>> '{}', ' '), '')
    FROM jsonb_path_query(draft_content, 'strict $.**?(@.type == "text").text') AS t
)
WHERE draft_content IS NOT NULL
  AND draft_content->>'type' = 'doc';

-- +goose Down

-- Nothing to undo. The previous values were empty strings produced by a bug;
-- restoring them would only break search again.
SELECT 1;
