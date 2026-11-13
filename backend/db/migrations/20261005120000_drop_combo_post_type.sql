-- +goose Up

-- Three post types was one too many to explain. A "combo" was a playbook about
-- several tools, and the distinction only ever existed so the catalogue could
-- be filtered by it — which filters can do without making every author choose a
-- category before they write anything.
--
-- Combos become playbooks, and a playbook is now about ONE OR MORE tools.
-- Comparisons keep their own type because they genuinely read differently: a
-- comparison weighs tools against each other, a playbook explains how to use
-- them.
--
-- Done now rather than later on purpose — every combo written between now and
-- the decision is another row to migrate and another author to confuse.

-- 1. Reclassify. A combo is already a playbook about several tools, so nothing
--    about the content needs to change.
UPDATE posts SET type = 'playbook' WHERE type = 'combo';

-- 2. Narrow the constraint so nothing can create a combo again. The initial
--    schema named this constraint implicitly, so it is dropped by the name
--    Postgres gave it.
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_type_check;

ALTER TABLE posts
    ADD CONSTRAINT posts_type_check
    CHECK (type IN ('playbook', 'comparison'));

-- +goose Down

-- Widening the constraint is safe; the reclassification is NOT reversible,
-- because once a combo is a playbook there is no record of which playbooks used
-- to be combos. Rolling back leaves them as playbooks about several tools,
-- which is exactly what they are.
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_type_check;

ALTER TABLE posts
    ADD CONSTRAINT posts_type_check
    CHECK (type IN ('playbook', 'combo', 'comparison'));
