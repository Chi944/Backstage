"use client";

import { motion, useReducedMotion } from "framer-motion";
import { paramLabel } from "@/lib/format";
import type { MatchResponse } from "@/lib/types";
import { SqlBlock } from "./SqlBlock";

const enter = {
  initial: { opacity: 0, y: 22, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, transition: { duration: 0.18 } },
  transition: { type: "spring" as const, stiffness: 260, damping: 28 },
};

interface Props {
  match: MatchResponse;
  readOnly: boolean;
  runState: "pending" | "running" | "done";
  onRun: () => void;
  onCancel: () => void;
}

function SimilarityMeter({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  const label = pct >= 0.9 ? "Strong match" : pct >= 0.85 ? "Good match" : "Close match";
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-line" role="meter" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Match confidence">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber/50 via-amber to-[#FFD27A] shadow-[0_0_14px_rgba(245,166,35,0.6)]"
          initial={{ width: 0 }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ type: "spring", stiffness: 90, damping: 20, delay: 0.15 }}
        />
        {[0.25, 0.5, 0.75].map((t) => (
          <span key={t} className="absolute inset-y-0 w-px bg-stage/70" style={{ left: `${t * 100}%` }} />
        ))}
      </div>
      <div className="flex shrink-0 items-baseline gap-2">
        <span className="tabular font-mono text-lg font-medium text-paper">{(pct * 100).toFixed(1)}%</span>
        <span className="hidden text-sm text-muted sm:inline">{label}</span>
      </div>
    </div>
  );
}

