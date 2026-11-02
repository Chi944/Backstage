// embed-commands — embeds every commands.example_phrase that has no embedding yet.
// Admin only: requires header `x-admin-token`. Optional ?batch=N (default 8, max 50).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BATCH_SIZE = 8;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
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

// Constant-time string comparison.
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ADMIN_TOKEN env secret wins; otherwise fall back to the sha256 hash in private.admin_tokens.
async function isAdmin(token: string | null) {
  if (!token) return false;
  const envToken = Deno.env.get("ADMIN_TOKEN");
  if (envToken) return safeEqual(token, envToken);
  const { data, error } = await supabase.rpc("verify_admin_token", { p_token: token });
  return !error && data === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  if (!(await isAdmin(req.headers.get("x-admin-token")))) return json({ error: "Unauthorized" }, 401);

  // The free tier caps CPU per invocation, so work in batches; callers loop until remaining = 0.
  const batch = Math.min(Math.max(Number(new URL(req.url).searchParams.get("batch") ?? BATCH_SIZE), 1), 50);
  const { data: rows, error, count } = await supabase
    .from("commands")
    .select("id, example_phrase", { count: "exact" })
    .is("embedding", null)
    .order("id")
    .limit(batch);
  if (error) return json({ error: error.message }, 500);

  let embedded = 0;
  const failed: number[] = [];
  for (const row of rows ?? []) {
    const embedding = await session.run(row.example_phrase, { mean_pool: true, normalize: true });
    const { error: updateError } = await supabase
      .from("commands")
      .update({ embedding: JSON.stringify(embedding) })
      .eq("id", row.id);
    if (updateError) failed.push(row.id);
    else embedded++;
  }

  return json({ embedded, failed, remaining: (count ?? 0) - embedded });
});
