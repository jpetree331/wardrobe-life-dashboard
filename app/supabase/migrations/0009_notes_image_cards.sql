-- Wardrobe — Notes room: image cards (roadmap Sprint 5).
-- Run once in the Supabase SQL Editor (after 0001–0008). Idempotent.
--
-- 1. Extends the notes_cards type CHECK additively with 'image'.
--    Image payload shape (jsonb, canonical):
--      { storagePath, thumbPath?, caption?, naturalW, naturalH }
-- 2. Creates the private notes-media Storage bucket with owner-scoped
--    policies: objects live under <user_id>/<uuid>-… so the first path
--    segment identifies the owner (mirrors the RLS owner-only pattern).
--
-- NOTE: soft-deleting an image card NEVER deletes its storage object —
-- the trash snapshot keeps the path and restore re-links it. Orphaned
-- objects are only removed by the explicit permanent-delete (Sprint 18).

-- ── Card type ──────────────────────────────────────────────────────────
alter table notes_cards drop constraint if exists notes_cards_type_check;
alter table notes_cards add constraint notes_cards_type_check
  check (type in ('note', 'todo', 'heading', 'link', 'document', 'board', 'image'));

-- ── Storage bucket ─────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('notes-media', 'notes-media', false)
on conflict (id) do nothing;

-- ── Storage policies (owner-only by path prefix) ───────────────────────
drop policy if exists notes_media_owner_select on storage.objects;
create policy notes_media_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'notes-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists notes_media_owner_insert on storage.objects;
create policy notes_media_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'notes-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists notes_media_owner_update on storage.objects;
create policy notes_media_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'notes-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists notes_media_owner_delete on storage.objects;
create policy notes_media_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'notes-media' and (storage.foldername(name))[1] = auth.uid()::text);
