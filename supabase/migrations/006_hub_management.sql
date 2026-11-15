-- Owner and hub-manager access. Apply after 001 through 005.
-- Existing submissions remain unassigned; no city-based ownership guesses.
begin;

create table if not exists public.hubs (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  city text not null check (length(trim(city)) > 0),
  district text not null check (length(trim(district)) > 0),
  status text not null default 'Network forming' check (status in ('Active', 'Network forming')),
  summary text not null default '',
  description text not null default '',
  focus_areas text[] not null default '{}',
  facilities text[] not null default '{}',
  contact_name text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.hub_managers (
  hub_id text primary key references public.hubs(id) on delete restrict,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null default '',
  email text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.hub_events (
  id text primary key check (length(trim(id)) > 0),
  hub_id text not null references public.hubs(id) on delete restrict,
  title text not null check (length(trim(title)) > 0),
  date date not null,
  time text not null check (length(trim(time)) > 0),
  venue text not null default '',
  type text not null default 'Founder meetup',
  summary text not null default '',
  is_published boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists hub_events_hub_date_idx on public.hub_events (hub_id, date);

create table if not exists public.hub_activity (
  id uuid primary key default gen_random_uuid(),
  hub_id text not null references public.hubs(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists hub_activity_recent_idx on public.hub_activity (hub_id, created_at desc);

insert into public.hubs (id, city, district, status, summary, description, focus_areas, facilities) values
('proddatur', 'Proddatur', 'YSR Kadapa', 'Active', 'Hanova’s flagship regional founder community.', 'The Proddatur hub brings aspiring founders, early-stage teams, mentors, students, and local professionals together through focused conversations, learning sessions, and startup meetups.', array['Idea validation', 'Founder meetups', 'Product guidance']::text[], array['Community sessions', 'Mentor introductions', 'Event access']::text[]),
('kadapa', 'Kadapa', 'YSR Kadapa', 'Active', 'A growing network for founders across the Kadapa region.', 'The Kadapa hub connects local founders with peer learning, business guidance, technology support, and opportunities across the wider Hanova ecosystem.', array['Business validation', 'Community building', 'Founder support']::text[], array['Startup discussions', 'Regional connections', 'Learning events']::text[]),
('tirupati', 'Tirupati', 'Tirupati', 'Active', 'A university-connected startup and innovation network.', 'The Tirupati hub is designed to connect student innovators, professionals, researchers, and founders with practical startup pathways and ecosystem opportunities.', array['Student startups', 'Technology', 'Innovation programs']::text[], array['Founder sessions', 'Campus connections', 'Community events']::text[]),
('anantapur', 'Anantapur', 'Anantapur', 'Active', 'A regional network supporting new and early-stage founders.', 'The Anantapur hub supports founders who are exploring ideas, testing opportunities, and looking for local people who can help them move forward.', array['Early-stage ideas', 'Local partnerships', 'Founder education']::text[], array['Peer community', 'Partner access', 'Meetup participation']::text[]),
('kurnool', 'Kurnool', 'Kurnool', 'Network forming', 'A new founder network being developed with local partners.', 'Hanova is connecting founders, institutions, and professionals in Kurnool to understand local needs and establish a useful founder-support network.', array['Community discovery', 'Partnerships', 'Founder outreach']::text[], array['Interest registration', 'Partner conversations', 'Future events']::text[]),
('nellore', 'Nellore', 'SPSR Nellore', 'Network forming', 'Connecting startup talent and ecosystem supporters in Nellore.', 'The Nellore network is being formed to help local founders discover collaborators, mentors, events, and practical startup support closer to home.', array['Founder discovery', 'Community', 'Regional collaboration']::text[], array['Interest registration', 'Community introductions', 'Future programs']::text[]),
('vijayawada', 'Vijayawada', 'NTR', 'Network forming', 'Building connections with founders and institutions in Vijayawada.', 'Hanova’s Vijayawada network will connect founders with educational institutions, experienced professionals, service partners, and regional startup opportunities.', array['Partnerships', 'Startup services', 'Founder connections']::text[], array['Partner network', 'Interest registration', 'Upcoming programs']::text[]),
('visakhapatnam', 'Visakhapatnam', 'Visakhapatnam', 'Network forming', 'Exploring a coastal startup network for technology and growth.', 'The Visakhapatnam network is intended to connect technology founders, business leaders, students, and ecosystem organizations through shared programs and events.', array['Technology startups', 'Growth', 'Industry connections']::text[], array['Interest registration', 'Industry outreach', 'Future meetups']::text[])
on conflict (id) do nothing;

insert into public.hub_events (id, hub_id, title, date, time, venue, type, summary, is_published) values
('proddatur-founder-meetup-01', 'proddatur', 'Hanova Founder Meetup — Proddatur', '2026-08-24', '4:00 PM – 7:00 PM', 'Venue will be shared with registered attendees', 'Founder meetup', 'An evening of founder conversations, practical startup guidance, peer connections, and clear next steps.', true),
('kadapa-idea-validation-workshop', 'kadapa', 'Idea Validation Workshop — Kadapa', '2026-09-12', '10:30 AM – 1:00 PM', 'Venue will be announced', 'Workshop', 'A practical workshop for aspiring founders who want to test the problem, audience, and opportunity behind an idea.', true)
on conflict (id) do nothing;

create or replace function public.is_hub_manager(p_hub_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.hub_managers as manager
    where manager.hub_id = p_hub_id
      and manager.user_id = (select auth.uid())
      and manager.active
  );
$$;
revoke all on function public.is_hub_manager(text) from public, anon;
grant execute on function public.is_hub_manager(text) to authenticated;

alter table public.hubs enable row level security;
alter table public.hub_managers enable row level security;
alter table public.hub_events enable row level security;
alter table public.hub_activity enable row level security;
revoke all on table public.hubs, public.hub_managers, public.hub_events, public.hub_activity from public, anon, authenticated;
grant select on table public.hubs to anon, authenticated;
grant select on table public.hub_events to anon, authenticated;
grant insert, update, delete on table public.hubs, public.hub_managers, public.hub_events to authenticated;
grant select on table public.hub_managers, public.hub_activity to authenticated;

drop policy if exists "Anyone can read hubs" on public.hubs;
create policy "Anyone can read hubs" on public.hubs for select to anon, authenticated using (true);
drop policy if exists "Owners can add hubs" on public.hubs;
create policy "Owners can add hubs" on public.hubs for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "Owners and assigned managers can edit hubs" on public.hubs;
create policy "Owners and assigned managers can edit hubs" on public.hubs for update to authenticated
using ((select public.is_admin()) or public.is_hub_manager(id))
with check ((select public.is_admin()) or public.is_hub_manager(id));
drop policy if exists "Owners can delete hubs" on public.hubs;
create policy "Owners can delete hubs" on public.hubs for delete to authenticated using ((select public.is_admin()));

drop policy if exists "Owners manage hub assignments" on public.hub_managers;
create policy "Owners manage hub assignments" on public.hub_managers for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "Managers can read their own assignment" on public.hub_managers;
create policy "Managers can read their own assignment" on public.hub_managers for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Anyone can read published hub events" on public.hub_events;
create policy "Anyone can read published hub events" on public.hub_events for select to anon, authenticated using (is_published);
drop policy if exists "Owners and assigned managers can read event drafts" on public.hub_events;
create policy "Owners and assigned managers can read event drafts" on public.hub_events for select to authenticated
using ((select public.is_admin()) or public.is_hub_manager(hub_id));
drop policy if exists "Owners and assigned managers can create events" on public.hub_events;
create policy "Owners and assigned managers can create events" on public.hub_events for insert to authenticated
with check ((select public.is_admin()) or public.is_hub_manager(hub_id));
drop policy if exists "Owners and assigned managers can edit events" on public.hub_events;
create policy "Owners and assigned managers can edit events" on public.hub_events for update to authenticated
using ((select public.is_admin()) or public.is_hub_manager(hub_id))
with check ((select public.is_admin()) or public.is_hub_manager(hub_id));
drop policy if exists "Owners can delete events" on public.hub_events;
create policy "Owners can delete events" on public.hub_events for delete to authenticated using ((select public.is_admin()));

drop policy if exists "Owners and assigned managers can read hub activity" on public.hub_activity;
create policy "Owners and assigned managers can read hub activity" on public.hub_activity for select to authenticated
using ((select public.is_admin()) or public.is_hub_manager(hub_id));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'startup_registrations', 'community_join_applications', 'event_registrations', 'meeting_registrations'
  ] loop
    execute format('alter table public.%I add column if not exists hub_id text references public.hubs(id)', table_name);
    execute format('alter table public.%I add column if not exists follow_up_notes text not null default %L', table_name, '');
    execute format('alter table public.%I add column if not exists status text not null default %L', table_name, 'pending');
    execute format('create index if not exists %I on public.%I (hub_id, created_at desc)', table_name || '_hub_idx', table_name);
    execute format('grant insert (hub_id) on table public.%I to anon', table_name);

    -- 004 added restrictive administrator guards. Replace SELECT and UPDATE
    -- guards for these four tables; retaining them would silently deny managers.
    execute format('drop policy if exists %I on public.%I', 'Hanova admin select guard', table_name);
    execute format('drop policy if exists %I on public.%I', 'Hanova admin update guard', table_name);
    execute format('drop policy if exists %I on public.%I', 'Hanova hub select guard', table_name);
    execute format('drop policy if exists %I on public.%I', 'Hanova hub update guard', table_name);
    execute format('drop policy if exists %I on public.%I', 'Assigned managers can read hub submissions', table_name);
    execute format('drop policy if exists %I on public.%I', 'Assigned managers can update hub submissions', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_hub_manager(hub_id))',
      'Assigned managers can read hub submissions', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_hub_manager(hub_id)) with check (public.is_hub_manager(hub_id))',
      'Assigned managers can update hub submissions', table_name);
    execute format('create policy %I on public.%I as restrictive for select to authenticated using ((select public.is_admin()) or public.is_hub_manager(hub_id))',
      'Hanova hub select guard', table_name);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using ((select public.is_admin()) or public.is_hub_manager(hub_id)) with check ((select public.is_admin()) or public.is_hub_manager(hub_id))',
      'Hanova hub update guard', table_name);

    -- DELETE retains the administrator-only guard from 004. Authenticated staff
    -- cannot insert private intake rows through an unrelated legacy policy.
    execute format('drop policy if exists %I on public.%I', 'Hanova hub authenticated insert guard', table_name);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (false)',
      'Hanova hub authenticated insert guard', table_name);
  end loop;
