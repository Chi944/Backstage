"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { LearnedCue } from "@/lib/useBackstage";

const SPARKS = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  const dist = 70 + (i % 3) * 26;
  return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist * 0.6, delay: (i % 4) * 0.04 };
});

function Toast({ cue, onDone }: { cue: LearnedCue; onDone: () => void }) {
  const reduce = useReducedMotion();
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const id = setTimeout(() => done.current(), 7000);
    return () => clearTimeout(id);
  }, []);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -40, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.96, transition: { duration: 0.25 } }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="pointer-events-auto relative w-full"
      role="status"
    >
      {!reduce && (
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
          {SPARKS.map((s, i) => (
            <motion.span
              key={i}
              className="absolute h-1.5 w-1.5 rounded-full bg-amber shadow-[0_0_8px_rgba(245,166,35,0.9)]"
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: s.x * 2.2, y: s.y * 1.6, opacity: 0, scale: 0.3 }}
              transition={{ duration: 1.1, delay: 0.1 + s.delay, ease: [0.16, 1, 0.3, 1] }}
            />
          ))}
        </div>
      )}
      <motion.div
        className="relative overflow-hidden rounded-2xl border border-amber/60 bg-[#1f1a12]/95 px-5 py-4 backdrop-blur-md sm:px-6"
        initial={{ boxShadow: "0 0 0 0 rgba(245,166,35,0)" }}
        animate={{
          boxShadow: [
            "0 0 0 0 rgba(245,166,35,0.0), 0 30px 60px -20px rgba(0,0,0,0.8)",
            "0 0 0 10px rgba(245,166,35,0.18), 0 0 90px 10px rgba(245,166,35,0.45)",
            "0 0 0 1px rgba(245,166,35,0.10), 0 30px 70px -20px rgba(245,166,35,0.35)",
          ],
        }}
        transition={{ duration: 1.4, times: [0, 0.3, 1] }}
      >
        <motion.span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-transparent via-amber/25 to-transparent"
          initial={{ x: "-100%" }}
          animate={{ x: "120%" }}
          transition={{ duration: 1.2, delay: 0.15, ease: "easeInOut" }}
        />
        <div className="relative flex items-start gap-4">
          <motion.span
            aria-hidden
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber text-[#1a1206]"
            initial={{ rotate: -90, scale: 0.4 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20">
              <path d="M10 1.5l2.2 5.6 6 .4-4.6 3.8 1.5 5.9L10 14l-5.1 3.2 1.5-5.9L1.8 7.5l6-.4L10 1.5z" fill="currentColor" />
            </svg>
          </motion.span>
          <div className="min-w-0 flex-1">
            <p className="eyebrow !text-amber">New cue learned</p>
            <p className="mt-1 font-display text-[26px] leading-tight text-paper">{cue.description}</p>
            <p className="mt-1 font-mono text-[12.5px] text-muted">{cue.name} · added to the cue sheet</p>
          </div>
          <button
            type="button"
            onClick={onDone}
            aria-label="Dismiss"
            className="-mr-1 -mt-1 rounded-md px-1.5 text-xl leading-none text-muted transition hover:text-paper"
          >
            ×
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function LearnedToasts({ items, onDismiss }: { items: LearnedCue[]; onDismiss: (key: string) => void }) {
  const reduce = useReducedMotion();
  const latest = items[items.length - 1]?.key;

  return (
    <>
      {/* House-lights flash: the whole room warms for a beat. */}
      <AnimatePresence>
        {latest && !reduce && (
          <motion.div
            key={latest}
            aria-hidden
            className="pointer-events-none fixed inset-0 z-[55]"
            style={{
              background:
                "radial-gradient(ellipse 70% 55% at 50% 0%, rgba(245,166,35,0.38), rgba(245,166,35,0.10) 45%, transparent 75%)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 1.8, times: [0, 0.15, 1], ease: "easeOut" }}
          />
        )}
      </AnimatePresence>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center overflow-hidden px-4 pb-28 pt-4 sm:pt-6">
        <div className="flex w-full max-w-[460px] flex-col gap-3">
          <AnimatePresence>
            {items.slice(-3).map((cue) => (
              <Toast key={cue.key} cue={cue} onDone={() => onDismiss(cue.key)} />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
