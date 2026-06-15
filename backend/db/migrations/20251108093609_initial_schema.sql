-- +goose Up

-- Functions

-- +goose StatementBegin
CREATE FUNCTION calculate_weighted_embedding(user_id uuid) RETURNS extensions.vector
    LANGUAGE plpgsql
    AS $$
DECLARE
    weighted_sum vector(384);
    total_weight FLOAT;
BEGIN
    WITH weighted_interactions AS (
        -- Posts: weight 3.0
        SELECT 
            array(SELECT unnest(t.embedding::real[]) * 3.0)::vector(384) as weighted_embedding,
            3.0 as weight
        FROM post_tools pt
        JOIN posts p ON pt.post_id = p.id
        JOIN tools t ON pt.tool_id = t.id
        WHERE p.author_id = user_id AND t.embedding IS NOT NULL
        
        UNION ALL
        
        -- Stack: weight 2.5
        SELECT 
            array(SELECT unnest(t.embedding::real[]) * 2.5)::vector(384),
            2.5
        FROM stack_items s
        JOIN tools t ON s.tool_id = t.id
        WHERE s.profile_id = user_id AND t.embedding IS NOT NULL
        
        UNION ALL
        
        -- Watchlist: weight 2.0
        SELECT 
            array(SELECT unnest(t.embedding::real[]) * 2.0)::vector(384),
            2.0
        FROM watchlist_items w
        JOIN tools t ON w.tool_id = t.id
        WHERE w.profile_id = user_id AND t.embedding IS NOT NULL
        
        UNION ALL
        
        -- Stars: weight 1.0
        SELECT 
            array(SELECT unnest(t.embedding::real[]) * 1.0)::vector(384),
            1.0
        FROM post_stars ps
        JOIN post_tools pt ON ps.post_id = pt.post_id
        JOIN tools t ON pt.tool_id = t.id
        WHERE ps.liker_id = user_id AND t.embedding IS NOT NULL
    )
    SELECT 
        SUM(weighted_embedding),
        SUM(weight)
    INTO weighted_sum, total_weight
    FROM weighted_interactions;
    
    -- Normalize by total weight
    IF total_weight > 0 AND weighted_sum IS NOT NULL THEN
        RETURN array(SELECT unnest(weighted_sum::real[]) / total_weight)::vector(384);
    END IF;
    
    RETURN NULL;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION custom_access_token_hook(event jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
  declare
    claims jsonb;
    user_onboarded boolean;
  begin
    -- Check if user has a profile (indicates they completed onboarding)
    select exists(select 1 from public.profiles where id = (event->>'user_id')::uuid) into user_onboarded;

    -- Extract current claims
    claims := event->'claims';

    -- Ensure 'app_metadata' exists
    if jsonb_typeof(claims->'app_metadata') is null then
      claims := jsonb_set(claims, '{app_metadata}', '{}');
    end if;

    -- Set the 'onboarded' field to true or false based on database value
    claims := jsonb_set(claims, '{app_metadata, onboarded}', to_jsonb(user_onboarded));

    -- Update the 'claims' object in the original event
    event := jsonb_set(event, '{claims}', claims);

    -- Return the modified event
    return event;
  end;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION recalculate_all_post_embeddings() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  post_record RECORD;
  new_embedding vector(384);
  posts_updated INTEGER := 0;
BEGIN
  -- Start explicit transaction block
  BEGIN
    FOR post_record IN
      SELECT DISTINCT p.id
      FROM posts p
      WHERE EXISTS (
        SELECT 1 FROM post_tools pt WHERE pt.post_id = p.id
      )
    LOOP
      -- Calculate the average embedding of all tools and user for this post
      WITH all_embeddings AS (
        SELECT t.embedding
        FROM post_tools pt
        JOIN tools t ON pt.tool_id = t.id
        WHERE pt.post_id = post_record.id 
          AND t.embedding IS NOT NULL
        
        UNION ALL
        
        SELECT p.embedding
        FROM posts po
        JOIN profiles p ON po.author_id = p.id
        WHERE po.id = post_record.id
          AND p.embedding IS NOT NULL
      )
      SELECT 
        CASE 
          WHEN COUNT(*) > 0 THEN
            AVG(embedding)
          ELSE NULL
        END
      INTO new_embedding
      FROM all_embeddings;
      
      -- Update the post with the recalculated embedding
      UPDATE posts 
      SET embedding = new_embedding, updated_at = now()
      WHERE id = post_record.id;
      
      posts_updated := posts_updated + 1;
    END LOOP;
    
    RAISE NOTICE 'Successfully recalculated embeddings for % posts with associated tools', posts_updated;
    
  EXCEPTION
    WHEN OTHERS THEN
      -- Rollback will happen automatically, just re-raise the error
      RAISE NOTICE 'Error during batch embedding update: %', SQLERRM;
      RAISE;
  END;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION update_content_vector() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.content_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')),         'A') ||
    setweight(to_tsvector('english', coalesce(NEW.name, '')),         'A') ||
    setweight(to_tsvector('english', coalesce(NEW.name, '')),         'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')),  'B') ||
    setweight(to_tsvector('english', coalesce(NEW.content_text, '')), 'C');
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION update_post_embedding_on_tools_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_post_id UUID;
  new_embedding vector(384);
