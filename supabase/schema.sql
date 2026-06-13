-- Nova — Supabase schema. Run this once in the Supabase SQL editor.
-- Covers Phase 1 (accounts + invites) and Phase 1.5 (cloud sync + billing).

-- ─────────────────────────────────────────────────────────────────────────────
-- PROFILES (one row per user; created automatically on sign-up)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id                 uuid primary key references auth.users on delete cascade,
  email              text,
  invited_by         uuid references public.profiles(id),
  invites_remaining  int  not null default 10,
  activated          boolean not null default false, -- true once a valid invite is redeemed
  is_admin           boolean not null default false,
  -- billing (Phase 1.5)
  stripe_customer_id text,
  plan               text not null default 'free',   -- 'free' | 'pro'
  plan_status        text,                            -- mirrors the Stripe subscription status
  created_at         timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select using (auth.uid() = id);
-- profiles are written only via SECURITY DEFINER functions / triggers below.

-- ─────────────────────────────────────────────────────────────────────────────
-- INVITES (invite-tree; each account gets 10 codes to give out)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.invites (
  code        text primary key,
  created_by  uuid references public.profiles(id) on delete set null, -- null = admin-seeded
  used_by     uuid references public.profiles(id),
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.invites enable row level security;

drop policy if exists "invites: read own" on public.invites;
create policy "invites: read own" on public.invites
  for select using (created_by = auth.uid());

-- Validate a code before sign-in (callable by anon; doesn't expose the table).
create or replace function public.check_invite(p_code text)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.invites where code = p_code and used_by is null);
$$;
grant execute on function public.check_invite(text) to anon, authenticated;

-- On new auth user: create the profile and redeem the invite code passed in the
-- sign-up metadata. If the code is missing/invalid, activated stays false and
-- the app gate keeps them out until a valid code is redeemed.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_code text; v_inviter uuid;
begin
  v_code := new.raw_user_meta_data->>'invite_code';
  insert into public.profiles (id, email) values (new.id, new.email)
    on conflict (id) do nothing;
  if v_code is not null then
    update public.invites set used_by = new.id, used_at = now()
      where code = v_code and used_by is null
      returning created_by into v_inviter;
    if found then
      update public.profiles set activated = true, invited_by = v_inviter where id = new.id;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Redeem a code for an already-signed-in user (fallback if they signed in
-- before entering a code).
create or replace function public.redeem_invite(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_inviter uuid;
begin
  if (select activated from public.profiles where id = auth.uid()) then
    return true;
  end if;
  update public.invites set used_by = auth.uid(), used_at = now()
    where code = p_code and used_by is null
    returning created_by into v_inviter;
  if not found then return false; end if;
  update public.profiles set activated = true, invited_by = v_inviter where id = auth.uid();
  return true;
end; $$;
grant execute on function public.redeem_invite(text) to authenticated;

-- Generate one invite code for the current user (enforces the 10-per-user cap).
create or replace function public.generate_invite()
returns text language plpgsql security definer set search_path = public as $$
declare v_code text; v_remaining int;
begin
  select invites_remaining into v_remaining from public.profiles where id = auth.uid() for update;
  if v_remaining is null or v_remaining <= 0 then
    raise exception 'No invites remaining';
  end if;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.invites (code, created_by) values (v_code, auth.uid());
  update public.profiles set invites_remaining = invites_remaining - 1 where id = auth.uid();
  return v_code;
end; $$;
grant execute on function public.generate_invite() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- CLOUD PROJECTS (Phase 1.5 — the paid sync/backup feature)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.cloud_projects (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  id          text not null,            -- the client-side project id
  name        text,
  data        jsonb not null,           -- the full ProjectRecord (files, etc.)
  rev         bigint not null default 1, -- bumped on each write (last-write-wins)
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false,
  primary key (user_id, id)
);
alter table public.cloud_projects enable row level security;

drop policy if exists "cloud_projects: own" on public.cloud_projects;
create policy "cloud_projects: own" on public.cloud_projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Enable realtime so cross-device sync updates live. (Safe to run on its own if
-- you already ran the rest of the schema.)
do $$
begin
  alter publication supabase_realtime add table public.cloud_projects;
exception when duplicate_object then null;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN: seed the first invite codes to hand to friends, e.g.
--   insert into public.invites (code) values ('NOVA-ALPHA-1'), ('NOVA-ALPHA-2');
-- Make yourself admin after you sign up:
--   update public.profiles set is_admin = true, activated = true, invites_remaining = 999 where email = 'you@example.com';
-- ─────────────────────────────────────────────────────────────────────────────
