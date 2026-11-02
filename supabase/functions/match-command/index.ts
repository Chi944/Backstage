// match-command — turns plain English into a pre-approved command + parameters.
// No LLM: gte-small embeddings (built into the Edge Runtime) + pgvector + pg_trgm.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Tuned on 32 test phrasings: correct matches >= 0.838, wrong-but-read-only matches up to 0.879,
// nonsense <= 0.829. See BACKEND.md.
const MATCH_THRESHOLD = Number(Deno.env.get("MATCH_THRESHOLD") ?? "0.83");
const MATCH_COUNT = 3;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// @ts-ignore Supabase global is provided by the Edge Runtime
const session = new Supabase.ai.Session("gte-small");

type Match = {
  id: number;
  name: string;
  description: string;
  example_phrase: string;
  rpc_name: string;
  param_type: "none" | "guest" | "table" | "two_tables";
  sql_preview: string;
  similarity: number;
};

// Single-number commands: which RPC argument the number maps to.
const SINGLE_NUMBER_PARAM: Record<string, { key: string; label: string }> = {
  rewind_minutes: { key: "p_minutes", label: "minutes" },
};

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
];
const NUMBER_WORD_RE = new RegExp(`\\b(${NUMBER_WORDS.join("|")})\\b`, "gi");

// Integers in order of appearance; "table nine" counts as 9.
const integersIn = (text: string) =>
  (text.replace(NUMBER_WORD_RE, (w) => String(NUMBER_WORDS.indexOf(w.toLowerCase()))).match(/\d+/g) ?? []).map(Number);

// Ranking guard: embeddings rate "which table has the most VIPs" ~0.92 against "how many VIPs are here".
// A ranking question may only match a command whose example phrase is itself a ranking question.
const RANKING = /\b(most|least|fewest|highest|lowest|top|biggest|largest|smallest|busiest|emptiest|rank|ranking)\b/i;
const rankingMismatch = (text: string, phrase: string) => RANKING.test(text) && !RANKING.test(phrase);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  let body: { text?: unknown; debug?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON: { \"text\": string }" }, 400);
  }
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 500) : "";
  if (!text) return json({ error: "\"text\" is required" }, 400);

  const embedding = await session.run(text, { mean_pool: true, normalize: true });

  // Debug mode: raw top matches with no threshold, for tuning.
  if (body.debug === true) {
    const { data, error } = await supabase.rpc("match_command", {
      query_embedding: JSON.stringify(embedding),
      match_threshold: -1,
      match_count: MATCH_COUNT,
    });
    if (error) return json({ error: error.message }, 500);
    return json({
      threshold: MATCH_THRESHOLD,
      top: (data as Match[]).map((m) => ({ name: m.name, example_phrase: m.example_phrase, similarity: m.similarity })),
    });
  }

  const { data: matches, error } = await supabase.rpc("match_command", {
    query_embedding: JSON.stringify(embedding),
    match_threshold: MATCH_THRESHOLD,
    match_count: MATCH_COUNT,
  });
  if (error) return json({ error: error.message }, 500);

  const best = (matches as Match[]).find((m) => !rankingMismatch(text, m.example_phrase));
  if (!best) {
    const { data: id, error: logError } = await supabase.rpc("log_unknown", { p_text: text });
    if (logError) return json({ error: logError.message }, 500);
    return json({ status: "unknown", id, text });
  }

  const command = {
    name: best.name,
    description: best.description,
    rpc_name: best.rpc_name,
    param_type: best.param_type,
    sql_preview: best.sql_preview,
  };
  const params: Record<string, number> = {};
  const display_params: Record<string, string | number> = {};
  const nums = integersIn(text);

  switch (best.param_type) {
    case "none":
      break;

    case "guest": {
      const { data: guests, error: guestError } = await supabase.rpc("guess_guest", { p_text: text });
      if (guestError) return json({ error: guestError.message }, 500);
      const guest = (guests as { id: number; name: string; score: number }[])[0];
      if (!guest) {
        return json({ status: "needs_input", similarity: best.similarity, command, reason: "Couldn't find that guest" });
      }
      params.p_guest_id = guest.id;
      display_params.guest = guest.name;
      return json({
        status: "matched",
        similarity: best.similarity,
        command,
        params,
        display_params,
        guest_name: guest.name,
      });
    }

    case "table": {
      const target = SINGLE_NUMBER_PARAM[best.rpc_name] ?? { key: "p_table", label: "table" };
      if (nums.length < 1) {
        return json({
          status: "needs_input",
          similarity: best.similarity,
          command,
          reason: target.label === "table" ? "Which table?" : `How many ${target.label}?`,
        });
      }
      params[target.key] = nums[0];
      display_params[target.label] = nums[0];
      break;
    }

    case "two_tables":
      if (nums.length < 2) {
        return json({
          status: "needs_input",
          similarity: best.similarity,
          command,
          reason: "Need two table numbers, e.g. \"move table 4 to table 9\"",
        });
      }
      params.p_from = nums[0];
      params.p_to = nums[1];
      display_params.from_table = nums[0];
      display_params.to_table = nums[1];
      break;
  }

  return json({ status: "matched", similarity: best.similarity, command, params, display_params });
});
