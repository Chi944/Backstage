-- Backstage seed: 40 guests + 9 commands x 6-7 example phrases.
-- Embeddings are filled afterwards by the embed-commands Edge Function.
-- Guest phrases say "the guest": match-command masks the recognised name the same way before embedding.

-- ---------------------------------------------------------------- guests
insert into public.guests (name, tier, table_no, checked_in_at)
select name, tier, table_no,
       case when mins_ago is null then null else now() - make_interval(mins => mins_ago) end
from (values
  ('Sarah Tan',               'vip',     1,    null),
  ('Ali Rahman',              'general', 4,    null),
  ('Tan Wei Ming',            'vip',     1,    95),
  ('Lim Hui Min',             'general', 2,    110),
  ('Priya Ramasamy',          'vip',     3,    72),
  ('Nur Aisyah Binte Ismail', 'general', 4,    null),
  ('Rajesh Kumar',            'general', 5,    64),
  ('Daniel de Souza',         'vip',     2,    88),
  ('Chloe Pereira',           'general', 6,    null),
  ('Muhammad Faizal',         'crew',    null, 118),
  ('Ong Jia Hui',             'general', 3,    null),
  ('Siti Nurhaliza Ahmad',    'general', 7,    null),
  ('Arjun Menon',             'general', 8,    30),
  ('Emily Goh',               'general', 5,    null),
  ('Kavitha Subramaniam',     'vip',     9,    52),
  ('Benjamin Oliveiro',       'general', 6,    18),
  ('Hiroshi Tanaka',          'vip',     10,   40),
  ('Chen Xiu Ling',           'general', 7,    25),
  ('Farah Hassan',            'general', 8,    null),
  ('Gabriel Rozario',         'general', 9,    null),
  ('Wong Kai Xuan',           'general', 10,   12),
  ('Amanda Lee',              'crew',    null, 115),
  ('Vikram Pillai',           'general', 1,    null),
  ('Zainab Yusof',            'general', 2,    80),
  ('Lucas Fernandez',         'general', 3,    null),
  ('Ng Pei Shan',             'general', 4,    null),
  ('Isabelle Martin',         'vip',     5,    null),
  ('Harith Iskandar',         'general', 6,    35),
  ('Deepa Nair',              'general', 7,    null),
  ('Koh Boon Kiat',           'general', 8,    null),
  ('Sophia Wang',             'vip',     9,    20),
  ('Aaron Chua',              'general', 10,   null),
  ('Haziq Rahim',             'crew',    null, 100),
  ('Meera Krishnan',          'general', 1,    66),
  ('James O''Connor',         'general', 2,    null),
  ('Rachel Teo',              'general', 3,    8),
  ('Yusuf Abdullah',          'general', 4,    null),
  ('Clara Viegas',            'general', 5,    42),
  ('Jonathan Ho',             'crew',    null, 105),
  ('Aditi Sharma',            'general', 6,    null)
) as v(name, tier, table_no, mins_ago);

