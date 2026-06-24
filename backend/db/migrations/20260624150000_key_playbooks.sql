-- +goose Up

CREATE TABLE key_playbooks (
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (profile_id, post_id)
);

-- +goose Down

DROP TABLE IF EXISTS key_playbooks;