end;
$$;

alter table public.event_registrations add column if not exists event_id text references public.hub_events(id) on delete restrict;
alter table public.meeting_registrations add column if not exists meeting_id text;
grant insert (event_id) on table public.event_registrations to anon;
grant insert (meeting_id) on table public.meeting_registrations to anon;

-- RLS controls which rows may be updated. This trigger also limits which
-- columns a manager can change, despite pre-existing broad UPDATE grants.
create or replace function public.guard_hub_submission_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select public.is_admin()) or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if not public.is_hub_manager(old.hub_id) then
    raise exception 'An active assignment to this hub is required.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - array['status', 'follow_up_notes']) is distinct from
     (to_jsonb(old) - array['status', 'follow_up_notes']) then
    raise exception 'Hub managers may only update the status and follow-up notes.' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if tg_table_name = 'startup_registrations' and old.status in ('approved', 'rejected') then
      raise exception 'Only the owner can change a final startup decision.' using errcode = '42501';
    end if;
    if (tg_table_name = 'startup_registrations' and new.status not in ('pending', 'reviewed'))
      or (tg_table_name = 'community_join_applications' and new.status not in ('pending', 'reviewed', 'approved', 'rejected'))
      or (tg_table_name = 'event_registrations' and new.status not in ('pending', 'confirmed', 'attended', 'cancelled'))
      or (tg_table_name = 'meeting_registrations' and new.status not in ('pending', 'confirmed', 'completed', 'cancelled')) then
      raise exception 'This status is reserved for the owner or is invalid for this request.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_hub_submission_update() from public, anon, authenticated;

