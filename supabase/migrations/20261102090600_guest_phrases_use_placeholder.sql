-- Backstage · 07 · guest example phrases use "the guest" instead of real names.
-- match-command masks the recognised guest's name the same way, so the verb (in/out) decides the command.
-- Embeddings are reset; run embed-commands afterwards.
with phrase(rpc_name, old_phrase, new_phrase) as (values
  ('check_in_guest',  'check in Sarah Tan',               'check in the guest'),
  ('check_in_guest',  'mark Ali as arrived',              'mark the guest as arrived'),
  ('check_in_guest',  'Priya Ramasamy just arrived',      'the guest just arrived'),
  ('check_in_guest',  'please check in Daniel de Souza',  'please check in the guest'),
  ('check_in_guest',  'sign in Rachel Teo',               'sign in the guest'),
  ('check_in_guest',  'Wong Kai Xuan is here',            'the guest is here'),
  ('check_in_guest',  'register arrival for Emily Goh',   'register arrival for the guest'),
  ('check_out_guest', 'check out Sarah Tan',              'check out the guest'),
  ('check_out_guest', 'Ali has left',                     'the guest has left'),
  ('check_out_guest', 'mark Priya as departed',           'mark the guest as departed'),
  ('check_out_guest', 'sign out Daniel de Souza',         'sign out the guest'),
  ('check_out_guest', 'Rachel Teo went home',             'the guest went home'),
  ('check_out_guest', 'remove Emily Goh from the venue',  'remove the guest from the venue')
)
update public.commands c
   set example_phrase = p.new_phrase, embedding = null
  from phrase p
 where c.rpc_name = p.rpc_name and c.example_phrase = p.old_phrase;
