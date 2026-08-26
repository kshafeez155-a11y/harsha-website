-- Initial submission schema for the existing public website forms.

-- Contact messages submitted from the homepage contact form.
create table public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  contact_name text not null,
  contact_phone text not null,
  contact_email text not null,
  message text not null
);

alter table public.contact_submissions enable row level security;

-- Allow anonymous visitors to submit contact messages, but never read or modify them publicly.
create policy "Allow public contact submissions"
on public.contact_submissions
for insert
to anon
with check (true);

-- Startup registration applications submitted from the startup registration page.
create table public.startup_registrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'pending',
  startup_name text not null,
  founder_name text not null,
  problem text not null,
  solution text not null,
  startup_stage text not null,
  website text,
  linkedin text,
  phone text not null,
  email text not null,
  pitch_deck_path text,
  consent_given boolean not null
);

alter table public.startup_registrations enable row level security;

-- Allow anonymous visitors to submit startup applications, but not read or change them publicly.
create policy "Allow public startup registrations"
on public.startup_registrations
for insert
to anon
with check (true);

-- Community join applications submitted from the community page.
create table public.community_join_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'pending',
  name text not null,
  phone text not null,
  email text not null,
  city text not null,
  district text not null,
  college_or_company text not null,
  profession text not null,
  startup_stage text not null,
  startup_name text,
  consent_given boolean not null
);

alter table public.community_join_applications enable row level security;

-- Allow anonymous visitors to submit community applications, but not read or change them publicly.
create policy "Allow public community applications"
on public.community_join_applications
for insert
to anon
with check (true);

-- Chapter leader applications submitted from the chapter application page.
create table public.chapter_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'pending',
  name text not null,
  phone text not null,
  email text not null,
  city text not null,
  district text not null,
  profession text not null,
  organization text,
  linkedin text,
  entrepreneurship_experience text not null,
  weekly_commitment text not null,
  motivation text not null,
  city_ecosystem text not null,
  first_meetup_plan text not null,
  community_reach text,
  consent_given boolean not null
);

alter table public.chapter_applications enable row level security;

-- Allow anonymous visitors to submit chapter applications, but not read or change them publicly.
create policy "Allow public chapter applications"
on public.chapter_applications
for insert
to anon
with check (true);

-- Event registrations submitted from an event registration page.
create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  phone text not null,
  email text not null,
  city text not null,
  purpose text not null,
  consent_given boolean not null
);

alter table public.event_registrations enable row level security;

-- Allow anonymous visitors to register for events, but not read or change registrations publicly.
create policy "Allow public event registrations"
on public.event_registrations
for insert
to anon
with check (true);

-- Meeting registrations submitted from a meeting registration page.
create table public.meeting_registrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  phone text not null,
  email text not null,
  city text not null,
  role text not null,
  purpose text not null,
  consent_given boolean not null
);

alter table public.meeting_registrations enable row level security;

-- Allow anonymous visitors to register for meetings, but not read or change registrations publicly.
create policy "Allow public meeting registrations"
on public.meeting_registrations
for insert
to anon
with check (true);

-- Founder connection requests submitted from the founder connection page.
create table public.founder_connection_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'pending',
  name text not null,
  phone text not null,
  email text not null,
  city text not null,
  startup_name text,
  founder text not null,
  startup_stage text not null,
  meeting_purpose text not null,
  context text not null,
  desired_outcome text not null,
  preferred_date date,
  preferred_time text,
  consent_given boolean not null
);

alter table public.founder_connection_requests enable row level security;

-- Allow anonymous visitors to submit founder connection requests, but not read or change them publicly.
create policy "Allow public founder connection requests"
on public.founder_connection_requests
for insert
to anon
with check (true);

-- Partner applications submitted from the partner page.
create table public.partner_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'pending',
  name text not null,
  email text not null,
  phone text not null,
  organization text not null,
  location text not null,
  website text,
  organization_type text not null,
  partnership_interest text not null,
  contribution text not null,
  goal text not null,
  community_reach text,
  ecosystem_experience text,
  consent_given boolean not null
);

alter table public.partner_applications enable row level security;

-- Allow anonymous visitors to submit partner applications, but not read or change them publicly.
create policy "Allow public partner applications"
on public.partner_applications
for insert
to anon
with check (true);

-- Pitch deck submissions and their future storage object path.
create table public.pitch_deck_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'pending',
  founder_name text not null,
  startup_name text not null,
  email text not null,
  phone text not null,
  startup_stage text not null,
  industry text not null,
  pitch_deck_path text,
  description text not null
);

alter table public.pitch_deck_submissions enable row level security;

-- Allow anonymous visitors to submit pitch deck metadata, but not read or change it publicly.
create policy "Allow public pitch deck submissions"
on public.pitch_deck_submissions
for insert
to anon
with check (true);
