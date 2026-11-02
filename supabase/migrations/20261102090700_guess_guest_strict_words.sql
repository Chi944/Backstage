-- Backstage · 08 · guess_guest compares against whole words only.
-- word_similarity let short name parts match inside ordinary words ("Chen"~"check", "Min"~"minutes"),
-- so "check in Bartholomew" resolved to Chen Xiu Ling (0.54). strict_word_similarity respects word
-- boundaries: those drop to <= 0.39 while real names stay >= 0.90. Ties prefer the closer full name.
create or replace function public.guess_guest(p_text text)
returns table (id bigint, name text, score real)
language sql stable
security definer
set search_path = public, extensions
as $$
  select g.id, g.name, s.score
    from public.guests g
   cross join lateral (
     select strict_word_similarity(g.name, p_text) as full_name,
            greatest(
              strict_word_similarity(g.name, p_text),
              coalesce((
                select max(strict_word_similarity(t, p_text)) * 0.9
                  from regexp_split_to_table(g.name, '\s+') t
                 where length(t) >= 3 and lower(t) not in ('bin', 'binte', 'binti', 'bte', 'van', 'von', 'de', 'da')
              ), 0)
            )::real as score
   ) s
   where s.score >= 0.45
   order by s.score desc, s.full_name desc
   limit 1
$$;
