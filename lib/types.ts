export type Tier = "general" | "vip" | "crew";
export type ParamType = "none" | "guest" | "table" | "two_tables";

export interface Guest {
  id: number;
  name: string;
  tier: Tier;
  table_no: number | null;
  checked_in_at: string | null;
}

export interface UnknownRequest {
  id: number;
  text: string;
  resolved: boolean | null;
  created_at: string;
}

export interface HistoryEntry {
  id: number;
  guest_id: number | null;
  old_data: Record<string, unknown> | null;
  action: string | null;
  undone: boolean | null;
  changed_at: string;
}

export interface CatalogCommand {
  name: string;
  description: string;
  rpc_name: string;
  param_type: ParamType;
  sql_preview: string;
  created_by: string;
  /** Joined client-side from `commands`; absent if that read fails. */
  created_at?: string | null;
  example_phrase?: string | null;
}

export interface MatchedCommand {
  name: string;
  description: string;
  rpc_name: string;
  param_type: ParamType;
  sql_preview: string;
}

export type MatchResponse =
  | {
      status: "matched";
      similarity: number;
      command: MatchedCommand;
      params: Record<string, number>;
      display_params: Record<string, string | number>;
    }
  | { status: "needs_input"; similarity?: number; command: MatchedCommand; reason: string }
  | { status: "unknown"; id: number; text: string };

export interface RpcResult {
  message: string;
  rows: Record<string, unknown>[];
  kind: "read" | "write";
  /** False when the backend refused and changed nothing, e.g. "Nothing to undo". */
  ok: boolean;
}
