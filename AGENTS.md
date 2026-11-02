<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working on Backstage (read before editing)

More than one coding agent works in this repo. Stay in your lane.

| Area | Owner | Notes |
|---|---|---|
| `app/`, `components/`, `lib/*.ts` except the two type files below, `scripts/`, Next/ESLint/TS config | **Frontend agent (Codex)** | Next.js 16 console |
| `supabase/**` (migrations, functions, seed, config) | **Backend agent (Claude Code)** | Applied to the live project via Supabase MCP. Never edit applied migrations; add a new one. |
| `lib/database.types.ts` | Backend | Generated. Regenerate, don't hand-edit. |
| `lib/backstage.types.ts` | Backend | Mirrors the API contract in `BACKEND.md`. |
| `BACKEND.md`, `TEACHING.md` | Backend | Source of truth for the API contract. |
| `README.md` | Shared | Edit in place; keep both the console and backend sections. |

## Rules

- **Secrets:** `.env.local` holds `ADMIN_TOKEN` (admin-only) plus the two public `NEXT_PUBLIC_SUPABASE_*` values. Never print, rewrite or commit the token. Append to the file; don't regenerate it.
- **Frontend talks to the backend only through** `supabase.functions.invoke("match-command")`, `supabase.rpc(<command.rpc_name>, params)`, and `SELECT` on `guests`, `history`, `unknown_requests`, `commands`, `command_catalog`. The anon key cannot write tables; do not try.
- **Result shape:** every command RPC returns `{ message, rows, kind: "read" | "write", ok }`. `ok: false` means a refusal that changed nothing.
- **Realtime** is on for `guests`, `history`, `unknown_requests` and `commands`.
- Need a backend change (new column, function, response field)? Note it in `BACKEND.md` under a "Requests" heading. Don't edit `supabase/` from the frontend side.
- Commit only files in your own lane. Run `npm run build` before committing frontend changes.