create or replace function public.guard_hub_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not (select public.is_admin()) and coalesce(auth.role(), '') <> 'service_role' then
    if not public.is_hub_manager(old.id) or
      (to_jsonb(new) - array['summary', 'description', 'focus_areas', 'facilities', 'contact_name', 'contact_email', 'contact_phone', 'updated_at']) is distinct from
      (to_jsonb(old) - array['summary', 'description', 'focus_areas', 'facilities', 'contact_name', 'contact_email', 'contact_phone', 'updated_at']) then
      raise exception 'Only the owner can change a hub identity, location or status.' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.guard_hub_profile_update() from public, anon, authenticated;
drop trigger if exists guard_hub_profile on public.hubs;
create trigger guard_hub_profile before update on public.hubs
for each row execute function public.guard_hub_profile_update();

create or replace function public.guard_hub_event_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Even an owner keeps event identity stable. Archive the old event and create
  -- another rather than moving attendee records to a different event or hub.
  if new.id is distinct from old.id or new.hub_id is distinct from old.hub_id then
    raise exception 'An event identity and its assigned hub cannot be changed.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.guard_hub_event_update() from public, anon, authenticated;
drop trigger if exists guard_hub_event on public.hub_events;
create trigger guard_hub_event before update on public.hub_events
for each row execute function public.guard_hub_event_update();

