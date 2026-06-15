-- +goose Up
ALTER TABLE profiles
ADD COLUMN email_hash TEXT;

-- +goose StatementBegin
CREATE FUNCTION update_profile_email_hash() RETURNS trigger AS $$
DECLARE
    user_email TEXT;
BEGIN
    -- Only update if email actually changed
    IF TG_OP = 'UPDATE' AND OLD.email = NEW.email THEN
        RETURN NEW;
    END IF;

    -- Get email from auth.users
    SELECT email INTO user_email
    FROM auth.users
    WHERE id = NEW.id;

    IF user_email IS NOT NULL THEN
        UPDATE public.profiles
        SET email_hash = encode(digest(lower(trim(user_email)), 'sha256'), 'hex')
        WHERE id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION fill_profile_email_hash() RETURNS trigger AS $$
DECLARE
    user_email TEXT;
BEGIN
    -- Get email from auth.users
    SELECT email INTO user_email
    FROM auth.users
    WHERE id = NEW.id;

    IF user_email IS NOT NULL THEN
        NEW.email_hash := encode(digest(lower(trim(user_email)), 'sha256'), 'hex');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- +goose StatementEnd

CREATE TRIGGER update_profile_email_hash_trigger
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION update_profile_email_hash();

CREATE TRIGGER fill_profile_email_hash_trigger
    BEFORE INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION fill_profile_email_hash();

-- +goose Down

DROP TRIGGER IF EXISTS update_profile_email_hash_trigger ON auth.users;
DROP TRIGGER IF EXISTS fill_profile_email_hash_trigger ON public.profiles;

DROP FUNCTION IF EXISTS fill_profile_email_hash();
DROP FUNCTION IF EXISTS update_profile_email_hash();

ALTER TABLE profiles
DROP COLUMN IF EXISTS email_hash;
