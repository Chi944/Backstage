import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient<Database> | null = null;

/** Browser-side singleton. Returns null when the env vars are missing so the UI can explain instead of crashing. */
export function getSupabase(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient<Database>(url!, anonKey!, {
      auth: { persistSession: false },
    });
  }
  return client;
}

/** Commands are chosen at runtime by the matcher, so their names can't be checked statically. */
export function callCommand(supabase: SupabaseClient<Database>, rpcName: string, params?: Record<string, number>) {
  type AnyRpc = (fn: string, args?: Record<string, number>) => ReturnType<SupabaseClient<Database>["rpc"]>;
  return (supabase.rpc as unknown as AnyRpc).call(supabase, rpcName, params ?? {});
}
