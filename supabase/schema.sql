-- Clouded: sync tables, privacy rules and PDF storage.
-- Paste all of this into Supabase → SQL Editor → New query → Run.
-- It's safe to run again; it won't duplicate anything or delete data.

-- ---------------------------------------------------------------------------
-- 1. One table for everything that syncs.
--    Each row is one item: a deadline, error, topic, resource, card's progress,
--    a day's log, or a setting. `kind` says which; `data` holds the item itself.
-- ---------------------------------------------------------------------------
create table if not exists public.items (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('deadline', 'error', 'topic', 'resource', 'card', 'day', 'setting')),
  id         text        not null,
  data       jsonb,
  deleted    boolean     not null default false,  -- deletions are kept as markers so they sync too
  updated_at timestamptz not null,                 -- when you edited it (newest edit wins)
  synced_at  timestamptz not null default now(),   -- when the server received it (for "what's new since")
  primary key (user_id, kind, id)
);

create index if not exists items_user_synced on public.items (user_id, synced_at);

-- The server stamps synced_at itself, so a device's clock can't skip changes.
create or replace function public.items_touch_synced_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.synced_at := now();
  return new;
end;
$$;

drop trigger if exists items_touch_synced_at on public.items;
create trigger items_touch_synced_at
  before insert or update on public.items
  for each row execute function public.items_touch_synced_at();

-- ---------------------------------------------------------------------------
-- 2. Privacy: only the signed-in owner can see or change their rows.
--    Visitors who aren't signed in get nothing.
-- ---------------------------------------------------------------------------
alter table public.items enable row level security;

revoke all on public.items from anon;
grant select, insert, update, delete on public.items to authenticated;

drop policy if exists "items: owner reads"   on public.items;
drop policy if exists "items: owner adds"    on public.items;
drop policy if exists "items: owner edits"   on public.items;
drop policy if exists "items: owner deletes" on public.items;

create policy "items: owner reads"   on public.items for select to authenticated using ((select auth.uid()) = user_id);
create policy "items: owner adds"    on public.items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "items: owner edits"   on public.items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "items: owner deletes" on public.items for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3. A private folder for PDFs (up to 50 MB each).
--    Files are stored as <your user id>/<file id>, and only you can reach yours.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('files', 'files', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "files: owner reads"   on storage.objects;
drop policy if exists "files: owner adds"    on storage.objects;
drop policy if exists "files: owner edits"   on storage.objects;
drop policy if exists "files: owner deletes" on storage.objects;

create policy "files: owner reads" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "files: owner adds" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "files: owner edits" on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "files: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- 4. Keep-alive: a harmless function the scheduled GitHub workflow calls every
--    few days so the free project never pauses. It only returns the time and
--    can't see or change any data.
-- ---------------------------------------------------------------------------
create or replace function public.keepalive()
returns timestamptz
language sql
stable
set search_path = ''
as $$ select now() $$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
