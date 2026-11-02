-- Backstage · 05 · advisor fix: read-only commands don't need definer rights.
-- anon already has SELECT on guests (RLS), so these run as the caller.
-- private.result is a pure jsonb builder; the private schema is not exposed through the Data API.
grant usage on schema private to anon, authenticated;
grant execute on function private.result(text, jsonb, text, boolean) to anon, authenticated;

alter function public.not_checked_in()      security invoker;
alter function public.who_is_inside()       security invoker;
alter function public.vip_inside_count()    security invoker;
alter function public.guests_at_table(int)  security invoker;
