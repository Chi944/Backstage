-- Backstage · 04 · fix: move_table referenced CTE alias `m` without declaring it
create or replace function public.move_table(p_from int, p_to int)
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
  select coalesce(jsonb_agg(to_jsonb(m) order by m.name), '[]'), count(*) into v_rows, v_n from moved m;

  if v_n = 0 then
    return private.result(format('No one is seated at table %s', p_from), '[]', 'write', false);
  end if;
  return private.result(
    format('Moved %s %s from table %s to table %s', v_n, case when v_n = 1 then 'guest' else 'guests' end, p_from, p_to),
    v_rows, 'write');
end
$$;
