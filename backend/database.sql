
-- SYRIA REAL ESTATE
-- Initial database schema
-- Run this script in the Supabase SQL Editor.

create extension if not exists pgcrypto;

-- =========================================
-- 1. USER PROFILES
-- =========================================

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text,
    phone text,
    account_type text not null default 'individual'
        check (account_type in (
            'individual',
            'owner',
            'buyer',
            'tenant',
            'real_estate_office',
            'developer'
        )),
    role text not null default 'user'
        check (role in ('user', 'admin')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Automatically create a profile after signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, full_name)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'full_name', '')
    )
    on conflict (id) do nothing;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- =========================================
-- 2. ADMIN CHECK
-- =========================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.profiles
        where id = (select auth.uid())
          and role = 'admin'
    );
$$;

-- =========================================
-- 3. PROPERTIES
-- =========================================

create table if not exists public.properties (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id) on delete cascade,

    title text not null,
    description text not null,

    purpose text not null
        check (purpose in ('sale', 'rent', 'investment')),

    property_type text not null
        check (property_type in (
            'apartment',
            'house',
            'villa',
            'land',
            'commercial',
            'office',
            'warehouse',
            'other'
        )),

    governorate text not null,
    city text,
    neighborhood text,

    area numeric(12,2),
    bedrooms integer,
    bathrooms integer,
    floor_number integer,

    price numeric(16,2),
    currency text,

    contact_phone text,

    status text not null default 'pending'
        check (status in (
            'pending',
            'approved',
            'rejected',
            'archived'
        )),

    rejection_reason text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists properties_status_idx
    on public.properties(status);

create index if not exists properties_governorate_idx
    on public.properties(governorate);

create index if not exists properties_purpose_idx
    on public.properties(purpose);

create index if not exists properties_user_id_idx
    on public.properties(user_id);

-- =========================================
-- 4. PROPERTY MEDIA
-- =========================================

create table if not exists public.property_media (
    id uuid primary key default gen_random_uuid(),

    property_id uuid not null
        references public.properties(id) on delete cascade,

    user_id uuid not null
        references auth.users(id) on delete cascade,

    media_type text not null
        check (media_type in ('image', 'video')),

    file_url text not null,
    display_order integer not null default 0,

    created_at timestamptz not null default now()
);

create index if not exists property_media_property_idx
    on public.property_media(property_id);

-- =========================================
-- 5. INQUIRIES
-- =========================================

create table if not exists public.inquiries (
    id uuid primary key default gen_random_uuid(),

    property_id uuid not null
        references public.properties(id) on delete cascade,

    sender_id uuid not null
        references auth.users(id) on delete cascade,

    message text not null,
    phone text,

    status text not null default 'new'
        check (status in ('new', 'read', 'answered', 'closed')),

    created_at timestamptz not null default now()
);

create index if not exists inquiries_property_idx
    on public.inquiries(property_id);

create index if not exists inquiries_sender_idx
    on public.inquiries(sender_id);

-- =========================================
-- 6. ROW LEVEL SECURITY
-- =========================================

alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.property_media enable row level security;
alter table public.inquiries enable row level security;

-- Profiles
drop policy if exists "Users view own profile" on public.profiles;
create policy "Users view own profile"
on public.profiles
for select
to authenticated
using (id = (select auth.uid()) or public.is_admin());

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()) or public.is_admin())
with check (
    public.is_admin()
    or (
        id = (select auth.uid())
        and role = 'user'
    )
);

-- Properties: public sees approved listings only.
drop policy if exists "Public view approved properties" on public.properties;
create policy "Public view approved properties"
on public.properties
for select
to anon, authenticated
using (
    status = 'approved'
    or user_id = (select auth.uid())
    or public.is_admin()
);

-- Users can submit their own pending listings.
drop policy if exists "Users submit properties" on public.properties;
create policy "Users submit properties"
on public.properties
for insert
to authenticated
with check (
    user_id = (select auth.uid())
    and status = 'pending'
);

-- Owners can edit their own pending listings.
drop policy if exists "Owners edit pending properties" on public.properties;
create policy "Owners edit pending properties"
on public.properties
for update
to authenticated
using (
    user_id = (select auth.uid())
    and status = 'pending'
)
with check (
    user_id = (select auth.uid())
    and status = 'pending'
);

-- Administrators can manage all listings.
drop policy if exists "Admins manage properties" on public.properties;
create policy "Admins manage properties"
on public.properties
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Property media
drop policy if exists "View approved property media" on public.property_media;
create policy "View approved property media"
on public.property_media
for select
to anon, authenticated
using (
    exists (
        select 1
        from public.properties p
        where p.id = property_id
          and (
              p.status = 'approved'
              or p.user_id = (select auth.uid())
              or public.is_admin()
          )
    )
);

drop policy if exists "Users add own property media" on public.property_media;
create policy "Users add own property media"
on public.property_media
for insert
to authenticated
with check (
    user_id = (select auth.uid())
    and exists (
        select 1
        from public.properties p
        where p.id = property_id
          and p.user_id = (select auth.uid())
          and p.status = 'pending'
    )
);

drop policy if exists "Admins manage property media" on public.property_media;
create policy "Admins manage property media"
on public.property_media
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Inquiries
drop policy if exists "Users submit inquiries" on public.inquiries;
create policy "Users submit inquiries"
on public.inquiries
for insert
to authenticated
with check (
    sender_id = (select auth.uid())
    and exists (
        select 1
        from public.properties p
        where p.id = property_id
          and p.status = 'approved'
    )
);

drop policy if exists "Senders and property owners view inquiries" on public.inquiries;
create policy "Senders and property owners view inquiries"
on public.inquiries
for select
to authenticated
using (
    sender_id = (select auth.uid())
    or exists (
        select 1
        from public.properties p
        where p.id = property_id
          and p.user_id = (select auth.uid())
    )
    or public.is_admin()
);

drop policy if exists "Admins manage inquiries" on public.inquiries;
create policy "Admins manage inquiries"
on public.inquiries
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- =========================================
-- END OF INITIAL SCHEMA
-- =========================================
