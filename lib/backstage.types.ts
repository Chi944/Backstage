// Hand-written types for the shapes Postgres returns as `Json`.
// Pair with database.types.ts (generated).
import type { Tables } from "./database.types";

export type Guest = Tables<"guests">;

/** Every command RPC returns this. `ok` is false for refusals ("already checked in", "nothing to undo"). */
export type CommandResult = {
  message: string;
  rows: Guest[];
  kind: "read" | "write";
  ok: boolean;
};

export type ParamType = "none" | "guest" | "table" | "two_tables";

export type MatchedCommand = {
  name: string;
  description: string;
  rpc_name: string;
  param_type: ParamType;
  sql_preview: string;
};

export type CommandParams =
  | Record<string, never>
  | { p_guest_id: number }
  | { p_table: number }
  | { p_minutes: number }
  | { p_from: number; p_to: number };

/** Response from the `match-command` Edge Function. */
export type MatchResponse =
  | {
      status: "matched";
      similarity: number;
      command: MatchedCommand;
      params: CommandParams;
      display_params: Record<string, string | number>;
      guest_name?: string;
    }
  | {
      status: "needs_input";
      similarity: number;
      command: MatchedCommand;
      reason: string;
    }
  | {
      status: "unknown";
      id: number;
      text: string;
    };
