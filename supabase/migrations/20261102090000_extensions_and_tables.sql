-- Backstage · 01 · extensions, tables, indexes, RLS, grants
-- Extensions live in the `extensions` schema (Supabase best practice; keeps them out of the API surface).
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------- tables
create table public.guests (
  id            bigint generated always as identity primary key,
  name          text not null,
  tier          text not null default 'general' check (tier in ('general', 'vip', 'crew')),
  table_no      int,
  checked_in_at timestamptz,
  created_at    timestamptz default now()
);

create table public.commands (
  id             bigint generated always as identity primary key,
  name           text not null,
  description    text not null,
  example_phrase text not null,
  embedding      extensions.vector(384),
  rpc_name       text not null,
  param_type     text not null default 'none' check (param_type in ('none', 'guest', 'table', 'two_tables')),
  sql_preview    text not null,
  created_by     text not null default 'claude',
  created_at     timestamptz default now()
);
comment on column public.commands.param_type is
  'none | guest | table (a single integer: table number, or minutes for rewind_minutes) | two_tables';

create table public.unknown_requests (
  id         bigint generated always as identity primary key,
  text       text not null,
  resolved   boolean default false,
  created_at timestamptz default now()
);

create table public.history (
  id         bigint generated always as identity primary key,
  guest_id   bigint references public.guests (id) on delete set null,
  old_data   jsonb not null,
  action     text,
  undone     boolean default false,
  tx_id      bigint not null default txid_current(),  -- groups rows changed by one command (e.g. move_table)
  changed_at timestamptz default now()
);

-- ---------------------------------------------------------------- indexes
create index commands_embedding_hnsw on public.commands
  using hnsw (embedding extensions.vector_cosine_ops);
create index guests_name_trgm on public.guests
  using gin (name extensions.gin_trgm_ops);
create index history_guest_id_idx on public.history (guest_id);
create index history_pending_idx on public.history (changed_at desc) where undone = false;

-- ---------------------------------------------------------------- RLS
alter table public.guests           enable row level security;
alter table public.commands         enable row level security;
alter table public.unknown_requests enable row level security;
alter table public.history          enable row level security;

-- Read-only policies. There are deliberately NO insert/update/delete policies:
-- every write goes through a SECURITY DEFINER function.
create policy "public read guests"           on public.guests           for select to anon, authenticated using (true);
create policy "public read unknown_requests" on public.unknown_requests for select to anon, authenticated using (true);
create policy "public read history"          on public.history          for select to anon, authenticated using (true);
create policy "public read commands"         on public.commands         for select to anon, authenticated using (true);

-- ---------------------------------------------------------------- grants
-- Supabase grants ALL on new public tables by default; strip that back to SELECT.
revoke all on public.guests, public.commands, public.unknown_requests, public.history from anon, authenticated;
grant select on public.guests, public.unknown_requests, public.history to anon, authenticated;
-- commands: SELECT is required so Realtime can deliver newly taught commands to the console.
grant select on public.commands to anon, authenticated;

-- Catalog view: one row per command (commands has one row per example phrase).
create view public.command_catalog
with (security_invoker = true) as
select distinct on (name)
  name, description, rpc_name, param_type, sql_preview, created_by
from public.commands
order by name, id;

revoke all on public.command_catalog from anon, authenticated;
grant select on public.command_catalog to anon, authenticated;