-- ---------------------------------------------------------------- commands
with meta(rpc_name, name, description, param_type, sql_preview) as (values
  ('not_checked_in', 'Who hasn''t arrived', 'List guests who have not checked in yet, A to Z', 'none',
   'SELECT * FROM guests WHERE checked_in_at IS NULL ORDER BY name;'),
  ('who_is_inside', 'Who''s inside', 'List guests who are checked in, most recent first', 'none',
   'SELECT * FROM guests WHERE checked_in_at IS NOT NULL ORDER BY checked_in_at DESC;'),
  ('check_in_guest', 'Check in guest', 'Mark one guest as arrived now', 'guest',
   'UPDATE guests SET checked_in_at = now() WHERE id = :p_guest_id AND checked_in_at IS NULL;'),
  ('check_out_guest', 'Check out guest', 'Mark one guest as having left', 'guest',
   'UPDATE guests SET checked_in_at = NULL WHERE id = :p_guest_id AND checked_in_at IS NOT NULL;'),
  ('vip_inside_count', 'VIPs inside', 'Count the VIP guests who are checked in', 'none',
   'SELECT count(*) FROM guests WHERE tier = ''vip'' AND checked_in_at IS NOT NULL;'),
  ('guests_at_table', 'Guests at table', 'List everyone seated at one table', 'table',
   'SELECT * FROM guests WHERE table_no = :p_table ORDER BY name;'),
  ('move_table', 'Move table', 'Move everyone from one table to another', 'two_tables',
   'UPDATE guests SET table_no = :p_to WHERE table_no = :p_from;'),
  ('undo_last', 'Undo last change', 'Revert the most recent command (every guest it touched)', 'none',
   'UPDATE guests SET (name, tier, table_no, checked_in_at) = history.old_data WHERE history.tx_id = (SELECT tx_id FROM history WHERE NOT undone ORDER BY id DESC LIMIT 1); UPDATE history SET undone = true WHERE tx_id = …;'),
  ('rewind_minutes', 'Rewind minutes', 'Undo every change made in the last N minutes, newest first (param_type ''table'' = single number)', 'table',
   'FOR h IN SELECT * FROM history WHERE NOT undone AND changed_at > now() - :p_minutes * interval ''1 minute'' ORDER BY id DESC LOOP restore(h.old_data); END LOOP;')
),
phrases(rpc_name, example_phrase) as (values
  ('not_checked_in', 'who hasn''t arrived yet'),
  ('not_checked_in', 'show me no-shows'),
  ('not_checked_in', 'which guests are still missing'),
  ('not_checked_in', 'list everyone who isn''t here'),
  ('not_checked_in', 'who is not checked in'),
  ('not_checked_in', 'who are we still waiting for'),
  ('not_checked_in', 'outstanding arrivals'),

  ('who_is_inside', 'who is inside'),
  ('who_is_inside', 'who''s here already'),
  ('who_is_inside', 'show checked in guests'),
  ('who_is_inside', 'list everyone who has arrived'),
  ('who_is_inside', 'who has checked in so far'),
  ('who_is_inside', 'show me the people in the venue'),

  ('check_in_guest', 'check in the guest'),
  ('check_in_guest', 'mark the guest as arrived'),
  ('check_in_guest', 'the guest just arrived'),
  ('check_in_guest', 'please check in the guest'),
  ('check_in_guest', 'sign in the guest'),
  ('check_in_guest', 'the guest is here'),
  ('check_in_guest', 'register arrival for the guest'),

  ('check_out_guest', 'check out the guest'),
  ('check_out_guest', 'the guest has left'),
  ('check_out_guest', 'mark the guest as departed'),
  ('check_out_guest', 'sign out the guest'),
  ('check_out_guest', 'the guest went home'),
  ('check_out_guest', 'remove the guest from the venue'),

  ('vip_inside_count', 'how many VIPs are here'),
  ('vip_inside_count', 'VIP count'),
  ('vip_inside_count', 'how many VIPs have arrived'),
  ('vip_inside_count', 'number of VIP guests inside'),
  ('vip_inside_count', 'are the VIPs in yet'),
  ('vip_inside_count', 'count the VIPs in the room'),

  ('guests_at_table', 'who is at table 5'),
  ('guests_at_table', 'show table 3'),
  ('guests_at_table', 'list guests at table 7'),
  ('guests_at_table', 'who''s sitting at table 2'),
  ('guests_at_table', 'table 8 guest list'),
  ('guests_at_table', 'seating for table 10'),

  ('move_table', 'move table 4 to table 9'),
  ('move_table', 'shift everyone from table 2 to table 6'),
  ('move_table', 'relocate table 3 to 8'),
  ('move_table', 'seat table 1 guests at table 5 instead'),
  ('move_table', 'transfer table 7 to table 10'),
  ('move_table', 'merge table 6 into table 2'),

  ('undo_last', 'undo that'),
  ('undo_last', 'undo'),
  ('undo_last', 'revert the last change'),
  ('undo_last', 'take that back'),
  ('undo_last', 'oops, reverse that'),
  ('undo_last', 'go back one step'),

  ('rewind_minutes', 'rewind the last 10 minutes'),
  ('rewind_minutes', 'undo everything from the past 5 minutes'),
  ('rewind_minutes', 'roll back 15 minutes'),
  ('rewind_minutes', 'go back in time 30 minutes'),
  ('rewind_minutes', 'revert all changes in the last 20 minutes'),
  ('rewind_minutes', 'time machine back 10 minutes')
)
insert into public.commands (name, description, example_phrase, rpc_name, param_type, sql_preview)
select m.name, m.description, p.example_phrase, m.rpc_name, m.param_type, m.sql_preview
from phrases p join meta m using (rpc_name);
