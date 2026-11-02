# Backstage — Backend Handoff

Everything the frontend needs to talk to the Backstage backend. The backend runs entirely on the **Supabase Free plan** and uses **no paid or external AI API**: natural-language matching runs on Supabase's built-in `gte-small` embedding model inside an Edge Function.

---

## 1. Project

| | |
|---|---|
| **Project URL** | `https://xakzepavudmskiegpwqw.supabase.co` |
| **Project ref** | `xakzepavudmskiegpwqw` |
| **Region** | `ap-southeast-1` (Singapore) |
| **Edge Functions** | `https://xakzepavudmskiegpwqw.supabase.co/functions/v1/<name>` |

## 2. Frontend environment variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xakzepavudmskiegpwqw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
```

**Where to find the key:** Supabase Dashboard → *Project Settings* → *API Keys* → **Publishable key** (`sb_publishable_…`). The legacy `anon` JWT on the *Legacy API Keys* tab works too. Both are safe to ship to the browser: RLS and function grants enforce what they can do. Copy [`.env.example`](.env.example) to `.env.local` and fill in these two values.

> **Never** put the `service_role` / secret key in the frontend. Only the Edge Functions use it, and they read it from their own runtime environment.

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```

## 3. The request flow

```
user text ──► supabase.functions.invoke("match-command", { body: { text } })
                 │  gte-small embedding → pgvector nearest command → params extracted (no LLM)
                 ▼
          { status: "matched", command.rpc_name, params }
                 │
                 ▼
          supabase.rpc(command.rpc_name, params)   ──► { message, rows, kind, ok }
```

User text **never** becomes SQL. It only selects one of the pre-approved Postgres functions below, and the parameters are typed integers or guest ids.

```ts
const { data: match } = await supabase.functions.invoke<MatchResponse>("match-command", { body: { text } });
if (match?.status === "matched") {
  const { data } = await supabase.rpc(match.command.rpc_name as any, match.params);
  const result = data as CommandResult; // { message, rows, kind, ok }
}
```

Types for every shape below are in [`lib/backstage.types.ts`](lib/backstage.types.ts). Generated DB types are in [`lib/database.types.ts`](lib/database.types.ts).

## 4. `match-command` response shapes

`POST /functions/v1/match-command` · body `{ "text": string }` · `verify_jwt = false` · CORS `*`

### `matched`
```json
{
  "status": "matched",
  "similarity": 0.934,
  "command": {
    "name": "Move table",
    "description": "Move everyone from one table to another",
    "rpc_name": "move_table",
    "param_type": "two_tables",
    "sql_preview": "UPDATE guests SET table_no = :p_to WHERE table_no = :p_from;"
  },
  "params": { "p_from": 3, "p_to": 7 },
  "display_params": { "from_table": 3, "to_table": 7 }
}
```
For `param_type: "guest"` the response also carries `"guest_name"`:
```json
{ "status": "matched", "similarity": 1, "command": { "rpc_name": "check_in_guest", "...": "..." },
  "params": { "p_guest_id": 1 }, "display_params": { "guest": "Sarah Tan" }, "guest_name": "Sarah Tan" }
```

### `needs_input`
The command was recognised, but a parameter is missing (unknown guest, no table number…).
```json
{ "status": "needs_input", "similarity": 0.91, "command": { "...": "..." }, "reason": "Couldn't find that guest" }
```
Possible `reason`s: `Couldn't find that guest` · `Which table?` · `How many minutes?` · `Need two table numbers, e.g. "move table 4 to table 9"`.

### `unknown`
Nothing scored above the threshold. The text has been logged to `unknown_requests` for teaching.
```json
{ "status": "unknown", "id": 12, "text": "which table has the most VIPs" }
```

### Errors
`400 { "error": "\"text\" is required" }` · `500 { "error": "<message>" }`

