"use client";

import { AnimatePresence, motion } from "framer-motion";
import { humanize } from "@/lib/format";
import type { Resource } from "@/lib/useBackstage";
import type { CatalogCommand } from "@/lib/types";
import { PanelMessage, PanelSkeleton } from "./Panel";

const INITIAL_AUTHORS = new Set(["claude-initial", "claude", "seed", "system"]);
const HOUR = 3_600_000;

/** Learned live = taught by someone other than the seed, or added an hour-or-less ago after the initial batch. */
export function learnedLiveNames(catalog: CatalogCommand[], now: number | null): Set<string> {
  const times = catalog.map((c) => (c.created_at ? new Date(c.created_at).getTime() : NaN)).filter((t) => !Number.isNaN(t));
  const seededAt = times.length ? Math.min(...times) : null;
  const names = new Set<string>();
  for (const c of catalog) {
    if (!INITIAL_AUTHORS.has(c.created_by)) {
      names.add(c.name);
      continue;
    }
    const t = c.created_at ? new Date(c.created_at).getTime() : NaN;
    if (now !== null && seededAt !== null && !Number.isNaN(t) && now - t < HOUR && t - seededAt > 5 * 60_000) {
      names.add(c.name);
    }
  }
  return names;
}

const PARAM_HINT: Record<string, string> = {
  none: "no input",
  guest: "takes a guest",
  table: "takes a number",
  two_tables: "takes two tables",
};

interface Props {
  open: boolean;
  onClose: () => void;
  catalog: Resource<CatalogCommand[]>;
  now: number | null;
  onTry: (phrase: string) => void;
  onRetry: () => void;
}

export function CueSheet({ open, onClose, catalog, now, onTry, onRetry }: Props) {
  const learned = learnedLiveNames(catalog.data, now);
  const sorted = [...catalog.data].sort(
    (a, b) => Number(learned.has(b.name)) - Number(learned.has(a.name)) || a.description.localeCompare(b.description),
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Cue sheet"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col border-l border-line-strong bg-[#14120f] shadow-[-40px_0_80px_-20px_rgba(0,0,0,0.8)]"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 36 }}
          >
            <header className="flex items-start justify-between gap-4 border-b border-line px-6 pb-5 pt-6 sm:px-8">
              <div>
                <p className="eyebrow">Prompt book</p>
                <h2 className="mt-1.5 font-display text-[40px] leading-none text-paper">Cue sheet</h2>
                <p className="mt-2 text-[15px] text-muted">
                  {catalog.state === "ready" ? `${catalog.data.length} cues the booth can call` : "Every cue the booth knows"}
                  {learned.size > 0 && <span className="text-amber"> · {learned.size} learned live</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                autoFocus
                aria-label="Close cue sheet"
                className="rounded-lg border border-line-strong px-2.5 py-1 font-mono text-[13px] text-muted transition hover:text-paper"
              >
                esc
              </button>
            </header>

            <div className="scroll-quiet flex-1 overflow-y-auto">
              {catalog.state === "loading" ? (
                <PanelSkeleton rows={6} />
              ) : catalog.state === "error" ? (
                <PanelMessage tone="error" title="The cue sheet is missing." body={catalog.error ?? undefined} onRetry={onRetry} />
              ) : sorted.length === 0 ? (
                <PanelMessage title="No cues yet." body="Commands appear here as soon as the backend is seeded." />
              ) : (
                <ol className="divide-y divide-line">
                  {sorted.map((c, i) => {
                    const isLearned = learned.has(c.name);
                    return (
                      <motion.li
                        key={c.name}
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.08 + Math.min(i, 14) * 0.025 }}
                        className={`relative px-6 py-5 sm:px-8 ${isLearned ? "bg-amber/[0.05]" : ""}`}
                      >
                        {isLearned && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-amber" />}
                        <div className="flex items-start gap-4">
                          <span className="tabular mt-1 w-7 shrink-0 font-mono text-[13px] text-faint">{String(i + 1).padStart(2, "0")}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-display text-[22px] leading-tight text-paper">{c.description}</p>
                              {isLearned && (
                                <span className="rounded-full bg-amber px-2 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#1a1206]">
                                  Learned live
                                </span>
                              )}
                            </div>
                            <p className="mt-1.5 font-mono text-[12.5px] text-muted">
                              {c.name} · {PARAM_HINT[c.param_type] ?? humanize(c.param_type)}
                            </p>
                            {c.example_phrase && (
                              <button
                                type="button"
                                onClick={() => onTry(c.example_phrase!)}
                                className="mt-3 rounded-lg border border-line-strong px-3 py-1.5 text-left text-[14.5px] text-paper/85 transition hover:border-amber/50 hover:text-paper"
                              >
                                <span className="text-muted">Try </span>&ldquo;{c.example_phrase}&rdquo;
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.li>
                    );
                  })}
                </ol>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
