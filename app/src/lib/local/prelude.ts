// Local-mode (desktop) database prelude — the Supabase-shaped shims that let
// the app's REAL migrations (supabase/migrations/0001–0014) run unchanged
// against an embedded PGlite Postgres. Nothing here is loaded by the cloud
// build; the cloud path never imports this module.
//
// What the migrations expect from a Supabase project:
//   • roles `anon` / `authenticated` / `service_role` (policy targets)
//   • schema `auth` with an auth.users table and an auth.uid() function
//   • schema `storage` with buckets/objects tables + storage.foldername()
// We recreate exactly those, plus:
//   • the single fixed local user (there are no accounts in desktop mode)
//   • a `local_files` table holding uploaded media bytes (the storage shim)
//   • a `local_migrations` ledger so each migration runs once
//
// RLS note: policies are CREATED faithfully by the migrations, but PGlite
// executes as the database owner, so they are not enforced — which is
// correct for a single-user local app (there is exactly one user, and
// every row is theirs).

/** The one local user. Fixed so data written across sessions always joins. */
export const LOCAL_USER_ID = '00000000-0000-4000-8000-000000000001';
export const LOCAL_USER_EMAIL = 'you@this-computer';

export const PRELUDE_SQL = `
-- Roles referenced by "to authenticated" etc. in policies.
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$$;

-- auth schema: the users table the app tables FK onto, and auth.uid().
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid
language sql stable
as $fn$ select '${LOCAL_USER_ID}'::uuid $fn$;

-- Seed the single local user (id must exist before app rows FK to it).
insert into auth.users (id, email)
values ('${LOCAL_USER_ID}', '${LOCAL_USER_EMAIL}')
on conflict (id) do nothing;

-- storage schema: enough shape for migration 0009's bucket + policies.
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamptz not null default now()
);
create or replace function storage.foldername(name text) returns text[]
language sql immutable
as $fn$
  select (string_to_array(name, '/'))[1 : greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)]
$fn$;

-- Media bytes for the storage shim (images / file attachments live here,
-- inside the same single database file as everything else).
create table if not exists local_files (
  path text primary key,
  bucket text not null,
  mime text,
  bytes bytea not null,
  created_at timestamptz not null default now()
);

-- Migration ledger: the real migrations are idempotent, but running each
-- exactly once is faster and safer across app launches.
create table if not exists local_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
`;