### Debug (tuning only)
`{ "text": "...", "debug": true }` returns the raw top 3 with no threshold and logs nothing:
`{ "threshold": 0.83, "top": [{ "name", "example_phrase", "similarity" }] }`

## 5. Command result shape

Every command RPC returns:
```json
{ "message": "Moved 4 guests from table 3 to table 7", "rows": [ /* guests rows */ ], "kind": "write", "ok": true }
```
- `rows`: guest records (`id, name, tier, table_no, checked_in_at, created_at`), possibly empty.
- `kind`: `"read"` or `"write"`. Use it to decide whether to offer **Undo**.
- `ok`: `false` for a refusal that changed nothing, e.g. *"Sarah Tan is already checked in (since 19:35)"*, *"Nothing to undo"*. This field was added on top of the spec so the UI can style refusals.

## 6. Command catalog

| Command | `rpc_name` | `param_type` | RPC params | kind |
|---|---|---|---|---|
| Who hasn't arrived | `not_checked_in` | `none` | — | read |
| Who's inside | `who_is_inside` | `none` | — | read |
| Check in guest | `check_in_guest` | `guest` | `p_guest_id: bigint` | write |
| Check out guest | `check_out_guest` | `guest` | `p_guest_id: bigint` | write |
| VIPs inside | `vip_inside_count` | `none` | — | read |
| Guests at table | `guests_at_table` | `table` | `p_table: int` | read |
| Move table | `move_table` | `two_tables` | `p_from: int, p_to: int` | write |
| Undo last change | `undo_last` | `none` | — | write |
| Rewind minutes | `rewind_minutes` | `table` ¹ | `p_minutes: int` (1–1440) | write |

¹ `param_type: "table"` means **"a single number"**. The Edge Function maps it to `p_minutes` for `rewind_minutes` and to `p_table` for everything else. Number words up to *twenty* are understood ("table nine").

Read the live list from the `command_catalog` view (one row per command):
```ts
const { data } = await supabase.from("command_catalog").select("*");
```

## 7. Matching threshold

