"use client";

import { AnimatePresence, motion } from "framer-motion";
import { relativeTime } from "@/lib/format";
import type { QueueItem, Resource } from "@/lib/useBackstage";
import { Panel, PanelMessage, PanelSkeleton } from "./Panel";

interface Props {
  queue: Resource<QueueItem[]>;
  now: number | null;
  onRetry: () => void;
  className?: string;
}

export function LearningQueue({ queue, now, onRetry, className }: Props) {
  const items = queue.data;
  const pending = items.filter((q) => !q.learnedAt).length;

  return (
    <Panel eyebrow="Stage left" title="Learning queue" count={pending} className={className}>
      {queue.state === "loading" ? (
        <PanelSkeleton rows={3} />
      ) : queue.state === "error" ? (
        <PanelMessage tone="error" title="The queue went quiet." body={queue.error ?? undefined} onRetry={onRetry} />
      ) : items.length === 0 ? (
        <PanelMessage title="Every cue is known." body="Ask for something new and it lands here for the stage manager to teach." />
      ) : (
        <ul className="scroll-quiet min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
          <AnimatePresence initial={false}>
            {items.map((item) => {
              const learned = Boolean(item.learnedAt);
              return (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24, transition: { duration: 0.35 } }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className={`relative overflow-hidden rounded-xl border px-4 py-3.5 transition-colors duration-500 ${
                    learned ? "border-cue/50 bg-cue/[0.08]" : "border-line bg-stage/40"
                  }`}
                >
                  {learned && (
                    <motion.span
                      aria-hidden
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-cue/25 to-transparent"
                      initial={{ x: "-100%" }}
                      animate={{ x: "100%" }}
                      transition={{ duration: 0.9, ease: "easeInOut" }}
                    />
                  )}
                  <p className="relative font-display text-[20px] italic leading-snug text-paper">&ldquo;{item.text}&rdquo;</p>
                  <p className="relative mt-1.5 flex items-center gap-2 font-mono text-[12.5px] text-muted">
                    {learned ? (
                      <span className="flex items-center gap-1.5 text-cue">
                        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                          <path d="M2 6.5 4.8 9 10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Learned
                      </span>
                    ) : (
                      <>
                        <span className="h-1.5 w-1.5 rounded-full bg-amber/70" aria-hidden />
                        Waiting to learn · {relativeTime(item.created_at, now)}
                      </>
                    )}
                  </p>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </Panel>
  );
}
