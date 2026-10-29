-- Security audit checks — 2026-10-16
--
-- READ-ONLY. Every statement is a SELECT. Run each block in the PRODUCTION
-- Supabase SQL editor and compare against the "expect" line above it. These
-- cover what the repository cannot show: dashboard-created tables, policies
-- added by hand, and data written before the October validation fixes.


-- A. Accounts whose passwords are committed to the public repo
--    (seed-data.demo.json, seed-data.local.json, create_fake_users.sql).
--    expect: no rows. Any row here can be logged into by anyone who reads GitHub.
select u.id, u.email, p.username, u.created_at, u.last_sign_in_at,
       coalesce(u.encrypted_password, '') <> '' as has_password
from auth.users u
left join public.profiles p on p.id = u.id
where u.email ~ '@(stackhub\.invalid|local\.test|example\.com)$'
   or p.username in ('demo_growth', 'demo_ops', 'alice', 'bob');

--    ...and their live sessions (a session taken now survives a later claim).
select s.user_id, s.created_at, s.updated_at, s.ip, s.user_agent
from auth.sessions s
join auth.users u on u.id = s.user_id
where u.email ~ '@(stackhub\.invalid|local\.test|example\.com)$';


-- B. Row-level security on every public table and view.
--    expect: relrowsecurity = true on every table ('r'), and 0 policies except
--    "Allow auth hook" on profiles. The app never reads tables with the anon
--    key, so any other policy for anon/authenticated is drift to investigate.
select c.relname, c.relkind, c.relrowsecurity,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
order by c.relrowsecurity, c.relname;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by 1, 2;

--    Views must be security_invoker; a materialised view ('m') ignores RLS.
select c.relname, c.relkind, c.reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v', 'm');


-- C. Functions anon / authenticated can call through /rest/v1/rpc.
--    expect: no SECURITY DEFINER (prosecdef = true) function executable by
--    anon or authenticated. custom_access_token_hook currently is — see the
--    fix in the audit notes.
select p.oid::regprocedure as function, p.prosecdef as security_definer, p.proconfig,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
order by p.prosecdef desc, 1;


-- D. account_claims — created in the dashboard, no migration in the repo.
--    expect: RLS on (block B), token is PRIMARY KEY or UNIQUE, expires_at NOT
--    NULL, and no live claim for an account that has already been used.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'account_claims';

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.account_claims'::regclass;

select c.user_id, c.expires_at, c.claimed_at, c.claimed_email is not null as email_submitted,
       u.last_sign_in_at
from public.account_claims c
join auth.users u on u.id = c.user_id
where c.claimed_at is null;


-- E. Storage.
--    expect: no SELECT policy for anon/authenticated on a public bucket (it
--    would let anyone LIST every object), no INSERT/UPDATE/DELETE policy for
--    them at all — uploads go through the Go API with the service key.
select id, public, file_size_limit, allowed_mime_types from storage.buckets;

--    Objects stored before the upload fix with a client-chosen type or name.
--    expect: no rows. Anything here was not uploaded as a plain image.
select bucket_id, name, metadata->>'mimetype' as type, created_at
from storage.objects
where coalesce(metadata->>'mimetype', '') not in
        ('image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/x-icon')
   or name !~* '\.(png|jpe?g|gif|webp|bmp|ico)$';


-- F. Stored links that are not http(s), written before validation existed.
--    expect: no rows. vendors.website matters most: the search page passes it
--    to window.open, where a javascript: value runs as script on stackhub.me.
select 'vendor website' as field, id::text, website as value from vendors where website !~* '^https?://'
union all
select 'vendor linkedin', id::text, linkedin_profile from vendors where linkedin_profile !~* '^https?://'
union all
select 'tool logo', id::text, logo_url from tools where logo_url !~* '^https?://'
union all
select 'ticket website', id::text, tool_website from tool_tickets
 where tool_website <> '' and tool_website !~* '^https?://';


-- G. Usernames the proposed rule ^[a-z0-9_-]{3,30}$ would reject.
--    Run BEFORE adding that rule as a CHECK constraint, which would fail on
--    any existing row listed here. Any row with < > " ' or spaces is also a
--    sign the email-injection finding has already been tried.
select id, username, created_at
from public.profiles
where username !~ '^[a-z0-9_-]{3,30}$';


-- H. Vendor rows shared between tools. A page owner edits the vendor row, so
--    a shared row lets the owner of one tool edit another tool's vendor card.
--    expect: no rows.
select vendor_id, count(*) as tools, array_agg(name) as tool_names
from tools
where vendor_id is not null
group by vendor_id
having count(*) > 1;


-- I. Table grants to the API roles and tables published to Realtime.
--    Grants are normal on Supabase (RLS is what blocks them); this is for
--    reference alongside block B. Realtime: expect no table with private data.
select grantee, table_name, string_agg(privilege_type, ',') as privileges
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by 1, 2
order by 2;

select * from pg_publication_tables where pubname = 'supabase_realtime';