**Final threshold: `0.83`** (the spec's default was 0.85). Override it without redeploying by setting the `MATCH_THRESHOLD` secret on the `match-command` function.

Tuned on 32 phrasings with `gte-small`:

| Phrase | Top match | Similarity | Result |
|---|---|---|---|
| check in sarah tan | Check in guest | **1.000** | ✅ guest = Sarah Tan |
| move everyone at table 3 over to table 7 | Move table | **0.934** | ✅ 3 → 7 |
| who still hasn't shown up | Who hasn't arrived | **0.920** | ✅ |
| undo the last thing | Undo last change | **0.923** | ✅ |
| how many vips do we have inside | VIPs inside | **0.970** | ✅ |
| Hiroshi Tanaka has arrived | Check in guest | **0.838** | ✅ (missed at 0.85) |
| Rajesh is here | Check in guest | **0.845** | ✅ (missed at 0.85) |
| the purple elephant sings jazz on tuesdays | Guests at table | 0.774 | ✅ unknown |
| book a taxi to changi airport | Check in guest | 0.777 | ✅ unknown |
| who's the speaker tonight | Who's inside | 0.829 | ✅ unknown (closest call) |
| which table has the most VIPs | VIPs inside | 0.919 | ✅ unknown, via the ranking guard |

**Why 0.83:** correct matches started at 0.838 and nonsense topped out at 0.829. A few off-topic but related phrases still score above any usable threshold, e.g. *"delete all guests"* (0.879) and *"how much did the venue cost"* (0.858). All of these land on **read-only** commands, so the worst case is a harmless list. No write command matched a wrong phrase in testing.

**Ranking guard:** embeddings put *"which table has the most VIPs"* at 0.92 against *"how many VIPs are here"*. That's too close for any threshold. So if the text contains a ranking word (*most, least, fewest, highest, lowest, top, biggest, largest, smallest, busiest, emptiest, rank*), it can only match a command whose example phrase also contains one. Today no command does, so ranking questions go to `unknown`, which is exactly where teaching starts.

## 8. Realtime

`guests`, `unknown_requests` and `commands` are in the `supabase_realtime` publication; anon can `SELECT` all three.
```ts
supabase.channel("backstage")
  .on("postgres_changes", { event: "*", schema: "public", table: "guests" }, refreshBoard)
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "unknown_requests" }, showInbox)
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "commands" }, refreshCatalog)
  .subscribe();
```

## 9. `embed-commands` (admin)

Embeds every `commands` row whose `embedding` is null. Call it after inserting new example phrases.

```bash
curl -X POST "https://xakzepavudmskiegpwqw.supabase.co/functions/v1/embed-commands" \
  -H "x-admin-token: $ADMIN_TOKEN"
# → {"embedded":8,"failed":[],"remaining":0}
```

- **The token:** it's in your local, git-ignored `.env.local` as `ADMIN_TOKEN`. The database stores only its sha256 hash (`private.admin_tokens`), checked through `verify_admin_token()`, which only the service role can call.
- **Rotating it / using an env secret instead:** set an `ADMIN_TOKEN` secret on the function (Dashboard → *Edge Functions* → *Secrets*, or `supabase secrets set ADMIN_TOKEN=…`). When that env var is present it takes precedence over the hash.
- **Batches:** the Free plan caps CPU per invocation, so each call embeds at most 8 rows (`?batch=N` up to 50). **Repeat until `remaining` is 0.**
- Wrong or missing token → `401 {"error":"Unauthorized"}`.

## 10. Security model

| Role | Can do |
|---|---|
| `anon` / `authenticated` | `SELECT` on `guests`, `history`, `unknown_requests`, `commands`, `command_catalog`. `EXECUTE` on the 9 command functions. **No** direct `INSERT` / `UPDATE` / `DELETE` anywhere. |
| `service_role` (Edge Functions only) | `match_command`, `guess_guest`, `log_unknown`, `verify_admin_token` |

- All writes go through `SECURITY DEFINER` functions with a pinned `search_path` (`public, extensions`, because pgvector and pg_trgm live in `extensions`). The four read commands run as `SECURITY INVOKER`.
- Internal helpers (result builder, history trigger, restore, admin token hash) live in a `private` schema that the Data API doesn't expose.
- New functions are **not** callable by anon until explicitly granted (default privileges are revoked).
- **Deviation from the spec:** anon also has `SELECT` on `commands`. Without it, Realtime can't deliver newly taught commands to the console. The table holds no secrets.

**Advisor status:** the performance advisor shows only INFO-level "unused index" notices (new database; the spec requires those indexes). The security advisor's remaining warnings are the 5 write/undo functions being executable by anon as `SECURITY DEFINER`. That is intentional: it's how the frontend is allowed to write.

## 11. Time Machine

- A `BEFORE UPDATE` trigger on `guests` copies the old row into `history` with `action` (from `backstage.action`) and `tx_id` (the transaction id).
- `undo_last()` reverts the most recent **command**, meaning every row that shares its `tx_id`. So *"undo that"* after a table move restores all the moved guests at once.
- `rewind_minutes(n)` reverts every change newer than `now() - n minutes`, newest first.
- Restores set `backstage.skip_history = on`, so an undo is never itself recorded.

## 12. Database schema

```
guests(id, name, tier general|vip|crew, table_no, checked_in_at, created_at)
commands(id, name, description, example_phrase, embedding vector(384), rpc_name, param_type, sql_preview, created_by, created_at)
unknown_requests(id, text, resolved, created_at)
history(id, guest_id → guests, old_data jsonb, action, undone, tx_id, changed_at)
```
Indexes: HNSW on `commands.embedding` (cosine) and GIN trigram on `guests.name`.

Seed: 40 guests (8 VIP, 4 crew), tables 1–10, 21 checked in over the last two hours. **Sarah Tan** (VIP, table 1) is not checked in.
