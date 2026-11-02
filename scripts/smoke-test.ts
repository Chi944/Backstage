import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

const cases = [
  ["who hasn't arrived yet", "not_checked_in"],
  ["check in Sarah Tan", "check_in_guest"],
  ["how many VIPs are inside", "vip_inside_count"],
  ["move table 4 to table 9", "move_table"],
  ["undo that", "undo_last"],
  ["which table has the most VIPs", null],
  ["banana spaceship", null],
] as const;

async function main() {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Set both NEXT_PUBLIC_SUPABASE_* values in .env.local.");

  const endpoint = new URL("/functions/v1/match-command", url);
  const headers: Record<string, string> = { "Content-Type": "application/json", apikey: key };
  if (!key.startsWith("sb_publishable_")) {
    const payload = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString());
    if (payload.role !== "anon") throw new Error("Use the public Supabase anon key.");
    headers.Authorization = `Bearer ${key}`;
  }

  const rows = [];
  for (const [phrase, expected] of cases) {
    try {
      // Match only. Never follow command.rpc_name to an execution endpoint.
      const response = await fetch(endpoint, {
        method: "POST", headers, body: JSON.stringify({ text: phrase }),
        redirect: "error", signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { status, command, similarity } = await response.json();
      const pass = expected === null
        ? status === "unknown" && command == null
        : status === "matched" && command?.rpc_name === expected && Number.isFinite(similarity);
      rows.push({ phrase, status, command: command?.rpc_name ?? "—",
        similarity: Number.isFinite(similarity) ? similarity.toFixed(3) : "—",
        result: pass ? "PASS" : "FAIL" });
    } catch (err) {
      rows.push({ phrase, status: err instanceof Error ? err.message : "request failed",
        command: "—", similarity: "—", result: "FAIL" });
    }
  }
  console.table(rows);
  if (rows.some(row => row.result === "FAIL")) process.exitCode = 1;
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : "Smoke test failed");
  process.exitCode = 1;
});
