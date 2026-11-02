# Teaching Backstage a New Command

When an event manager asks something Backstage doesn't know, `match-command` replies `{ "status": "unknown" }` and logs the text to `unknown_requests`. Teaching closes that loop in four steps, with no redeploy and no LLM.

> The live demo walks through this with **"which table has the most VIPs"**. That command is deliberately *not* in the seed.

---

## Step 0 — Find what people asked

```sql
select id, text, created_at
from public.unknown_requests
where resolved = false
order by created_at desc;
```

## Step 1 — Create the Postgres function

Rules every command function must follow:

1. **Return the standard result shape** with `private.result(message, rows, kind, ok)`, which produces `{ message, rows, kind, ok }`.
2. **Reads** (`kind = 'read'`): `language plpgsql stable security invoker`. Anon already has `SELECT` on `guests`.
3. **Writes** (`kind = 'write'`): `security definer`, and call `perform set_config('backstage.action', '<rpc_name>', true);` before updating, so the Time Machine records the action name and Undo works.
4. **Always** `set search_path = public, extensions`.
5. **Grant** execute to `anon, authenticated`. New functions are locked down by default.
6. Parameters must fit one of the extractors: none, `p_guest_id bigint` (guest), `p_table int` (one number), or `p_from int, p_to int` (two numbers).

Worked example (read-only, no parameters):

```sql
create function public.vip_table_ranking()
returns jsonb
language plpgsql stable
security invoker
set search_path = public, extensions
as $$
declare v_rows jsonb; v_top record;
begin
  select coalesce(jsonb_agg(r order by r.vips desc, r.table_no), '[]') into v_rows
  from (
    select table_no, count(*) filter (where tier = 'vip') as vips, count(*) as guests
    from public.guests
    where table_no is not null
    group by table_no
    having count(*) filter (where tier = 'vip') > 0
  ) r;

  select (v_rows -> 0 ->> 'table_no')::int as table_no, (v_rows -> 0 ->> 'vips')::int as vips into v_top;

  if v_top.table_no is null then
    return private.result('No VIPs are seated yet', '[]', 'read', false);
  end if;
  return private.result(format('Table %s has the most VIPs (%s)', v_top.table_no, v_top.vips), v_rows, 'read');
end
$$;

grant execute on function public.vip_table_ranking() to anon, authenticated;
```

> `rows` normally holds guest records. A ranking command can return its own row shape (here `{table_no, vips, guests}`), so make sure the frontend renders generic rows.

Apply it as a tracked migration (Supabase MCP `apply_migration`, or `supabase db push`) and save the SQL under `supabase/migrations/`.

## Step 2 — Insert 5–7 example phrases

One row per phrase; every row shares `name`, `description`, `rpc_name`, `param_type` and `sql_preview`. Mix the registers: casual, formal, short, long.

```sql
insert into public.commands (name, description, example_phrase, rpc_name, param_type, sql_preview, created_by)
select 'VIP table ranking',
       'Rank tables by how many VIPs are seated there',
       phrase,
       'vip_table_ranking',
       'none',
       'SELECT table_no, count(*) FILTER (WHERE tier = ''vip'') AS vips FROM guests GROUP BY table_no ORDER BY vips DESC;',
       'claude'
from unnest(array[
  'which table has the most VIPs',
  'where are most of the VIPs sitting',
  'top table for VIPs',
  'rank tables by VIP count',
  'which table is busiest with VIPs',
  'the table with the highest number of VIPs'
]) as phrase;
```

> ⚠️ **Ranking guard.** If the command answers a *ranking* question, its phrases **must** contain a ranking word: *most, least, fewest, highest, lowest, top, biggest, largest, smallest, busiest, emptiest, rank*. `match-command` refuses to match ranking questions to phrases that have none of these words.

The `INSERT` fires a Realtime event on `commands`, so open consoles can refresh their catalog right away.

## Step 3 — Embed the new phrases

```bash
curl -X POST "https://xakzepavudmskiegpwqw.supabase.co/functions/v1/embed-commands" \
  -H "x-admin-token: $ADMIN_TOKEN"
# {"embedded":6,"failed":[],"remaining":0}
```

`ADMIN_TOKEN` is in your local `.env.local`. Each call embeds up to 8 rows, so **repeat until `remaining` is 0.** Then check:

```sql
select count(*) as missing from public.commands where embedding is null;  -- expect 0
```

Optionally test the match before going live (debug mode logs nothing):

```bash
curl -X POST "https://xakzepavudmskiegpwqw.supabase.co/functions/v1/match-command" \
  -H "content-type: application/json" \
  -d '{"text":"which table has the most VIPs","debug":true}'
```

## Step 4 — Mark the unknown requests resolved

```sql
update public.unknown_requests
set resolved = true
where resolved = false
  and text ilike any (array['%most vip%', '%vip%table%', '%table%vip%']);
```

Or resolve by id: `update public.unknown_requests set resolved = true where id in (1, 2);`

Anon can't do this (no `UPDATE` grant). It runs as the database owner, through the MCP / SQL editor. The `UPDATE` also streams over Realtime, so the console's "unknown" inbox clears itself.

---

## Checklist

- [ ] Function returns `private.result(...)` · pinned `search_path` · `security invoker` (read) or `definer` + `set_config('backstage.action', …)` (write)
- [ ] `grant execute … to anon, authenticated`
- [ ] Migration file saved under `supabase/migrations/`
- [ ] 5–7 phrases inserted (ranking words if it's a ranking question)
- [ ] `embed-commands` called until `remaining = 0`; no null embeddings
- [ ] `unknown_requests` marked `resolved = true`
- [ ] Optional: regenerate `lib/database.types.ts` and add the command to the table in `BACKEND.md`
