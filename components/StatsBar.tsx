"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { Resource } from "@/lib/useBackstage";
import type { Guest } from "@/lib/types";

function Ticker({ value }: { value: number | null }) {
  return (
    <span className="relative inline-flex h-[1.15em] overflow-hidden align-bottom">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value ?? "none"}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="tabular inline-block"
        >
          {value === null ? "–" : value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | null; accent?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="eyebrow whitespace-nowrap !text-[10.5px] sm:!text-[11.5px]">{label}</dt>
      <dd className={`font-mono text-2xl leading-none font-medium sm:text-[28px] ${accent ? "text-amber" : "text-paper"}`}>
        <Ticker value={value} />
      </dd>
    </div>
  );
}

export function StatsBar({ guests }: { guests: Resource<Guest[]> }) {
  const ready = guests.state === "ready";
  const list = guests.data;
  const inside = list.filter((g) => g.checked_in_at).length;
  const vipsInside = list.filter((g) => g.checked_in_at && g.tier === "vip").length;
  const pct = list.length ? inside / list.length : 0;

  return (
    <div className="flex flex-col gap-2.5" title={guests.error ?? undefined}>
      <dl className="grid grid-cols-3 gap-5 sm:gap-8">
        <Stat label="Inside" value={ready ? inside : null} />
        <Stat label="Expected" value={ready ? list.length : null} />
        <Stat label="VIPs inside" value={ready ? vipsInside : null} accent />
      </dl>
      <div className="h-[3px] w-full overflow-hidden rounded-full bg-line" aria-hidden>
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-amber/60 to-amber"
          initial={false}
          animate={{ width: `${Math.round(pct * 100)}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 24 }}
        />
      </div>
    </div>
  );
}
