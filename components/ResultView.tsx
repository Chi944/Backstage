"use client";

import { motion } from "framer-motion";
import { humanize, relativeTime } from "@/lib/format";
import type { RpcResult } from "@/lib/types";

const MAX_ROWS = 40;

export function TierBadge({ tier }: { tier: unknown }) {
  const t = String(tier ?? "general").toLowerCase();
  if (t === "vip")
    return (
      <span className="inline-flex items-center rounded-md bg-amber px-2 py-0.5 font-mono text-[11.5px] font-semibold tracking-[0.12em] text-[#1a1206]">
        VIP
      </span>
    );
  if (t === "crew")
    return (
      <span className="inline-flex items-center rounded-md border border-muted/50 px-2 py-0.5 font-mono text-[11.5px] tracking-[0.12em] text-muted">
        CREW
      </span>
    );
  return <span className="font-mono text-[12px] tracking-[0.08em] text-faint">GUEST</span>;
}

function looksLikeTimestamp(key: string, value: unknown) {
  return typeof value === "string" && (/_at$/.test(key) || /^\d{4}-\d{2}-\d{2}T/.test(value));
}

function Cell({ k, v, now }: { k: string; v: unknown; now: number | null }) {
  if ((v === null || v === undefined) && k === "checked_in_at") return <span className="text-faint">Not yet</span>;
  if (v === null || v === undefined || v === "") return <span className="text-faint">—</span>;
  if (k === "tier") return <TierBadge tier={v} />;
  if (looksLikeTimestamp(k, v)) return <span className="text-muted">{relativeTime(String(v), now)}</span>;
  if (typeof v === "number") return <span className="tabular font-mono">{v}</span>;
  if (typeof v === "boolean") return <span className="font-mono text-muted">{v ? "yes" : "no"}</span>;
  if (typeof v === "object") return <span className="font-mono text-[13px] text-muted">{JSON.stringify(v)}</span>;
  return <>{String(v)}</>;
}

const GUEST_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "tier", label: "Tier" },
  { key: "table_no", label: "Table" },
  { key: "checked_in_at", label: "Checked in" },
];

function columnsFor(rows: Record<string, unknown>[]) {
  const first = rows[0] ?? {};
  if ("name" in first && ("tier" in first || "table_no" in first || "checked_in_at" in first)) {
    return GUEST_COLUMNS.filter((c) => rows.some((r) => c.key in r));
  }
  return Object.keys(first)
    .filter((k) => k !== "id" && k !== "guest_id")
    .slice(0, 5)
    .map((key) => ({ key, label: key === "table_no" ? "Table" : humanize(key) }));
}

interface Props {
  state: "running" | "done" | "error";
  result: RpcResult | null;
  error: string | null;
  now: number | null;
  onDismiss: () => void;
}

export function ResultView({ state, result, error, now, onDismiss }: Props) {
  if (state === "running") {
    return (
      <div className="panel rounded-2xl px-6 py-7 sm:px-8" role="status">
        <div className="h-3 w-24 animate-pulse rounded bg-line" />
        <div className="mt-4 h-9 w-3/4 animate-pulse rounded bg-line" />
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-5 animate-pulse rounded bg-line/70" style={{ width: `${90 - i * 12}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (state === "error" || !result) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel relative overflow-hidden rounded-2xl px-6 py-6 sm:px-8"
        role="alert"
      >
        <div aria-hidden className="absolute inset-y-0 left-0 w-1 bg-house" />
        <p className="eyebrow !text-house">The cue didn&rsquo;t land</p>
        <p className="mt-3 font-display text-[28px] leading-tight text-paper sm:text-[32px]">
          {error ?? "Something went wrong backstage."}
        </p>
        <button type="button" onClick={onDismiss} className="mt-4 text-sm text-muted underline decoration-line-strong underline-offset-4 hover:text-paper">
          Dismiss
        </button>
      </motion.div>
    );
  }

  const rows = Array.isArray(result.rows) ? result.rows : [];
  const columns = columnsFor(rows);
  const shown = rows.slice(0, MAX_ROWS);
  const refused = result.ok === false;
  const isWrite = result.kind === "write" && !refused;

  return (
    <motion.section
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 240, damping: 28 }}
      className="panel overflow-hidden rounded-2xl"
      aria-live="polite"
    >
      <div className="px-6 pb-5 pt-6 sm:px-8 sm:pt-7">
        <div className="flex items-center justify-between gap-3">
          <span className={`eyebrow flex items-center gap-2 ${isWrite ? "!text-cue" : refused ? "!text-amber" : ""}`}>
            {refused ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden />
                Held — nothing changed
              </>
            ) : isWrite ? (
              <>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                  <path d="M2 6.5 4.8 9 10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Cue complete
              </>
            ) : (
              <>House report</>
            )}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss result"
            className="-mr-2 rounded-lg px-2 py-1 font-mono text-[13px] text-faint transition hover:text-paper"
          >
            esc
          </button>
        </div>
        <p className="mt-3 font-display text-[32px] leading-[1.1] tracking-[-0.01em] text-paper sm:text-[40px]">
          {result.message || (isWrite ? "Done." : "Here's what I found.")}
        </p>
      </div>

      {rows.length > 0 && columns.length > 0 && (
        <div className="scroll-quiet overflow-x-auto border-t border-line">
          <table className="w-full min-w-[420px] border-collapse text-left text-[15px] sm:text-[16px]">
            <thead>
              <tr className="border-b border-line">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={`eyebrow px-4 py-3 font-normal first:pl-6 last:pr-6 sm:first:pl-8 sm:last:pr-8 ${c.key === "table_no" ? "text-right" : ""}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, i) => (
                <motion.tr
                  key={String(row.id ?? i)}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i, 12) * 0.03 }}
                  className="border-b border-line/70 last:border-0 hover:bg-paper/[0.025]"
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 py-3 first:pl-6 last:pr-6 sm:first:pl-8 sm:last:pr-8 ${
                        c.key === "name" ? "font-medium text-paper" : "text-paper/85"
                      } ${c.key === "table_no" ? "text-right" : ""}`}
                    >
                      <Cell k={c.key} v={row[c.key]} now={now} />
                    </td>
                  ))}
                </motion.tr>
              ))}
            </tbody>
          </table>
          {rows.length > MAX_ROWS && (
            <p className="border-t border-line px-6 py-3 text-sm text-muted sm:px-8">and {rows.length - MAX_ROWS} more…</p>
          )}
        </div>
      )}
    </motion.section>
  );
}
