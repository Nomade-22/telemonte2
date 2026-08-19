-- TELEMONTE - Fase 1 do banco online (Supabase/Postgres)
-- Execute este arquivo no SQL Editor de um projeto Supabase novo.
-- O frontend usa SOMENTE a Publishable Key. Nunca coloque Secret Key no GitHub ou navegador.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.organizations (id, name)
values ('11111111-1111-4111-8111-111111111111', 'Telemonte')
on conflict (id) do update set name = excluded.name;

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','supervisor','driver')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.containers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  number integer not null,
  capacity text not null default '',
  status text not null default 'Disponível no pátio',
  location text not null default 'Pátio Telemonte',
  client_name text not null default '',
  gps text not null default '',
  history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (organization_id, code),
  unique (organization_id, number)
);

create index if not exists containers_org_idx on public.containers(organization_id);
create index if not exists members_user_idx on public.organization_members(user_id);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.containers enable row level security;

-- Usuário pode ver somente a organização da qual é membro.
drop policy if exists "members_select_org" on public.organizations;
create policy "members_select_org" on public.organizations
for select to authenticated
using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = organizations.id
      and m.user_id = auth.uid()
      and m.active = true
  )
);

-- Usuário pode ver apenas membros da própria organização.
drop policy if exists "members_select_members" on public.organization_members;
create policy "members_select_members" on public.organization_members
for select to authenticated
using (
  exists (
    select 1 from public.organization_members self
    where self.organization_id = organization_members.organization_id
      and self.user_id = auth.uid()
      and self.active = true
  )
);

-- Admin pode gerenciar vínculos/perfis.
drop policy if exists "admin_manage_members" on public.organization_members;
create policy "admin_manage_members" on public.organization_members
for all to authenticated
using (
  exists (
    select 1 from public.organization_members self
    where self.organization_id = organization_members.organization_id
      and self.user_id = auth.uid()
      and self.active = true
      and self.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.organization_members self
    where self.organization_id = organization_members.organization_id
      and self.user_id = auth.uid()
      and self.active = true
      and self.role = 'admin'
  )
);

-- Todos os membros ativos podem consultar as caçambas.
drop policy if exists "members_select_containers" on public.containers;
create policy "members_select_containers" on public.containers
for select to authenticated
using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = containers.organization_id
      and m.user_id = auth.uid()
      and m.active = true
  )
);

-- Membros ativos podem registrar movimentação/estado.
-- Restrições extras para campos administrativos são aplicadas pelo trigger abaixo.
drop policy if exists "members_insert_containers" on public.containers;
create policy "members_insert_containers" on public.containers
for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = containers.organization_id
      and m.user_id = auth.uid()
      and m.active = true
      and m.role in ('admin','supervisor')
  )
);

drop policy if exists "members_update_containers" on public.containers;
create policy "members_update_containers" on public.containers
for update to authenticated
using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = containers.organization_id
      and m.user_id = auth.uid()
      and m.active = true
  )
)
with check (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = containers.organization_id
      and m.user_id = auth.uid()
      and m.active = true
  )
);

drop policy if exists "admin_delete_containers" on public.containers;
create policy "admin_delete_containers" on public.containers
for delete to authenticated
using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = containers.organization_id
      and m.user_id = auth.uid()
      and m.active = true
      and m.role = 'admin'
  )
);

-- Motorista não pode alterar identificação/tamanho da caçamba via API.
create or replace function public.guard_container_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_role text;
begin
  select role into member_role
  from public.organization_members
  where organization_id = old.organization_id
    and user_id = auth.uid()
    and active = true;

  if member_role = 'driver' then
    if new.organization_id is distinct from old.organization_id
       or new.code is distinct from old.code
       or new.number is distinct from old.number
       or new.capacity is distinct from old.capacity then
      raise exception 'Motorista não possui permissão para alterar identificação ou capacidade da caçamba.';
    end if;
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_guard_container_admin_fields on public.containers;
create trigger trg_guard_container_admin_fields
before update on public.containers
for each row execute function public.guard_container_admin_fields();

-- Privilégios da Data API (RLS continua sendo a autoridade de acesso).
grant usage on schema public to authenticated;
grant select on public.organizations to authenticated;
grant select on public.organization_members to authenticated;
grant select, insert, update, delete on public.containers to authenticated;

-- Realtime para as caçambas.
do $$
begin
  alter publication supabase_realtime add table public.containers;
exception
  when duplicate_object then null;
end $$;

-- Depois de criar os usuários no Supabase Auth, vincule-os assim (substitua os UUIDs):
-- insert into public.organization_members(organization_id,user_id,role) values
-- ('11111111-1111-4111-8111-111111111111','UUID-DO-ADMIN','admin'),
-- ('11111111-1111-4111-8111-111111111111','UUID-DO-SUPERVISOR','supervisor'),
-- ('11111111-1111-4111-8111-111111111111','UUID-DO-MOTORISTA','driver');
