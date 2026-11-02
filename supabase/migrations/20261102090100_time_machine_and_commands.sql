-- Backstage · 02 · Time Machine, command functions, helper functions
-- All functions pin search_path. `extensions` is included because pgvector (<=>) and
-- pg_trgm (word_similarity) are installed there.

-- ================================================================ private schema
-- Not exposed through the Data API: internal helpers and secrets live here.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.admin_tokens (
  token_hash text primary key,                -- sha256 hex of the ADMIN_TOKEN
  created_at timestamptz default now()
);

-- Standard result shape: { message, rows, kind, ok }
create function private.result(p_message text, p_rows jsonb, p_kind text, p_ok boolean default true)
returns jsonb
language sql immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'message', p_message,
    'rows',    coalesce(p_rows, '[]'::jsonb),
    'kind',    p_kind,
    'ok',      p_ok
  )
$$;

-- ================================================================ Time Machine
-- BEFORE UPDATE: snapshot the OLD row into history, tagged with the command name.
create function private.record_guest_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('backstage.skip_history', true), '') = 'on' then
    return new;  -- an undo/rewind is restoring this row; don't record it
  end if;
  if (new.name, new.tier, new.table_no, new.checked_in_at)
     is not distinct from (old.name, old.tier, old.table_no, old.checked_in_at) then
    return new;  -- no-op update
  end if;
  insert into public.history (guest_id, old_data, action)
  values (old.id, to_jsonb(old), coalesce(nullif(current_setting('backstage.action', true), ''), 'update'));
  return new;
end
$$;

create trigger guests_time_machine
before update on public.guests
for each row execute function private.record_guest_change();

-- Restore one history row onto guests without recording the restore itself.
create function private.restore(p_history public.history)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('backstage.skip_history', 'on', true);
  update public.guests g
     set name = r.name, tier = r.tier, table_no = r.table_no, checked_in_at = r.checked_in_at
    from jsonb_populate_record(null::public.guests, p_history.old_data) r
   where g.id = p_history.guest_id;
  perform set_config('backstage.skip_history', 'off', true);
  update public.history set undone = true where id = p_history.id;
end
$$;

-- undo_last(): reverts the most recent command (all rows it touched, e.g. a whole move_table).
create function public.undo_last()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tx     bigint;
  v_action text;
  v_n      int := 0;
  v_rows   jsonb;
  h        public.history;
begin
  select tx_id, action into v_tx, v_action
    from public.history where undone = false
   order by id desc limit 1;

  if v_tx is null then
    return private.result('Nothing to undo', '[]', 'write', false);
  end if;

  for h in select * from public.history
            where undone = false and tx_id = v_tx
            order by id desc
            for update
  loop
    perform private.restore(h);
    v_n := v_n + 1;
  end loop;

  select jsonb_agg(to_jsonb(g) order by g.name) into v_rows
    from public.guests g
   where g.id in (select guest_id from public.history where tx_id = v_tx);

  return private.result(
    format('Undid %s (%s %s restored)', v_action, v_n, case when v_n = 1 then 'guest' else 'guests' end),
    v_rows, 'write');
end
$$;

-- rewind_minutes(n): undoes every change newer than now() - n minutes, newest first.
create function public.rewind_minutes(p_minutes int)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_n    int := 0;
  v_ids  bigint[] := '{}';
  v_rows jsonb;
  h      public.history;
begin
  if p_minutes is null or p_minutes < 1 or p_minutes > 1440 then
    return private.result('Rewind must be between 1 and 1440 minutes', '[]', 'write', false);
  end if;

  for h in select * from public.history
            where undone = false
              and changed_at > now() - make_interval(mins => p_minutes)
            order by id desc
            for update
  loop
    perform private.restore(h);
    v_n := v_n + 1;
    v_ids := v_ids || h.guest_id;
  end loop;

  if v_n = 0 then
    return private.result(format('Nothing changed in the last %s minutes', p_minutes), '[]', 'write', false);
  end if;

  select jsonb_agg(to_jsonb(g) order by g.name) into v_rows
    from public.guests g where g.id = any (v_ids);

  return private.result(
    format('Rewound %s minutes: undid %s %s across %s %s',
           p_minutes, v_n, case when v_n = 1 then 'change' else 'changes' end,
           jsonb_array_length(v_rows), case when jsonb_array_length(v_rows) = 1 then 'guest' else 'guests' end),
    v_rows, 'write');
