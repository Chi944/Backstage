const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });

export function relativeTime(iso: string | null | undefined, now: number | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  if (now === null) return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const seconds = Math.round((then - now) / 1000);
  if (Math.abs(seconds) < 45) return "just now";
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(Math.round(seconds / 60), "minute");
}

export function humanize(value: string | null | undefined): string {
  if (!value) return "Change";
  const words = value.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const PARAM_LABELS: Record<string, string> = {
  guest: "Guest",
  table: "Table",
  minutes: "Minutes",
  from_table: "From table",
  to_table: "To table",
};

export function paramLabel(key: string): string {
  return PARAM_LABELS[key] ?? humanize(key);
}

/** Write commands always wait for a click; anything that only SELECTs may auto-run. */
export function isReadOnlySql(sql: string): boolean {
  const body = sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim()
    .toLowerCase();
  if (!/^(select|with)\b/.test(body)) return false;
  return !/\b(insert|update|delete|truncate|alter|drop|create)\b/.test(body);
}

/** Supabase/network errors arrive in many shapes; never show the raw object. */
export function friendlyError(error: unknown, fallback: string): string {
  if (!error) return fallback;
  const message =
    typeof error === "string"
      ? error
      : typeof error === "object" && error && "message" in error && typeof error.message === "string"
        ? error.message
        : "";
  if (/failed to fetch|network|fetch failed|load failed/i.test(message)) {
    return "Can't reach the booth right now. Check the connection and try again.";
  }
  if (/non-2xx|edge function/i.test(message)) return fallback;
  if (/could not find the function|does not exist/i.test(message)) {
    return "That cue isn't wired up on the backend yet.";
  }
  if (message && message.length < 160 && !/[{}[\]]/.test(message)) return message;
  return fallback;
}