BEGIN
  -- Determine which post to update
  IF TG_OP = 'DELETE' THEN
    target_post_id := OLD.post_id;
  ELSE
    target_post_id := NEW.post_id;
  END IF;
  
  -- Calculate the average embedding of all tools and user associated with this post
  WITH all_embeddings AS (
    SELECT t.embedding
    FROM post_tools pt
    JOIN tools t ON pt.tool_id = t.id
    WHERE pt.post_id = target_post_id 
      AND t.embedding IS NOT NULL
    
    UNION ALL
    
    SELECT p.embedding
    FROM posts po
    JOIN profiles p ON po.author_id = p.id
    WHERE po.id = target_post_id
      AND p.embedding IS NOT NULL
  )
  SELECT 
    CASE 
      WHEN COUNT(*) > 0 THEN
        AVG(embedding)
      ELSE NULL
    END
  INTO new_embedding
  FROM all_embeddings;
  
  -- Update the post with the new embedding
  UPDATE posts 
  SET embedding = new_embedding, updated_at = now()
  WHERE id = target_post_id;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION update_profiles_vector() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.vector :=
    setweight(to_tsvector('simple', coalesce(NEW.username, '')),         'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.username, '')),         'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.username, '')),         'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.display_name, '')),     'B');
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION update_tool_tickets_vector() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.vector :=
    setweight(to_tsvector('simple', coalesce(NEW.tool_name, '')),        'A') ||
    setweight(to_tsvector('english', coalesce(NEW.tool_description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.tool_website, '')),      'C');
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION update_tools_vector() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.vector :=
    setweight(to_tsvector('simple',  coalesce(NEW.name, '')),           'A') ||
    setweight(to_tsvector('simple',  coalesce(NEW.name, '')),           'A') ||
    setweight(to_tsvector('simple',  coalesce(NEW.name, '')),           'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')),    'B');
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION update_user_embeddings() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN
        SELECT DISTINCT p.id
        FROM profiles p
        WHERE EXISTS (
            SELECT 1 FROM posts WHERE author_id = p.id
            AND created_at > COALESCE(p.last_embedding_update, '1970-01-01'::timestamptz)
        )
        OR EXISTS (SELECT 1 FROM stack_items WHERE profile_id = p.id)
        OR EXISTS (SELECT 1 FROM watchlist_items WHERE profile_id = p.id)
        OR EXISTS (
            SELECT 1 FROM post_stars ps WHERE ps.liker_id = p.id
        )
    LOOP
        UPDATE profiles
        SET 
            embedding = calculate_weighted_embedding(user_record.id),
            last_embedding_update = NOW()
        WHERE id = user_record.id;
    END LOOP;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION update_vendors_vector() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.vector :=
    setweight(to_tsvector('simple', coalesce(NEW.name, '')),    'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.name, '')),    'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.name, '')),    'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.website, '')), 'B') ||
    setweight(
      to_tsvector('simple',
        coalesce(NEW.x_profile, '') || ' ' || coalesce(NEW.linkedin_profile, '')
      ),
      'C'
    );
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    vector tsvector,
    embedding vector(384),
    last_embedding_update TIMESTAMPTZ DEFAULT '1970-01-01 00:00:00+00'::TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    website TEXT,
    x_profile TEXT,
    linkedin_profile TEXT,
    head_office TEXT,
    year_of_foundation INTEGER,
    vector tsvector
);

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL
);

