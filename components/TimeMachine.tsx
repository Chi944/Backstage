"use client";

import { AnimatePresence, motion } from "framer-motion";
import { humanize, relativeTime } from "@/lib/format";
import type { Resource } from "@/lib/useBackstage";
import type { HistoryEntry } from "@/lib/types";
import { Panel, PanelMessage, PanelSkeleton } from "./Panel";

interface Props {
  history: Resource<HistoryEntry[]>;
  now: number | null;
  undoing: boolean;
  onUndo: () => void;
  onRetry: () => void;
  className?: string;
}

function guestName(entry: HistoryEntry) {
  const name = entry.old_data && typeof entry.old_data.name === "string" ? entry.old_data.name : null;
  return name ?? (entry.guest_id ? `Guest #${entry.guest_id}` : "A guest");
}

export function TimeMachine({ history, now, undoing, onUndo, onRetry, className }: Props) {
  const entries = history.data;
  const canUndo = entries.some((e) => !e.undone);

  return (
    <Panel eyebrow="Stage right" title="Time Machine" className={className}>
      <div className="px-5 pt-4">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo || undoing}
          className="group flex w-full items-center justify-center gap-2.5 rounded-xl border border-house/50 bg-house/10 px-4 py-3 text-[16px] font-semibold text-house transition hover:border-house hover:bg-house/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-faint"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            aria-hidden
            className={`transition-transform duration-500 ${undoing ? "animate-spin [animation-direction:reverse]" : "group-hover:-rotate-45"}`}
          >
            <path d="M4 8h8.5a4 4 0 0 1 0 8H8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M7.5 4.5 4 8l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {undoing ? "Rewinding…" : "Undo last"}
        </button>
      </div>

      {history.state === "loading" ? (
        <PanelSkeleton rows={5} />
      ) : history.state === "error" ? (
        <PanelMessage tone="error" title="History is out of reach." body={history.error ?? undefined} onRetry={onRetry} />
      ) : entries.length === 0 ? (
        <PanelMessage title="Nothing to rewind." body="Every change you make shows up here, ready to undo." />
      ) : (
        <ol className="scroll-quiet relative min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
          <span aria-hidden className="absolute bottom-6 left-[24px] top-6 w-px bg-line-strong" />
          <AnimatePresence initial={false}>
            {entries.map((entry, i) => (
              <motion.li
                key={entry.id}
                layout
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="relative flex gap-4 py-2.5"
              >
                <span
                  aria-hidden
                  className={`relative z-10 mt-[7px] h-[9px] w-[9px] shrink-0 rounded-full border-2 border-booth ${
                    entry.undone ? "bg-faint" : i === entries.findIndex((e) => !e.undone) ? "bg-amber shadow-[0_0_0_3px_rgba(245,166,35,0.2)]" : "bg-muted"
                  }`}
                />
                <div className={`min-w-0 flex-1 ${entry.undone ? "opacity-55" : ""}`}>
                  <p className={`truncate text-[16px] leading-snug text-paper ${entry.undone ? "line-through decoration-house/70" : ""}`}>
                    <span className="font-medium">{humanize(entry.action)}</span>
                    <span className="text-muted"> · </span>
                    {guestName(entry)}
                  </p>
                  <p className="mt-0.5 flex items-center gap-2 font-mono text-[12.5px] text-muted">
                    {relativeTime(entry.changed_at, now)}
                    {entry.undone && <span className="text-house/90">undone</span>}
                  </p>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </Panel>
  );
}
