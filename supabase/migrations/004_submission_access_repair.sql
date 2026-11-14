-- Repair submission access and pitch-deck storage on an existing Hanova schema.
-- Re-running this migration is safe: only policy names owned by 002/003/004 are
-- replaced. Existing rows, tables, and unrelated policies are preserved.
begin;

do $$
declare
  table_name text;
  missing_tables text[] := array[]::text[];
begin
  foreach table_name in array array[
    'contact_submissions', 'startup_registrations', 'community_join_applications',
    'chapter_applications', 'event_registrations', 'meeting_registrations',
    'founder_connection_requests', 'partner_applications', 'pitch_deck_submissions'
  ] loop
    if to_regclass(format('public.%I', table_name)) is null then
      missing_tables := array_append(missing_tables, 'public.' || table_name);
    end if;
  end loop;

  if cardinality(missing_tables) > 0 then
    raise exception 'Hanova repair requires existing submission tables. Missing: %. Apply 001_initial_schema.sql to a fresh project, or reconcile its existing schema first.',
      array_to_string(missing_tables, ', ');
  end if;

  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception 'Hanova repair requires Supabase Storage (storage.buckets and storage.objects). Enable Storage in the intended Supabase project first.';
  end if;
end;
$$;

-- The JWT claim must be assigned by a trusted operator through auth.users or
-- the Auth admin API. Browser-editable user_metadata never authorizes access.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin';
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant usage on schema public to anon, authenticated;

do $$
declare
  table_name text;
  policy_suffix text;
  public_insert_policy text;
  insert_columns text;
  all_columns text;
  command_name text;
  policy_verb text;
  policy_name text;
begin
  for table_name, policy_suffix, public_insert_policy, insert_columns in
    select * from (values
      ('contact_submissions', 'contact submissions', 'Allow public contact submissions', 'contact_name, contact_phone, contact_email, message'),
      ('startup_registrations', 'startup registrations', 'Allow public startup registrations', 'startup_name, founder_name, problem, solution, startup_stage, website, linkedin, phone, email, pitch_deck_path, consent_given'),
      ('community_join_applications', 'community applications', 'Allow public community applications', 'name, phone, email, city, district, college_or_company, profession, startup_stage, startup_name, consent_given'),
      ('chapter_applications', 'chapter applications', 'Allow public chapter applications', 'name, phone, email, city, district, profession, organization, linkedin, entrepreneurship_experience, weekly_commitment, motivation, city_ecosystem, first_meetup_plan, community_reach, consent_given'),
      ('event_registrations', 'event registrations', 'Allow public event registrations', 'name, phone, email, city, purpose, consent_given'),
      ('meeting_registrations', 'meeting registrations', 'Allow public meeting registrations', 'name, phone, email, city, role, purpose, consent_given'),
      ('founder_connection_requests', 'founder connection requests', 'Allow public founder connection requests', 'name, phone, email, city, startup_name, founder, startup_stage, meeting_purpose, context, desired_outcome, preferred_date, preferred_time, consent_given'),
      ('partner_applications', 'partner applications', 'Allow public partner applications', 'name, email, phone, organization, location, website, organization_type, partnership_interest, contribution, goal, community_reach, ecosystem_experience, consent_given'),
      ('pitch_deck_submissions', 'pitch deck submissions', 'Allow public pitch deck submissions', 'founder_name, startup_name, email, phone, startup_stage, industry, pitch_deck_path, description')
    ) as submission_tables(table_name, policy_suffix, public_insert_policy, insert_columns)
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon', table_name);

    -- Remove old column-level INSERT grants too before restoring form fields.
    select string_agg(format('%I', attribute.attname), ', ' order by attribute.attnum)
      into all_columns
      from pg_attribute as attribute
      where attribute.attrelid = to_regclass(format('public.%I', table_name))
        and attribute.attnum > 0 and not attribute.attisdropped;
    execute format('revoke insert (%s) on table public.%I from public, anon', all_columns, table_name);
    execute format('grant insert (%s) on table public.%I to anon', insert_columns, table_name);
    execute format('grant select, update, delete on table public.%I to authenticated', table_name);

    execute format('drop policy if exists %I on public.%I', public_insert_policy, table_name);
    execute format('create policy %I on public.%I for insert to anon with check (true)', public_insert_policy, table_name);

    -- A restrictive guard prevents an older permissive policy from exposing
    -- records anonymously. INSERT still uses its explicit column grants above.
    execute format('drop policy if exists %I on public.%I', 'Hanova anonymous submission guard', table_name);
    execute format('create policy %I on public.%I as restrictive for all to anon using (false) with check (true)',
      'Hanova anonymous submission guard', table_name);

    for command_name, policy_verb in
      select * from (values ('select', 'read'), ('update', 'update'), ('delete', 'delete')) as commands(command_name, policy_verb)
    loop
      policy_name := 'Admins can ' || policy_verb || ' ' || policy_suffix;
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
      execute format('create policy %I on public.%I for %s to authenticated using ((select public.is_admin()))%s',
        policy_name, table_name, command_name,
        case when command_name = 'update' then ' with check ((select public.is_admin()))' else '' end);

      -- Keep unknown policies, but require the server-controlled role even if
      -- one of those policies would otherwise permit a regular signed-in user.
      policy_name := 'Hanova admin ' || command_name || ' guard';
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
      execute format('create policy %I on public.%I as restrictive for %s to authenticated using ((select public.is_admin()))%s',
        policy_name, table_name, command_name,
        case when command_name = 'update' then ' with check ((select public.is_admin()))' else '' end);
    end loop;
  end loop;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pitch-decks', 'pitch-decks', false, 10485760, array['application/pdf']::text[])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public startup intake can upload pitch decks" on storage.objects;