end
$$;

-- ================================================================ read commands
create function public.not_checked_in()
returns jsonb
language plpgsql stable
security definer
set search_path = public, extensions
as $$
declare v_rows jsonb; v_n int;
begin
  select coalesce(jsonb_agg(to_jsonb(g) order by g.name), '[]'), count(*)
    into v_rows, v_n
    from public.guests g where g.checked_in_at is null;
  return private.result(
    case when v_n = 0 then 'Everyone has arrived'
         when v_n = 1 then '1 guest hasn''t arrived yet'
         else format('%s guests haven''t arrived yet', v_n) end,
    v_rows, 'read');
end
$$;

create function public.who_is_inside()
returns jsonb
language plpgsql stable
security definer
set search_path = public, extensions
as $$
declare v_rows jsonb; v_n int;
begin
  select coalesce(jsonb_agg(to_jsonb(g) order by g.checked_in_at desc), '[]'), count(*)
    into v_rows, v_n
    from public.guests g where g.checked_in_at is not null;
  return private.result(
    case when v_n = 0 then 'No one is inside yet'
         when v_n = 1 then '1 guest is inside'
         else format('%s guests are inside', v_n) end,
    v_rows, 'read');
end
$$;

create function public.vip_inside_count()
returns jsonb
language plpgsql stable
security definer
set search_path = public, extensions
as $$
declare v_rows jsonb; v_n int;
begin
  select coalesce(jsonb_agg(to_jsonb(g) order by g.checked_in_at desc), '[]'), count(*)
    into v_rows, v_n
    from public.guests g where g.tier = 'vip' and g.checked_in_at is not null;
  return private.result(
    case when v_n = 1 then '1 VIP is inside' else format('%s VIPs are inside', v_n) end,
    v_rows, 'read');
end
$$;

create function public.guests_at_table(p_table int)
returns jsonb
language plpgsql stable
security definer
set search_path = public, extensions
as $$
declare v_rows jsonb; v_n int; v_in int;
begin
  select coalesce(jsonb_agg(to_jsonb(g) order by g.name), '[]'), count(*), count(g.checked_in_at)
    into v_rows, v_n, v_in
    from public.guests g where g.table_no = p_table;
  if v_n = 0 then
    return private.result(format('No one is seated at table %s', p_table), '[]', 'read', false);
  end if;
  return private.result(
    format('Table %s has %s %s (%s checked in)', p_table, v_n, case when v_n = 1 then 'guest' else 'guests' end, v_in),
    v_rows, 'read');
end
$$;