CREATE TABLE tools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    logo_url TEXT,
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    vector tsvector,
    embedding vector(384),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK(type IN ('follow', 'post_star', 'post_comment')),
    entity_id UUID,
    entity_type TEXT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type in ('playbook', 'combo', 'comparison')),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    content JSONB,
    content_text TEXT,
    content_vector tsvector,
    draft_content JSONB,
    draft_content_text TEXT,
    is_published BOOLEAN,
    embedding vector(384),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE post_comments(
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    commenter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE post_medias(
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id),
    file_name TEXT NOT NULL,
    s3_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE post_slug_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    old_slug VARCHAR(100) NOT NULL,
    current_slug VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(old_slug)
);

CREATE TABLE post_stars(
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    liker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, liker_id)
);


CREATE TABLE post_tools (
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, tool_id)
);

CREATE TABLE tool_tickets (
    id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4() NOT NULL,
    post_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    tool_name text NOT NULL,
    tool_description text,
    tool_website text,
    status text DEFAULT 'pending'::text NOT NULL,
    resolved_tool_id uuid,
    resolved_by uuid,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    vector tsvector,
    CONSTRAINT tool_tickets_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'resolved'::text, 'rejected'::text])))
);

CREATE TABLE stack_items (
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    PRIMARY KEY (profile_id, tool_id)
);

CREATE TABLE tool_categories (
    tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (tool_id, category_id)
);

