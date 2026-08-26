-- Security hardening for the Hanova submission tables.
--
-- Admin authorization is based on Supabase Auth app_metadata. An operator must
-- set { "role": "admin" } in the user's app_metadata through a trusted
-- Supabase Dashboard or server-side administrative workflow. app_metadata is
-- not writable by the browser client.
--
-- This migration is intentionally reviewable and does not disable RLS or grant
-- any submission access to ordinary authenticated users.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin';
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Policies do not grant PostgreSQL table privileges. Remove any accidental
-- PUBLIC table grants, then give authenticated users only the privileges that
-- RLS will further restrict to authorized admins below.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'contact_submissions',
    'startup_registrations',
    'chapter_applications',
    'community_join_applications',
    'event_registrations',
    'meeting_registrations',
    'founder_connection_requests',
    'partner_applications',
    'pitch_deck_submissions'
  ] loop
    execute format('revoke all on table public.%I from public', table_name);
    execute format('grant select, update, delete on table public.%I to authenticated', table_name);
  end loop;
end;
$$;

-- Public forms can insert only their submitted columns. Server-managed fields
-- such as id, created_at, and status cannot be supplied by the anon role.
revoke insert on table public.contact_submissions from anon;
grant insert (contact_name, contact_phone, contact_email, message) on table public.contact_submissions to anon;
drop policy if exists "Allow public contact submissions" on public.contact_submissions;
create policy "Allow public contact submissions"
on public.contact_submissions for insert to anon with check (true);

revoke insert on table public.startup_registrations from anon;
grant insert (startup_name, founder_name, problem, solution, startup_stage, website, linkedin, phone, email, pitch_deck_path, consent_given) on table public.startup_registrations to anon;
drop policy if exists "Allow public startup registrations" on public.startup_registrations;
create policy "Allow public startup registrations"
on public.startup_registrations for insert to anon with check (true);

revoke insert on table public.community_join_applications from anon;
grant insert (name, phone, email, city, district, college_or_company, profession, startup_stage, startup_name, consent_given) on table public.community_join_applications to anon;
drop policy if exists "Allow public community applications" on public.community_join_applications;
create policy "Allow public community applications"
on public.community_join_applications for insert to anon with check (true);

revoke insert on table public.chapter_applications from anon;
grant insert (name, phone, email, city, district, profession, organization, linkedin, entrepreneurship_experience, weekly_commitment, motivation, city_ecosystem, first_meetup_plan, community_reach, consent_given) on table public.chapter_applications to anon;
drop policy if exists "Allow public chapter applications" on public.chapter_applications;
create policy "Allow public chapter applications"
on public.chapter_applications for insert to anon with check (true);

revoke insert on table public.event_registrations from anon;
grant insert (name, phone, email, city, purpose, consent_given) on table public.event_registrations to anon;
drop policy if exists "Allow public event registrations" on public.event_registrations;
create policy "Allow public event registrations"
on public.event_registrations for insert to anon with check (true);

revoke insert on table public.meeting_registrations from anon;
grant insert (name, phone, email, city, role, purpose, consent_given) on table public.meeting_registrations to anon;
drop policy if exists "Allow public meeting registrations" on public.meeting_registrations;
create policy "Allow public meeting registrations"
on public.meeting_registrations for insert to anon with check (true);

revoke insert on table public.founder_connection_requests from anon;
grant insert (name, phone, email, city, startup_name, founder, startup_stage, meeting_purpose, context, desired_outcome, preferred_date, preferred_time, consent_given) on table public.founder_connection_requests to anon;
drop policy if exists "Allow public founder connection requests" on public.founder_connection_requests;
create policy "Allow public founder connection requests"
on public.founder_connection_requests for insert to anon with check (true);

revoke insert on table public.partner_applications from anon;
grant insert (name, email, phone, organization, location, website, organization_type, partnership_interest, contribution, goal, community_reach, ecosystem_experience, consent_given) on table public.partner_applications to anon;
drop policy if exists "Allow public partner applications" on public.partner_applications;
create policy "Allow public partner applications"
on public.partner_applications for insert to anon with check (true);

revoke insert on table public.pitch_deck_submissions from anon;
grant insert (founder_name, startup_name, email, phone, startup_stage, industry, pitch_deck_path, description) on table public.pitch_deck_submissions to anon;
drop policy if exists "Allow public pitch deck submissions" on public.pitch_deck_submissions;
create policy "Allow public pitch deck submissions"
on public.pitch_deck_submissions for insert to anon with check (true);

-- Only users whose server-managed app_metadata role is admin can manage
-- submissions. Ordinary authenticated users have no matching policies.
create policy "Admins can read contact submissions"
on public.contact_submissions for select to authenticated using ((select public.is_admin()));
create policy "Admins can update contact submissions"
on public.contact_submissions for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins can delete contact submissions"
on public.contact_submissions for delete to authenticated using ((select public.is_admin()));

create policy "Admins can read startup registrations"
on public.startup_registrations for select to authenticated using ((select public.is_admin()));
create policy "Admins can update startup registrations"
on public.startup_registrations for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins can delete startup registrations"
on public.startup_registrations for delete to authenticated using ((select public.is_admin()));

create policy "Admins can read community applications"
on public.community_join_applications for select to authenticated using ((select public.is_admin()));
create policy "Admins can update community applications"
on public.community_join_applications for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins can delete community applications"
on public.community_join_applications for delete to authenticated using ((select public.is_admin()));

create policy "Admins can read chapter applications"
on public.chapter_applications for select to authenticated using ((select public.is_admin()));
create policy "Admins can update chapter applications"
on public.chapter_applications for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins can delete chapter applications"
on public.chapter_applications for delete to authenticated using ((select public.is_admin()));

create policy "Admins can read event registrations"
on public.event_registrations for select to authenticated using ((select public.is_admin()));
create policy "Admins can update event registrations"
on public.event_registrations for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins can delete event registrations"
on public.event_registrations for delete to authenticated using ((select public.is_admin()));

create policy "Admins can read meeting registrations"
on public.meeting_registrations for select to authenticated using ((select public.is_admin()));
create policy "Admins can update meeting registrations"
on public.meeting_registrations for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins can delete meeting registrations"
on public.meeting_registrations for delete to authenticated using ((select public.is_admin()));

create policy "Admins can read founder connection requests"
on public.founder_connection_requests for select to authenticated using ((select public.is_admin()));
create policy "Admins can update founder connection requests"
on public.founder_connection_requests for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins can delete founder connection requests"
on public.founder_connection_requests for delete to authenticated using ((select public.is_admin()));

create policy "Admins can read partner applications"
on public.partner_applications for select to authenticated using ((select public.is_admin()));
create policy "Admins can update partner applications"
on public.partner_applications for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins can delete partner applications"
on public.partner_applications for delete to authenticated using ((select public.is_admin()));

create policy "Admins can read pitch deck submissions"
on public.pitch_deck_submissions for select to authenticated using ((select public.is_admin()));
create policy "Admins can update pitch deck submissions"
on public.pitch_deck_submissions for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins can delete pitch deck submissions"
on public.pitch_deck_submissions for delete to authenticated using ((select public.is_admin()));