function CueLabel({ children, tone = "amber" }: { children: React.ReactNode; tone?: "amber" | "house" | "muted" }) {
  const colors = {
    amber: "text-amber",
    house: "text-house",
    muted: "text-muted",
  }[tone];
  const dot = { amber: "bg-amber", house: "bg-house", muted: "bg-muted" }[tone];
  return (
    <span className={`eyebrow flex items-center gap-2 ${colors}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

export function MatchCard({ match, readOnly, runState, onRun, onCancel }: Props) {
  const reduce = useReducedMotion();
  const running = runState === "running";

  if (match.status === "unknown") {
    return (
      <motion.section {...enter} aria-live="polite" className="panel relative overflow-hidden rounded-2xl px-6 py-8 sm:px-10 sm:py-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "repeating-linear-gradient(90deg, rgba(229,96,77,0.05) 0 2px, transparent 2px 46px), radial-gradient(ellipse 70% 60% at 50% 0%, rgba(229,96,77,0.10), transparent 70%)",
          }}
        />
        <div className="relative flex flex-col items-center text-center">
          <CueLabel tone="house">Unknown cue</CueLabel>
          <h2 className="mt-5 font-display text-[40px] leading-[1.02] tracking-[-0.01em] text-paper sm:text-[56px]">
            I don&rsquo;t know that cue <em className="text-house">yet</em>.
          </h2>
          <blockquote className="mt-6 max-w-xl font-display text-[22px] italic leading-snug text-muted sm:text-[26px]">
            &ldquo;{match.text}&rdquo;
          </blockquote>
          <div className="mt-8 flex items-center gap-3 rounded-full border border-line-strong bg-stage/50 px-4 py-2 text-[15px] text-paper/85">
            <motion.span
              aria-hidden
              className="h-2 w-2 rounded-full bg-amber"
              animate={reduce ? undefined : { opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            />
            Sent to the stage manager to learn.
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="mt-6 text-sm text-muted underline decoration-line-strong underline-offset-4 transition hover:text-paper"
          >
            Dismiss
          </button>
        </div>
      </motion.section>
    );
  }

  if (match.status === "needs_input") {
    return (
      <motion.section
        {...enter}
        aria-live="polite"
        className="panel relative overflow-hidden rounded-2xl border-amber/35 px-6 py-6 sm:px-8 sm:py-7"
      >
        <div aria-hidden className="absolute inset-y-0 left-0 w-1 bg-amber" />
        <div className="flex items-start gap-4">
          <span aria-hidden className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber/50 bg-amber/10 font-display text-xl text-amber">
            ?
          </span>
          <div className="min-w-0 flex-1">
            <CueLabel>Hold — need one more detail</CueLabel>
            <p className="mt-3 font-display text-[30px] leading-tight text-paper sm:text-[36px]">{match.reason}</p>
            <p className="mt-3 text-[16px] text-muted">
              Matched <span className="font-mono text-paper/85">{match.command.name}</span> — {match.command.description}
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2.5 text-[15px] text-muted transition hover:bg-line hover:text-paper">
            Cancel
          </button>
        </div>
      </motion.section>
    );
  }

  const entries = Object.entries(match.display_params ?? {});

  return (
    <motion.section {...enter} aria-live="polite" className="relative">
      {/* The "cue light": a burst of amber as the card arrives, settling to a warm rim. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-[17px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: reduce ? 0.5 : [0, 1, 0.5] }}
        transition={{ duration: 1.1, times: [0, 0.25, 1], ease: "easeOut" }}
        style={{
          background: "linear-gradient(180deg, rgba(245,166,35,0.75), rgba(245,166,35,0.12) 40%, rgba(245,166,35,0.05))",
          boxShadow: "0 0 60px -10px rgba(245,166,35,0.45)",
        }}
      />
      <div className="relative overflow-hidden rounded-2xl bg-booth">
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-40"
          style={{ background: "radial-gradient(ellipse 60% 100% at 50% 0%, rgba(245,166,35,0.16), transparent 75%)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
        />
        <div className="relative px-6 pb-6 pt-6 sm:px-8 sm:pb-7 sm:pt-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CueLabel>
              {runState === "done" ? "Cue called" : running ? "Go" : readOnly ? "Standby · read" : "Standby · awaiting your go"}
            </CueLabel>
            <span className="font-mono text-[13px] text-muted">{match.command.name}</span>
          </div>

          <h2 className="mt-4 font-display text-[32px] leading-[1.08] tracking-[-0.01em] text-paper sm:text-[42px]">
            {match.command.description}
          </h2>

          <div className="mt-6">
            <SimilarityMeter value={match.similarity} />
          </div>

          {entries.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-2.5">
              {entries.map(([key, value], i) => (
                <motion.li
                  key={key}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.25 + i * 0.07 }}
                  className="flex items-center overflow-hidden rounded-lg border border-amber/30 bg-amber/[0.07] text-[15px]"
                >
                  <span className="border-r border-amber/25 px-3 py-1.5 text-amber/85">{paramLabel(key)}</span>
                  <span className="px-3 py-1.5 font-medium text-paper">{String(value)}</span>
                </motion.li>
              ))}
            </ul>
          )}

          <div className="mt-6">
            <SqlBlock sql={match.command.sql_preview} />
          </div>

          {runState === "done" ? (
            <div className="mt-6 flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-[15px] text-cue">
                <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden>
                  <path d="M2 6.5 4.8 9 10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {readOnly ? "Ran automatically — read-only" : "Cue called"}
              </p>
              <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-[14px] text-muted transition hover:bg-line hover:text-paper">
                Clear
              </button>
            </div>
          ) : (
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[14px] text-muted">
              {readOnly ? "Read-only — runs automatically." : "Changes the guest list. Undo is always one click away."}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={running}
                className="flex-1 rounded-xl border border-line-strong px-5 py-3 text-[16px] text-paper/85 transition hover:border-paper/30 hover:text-paper disabled:opacity-40 sm:flex-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onRun}
                disabled={running}
                autoFocus={!readOnly}
                className="relative flex-1 overflow-hidden rounded-xl bg-amber px-6 py-3 text-[16px] font-semibold text-[#1a1206] shadow-[0_8px_30px_-8px_rgba(245,166,35,0.7)] transition hover:bg-[#FFB840] active:scale-[0.98] disabled:cursor-wait sm:flex-none"
              >
                {running ? "Running…" : "Run cue"}
                {!running && <span className="ml-2 font-mono text-[13px] font-normal opacity-60">↵</span>}
              </button>
            </div>
          </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}