create or replace function public.validate_event_registration_hub()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_hub text;
  event_published boolean;
begin
  if tg_op = 'INSERT' and coalesce(auth.role(), '') = 'anon' and new.event_id is null then
    raise exception 'Choose a published event before registering.' using errcode = '23514';
  end if;
  if new.event_id is not null then
    select event.hub_id, event.is_published into event_hub, event_published
    from public.hub_events as event where event.id = new.event_id;
    if not found or (coalesce(auth.role(), '') = 'anon' and not event_published) then
      raise exception 'This event is not available for registration.' using errcode = '23514';
    end if;
    if new.hub_id is not null and new.hub_id <> event_hub then
      raise exception 'The event does not belong to the selected hub.' using errcode = '23514';
    end if;
    new.hub_id := event_hub;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_event_registration_hub() from public, anon, authenticated;
drop trigger if exists validate_event_registration on public.event_registrations;
create trigger validate_event_registration before insert or update of hub_id, event_id on public.event_registrations
for each row execute function public.validate_event_registration_hub();

create or replace function public.record_hub_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  previous_data jsonb;
  assigned_hub text;
  previous_hub text;
  item_id text;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  assigned_hub := case when tg_table_name = 'hubs' then row_data ->> 'id' else row_data ->> 'hub_id' end;
  item_id := coalesce(row_data ->> 'id', row_data ->> 'hub_id');
  if assigned_hub is not null then
    insert into public.hub_activity (hub_id, actor_id, action, entity_type, entity_id)
    values (assigned_hub, auth.uid(), lower(tg_op), tg_table_name, item_id);
  end if;
  if tg_op = 'UPDATE' and tg_table_name <> 'hubs' then
    previous_data := to_jsonb(old);
    previous_hub := previous_data ->> 'hub_id';
    if previous_hub is not null and previous_hub is distinct from assigned_hub then
      insert into public.hub_activity (hub_id, actor_id, action, entity_type, entity_id)
      values (previous_hub, auth.uid(), 'transferred', tg_table_name, item_id);
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.record_hub_activity() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'startup_registrations', 'community_join_applications', 'event_registrations', 'meeting_registrations'
  ] loop
    execute format('drop trigger if exists guard_hub_submission on public.%I', table_name);
    execute format('create trigger guard_hub_submission before update on public.%I for each row execute function public.guard_hub_submission_update()', table_name);
  end loop;
  foreach table_name in array array[
    'hubs', 'hub_managers', 'hub_events', 'startup_registrations', 'community_join_applications', 'event_registrations', 'meeting_registrations'
  ] loop
    execute format('drop trigger if exists audit_hub_activity on public.%I', table_name);
    execute format('create trigger audit_hub_activity after insert or update or delete on public.%I for each row execute function public.record_hub_activity()', table_name);
  end loop;
end;
$$;

create or replace function public.assign_hub_manager(p_hub_id text, p_email text, p_display_name text)
returns public.hub_managers
language plpgsql
security definer
set search_path = ''
as $$
declare
  manager_user auth.users%rowtype;
  assignment public.hub_managers%rowtype;
begin
  if not (select public.is_admin()) then
    raise exception 'Only an owner can assign hub managers.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.hubs where id = p_hub_id) then
    raise exception 'The selected hub does not exist.' using errcode = '23503';
  end if;
  select * into manager_user from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if not found then
    raise exception 'Create or invite this account before assigning a hub.' using errcode = 'P0002';
  end if;
  if coalesce(manager_user.raw_app_meta_data ->> 'role', '') = 'admin' then
    raise exception 'An owner account cannot be assigned as a hub manager.' using errcode = '23514';
  end if;
  if exists (select 1 from public.hub_managers where user_id = manager_user.id and hub_id <> p_hub_id) then
    raise exception 'This account already manages another hub. Remove that assignment first.' using errcode = '23505';
  end if;
  insert into public.hub_managers (hub_id, user_id, display_name, email, active, updated_at)
  values (p_hub_id, manager_user.id, trim(coalesce(p_display_name, '')), lower(trim(p_email)), true, now())
  on conflict (hub_id) do update set
    user_id = excluded.user_id, display_name = excluded.display_name, email = excluded.email,
    active = true, updated_at = now()
  returning * into assignment;
  return assignment;
end;
$$;
revoke all on function public.assign_hub_manager(text, text, text) from public, anon;
grant execute on function public.assign_hub_manager(text, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