CREATE TABLE tool_ticket_categories (
    ticket_id uuid NOT NULL REFERENCES tool_tickets(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (ticket_id, category_id)
);

CREATE TABLE user_follows(
  follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  followee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (follower_id, followee_id)
);

CREATE TABLE watchlist_items (
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    PRIMARY KEY (profile_id, tool_id)
);

-- Views

CREATE VIEW posts_with_tools WITH (security_invoker='on') AS
    SELECT p.id,
        p.type,
        p.name,
        p.slug,
        p.description,
        p.updated_at,
        p.author_id,
        p.is_published,
        u.username AS author_username,
        json_agg(json_build_object('id', t.id, 'name', t.name, 'logo_url', t.logo_url)) AS tools
    FROM (((posts p
        JOIN profiles u ON ((p.author_id = u.id)))
        JOIN post_tools pt ON ((p.id = pt.post_id)))
        JOIN tools t ON ((t.id = pt.tool_id)))
    GROUP BY p.id, u.username, p.type, p.name, p.slug, p.description, p.updated_at, p.author_id, p.is_published;

CREATE VIEW posts_with_tools_and_tickets WITH (security_invoker='on') AS
    SELECT p.id,
        p.type,
        p.name,
        p.slug,
        p.description,
        p.updated_at,
        p.author_id,
        p.is_published,
        u.username AS author_username,
        COALESCE(jsonb_agg(jsonb_build_object('id', combined.id, 'name', combined.name, 'logo_url', combined.logo_url, 'is_ticket', combined.is_ticket)), '[]'::jsonb) AS tools
    FROM ((posts p
        JOIN profiles u ON ((p.author_id = u.id)))
        LEFT JOIN ( SELECT pt.post_id,
                (t.id)::text AS id,
                t.name,
                COALESCE(t.logo_url, ''::text) AS logo_url,
                false AS is_ticket
            FROM (post_tools pt
                JOIN tools t ON ((t.id = pt.tool_id)))
            UNION ALL
            SELECT tt.post_id,
                (tt.id)::text AS id,
                tt.tool_name AS name,
                ''::text AS logo_url,
                true AS is_ticket
            FROM tool_tickets tt
            WHERE (tt.status = 'pending'::text)) combined ON ((combined.post_id = p.id)))
    GROUP BY p.id, u.username, p.type, p.name, p.slug, p.description, p.updated_at, p.author_id, p.is_published;


CREATE VIEW tools_with_details WITH (security_invoker='on') AS
    SELECT t.id,
        t.name,
        t.description,
        t.logo_url,
        t.created_at,
        t.updated_at,
        COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', c.id, 'name', c.name)) FILTER (WHERE (c.id IS NOT NULL)), '[]'::jsonb) AS categories,
        jsonb_build_object('id', v.id, 'website', v.website, 'x_profile', v.x_profile, 'linkedin_profile', v.linkedin_profile, 'head_office', v.head_office, 'year_of_foundation', v.year_of_foundation) AS vendor
    FROM (((tools t
        LEFT JOIN tool_categories tc ON ((t.id = tc.tool_id)))
        LEFT JOIN categories c ON ((tc.category_id = c.id)))
        LEFT JOIN vendors v ON ((t.vendor_id = v.id)))
    GROUP BY t.id, t.name, t.description, t.logo_url, t.created_at, t.updated_at, v.id;

-- Indices

CREATE INDEX idx_categories_name_trgm ON categories USING gin (name gin_trgm_ops);

CREATE INDEX idx_post_slug_history_old_slug ON post_slug_history USING btree (old_slug);

CREATE INDEX idx_post_slug_history_post_id ON post_slug_history USING btree (post_id);

CREATE UNIQUE INDEX idx_posts_author_slug ON posts USING btree (author_id, slug);

CREATE INDEX idx_posts_content_vector ON posts USING gin (content_vector);

CREATE INDEX idx_profiles_embedding_cosine ON profiles USING hnsw (embedding extensions.vector_cosine_ops);

CREATE INDEX idx_profiles_vector ON profiles USING gin (vector);

CREATE INDEX idx_tool_tickets_created_at ON tool_tickets USING btree (created_at DESC);

CREATE INDEX idx_tool_tickets_post_id ON tool_tickets USING btree (post_id);

CREATE INDEX idx_tool_tickets_requested_by ON tool_tickets USING btree (requested_by);

CREATE INDEX idx_tool_tickets_resolved_by ON tool_tickets USING btree (resolved_by);

CREATE INDEX idx_tool_tickets_status ON tool_tickets USING btree (status);

CREATE INDEX idx_tool_tickets_tool_name ON tool_tickets USING btree (tool_name);

CREATE INDEX idx_tool_tickets_vector ON tool_tickets USING gin (vector);

CREATE INDEX idx_tools_vector ON tools USING gin (vector);

CREATE INDEX idx_vendors_vector ON vendors USING gin (vector);

CREATE INDEX trgm_idx ON tools USING gin (name gin_trgm_ops);

-- Triggers

CREATE TRIGGER post_tools_embedding_update_trigger AFTER INSERT OR DELETE OR UPDATE ON post_tools FOR EACH ROW EXECUTE FUNCTION update_post_embedding_on_tools_change();

CREATE TRIGGER posts_content_vector_trigger BEFORE INSERT OR UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION update_content_vector();

CREATE TRIGGER profiles_vector_trigger BEFORE INSERT OR UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_profiles_vector();

CREATE TRIGGER tool_tickets_vector_trigger BEFORE INSERT OR UPDATE ON tool_tickets FOR EACH ROW EXECUTE FUNCTION update_tool_tickets_vector();

CREATE TRIGGER tools_vector_trigger BEFORE INSERT OR UPDATE ON tools FOR EACH ROW EXECUTE FUNCTION update_tools_vector();

CREATE TRIGGER vendors_vector_trigger BEFORE INSERT OR UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION update_vendors_vector();

-- RLS stuff to make supabase happy

CREATE POLICY "Allow auth hook" ON public.profiles FOR SELECT TO supabase_auth_admin USING (true);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;

ALTER TABLE post_medias ENABLE ROW LEVEL SECURITY;

ALTER TABLE post_slug_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE post_stars ENABLE ROW LEVEL SECURITY;

ALTER TABLE post_tools ENABLE ROW LEVEL SECURITY;

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE stack_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE tool_categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE tool_ticket_categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE tool_tickets ENABLE ROW LEVEL SECURITY;

ALTER TABLE tools ENABLE ROW LEVEL SECURITY;

ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;


-- +goose Down

-- Drop RLS policies
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE post_medias DISABLE ROW LEVEL SECURITY;
ALTER TABLE post_slug_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE post_stars DISABLE ROW LEVEL SECURITY;
ALTER TABLE post_tools DISABLE ROW LEVEL SECURITY;
ALTER TABLE posts DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE stack_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE tool_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE tool_ticket_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE tool_tickets DISABLE ROW LEVEL SECURITY;
ALTER TABLE tools DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_follows DISABLE ROW LEVEL SECURITY;
ALTER TABLE vendors DISABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_items DISABLE ROW LEVEL SECURITY;

-- Drop policy
DROP POLICY IF EXISTS "Allow auth hook" ON public.profiles;

-- Drop triggers
DROP TRIGGER IF EXISTS post_tools_embedding_update_trigger ON post_tools;
DROP TRIGGER IF EXISTS posts_content_vector_trigger ON posts;
DROP TRIGGER IF EXISTS profiles_vector_trigger ON profiles;
DROP TRIGGER IF EXISTS tool_tickets_vector_trigger ON tool_tickets;
DROP TRIGGER IF EXISTS tools_vector_trigger ON tools;
DROP TRIGGER IF EXISTS vendors_vector_trigger ON vendors;

-- Drop views
DROP VIEW IF EXISTS tools_with_details;
DROP VIEW IF EXISTS posts_with_tools_and_tickets;
DROP VIEW IF EXISTS posts_with_tools;

-- Drop indexes
DROP INDEX IF EXISTS idx_categories_name_trgm;
DROP INDEX IF EXISTS idx_post_slug_history_old_slug;
DROP INDEX IF EXISTS idx_post_slug_history_post_id;
DROP INDEX IF EXISTS idx_posts_author_slug;
DROP INDEX IF EXISTS idx_posts_content_vector;
DROP INDEX IF EXISTS idx_profiles_embedding_cosine;
DROP INDEX IF EXISTS idx_profiles_vector;
DROP INDEX IF EXISTS idx_tool_tickets_created_at;
DROP INDEX IF EXISTS idx_tool_tickets_post_id;
DROP INDEX IF EXISTS idx_tool_tickets_requested_by;
DROP INDEX IF EXISTS idx_tool_tickets_resolved_by;
DROP INDEX IF EXISTS idx_tool_tickets_status;
DROP INDEX IF EXISTS idx_tool_tickets_tool_name;
DROP INDEX IF EXISTS idx_tool_tickets_vector;
DROP INDEX IF EXISTS idx_tools_vector;
DROP INDEX IF EXISTS idx_vendors_vector;
DROP INDEX IF EXISTS trgm_idx;

-- Drop tables (order matters due to foreign keys)
DROP TABLE IF EXISTS watchlist_items;
DROP TABLE IF EXISTS user_follows;
DROP TABLE IF EXISTS tool_ticket_categories;
DROP TABLE IF EXISTS tool_categories;
DROP TABLE IF EXISTS stack_items;
DROP TABLE IF EXISTS tool_tickets;
DROP TABLE IF EXISTS post_tools;
DROP TABLE IF EXISTS post_stars;
DROP TABLE IF EXISTS post_slug_history;
DROP TABLE IF EXISTS post_medias;
DROP TABLE IF EXISTS post_comments;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS tools;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS profiles;
DROP TABLE IF EXISTS vendors;

-- Drop functions
DROP FUNCTION IF EXISTS update_vendors_vector();
DROP FUNCTION IF EXISTS update_user_embeddings();
DROP FUNCTION IF EXISTS update_tools_vector();
DROP FUNCTION IF EXISTS update_tool_tickets_vector();
DROP FUNCTION IF EXISTS update_profiles_vector();
DROP FUNCTION IF EXISTS update_post_embedding_on_tools_change();
DROP FUNCTION IF EXISTS update_content_vector();
DROP FUNCTION IF EXISTS recalculate_all_post_embeddings();
DROP FUNCTION IF EXISTS custom_access_token_hook(jsonb);
DROP FUNCTION IF EXISTS calculate_weighted_embedding(uuid);
