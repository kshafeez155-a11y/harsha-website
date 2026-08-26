-- Private storage for the pitch deck required by the startup registration form.
-- The bucket is intentionally not public. The anonymous role may upload only
-- PDF files under the generated intake/ path; only authorized admins may read
-- or delete objects. The bucket limit is enforced by Storage in addition to
-- the browser validation in the startup form.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pitch-decks', 'pitch-decks', false, 10485760, array['application/pdf']::text[])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public startup intake can upload pitch decks"
on storage.objects for insert to anon
with check (
  bucket_id = 'pitch-decks'
  and name ~ '^intake/[0-9a-f-]+\.pdf$'
  and coalesce(metadata ->> 'mimetype', '') = 'application/pdf'
);

create policy "Admins can read pitch decks"
on storage.objects for select to authenticated
using (bucket_id = 'pitch-decks' and (select public.is_admin()));

create policy "Admins can delete pitch decks"
on storage.objects for delete to authenticated
using (bucket_id = 'pitch-decks' and (select public.is_admin()));