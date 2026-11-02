import type { ReactNode } from "react";

/** Shared booth-panel chrome for the side panels. */
export function Panel({
  eyebrow,
  title,
  count,
  action,
  children,
  className = "",
}: {
  eyebrow: string;
  title: string;
  count?: number | null;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel flex min-h-0 flex-col rounded-2xl ${className}`}>
      <header className="flex items-end justify-between gap-3 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="mt-1.5 flex items-baseline gap-2.5 font-display text-[28px] leading-none text-paper">
            {title}
            {typeof count === "number" && count > 0 && (
              <span className="tabular rounded-full bg-amber/15 px-2 py-0.5 font-mono text-[13px] leading-none text-amber">{count}</span>
            )}
          </h2>
        </div>
        {action}
      </header>
      <div className="h-px bg-line" />
      {children}
    </section>
  );
}

export function PanelMessage({ tone = "muted", title, body, onRetry }: { tone?: "muted" | "error"; title: string; body?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-1.5 px-5 py-6">
      <p className={`font-display text-[22px] leading-tight ${tone === "error" ? "text-house" : "text-paper/85"}`}>{title}</p>
      {body && <p className="text-[15px] leading-relaxed text-muted">{body}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 text-sm text-amber underline decoration-amber/40 underline-offset-4 hover:decoration-amber">
          Try again
        </button>
      )}
    </div>
  );
}

export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="space-y-4 px-5 py-5" aria-busy>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="space-y-2">
          <div className="h-4 animate-pulse rounded bg-line" style={{ width: `${78 - i * 9}%` }} />
          <div className="h-3 w-20 animate-pulse rounded bg-line/60" />
        </li>
      ))}
    </ul>
  );
}