create policy "Public startup intake can upload pitch decks"
on storage.objects for insert to anon
with check (
  bucket_id = 'pitch-decks'
  and name ~ '^intake/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
);

drop policy if exists "Admins can read pitch decks" on storage.objects;
create policy "Admins can read pitch decks"
on storage.objects for select to authenticated
using (bucket_id = 'pitch-decks' and (select public.is_admin()));

drop policy if exists "Admins can delete pitch decks" on storage.objects;
create policy "Admins can delete pitch decks"
on storage.objects for delete to authenticated
using (bucket_id = 'pitch-decks' and (select public.is_admin()));

-- These restrictive guards apply only to pitch-decks; policies for other
-- buckets continue to decide their access. MIME/size limits belong to the
-- bucket configuration above, not upload metadata that may be unset at INSERT.
drop policy if exists "Hanova pitch deck anonymous insert guard" on storage.objects;
create policy "Hanova pitch deck anonymous insert guard"
on storage.objects as restrictive for insert to anon
with check (
  bucket_id <> 'pitch-decks'
  or name ~ '^intake/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
);

drop policy if exists "Hanova pitch deck authenticated insert guard" on storage.objects;
create policy "Hanova pitch deck authenticated insert guard"
on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'pitch-decks');

drop policy if exists "Hanova pitch deck update guard" on storage.objects;
create policy "Hanova pitch deck update guard"
on storage.objects as restrictive for update to anon, authenticated
using (bucket_id <> 'pitch-decks')
with check (bucket_id <> 'pitch-decks');

do $$
declare
  command_name text;
  policy_name text;
begin
  foreach command_name in array array['select', 'delete'] loop
    policy_name := 'Hanova pitch deck anonymous ' || command_name || ' guard';
    execute format('drop policy if exists %I on storage.objects', policy_name);
    execute format('create policy %I on storage.objects as restrictive for %s to anon using (bucket_id <> %L)',
      policy_name, command_name, 'pitch-decks');

    policy_name := 'Hanova pitch deck admin ' || command_name || ' guard';
    execute format('drop policy if exists %I on storage.objects', policy_name);
    execute format('create policy %I on storage.objects as restrictive for %s to authenticated using (bucket_id <> %L or (select public.is_admin()))',
      policy_name, command_name, 'pitch-decks');
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
