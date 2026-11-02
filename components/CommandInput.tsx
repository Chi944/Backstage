"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type KeyboardEvent, type RefObject } from "react";

interface Props {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  onClear: () => void;
  onRecall: (direction: 1 | -1) => void;
  busy: boolean;
  disabled?: boolean;
  examples: string[];
  suggestions: string[];
  suggestionsLoading: boolean;
}

export function CommandInput({
  inputRef,
  value,
  onChange,
  onSubmit,
  onClear,
  onRecall,
  busy,
  disabled,
  examples,
  suggestions,
  suggestionsLoading,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [exampleIndex, setExampleIndex] = useState(0);

  useEffect(() => {
    if (value || examples.length < 2) return;
    const id = setInterval(() => setExampleIndex((i) => (i + 1) % examples.length), 3200);
    return () => clearInterval(id);
  }, [value, examples.length]);

  const example = examples[exampleIndex % Math.max(examples.length, 1)] ?? "";

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (value.trim()) onSubmit(value.trim());
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClear();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      onRecall(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onRecall(1);
    }
  };

  const glow = busy ? 1 : focused ? 0.75 : 0.5;

  return (
    <div className="relative isolate">
      {/* Spotlight: soft amber pool behind the input, brightening while a cue is being matched. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[44px] -z-10 h-[340px] w-[min(900px,150%)] -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(245,166,35,0.30), rgba(245,166,35,0.12) 45%, rgba(245,166,35,0) 100%)",
          filter: "blur(18px)",
        }}
        animate={busy ? { opacity: [0.75, 1, 0.75], scale: [1, 1.08, 1] } : { opacity: glow, scale: 1 }}
        transition={busy ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.6, ease: "easeOut" }}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSubmit(value.trim());
        }}
        className={`group relative flex items-center gap-3 rounded-2xl border bg-[rgba(18,17,14,0.82)] px-4 backdrop-blur-md transition-[border-color,box-shadow] duration-300 sm:gap-4 sm:px-6 ${
          focused || busy
            ? "border-amber/55 shadow-[0_0_0_4px_rgba(245,166,35,0.10),0_20px_60px_-20px_rgba(245,166,35,0.35)]"
            : "border-line-strong shadow-[0_20px_50px_-24px_rgba(0,0,0,0.9)]"
        }`}
      >
        <span aria-hidden className="font-mono text-xl text-amber sm:text-2xl">
          ›
        </span>
        <div className="relative min-w-0 flex-1">
          <label htmlFor="cue-input" className="sr-only">
            Type a command in plain English
          </label>
          <input
            id="cue-input"
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={disabled}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            className="h-[68px] w-full bg-transparent text-[22px] tracking-[-0.01em] text-paper outline-none placeholder:text-transparent disabled:cursor-not-allowed sm:h-[80px] sm:text-[26px]"
            placeholder={example}
          />
          <AnimatePresence mode="wait">
            {!value && example && (
              <motion.span
                key={example}
                aria-hidden
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="pointer-events-none absolute inset-y-0 left-0 flex max-w-full items-center truncate text-[22px] tracking-[-0.01em] text-faint sm:text-[26px]"
              >
                <span className="truncate">{example}</span>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="flex shrink-0 items-center">
          {busy ? (
            <span className="flex items-center gap-1.5 pr-1" role="status" aria-label="Matching">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-amber"
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </span>
          ) : value.trim() ? (
            <button
              type="submit"
              className="rounded-lg border border-amber/40 bg-amber/10 px-3 py-1.5 font-mono text-sm text-amber transition hover:bg-amber/20"
            >
              Enter ↵
            </button>
          ) : (
            <kbd className="hidden rounded-md border border-line-strong px-2 py-0.5 font-mono text-sm text-muted sm:inline-block">
              /
            </kbd>
          )}
        </div>
      </form>

      <div className="mt-5 flex min-h-[38px] flex-wrap items-center gap-2 sm:gap-2.5">
        {suggestionsLoading
          ? [112, 148, 96, 134].map((w, i) => (
              <span key={i} className="h-[38px] animate-pulse rounded-full bg-line" style={{ width: w }} />
            ))
          : suggestions.map((s, i) => (
              <motion.button
                key={s}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i, duration: 0.35 }}
                onClick={() => onSubmit(s)}
                disabled={busy || disabled}
                className="rounded-full border border-line-strong bg-booth/70 px-4 py-2 text-[15px] leading-none text-muted transition hover:border-amber/50 hover:text-paper disabled:opacity-50"
              >
                {s}
              </motion.button>
            ))}
      </div>
    </div>
  );
}
