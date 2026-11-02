"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { friendlyError, isReadOnlySql } from "@/lib/format";
import { callCommand, getSupabase } from "@/lib/supabase";
import type { MatchResponse, RpcResult } from "@/lib/types";
import { useBackstage } from "@/lib/useBackstage";
import { useNow } from "@/lib/useNow";
import { CommandInput } from "./CommandInput";
import { CueSheet, learnedLiveNames } from "./CueSheet";
import { LearnedToasts } from "./LearnedToast";
import { LearningQueue } from "./LearningQueue";
import { MatchCard } from "./MatchCard";
import { ResultView } from "./ResultView";
import { StatsBar } from "./StatsBar";
import { TimeMachine } from "./TimeMachine";

const BASE_EXAMPLES = ["who hasn't arrived yet?", "check in Sarah Tan", "undo that"];
const SUGGESTION_ORDER = ["not_checked_in", "check_in_guest", "vip_inside_count", "move_table", "guests_at_table", "undo_last"];

type MatchState =
  | { phase: "idle" }
  | { phase: "matching"; text: string }
  | { phase: "match"; text: string; match: MatchResponse }
  | { phase: "error"; message: string };

type RunState = { state: "running" | "done" | "error"; result: RpcResult | null; error: string | null } | null;

function normalizeResult(data: unknown): RpcResult {
  const d = (data ?? {}) as Partial<RpcResult>;
  return {
    message: typeof d.message === "string" ? d.message : "",
    rows: Array.isArray(d.rows) ? d.rows : [],
    kind: d.kind === "write" ? "write" : "read",
    ok: d.ok !== false,
  };
}

async function describeInvokeError(error: unknown): Promise<string> {
  const fallback = "The cue matcher didn't answer. Try again in a moment.";
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (body && typeof body.error === "string") return friendlyError(body.error, fallback);
    } catch {
      /* body wasn't JSON */
    }
  }
  return friendlyError(error, fallback);
}

