// match-command — turns plain English into a pre-approved command + parameters.
// No LLM: gte-small embeddings (built into the Edge Runtime) + pgvector + pg_trgm.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Tuned on 32 test phrasings: correct matches >= 0.838, wrong-but-read-only matches up to 0.879,
// nonsense <= 0.829. See BACKEND.md.
const MATCH_THRESHOLD = Number(Deno.env.get("MATCH_THRESHOLD") ?? "0.83");
// Several candidates so a command whose parameters can't be filled can fall through to the next one.
const MATCH_COUNT = 8;

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

type ParamType = "none" | "guest" | "table" | "two_tables";
type Match = {
  id: number;
  name: string;
  description: string;
  example_phrase: string;
  rpc_name: string;
  param_type: ParamType;
  sql_preview: string;
  similarity: number;
};
type Guest = { id: number; name: string; score: number };

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

// Name masking: a guest's name otherwise dominates the embedding ("check out Rachel Teo" scored 0.945
// against "sign in Rachel Teo"). Replace the recognised guest's name with "the guest" before embedding,
// matching how the guest example phrases are written, so the verb decides the command.
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function maskGuest(text: string, guest: Guest | null) {
  if (!guest) return text;
  let masked = text;
  for (const token of guest.name.split(/\s+/).filter((t) => t.length >= 2)) {
    masked = masked.replace(new RegExp(`(?<![\\p{L}'])${escapeRe(token)}(?![\\p{L}])`, "giu"), "\u0000");
  }
  return masked.replace(/\u0000(?:\s*\u0000)*/g, "the guest").replace(/\s+/g, " ").trim();
}

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

  const { data: guests, error: guestError } = await supabase.rpc("guess_guest", { p_text: text });
  if (guestError) return json({ error: guestError.message }, 500);
  const guest = ((guests ?? []) as Guest[])[0] ?? null;
  const masked = maskGuest(text, guest);

  const embedding = await session.run(masked, { mean_pool: true, normalize: true });
  const { data, error } = await supabase.rpc("match_command", {
    query_embedding: JSON.stringify(embedding),
    match_threshold: body.debug === true ? -1 : MATCH_THRESHOLD,
    match_count: MATCH_COUNT,
  });
  if (error) return json({ error: error.message }, 500);
  const matches = data as Match[];

  // Debug mode: raw top matches with no threshold, for tuning. Logs nothing.
  if (body.debug === true) {
    return json({
      threshold: MATCH_THRESHOLD,
      masked_text: masked,
      guest: guest?.name ?? null,
      top: matches.slice(0, 3).map((m) => ({ name: m.name, example_phrase: m.example_phrase, similarity: m.similarity })),
    });
  }

  const candidates = matches.filter((m) => !rankingMismatch(text, m.example_phrase));
  if (candidates.length === 0) {
    const { data: id, error: logError } = await supabase.rpc("log_unknown", { p_text: text });
    if (logError) return json({ error: logError.message }, 500);
    return json({ status: "unknown", id, text });
  }

  const nums = integersIn(text);
  const commandOf = (m: Match) => ({
    name: m.name,
    description: m.description,
    rpc_name: m.rpc_name,
    param_type: m.param_type,
    sql_preview: m.sql_preview,
  });
  const needsInput = (m: Match, reason: string) =>
    json({ status: "needs_input", similarity: m.similarity, command: commandOf(m), reason });

  // Take the best candidate whose parameters the text can supply. A missing number falls through to the
  // next candidate ("who is at table 9" is close to "move table 4 to table 9"); a missing guest does not.
  let chosen: Match | null = null;
  for (const m of candidates) {
    if (m.param_type === "guest" && !guest) return needsInput(m, "Couldn't find that guest");
    if (m.param_type === "table" && nums.length < 1) continue;
    if (m.param_type === "two_tables" && nums.length < 2) continue;
    chosen = m;
    break;
  }

  if (!chosen) {
    const best = candidates[0];
    if (best.param_type === "two_tables") {
      return needsInput(best, "Need two table numbers, e.g. \"move table 4 to table 9\"");
    }
    const label = SINGLE_NUMBER_PARAM[best.rpc_name]?.label ?? "table";
    return needsInput(best, label === "table" ? "Which table?" : `How many ${label}?`);
  }

  const params: Record<string, number> = {};
  const display_params: Record<string, string | number> = {};

  switch (chosen.param_type) {
    case "none":
      break;

    case "guest":
      params.p_guest_id = guest!.id;
      display_params.guest = guest!.name;
      return json({
        status: "matched",
        similarity: chosen.similarity,
        command: commandOf(chosen),
        params,
        display_params,
        guest_name: guest!.name,
      });

    case "table": {
      const target = SINGLE_NUMBER_PARAM[chosen.rpc_name] ?? { key: "p_table", label: "table" };
      params[target.key] = nums[0];
      display_params[target.label] = nums[0];
      break;
    }

    case "two_tables":
      params.p_from = nums[0];
      params.p_to = nums[1];
      display_params.from_table = nums[0];
      display_params.to_table = nums[1];
      break;
  }

  return json({ status: "matched", similarity: chosen.similarity, command: commandOf(chosen), params, display_params });
});
