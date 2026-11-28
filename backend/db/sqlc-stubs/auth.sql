-- Read by sqlc only. NEVER applied to any database.
--
-- Supabase owns the real `auth` schema, so no migration of ours creates it, and
-- sqlc builds its catalog from db/migrations alone. Without this, any query that
-- touches auth.users fails to generate with `schema "auth" does not exist`.
--
-- Declare only the columns our queries actually read. This file lives outside
-- db/migrations on purpose: backend/db/build-schema.mjs concatenates that folder
-- into the baseline, and this must never reach a real database.
CREATE SCHEMA auth;

CREATE TABLE auth.users (
    id    uuid PRIMARY KEY,
    email varchar(255)
);