function LivePill({ live, configured }: { live: boolean; configured: boolean }) {
  const label = !configured ? "Offline" : live ? "Live" : "Connecting";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[11.5px] font-medium uppercase tracking-[0.2em] ${
        live ? "border-amber/50 bg-amber/10 text-amber" : "border-line-strong text-muted"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "live-dot bg-amber shadow-[0_0_8px_rgba(245,166,35,0.9)]" : "bg-faint"}`} />
      {label}
    </span>
  );
}

export function Console() {
  const data = useBackstage();
  const now = useNow();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const seq = useRef(0);

  const [text, setText] = useState("");
  const [match, setMatch] = useState<MatchState>({ phase: "idle" });
  const [run, setRun] = useState<RunState>(null);
  const [ranMatch, setRanMatch] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [recall, setRecall] = useState<{ list: string[]; index: number | null }>({ list: [], index: null });

  // Guest example phrases are stored as "check in the guest" (the matcher masks names the same way);
  // show them with a real guest so suggestions are runnable: check-ins use someone not yet inside.
  const guestList = data.guests.data;
  const catalog = useMemo(() => {
    const waiting = guestList.find((g) => g.name === "Sarah Tan" && !g.checked_in_at) ?? guestList.find((g) => !g.checked_in_at);
    const inside = guestList.find((g) => g.checked_in_at);
    return data.catalog.data.map((c) => {
      const guest = c.rpc_name === "check_out_guest" ? inside : waiting;
      return guest && c.example_phrase
        ? { ...c, example_phrase: c.example_phrase.replace(/\bthe guest\b/i, guest.name) }
        : c;
    });
  }, [data.catalog.data, guestList]);
  const learned = useMemo(() => learnedLiveNames(catalog, now), [catalog, now]);

  const suggestions = useMemo(() => {
    const rank = (rpc: string) => {
      const i = SUGGESTION_ORDER.indexOf(rpc);
      return i === -1 ? SUGGESTION_ORDER.length : i;
    };
    const ordered = [...catalog].sort(
      (a, b) => Number(learned.has(b.name)) - Number(learned.has(a.name)) || rank(a.rpc_name) - rank(b.rpc_name),
    );
    const picks: string[] = [];
    for (const c of ordered) {
      const phrase = c.example_phrase || c.description;
      if (phrase && !picks.includes(phrase)) picks.push(phrase);
      if (picks.length === 5) break;
    }
    return picks;
  }, [catalog, learned]);

  const examples = useMemo(() => {
    const extra = catalog.map((c) => c.example_phrase).filter((p): p is string => Boolean(p));
    return [...BASE_EXAMPLES, ...extra.filter((p) => !BASE_EXAMPLES.includes(p)).slice(0, 4)];
  }, [catalog]);

  const showResult = useCallback(() => {
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }, []);

  const callRpc = useCallback(
    async (rpcName: string, params: Record<string, number> | undefined, id: number) => {
      const supabase = getSupabase();
      if (!supabase) return;
      setRun({ state: "running", result: null, error: null });
      showResult();
      const { data: rpcData, error } = await callCommand(supabase, rpcName, params);
      if (id !== seq.current) return;
      if (error) {
        setRun({ state: "error", result: null, error: friendlyError(error, "The booth couldn't run that cue.") });
        return;
      }
      const result = normalizeResult(rpcData);
      setRun({ state: "done", result, error: null });
      if (result.kind === "write" && result.ok) data.refreshAfterWrite();
      showResult();
    },
    [data, showResult],
  );

  const runMatch = useCallback(async () => {
    if (match.phase !== "match" || match.match.status !== "matched") return;
    const id = seq.current;
    setRanMatch(true);
    await callRpc(match.match.command.rpc_name, match.match.params, id);
  }, [match, callRpc]);

  const submit = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      const supabase = getSupabase();
      if (!value || !supabase) return;
      const id = ++seq.current;
      setText(value);
      setRun(null);
      setRanMatch(false);
      setMatch({ phase: "matching", text: value });
      setRecall((r) => ({ list: r.list[r.list.length - 1] === value ? r.list : [...r.list, value].slice(-30), index: null }));

      const { data: res, error } = await supabase.functions.invoke<MatchResponse>("match-command", { body: { text: value } });
      if (id !== seq.current) return;
      if (error || !res || !("status" in res)) {
        setMatch({ phase: "error", message: error ? await describeInvokeError(error) : "The cue matcher sent back something unexpected." });
        return;
      }
      setMatch({ phase: "match", text: value, match: res });
      if (res.status === "matched" && isReadOnlySql(res.command.sql_preview)) {
        setRanMatch(true);
        void callRpc(res.command.rpc_name, res.params, id);
      }
    },
    [callRpc],
  );

  const clearAll = useCallback(() => {
    seq.current++;
    setText("");
    setMatch({ phase: "idle" });
    setRun(null);
    setRanMatch(false);
    setRecall((r) => ({ ...r, index: null }));
  }, []);

  const cancelMatch = useCallback(() => {
    seq.current++;
    setMatch({ phase: "idle" });
    setRun(null);
    setRanMatch(false);
    inputRef.current?.focus();
  }, []);

  const onRecall = useCallback(
    (dir: 1 | -1) => {
      const { list, index } = recall;
      if (!list.length) return;
      if (dir === -1) {
        if (index === null && text.trim() && text !== list[list.length - 1]) return;
        const next = index === null ? list.length - 1 : Math.max(0, index - 1);
        setRecall({ list, index: next });
        setText(list[next]);
      } else {
        if (index === null) return;
        const next = index + 1;
        if (next >= list.length) {
          setRecall({ list, index: null });
          setText("");
        } else {
          setRecall({ list, index: next });
          setText(list[next]);
        }
      }
    },
    [recall, text],
  );

  const undoLast = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || undoing) return;
    const id = ++seq.current;
    setUndoing(true);
    setMatch({ phase: "idle" });
    setRanMatch(false);
    setRun({ state: "running", result: null, error: null });
    const { data: rpcData, error } = await supabase.rpc("undo_last");
    setUndoing(false);
    data.refreshAfterWrite();
    if (id !== seq.current) return;
    if (error) {
      setRun({ state: "error", result: null, error: friendlyError(error, "Couldn't rewind that change.") });
      return;
    }
    setRun({ state: "done", result: { ...normalizeResult(rpcData), kind: "write" }, error: null });
    showResult();
  }, [data, undoing, showResult]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setSheetOpen(false);
        inputRef.current?.focus();
      } else if (e.key === "Escape") {
        if (sheetOpen) setSheetOpen(false);
        else {
          clearAll();
          inputRef.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, clearAll]);

  const matching = match.phase === "matching";
  const current = match.phase === "match" ? match.match : null;
  const readOnly = current?.status === "matched" ? isReadOnlySql(current.command.sql_preview) : false;
  const running = run?.state === "running";

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1520px] flex-col overflow-x-clip px-5 pb-10 sm:px-8 lg:px-10">
        {/* ---------- Header ---------- */}
        <header className="flex flex-col gap-6 border-b border-line py-6 sm:py-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-3.5">
                <h1 className="font-display text-[48px] leading-[0.9] tracking-[-0.02em] text-paper sm:text-[60px]">Backstage</h1>
                <LivePill live={data.live} configured={data.configured} />
              </div>
              <p className="mt-2.5 text-[15px] text-muted">The operations console for tonight&rsquo;s show.</p>
            </div>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="shrink-0 rounded-xl border border-line-strong bg-booth/60 px-3.5 py-2.5 text-[15px] text-paper/90 transition hover:border-amber/50 lg:hidden"
            >
              Cue sheet
            </button>
          </div>
          <div className="flex items-end gap-8">
            <div className="w-full sm:w-[420px]">
              <StatsBar guests={data.guests} />
            </div>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="hidden shrink-0 items-center gap-2.5 rounded-xl border border-line-strong bg-booth/60 px-4 py-2.5 text-[15px] text-paper/90 transition hover:border-amber/50 hover:text-paper lg:flex"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="text-amber">
                <path d="M3 2.5h10M3 6.5h10M3 10.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Cue sheet
              {learned.size > 0 && (
                <span className="rounded-full bg-amber px-1.5 font-mono text-[11px] font-semibold text-[#1a1206]">+{learned.size}</span>
              )}
            </button>
          </div>
        </header>

        {/* ---------- Stage ---------- */}
        <div className="mt-8 grid flex-1 grid-cols-1 items-start gap-6 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8 2xl:grid-cols-[320px_minmax(0,1fr)_360px]">
          <section className="min-w-0 lg:col-start-1 lg:row-start-1 2xl:col-start-2" aria-label="The cue">
            <div className="mx-auto max-w-[860px]">
              <p className="eyebrow">The cue · plain English in, SQL out</p>
              <h2 className="mb-7 mt-3 font-display text-[44px] leading-[0.95] tracking-[-0.02em] text-paper sm:mb-8 sm:text-[64px]">
                What&rsquo;s the <em className="text-amber">cue</em>?
              </h2>

              {!data.configured && (
                <div className="mb-6 rounded-2xl border border-amber/35 bg-amber/[0.06] px-5 py-4 text-[15px] leading-relaxed text-paper/90">
                  <p className="font-display text-[22px] text-amber">The booth isn&rsquo;t connected yet.</p>
                  <p className="mt-1 text-muted">
                    Add <code className="font-mono text-paper">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                    <code className="font-mono text-paper">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code className="font-mono text-paper">.env.local</code>, then restart the dev server.
                  </p>
                </div>
              )}

              <CommandInput
                inputRef={inputRef}
                value={text}
                onChange={(v) => {
                  setText(v);
                  if (recall.index !== null) setRecall((r) => ({ ...r, index: null }));
                }}
                onSubmit={submit}
                onClear={clearAll}
                onRecall={onRecall}
                busy={matching}
                disabled={!data.configured}
                examples={examples}
                suggestions={suggestions}
                suggestionsLoading={data.configured && data.catalog.state === "loading"}
              />

              <div className="mt-8 space-y-5" ref={resultRef}>
                <AnimatePresence mode="popLayout">
                  {match.phase === "match" && (
                    <MatchCard
                      key={`match-${match.text}-${match.match.status}`}
                      match={match.match}
                      readOnly={readOnly}
                      runState={!ranMatch || run?.state === "error" ? "pending" : running ? "running" : "done"}
                      onRun={runMatch}
                      onCancel={cancelMatch}
                    />
                  )}
                  {match.phase === "error" && (
                    <motion.div
                      key="match-error"
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      role="alert"
                      className="panel relative overflow-hidden rounded-2xl px-6 py-5 sm:px-8"
                    >
                      <div aria-hidden className="absolute inset-y-0 left-0 w-1 bg-house" />
                      <p className="eyebrow !text-house">No answer from the booth</p>
                      <p className="mt-2 font-display text-[26px] leading-tight text-paper">{match.message}</p>
                    </motion.div>
                  )}
                  {run && (
                    <motion.div key="run" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <ResultView state={run.state} result={run.result} error={run.error} now={now} onDismiss={clearAll} />
                    </motion.div>
                  )}
                  {match.phase === "idle" && !run && (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0.12 } }}
                      className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center sm:py-12"
                    >
                      <p className="font-display text-[28px] italic text-paper/80">Standing by.</p>
                      <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted">
                        Ask for anything in plain English. Read-only cues run straight away; anything that changes the guest list waits for your go.
                      </p>
                      <div className="mt-6 hidden flex-wrap justify-center gap-x-6 gap-y-2 font-mono text-[13px] text-muted sm:flex">
                        {[
                          ["/", "focus"],
                          ["↵", "call cue"],
                          ["↑", "recall"],
                          ["esc", "clear"],
                        ].map(([k, label]) => (
                          <span key={k} className="flex items-center gap-2">
                            <kbd className="rounded-md border border-line-strong bg-booth px-1.5 py-0.5 text-paper/85">{k}</kbd>
                            {label}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </section>

          {/* One sticky column on laptops; on very wide screens it dissolves so each panel takes its own wing. */}
          <div className="flex flex-col gap-6 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:gap-8 2xl:contents">
            <TimeMachine
              history={data.history}
              now={now}
              undoing={undoing}
              onUndo={undoLast}
              onRetry={data.retry.history}
              className="max-h-[520px] lg:max-h-[48dvh] 2xl:sticky 2xl:top-6 2xl:col-start-3 2xl:row-start-1 2xl:max-h-[calc(100dvh-48px)]"
            />
            <LearningQueue
              queue={data.queue}
              now={now}
              onRetry={data.retry.queue}
              className="max-h-[440px] lg:max-h-[38dvh] 2xl:sticky 2xl:top-6 2xl:col-start-1 2xl:row-start-1 2xl:max-h-[calc(100dvh-48px)]"
            />
          </div>
        </div>
      </div>

      <CueSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        catalog={{ ...data.catalog, data: catalog }}
        now={now}
        onRetry={data.retry.catalog}
        onTry={(phrase) => {
          setSheetOpen(false);
          void submit(phrase);
        }}
      />
      <LearnedToasts items={data.learned} onDismiss={data.dismissLearned} />
    </MotionConfig>
  );
}
