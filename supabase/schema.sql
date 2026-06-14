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
-- COLLABORATION (Phase 8 — invite editors / commentors / viewers)
-- A project is owned by one user (their cloud_projects row). Collaborators are
-- invited by email and granted a role; RLS enforces the role on both the project
-- data and its comments. Inviting an EDITOR requires the owner be on Studio.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.project_collaborators (
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  project_id      text not null,                       -- the owner's cloud_projects.id
  email           text not null,
  collaborator_id uuid references public.profiles(id) on delete cascade, -- null until they sign up
  role            text not null check (role in ('editor','commentor','viewer')),
  invited_by      uuid references public.profiles(id),
  status          text not null default 'pending',     -- 'pending' | 'active'
  created_at      timestamptz not null default now(),
  primary key (owner_id, project_id, email)
);
alter table public.project_collaborators enable row level security;

create table if not exists public.project_comments (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  project_id    text not null,
  element_id    text not null,
  element_label text,
  body          text not null,
  x             real,                                  -- 0–1 pin position
  y             real,
  author_id     uuid references public.profiles(id),
  resolved      boolean not null default false,
  created_at    timestamptz not null default now()
);
alter table public.project_comments enable row level security;

-- Access helpers (SECURITY DEFINER: read the collaborators table past RLS).
create or replace function public.can_access_project(p_owner uuid, p_project text)
returns boolean language sql security definer stable set search_path = public as $$
  select p_owner = auth.uid() or exists (
    select 1 from public.project_collaborators pc
    where pc.owner_id = p_owner and pc.project_id = p_project
      and pc.collaborator_id = auth.uid() and pc.status = 'active');
$$;
create or replace function public.can_edit_project(p_owner uuid, p_project text)
returns boolean language sql security definer stable set search_path = public as $$
  select p_owner = auth.uid() or exists (
    select 1 from public.project_collaborators pc
    where pc.owner_id = p_owner and pc.project_id = p_project
      and pc.collaborator_id = auth.uid() and pc.status = 'active' and pc.role = 'editor');
$$;
create or replace function public.can_comment_project(p_owner uuid, p_project text)
returns boolean language sql security definer stable set search_path = public as $$
  select p_owner = auth.uid() or exists (
    select 1 from public.project_collaborators pc
    where pc.owner_id = p_owner and pc.project_id = p_project
      and pc.collaborator_id = auth.uid() and pc.status = 'active' and pc.role in ('editor','commentor'));
$$;

-- project_collaborators RLS: the owner manages; a collaborator sees their rows.
drop policy if exists "collab: owner manage" on public.project_collaborators;
create policy "collab: owner manage" on public.project_collaborators
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "collab: see mine" on public.project_collaborators;
create policy "collab: see mine" on public.project_collaborators
  for select using (collaborator_id = auth.uid() or email = (select email from public.profiles where id = auth.uid()));

-- cloud_projects: collaborators read; the owner + editors write.
drop policy if exists "cloud_projects: own" on public.cloud_projects;
drop policy if exists "cloud_projects: read" on public.cloud_projects;
create policy "cloud_projects: read" on public.cloud_projects
  for select using (public.can_access_project(user_id, id));
drop policy if exists "cloud_projects: write" on public.cloud_projects;
create policy "cloud_projects: write" on public.cloud_projects
  for all using (public.can_edit_project(user_id, id)) with check (public.can_edit_project(user_id, id));

-- project_comments RLS by role: anyone with access reads; editors+commentors add
-- (their own); authors + editors edit/delete.
drop policy if exists "comments: read" on public.project_comments;
create policy "comments: read" on public.project_comments
  for select using (public.can_access_project(owner_id, project_id));
drop policy if exists "comments: add" on public.project_comments;
create policy "comments: add" on public.project_comments
  for insert with check (author_id = auth.uid() and public.can_comment_project(owner_id, project_id));
drop policy if exists "comments: edit" on public.project_comments;
create policy "comments: edit" on public.project_comments
  for update using (author_id = auth.uid() or public.can_edit_project(owner_id, project_id))
  with check (author_id = auth.uid() or public.can_edit_project(owner_id, project_id));
drop policy if exists "comments: delete" on public.project_comments;
create policy "comments: delete" on public.project_comments
  for delete using (author_id = auth.uid() or public.can_edit_project(owner_id, project_id));

-- Invite a collaborator. Inviting an EDITOR requires Studio (or admin) — enforced
-- here so it can't be bypassed from the client.
create or replace function public.invite_collaborator(p_project text, p_email text, p_role text)
returns text language plpgsql security definer set search_path = public as $$
declare v_plan text; v_admin boolean; v_status text; v_uid uuid;
begin
  if p_role not in ('editor','commentor','viewer') then raise exception 'invalid role'; end if;
  select plan, is_admin into v_plan, v_admin from public.profiles where id = auth.uid();
  if p_role = 'editor' and coalesce(v_plan,'free') <> 'studio' and not coalesce(v_admin,false) then
    raise exception 'Inviting editors requires the Studio plan';
  end if;
  select id into v_uid from public.profiles where lower(email) = lower(p_email);
  insert into public.project_collaborators (owner_id, project_id, email, role, invited_by, collaborator_id, status)
  values (auth.uid(), p_project, lower(p_email), p_role, auth.uid(), v_uid,
          case when v_uid is not null then 'active' else 'pending' end)
  on conflict (owner_id, project_id, email) do update set role = excluded.role
  returning status into v_status;
  return v_status;
end; $$;
grant execute on function public.invite_collaborator(text, text, text) to authenticated;

-- Link any pending invites to the signed-in user (call after sign-in).
create or replace function public.link_collaborations()
returns void language sql security definer set search_path = public as $$
  update public.project_collaborators
  set collaborator_id = auth.uid(), status = 'active'
  where collaborator_id is null
    and lower(email) = lower((select email from public.profiles where id = auth.uid()));
$$;
grant execute on function public.link_collaborations() to authenticated;

-- Projects shared WITH the current user (for the dashboard, with role + data).
create or replace function public.my_shared_projects()
returns table (owner_id uuid, project_id text, role text, name text, data jsonb, rev bigint, updated_at timestamptz)
language sql security definer stable set search_path = public as $$
  select pc.owner_id, pc.project_id, pc.role, cp.name, cp.data, cp.rev, cp.updated_at
  from public.project_collaborators pc
  join public.cloud_projects cp on cp.user_id = pc.owner_id and cp.id = pc.project_id and not cp.deleted
  where pc.collaborator_id = auth.uid() and pc.status = 'active';
$$;
grant execute on function public.my_shared_projects() to authenticated;

-- Realtime for live comments + collaborator changes.
do $$ begin alter publication supabase_realtime add table public.project_comments; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.project_collaborators; exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN: seed the first invite codes to hand to friends, e.g.
--   insert into public.invites (code) values ('NOVA-ALPHA-1'), ('NOVA-ALPHA-2');
-- Make yourself admin after you sign up:
--   update public.profiles set is_admin = true, activated = true, invites_remaining = 999 where email = 'you@example.com';
-- ─────────────────────────────────────────────────────────────────────────────
