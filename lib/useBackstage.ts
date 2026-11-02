"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { friendlyError } from "./format";
import type { CatalogCommand, Guest, HistoryEntry, UnknownRequest } from "./types";

export type LoadState = "loading" | "ready" | "error";

export interface Resource<T> {
  data: T;
  state: LoadState;
  error: string | null;
}

export interface QueueItem extends UnknownRequest {
  /** Set briefly when the request is resolved, so the row can celebrate before leaving. */
  learnedAt?: number;
}

export interface LearnedCue {
  key: string;
  name: string;
  description: string;
}

const HISTORY_LIMIT = 14;
const QUEUE_LIMIT = 30;
const LEARNED_LINGER_MS = 2400;

function initial<T>(data: T): Resource<T> {
  return { data, state: "loading", error: null };
}

function useDebounced(fn: () => void, ms: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(), ms);
  }, [ms]);
}

export function useBackstage() {
  const supabase = getSupabase();
  const [guests, setGuests] = useState<Resource<Guest[]>>(initial([]));
  const [queue, setQueue] = useState<Resource<QueueItem[]>>(initial([]));
  const [history, setHistory] = useState<Resource<HistoryEntry[]>>(initial([]));
  const [catalog, setCatalog] = useState<Resource<CatalogCommand[]>>(initial([]));
  const [live, setLive] = useState(false);
  const [learned, setLearned] = useState<LearnedCue[]>([]);
  const announced = useRef(new Map<string, number>());

  const loadGuests = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("guests")
      .select("id, name, tier, table_no, checked_in_at")
      .order("name");
    setGuests((prev) =>
      error
        ? { ...prev, state: "error", error: friendlyError(error, "Couldn't load the guest list.") }
        : { data: (data ?? []) as Guest[], state: "ready", error: null },
    );
  }, [supabase]);

  const loadQueue = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("unknown_requests")
      .select("id, text, resolved, created_at")
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(QUEUE_LIMIT);
    setQueue((prev) =>
      error
        ? { ...prev, state: "error", error: friendlyError(error, "Couldn't load the learning queue.") }
        : { data: (data ?? []) as QueueItem[], state: "ready", error: null },
    );
  }, [supabase]);

  const loadHistory = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("history")
      .select("id, guest_id, old_data, action, undone, changed_at")
      .order("changed_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(HISTORY_LIMIT);
    setHistory((prev) =>
      error
        ? { ...prev, state: "error", error: friendlyError(error, "Couldn't load the change history.") }
        : { data: (data ?? []) as HistoryEntry[], state: "ready", error: null },
    );
  }, [supabase]);

  const loadCatalog = useCallback(async () => {
    if (!supabase) return;
    const [catalogRes, commandsRes] = await Promise.all([
      supabase
        .from("command_catalog")
        .select("name, description, rpc_name, param_type, sql_preview, created_by"),
      supabase
        .from("commands")
        .select("name, example_phrase, created_at")
        .order("id", { ascending: true }),
    ]);
    if (catalogRes.error) {
      setCatalog((prev) => ({
        ...prev,
        state: "error",
        error: friendlyError(catalogRes.error, "Couldn't load the cue sheet."),
      }));
      return;
    }
    const extras = new Map<string, { example_phrase: string | null; created_at: string | null }>();
    for (const row of (commandsRes.data ?? []) as { name: string; example_phrase: string; created_at: string }[]) {
      if (!extras.has(row.name)) extras.set(row.name, { example_phrase: row.example_phrase, created_at: row.created_at });
    }
    const merged = ((catalogRes.data ?? []) as CatalogCommand[])
      .map((c) => ({ ...c, ...extras.get(c.name) }))
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "") || a.name.localeCompare(b.name));
    setCatalog({ data: merged, state: "ready", error: null });
  }, [supabase]);

  const reloadHistorySoon = useDebounced(loadHistory, 250);
  const reloadCatalogSoon = useDebounced(loadCatalog, 400);

  useEffect(() => {
    if (!supabase) return;
    const first = setTimeout(() => {
      void loadGuests();
      void loadQueue();
      void loadHistory();
      void loadCatalog();
    }, 0);

    const onGuest = (payload: RealtimePostgresChangesPayload<Guest>) => {
      setGuests((prev) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as Partial<Guest>).id;
          return { ...prev, data: prev.data.filter((g) => g.id !== id) };
        }
        const row = payload.new as Guest;
        const exists = prev.data.some((g) => g.id === row.id);
        return {
          ...prev,
          data: exists ? prev.data.map((g) => (g.id === row.id ? { ...g, ...row } : g)) : [...prev.data, row],
        };
      });
      reloadHistorySoon();
    };

    const onUnknown = (payload: RealtimePostgresChangesPayload<UnknownRequest>) => {
      if (payload.eventType === "DELETE") {
        const id = (payload.old as Partial<UnknownRequest>).id;
        setQueue((prev) => ({ ...prev, data: prev.data.filter((q) => q.id !== id) }));
        return;
      }
      const row = payload.new as UnknownRequest;
      if (row.resolved) {
        setQueue((prev) => ({
          ...prev,
          data: prev.data.map((q) => (q.id === row.id ? { ...q, resolved: true, learnedAt: Date.now() } : q)),
        }));
        setTimeout(() => {
          setQueue((prev) => ({ ...prev, data: prev.data.filter((q) => q.id !== row.id) }));
        }, LEARNED_LINGER_MS);
        return;
      }
      setQueue((prev) =>
        prev.data.some((q) => q.id === row.id)
          ? prev
          : { ...prev, data: [row, ...prev.data].slice(0, QUEUE_LIMIT) },
      );
    };

    const onCommand = (payload: RealtimePostgresChangesPayload<{ name: string; description: string }>) => {
      reloadCatalogSoon();
      if (payload.eventType !== "INSERT") return;
      const { name, description } = payload.new as { name: string; description: string };
      const last = announced.current.get(name) ?? 0;
      if (Date.now() - last < 60_000) return;
      announced.current.set(name, Date.now());
      setLearned((prev) => [...prev, { key: `${name}-${Date.now()}`, name, description }]);
    };

    const channel = supabase
      .channel("backstage-console")
      .on("postgres_changes", { event: "*", schema: "public", table: "guests" }, onGuest)
      .on("postgres_changes", { event: "*", schema: "public", table: "unknown_requests" }, onUnknown)
      .on("postgres_changes", { event: "*", schema: "public", table: "commands" }, onCommand)
      .on("postgres_changes", { event: "*", schema: "public", table: "history" }, () => reloadHistorySoon())
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      clearTimeout(first);
      void supabase.removeChannel(channel);
    };
  }, [supabase, loadGuests, loadQueue, loadHistory, loadCatalog, reloadHistorySoon, reloadCatalogSoon]);

  const dismissLearned = useCallback((key: string) => {
    setLearned((prev) => prev.filter((l) => l.key !== key));
  }, []);

  const refreshAfterWrite = useCallback(() => {
    void loadGuests();
    void loadHistory();
  }, [loadGuests, loadHistory]);

  return {
    configured: Boolean(supabase),
    live,
    guests,
    queue,
    history,
    catalog,
    learned,
    dismissLearned,
    refreshAfterWrite,
    retry: { guests: loadGuests, queue: loadQueue, history: loadHistory, catalog: loadCatalog },
  };
}
