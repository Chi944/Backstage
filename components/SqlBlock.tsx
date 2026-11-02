import { Fragment } from "react";

const KEYWORDS = new Set(
  (
    "select from where and or not in is null as on join left right inner outer group by order having limit offset " +
    "update set insert into values delete returning with case when then else end distinct count sum avg min max " +
    "coalesce now interval desc asc exists between like ilike true false begin commit"
  ).split(" "),
);

const TOKEN =
  /(--[^\n]*)|('(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|([:$@]?\bp_[a-z_]+\b|\$\d+|:[a-z_]+)|(\b[a-z_][a-z0-9_]*\b)|(\s+)|([^\sa-z0-9_'$:@-]+|-)/gi;

export function SqlBlock({ sql }: { sql: string }) {
  const parts: React.ReactNode[] = [];
  let i = 0;
  let cursor = 0;
  for (const match of sql.matchAll(TOKEN)) {
    const [text, comment, str, num, param, word] = match;
    if (match.index > cursor) parts.push(<Fragment key={`gap-${i}`}>{sql.slice(cursor, match.index)}</Fragment>);
    cursor = match.index + text.length;
    const key = i++;
    if (comment) parts.push(<span key={key} className="italic text-faint">{text}</span>);
    else if (str) parts.push(<span key={key} className="text-[#E8C99A]">{text}</span>);
    else if (num) parts.push(<span key={key} className="text-cue">{text}</span>);
    else if (param) parts.push(<span key={key} className="text-cue">{text}</span>);
    else if (word && KEYWORDS.has(word.toLowerCase()))
      parts.push(<span key={key} className="font-semibold text-amber">{text}</span>);
    else if (word) parts.push(<span key={key} className="text-paper/90">{text}</span>);
    else parts.push(<Fragment key={key}>{text}</Fragment>);
  }
  if (cursor < sql.length) parts.push(<Fragment key="tail">{sql.slice(cursor)}</Fragment>);

  return (
    <pre className="scroll-quiet overflow-x-auto rounded-xl border border-line bg-[#0b0a08] px-4 py-3.5 font-mono text-[13.5px] leading-[1.7] text-muted sm:px-5 sm:text-[14.5px]">
      <code>{parts}</code>
    </pre>
  );
}
