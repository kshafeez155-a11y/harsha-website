-- Public startup content is deliberately separate from private startup applications.
-- This additive migration preserves existing submissions, Auth, and pitch decks.
create table if not exists public.startup_profiles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and slug <> 'register'),
  startup_name text not null check (length(trim(startup_name)) > 0),
  founder_name text not null check (length(trim(founder_name)) > 0),
  location text not null check (length(trim(location)) > 0),
  industry text not null check (length(trim(industry)) > 0),
  short_story text not null check (length(trim(short_story)) > 0),
  stage text not null default 'Idea Stage' check (stage in ('Idea Stage', 'MVP', 'Early Revenue', 'Growth Stage', 'Funded')),
  startup_logo text not null default '',
  founder_image text not null default '',
  cover_image text not null default '',
  website text not null default '',
  is_published boolean not null default false,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  story_details jsonb not null default '{}'::jsonb check (jsonb_typeof(story_details) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists startup_profiles_public_order_idx
on public.startup_profiles (sort_order, created_at) where is_published;

create or replace function public.set_startup_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.set_startup_profile_updated_at() from public, anon, authenticated;
drop trigger if exists startup_profiles_updated_at on public.startup_profiles;
create trigger startup_profiles_updated_at
before update on public.startup_profiles
for each row execute function public.set_startup_profile_updated_at();

alter table public.startup_profiles enable row level security;
revoke all on table public.startup_profiles from public, anon, authenticated;
grant select on table public.startup_profiles to anon, authenticated;
grant insert, update, delete on table public.startup_profiles to authenticated;

drop policy if exists "Anyone can read published startup profiles" on public.startup_profiles;
create policy "Anyone can read published startup profiles"
on public.startup_profiles for select to anon, authenticated using (is_published);

drop policy if exists "Admins can read all startup profiles" on public.startup_profiles;
create policy "Admins can read all startup profiles"
on public.startup_profiles for select to authenticated using ((select public.is_admin()));

drop policy if exists "Admins can add startup profiles" on public.startup_profiles;
create policy "Admins can add startup profiles"
on public.startup_profiles for insert to authenticated with check ((select public.is_admin()));

drop policy if exists "Admins can edit startup profiles" on public.startup_profiles;
create policy "Admins can edit startup profiles"
on public.startup_profiles for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Admins can delete startup profiles" on public.startup_profiles;
create policy "Admins can delete startup profiles"
on public.startup_profiles for delete to authenticated using ((select public.is_admin()));

-- These images are public assets. Only authorized administrators can upload,
-- replace, or remove them. Keep private pitch decks in their separate bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('startup-images', 'startup-images', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can read startup images" on storage.objects;
create policy "Anyone can read startup images"
on storage.objects for select to anon, authenticated using (bucket_id = 'startup-images');

drop policy if exists "Admins can add startup images" on storage.objects;
create policy "Admins can add startup images"
on storage.objects for insert to authenticated
with check (bucket_id = 'startup-images' and (select public.is_admin()));

drop policy if exists "Admins can update startup images" on storage.objects;
create policy "Admins can update startup images"
on storage.objects for update to authenticated
using (bucket_id = 'startup-images' and (select public.is_admin()))
with check (bucket_id = 'startup-images' and (select public.is_admin()));

drop policy if exists "Admins can delete startup images" on storage.objects;
create policy "Admins can delete startup images"
on storage.objects for delete to authenticated
using (bucket_id = 'startup-images' and (select public.is_admin()));

-- Preserve the existing verified founder story, including its complete portfolio.
-- A rerun never overwrites a profile edited from the dashboard.
insert into public.startup_profiles (
  slug, startup_name, founder_name, location, industry, short_story, stage, startup_logo, founder_image, cover_image, website, is_published, is_featured, sort_order, story_details
) values (
  'omax-media',
  'Mila Innovations and Technologies Pvt. Ltd.',
  'Mila Yashwanth Kumar Yadav',
  'Kadapa',
  'Technology, Digital Marketing and Product Development',
  'Mila Innovations and Technologies Pvt. Ltd. helps businesses build influential digital brands and scalable technology products. O-MAX Media operates as its branding, content, and digital-marketing division, while the technology team builds websites, applications, AI-powered platforms, marketplaces, and custom digital solutions.',
  'Growth Stage',
  '',
  '/images/yaswanth.jpeg',
  '/images/omax-media-logo.jpg',
  '',
  true,
  true,
  0,
  '{"portfolioHeading":"Building Digital Brands. Engineering Digital Products.","mediaDivisionName":"O-MAX Media","mediaDivisionDescription":"We transform founders into influential brands through strategic storytelling, cinematic content, and high-impact social media.","technologyDivisionName":"Mila Innovations and Technologies Pvt. Ltd.","technologyDivisionDescription":"We design and build AI-powered websites, applications, marketplaces, and digital platforms that help businesses scale faster.","mediaPortfolio":[{"name":"Dandapani Group of Companies","description":"Built a legacy-driven personal brand through cinematic storytelling, helping transform more than 50 years of business experience into engaging digital content.","url":"https://www.instagram.com/dandapanigroupofcompanies?igsh=ZHRhM2lneTl3ejd0","linkLabel":"View Instagram"},{"name":"SPAN Fitness","description":"Created high-impact fitness content that inspires trust, motivates audiences, and strengthens the brand''s online community.","url":"https://www.instagram.com/spanfitnes?igsh=dHpubDcyM3owejRj","linkLabel":"View Instagram"},{"name":"Arise Awuake","description":"Developed personality-driven content that positions the founder as a trusted mentor in communication and personal development.","url":"https://www.instagram.com/ariseawuake?igsh=MTdxdHNhbmhibGRmYg==","linkLabel":"View Instagram"},{"name":"Stone Bulls","description":"Crafted bold, premium social-media content that reflects the brand''s strength, lifestyle, and modern identity.","url":"https://www.instagram.com/_stonebulls_?igsh=NDV4djIyOHc1Mjc5","linkLabel":"View Instagram"}],"technologyPortfolio":[{"name":"WTI Agency","description":"Designed and developed a modern corporate website showcasing expertise in artificial intelligence, software development, and business transformation.","url":"https://www.wtiagency.in/","linkLabel":"Visit Website"},{"name":"Sri Vinayaka Foundation","description":"Built a professional website that strengthens the foundation''s credibility and makes its social initiatives more accessible to the public.","url":"https://www.srivinayakafoundation.org/","linkLabel":"Visit Website"},{"name":"RACAN","description":"Developed an AI-powered web platform focused on delivering intelligent digital experiences through a scalable architecture.","url":"https://racan.vercel.app/","linkLabel":"Visit Website"},{"name":"School Bus Media","description":"Created a business-focused website that presents the company''s media services, brand identity, and client offerings clearly.","url":"https://www.schoolbusmedia.com/","linkLabel":"Visit Website"},{"name":"SK Car Products","description":"Designed an e-commerce-ready platform that showcases automotive products through a seamless browsing experience.","url":"https://www.skcarproducts.com/","linkLabel":"Visit Website"},{"name":"Ranjith On Wheels","description":"Built a modern personal-brand website highlighting travel stories, adventures, and digital content in an engaging format.","url":"https://ranjithonwheels.vercel.app/","linkLabel":"Visit Website"},{"name":"Text Book Platform","description":"Developed an education-focused web application that simplifies access to learning resources through an intuitive interface.","url":"https://text-book-frontend.vercel.app/","linkLabel":"Visit Website"},{"name":"Stone Bulls Website","description":"Built a premium business website that reflects the brand''s identity and creates a strong digital customer experience.","url":"https://stonebulls.com/","linkLabel":"Visit Website"},{"name":"Partmo","description":"Developed a scalable platform with a clean user experience, enabling businesses to deliver services efficiently online.","url":"https://partmo.in/#/home","linkLabel":"Visit Website"},{"name":"Chaamundeshwari Water","description":"Created a professional corporate website that builds customer trust and showcases the brand''s products with clarity.","url":"https://www.chaamundeshwariwater.com/","linkLabel":"Visit Website"},{"name":"Animal Market","description":"Developed a marketplace that digitally connects buyers and sellers, making livestock trading more accessible and organised.","url":"https://animalmarket.in/","linkLabel":"Visit Website"},{"name":"Domestica","description":"Contributed to a digital platform designed to provide an accessible and modern online experience for its users.","url":"https://domestica.com/","linkLabel":"Visit Website"}],"milestones":[{"number":"01","title":"Started with a vision","description":"Started with a vision to help businesses grow through technology, branding, strategic storytelling, and digital transformation."},{"number":"02","title":"Launched O-MAX Media","description":"Built O-MAX Media as a specialised division for digital marketing, cinematic content, social-media strategy, and founder branding."},{"number":"03","title":"Expanded into technology","description":"Expanded into website development, applications, AI-powered platforms, marketplaces, and scalable digital products."},{"number":"04","title":"Connected with Hanova","description":"Connected with the Hanova ecosystem, expanded the company''s founder and business network, and received strategic support."},{"number":"05","title":"Received ₹85,000 investment","description":"Received ₹85,000 in investment along with strategic marketing and ecosystem support."},{"number":"06","title":"Scaling across Rayalaseema","description":"Now expanding digital-marketing, software-development, and technology services across Rayalaseema and beyond."}]}'::jsonb
) on conflict (slug) do nothing;