-- ================================================================ write commands
create function public.check_in_guest(p_guest_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare g public.guests;
begin
  select * into g from public.guests where id = p_guest_id for update;
  if not found then
    return private.result('Guest not found', '[]', 'write', false);
  end if;
  if g.checked_in_at is not null then
    return private.result(
      format('%s is already checked in (since %s)', g.name,
             to_char(g.checked_in_at at time zone 'Asia/Singapore', 'HH24:MI')),
      jsonb_build_array(to_jsonb(g)), 'write', false);
  end if;

  perform set_config('backstage.action', 'check_in_guest', true);
  update public.guests set checked_in_at = now() where id = p_guest_id returning * into g;

  return private.result(
    format('Checked in %s%s', g.name, case when g.tier = 'vip' then ' (VIP)' else '' end),
    jsonb_build_array(to_jsonb(g)), 'write');
end
$$;

create function public.check_out_guest(p_guest_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare g public.guests;
begin
  select * into g from public.guests where id = p_guest_id for update;
  if not found then
    return private.result('Guest not found', '[]', 'write', false);
  end if;
  if g.checked_in_at is null then
    return private.result(format('%s isn''t checked in', g.name), jsonb_build_array(to_jsonb(g)), 'write', false);
  end if;

  perform set_config('backstage.action', 'check_out_guest', true);
  update public.guests set checked_in_at = null where id = p_guest_id returning * into g;

  return private.result(format('Checked out %s', g.name), jsonb_build_array(to_jsonb(g)), 'write');
end
$$;

create function public.move_table(p_from int, p_to int)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_rows jsonb; v_n int;
begin
  if p_from is null or p_to is null then
    return private.result('Both a source and a destination table are needed', '[]', 'write', false);
  end if;
  if p_from = p_to then
    return private.result(format('Table %s is already table %s', p_from, p_to), '[]', 'write', false);
  end if;

  perform set_config('backstage.action', 'move_table', true);
  with moved as (
    update public.guests set table_no = p_to where table_no = p_from returning *
  )
  select coalesce(jsonb_agg(to_jsonb(m) order by m.name), '[]'), count(*) into v_rows, v_n from moved;

  if v_n = 0 then
    return private.result(format('No one is seated at table %s', p_from), '[]', 'write', false);
  end if;
  return private.result(
    format('Moved %s %s from table %s to table %s', v_n, case when v_n = 1 then 'guest' else 'guests' end, p_from, p_to),
    v_rows, 'write');
end
$$;

-- ================================================================ helpers (service role only)
create function public.match_command(query_embedding extensions.vector(384), match_threshold float, match_count int)
returns table (
  id bigint, name text, description text, example_phrase text,
  rpc_name text, param_type text, sql_preview text, similarity float
)
language sql stable
security definer
set search_path = public, extensions
as $$
  select * from (
    select c.id, c.name, c.description, c.example_phrase, c.rpc_name, c.param_type, c.sql_preview,
           1 - (c.embedding <=> query_embedding) as similarity
      from public.commands c
     where c.embedding is not null
     order by c.embedding <=> query_embedding
     limit greatest(match_count, 1)
  ) top
  where top.similarity >= match_threshold
  order by top.similarity desc
$$;

-- Best guest whose name appears anywhere inside p_text. Scores the full name, and also each
-- single name word (x0.9) so "mark Ali as arrived" finds "Ali Rahman".
create function public.guess_guest(p_text text)
returns table (id bigint, name text, score real)
language sql stable
security definer
set search_path = public, extensions
as $$
  select g.id, g.name, s.score
    from public.guests g
   cross join lateral (
     select greatest(
       word_similarity(g.name, p_text),
       coalesce((
         select max(word_similarity(t, p_text)) * 0.9
           from regexp_split_to_table(g.name, '\s+') t
          where length(t) >= 3 and lower(t) not in ('bin', 'binte', 'binti', 'bte', 'van', 'von', 'de', 'da')
       ), 0)
     )::real as score
   ) s
   where s.score >= 0.45
   order by s.score desc, word_similarity(g.name, p_text) desc
   limit 1
$$;

create function public.log_unknown(p_text text)
returns bigint
language sql
security definer
set search_path = public, extensions
as $$
  insert into public.unknown_requests (text) values (left(p_text, 500)) returning id
$$;

create function public.verify_admin_token(p_token text)
returns boolean
language sql stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from private.admin_tokens
     where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  )
$$;

-- ================================================================ privileges
-- Postgres grants EXECUTE to PUBLIC by default, and Supabase adds anon/authenticated.
revoke execute on all functions in schema public  from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
-- Future functions are NOT callable by the frontend until explicitly granted (see TEACHING.md).
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- Frontend-callable commands
grant execute on function
  public.not_checked_in(), public.who_is_inside(), public.vip_inside_count(),
  public.guests_at_table(int), public.check_in_guest(bigint), public.check_out_guest(bigint),
  public.move_table(int, int), public.undo_last(), public.rewind_minutes(int)
to anon, authenticated;

-- Edge Function (service role) only
grant execute on function
  public.match_command(extensions.vector, float, int), public.guess_guest(text),
  public.log_unknown(text), public.verify_admin_token(text)
to service_role;
