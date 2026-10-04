'use client';

/**
 * Self-contained markdown renderer for assistant messages.
 *
 * No external dependencies (react-markdown isn't installed and we keep this
 * fully offline). Supports the subset real AI products use: headings, bold,
 * italic, inline code, fenced code blocks with copy + lightweight syntax
 * highlighting, ordered/unordered lists, tables, blockquotes, links, and
 * horizontal rules. Renders into the app's existing design tokens.
 */
import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { safeMarkdownUrl } from '@/lib/markdown-url';

/* ------------------------------------------------------------------ *
 * Inline formatting: bold, italic, code, links, strikethrough.
 * ------------------------------------------------------------------ */

let inlineKey = 0;

/** Turn backslash-escaped markdown punctuation (e.g. `\[`) into the literal char. */
const UNESCAPE = /\\([\\`*_~[\]()#>+\-.!])/g;
function unescape(s: string): string {
  return s.replace(UNESCAPE, '$1');
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Order matters: code first (so we don't format inside it), then links,
  // then bold, then italic, then strikethrough.
  const pattern =
    /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(~~[^~]+~~)/;

  let remaining = text;
  while (remaining.length > 0) {
    const match = pattern.exec(remaining);
    if (!match) {
      nodes.push(unescape(remaining));
      break;
    }
    const idx = match.index;
    if (idx > 0) nodes.push(unescape(remaining.slice(0, idx)));
    const token = match[0];

    if (token.startsWith('`')) {
      nodes.push(
        <code
          key={`i-${inlineKey++}`}
          className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('[')) {
      const m = /\[([^\]]+)\]\(([^)]+)\)/.exec(token);
      if (m) {
        const href = safeMarkdownUrl(m[2]);
        nodes.push(
          href ? (
            <a
              key={`i-${inlineKey++}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
            >
              {m[1]}
            </a>
          ) : (
            m[1]
          ),
        );
      }
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(
        <strong key={`i-${inlineKey++}`} className="font-semibold text-foreground">
          {renderInline(token.slice(2, -2))}
        </strong>,
      );
    } else if (token.startsWith('~~')) {
      nodes.push(
        <del key={`i-${inlineKey++}`} className="text-muted-foreground">
          {token.slice(2, -2)}
        </del>,
      );
    } else {
      // single * or _ -> italic
      nodes.push(
        <em key={`i-${inlineKey++}`} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }

    remaining = remaining.slice(idx + token.length);
  }
  return nodes;
}

/* ------------------------------------------------------------------ *
 * Syntax highlighting (lightweight, regex-based, multi-language).
 * Renders on a dark code surface for a premium, consistent look.
 * ------------------------------------------------------------------ */

const KEYWORDS = new Set([
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'break',
  'continue',
  'new',
  'class',
  'extends',
  'super',
  'this',
  'import',
  'export',
  'from',
  'default',
  'async',
  'await',
  'try',
  'catch',
  'finally',
  'throw',
  'typeof',
  'instanceof',
  'in',
  'of',
  'void',
  'delete',
  'yield',
  'static',
  'public',
  'private',
  'protected',
  'interface',
  'type',
  'enum',
  'implements',
  'def',
  'lambda',
  'pass',
  'elif',
  'None',
  'True',
  'False',
  'and',
  'or',
  'not',
  'with',
  'as',
  'select',
  'from',
  'where',
  'join',
  'inner',
  'left',
  'right',
  'outer',
  'on',
  'group',
  'by',
  'order',
  'having',
  'limit',
  'insert',
  'update',
  'delete',
  'create',
  'table',
  'index',
  'as',
  'and',
  'or',
  'desc',
  'asc',
  'distinct',
  'count',
  'sum',
  'avg',
  'rank',
  'over',
  'partition',
  'using',
  'set',
  'into',
  'values',
]);

interface Tok {
  text: string;
  cls: string;
}

const TOKEN_CLASS: Record<string, string> = {
  comment: 'text-zinc-500 italic',
  string: 'text-emerald-300',
  number: 'text-amber-300',
  keyword: 'text-violet-300',
  func: 'text-sky-300',
  plain: 'text-zinc-100',
};

function highlightLine(line: string): React.ReactNode[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = line.length;

  const isWord = (c: string) => /[A-Za-z0-9_$]/.test(c);

  while (i < n) {
    const rest = line.slice(i);

    // line comments: // or # or --
    const cm = /^(\/\/.*|#.*|--.*)/.exec(rest);
    if (cm) {
      toks.push({ text: cm[0], cls: 'comment' });
      i += cm[0].length;
      continue;
    }

    // strings: ' " `
    const ch = line[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < n && line[j] !== ch) {
        if (line[j] === '\\') j += 2;
        else j += 1;
      }
      toks.push({ text: line.slice(i, Math.min(j + 1, n)), cls: 'string' });
      i = j + 1;
      continue;
    }

    // numbers
    const num = /^(0x[0-9a-fA-F]+|\d+\.?\d*)/.exec(rest);
    if (num && (i === 0 || !isWord(line[i - 1]))) {
      toks.push({ text: num[0], cls: 'number' });
      i += num[0].length;
      continue;
    }

    // words (keywords / functions / plain)
    if (isWord(ch)) {
      let j = i;
      while (j < n && isWord(line[j])) j += 1;
      const word = line.slice(i, j);
      const lower = word.toLowerCase();
      let cls = 'plain';
      if (KEYWORDS.has(word) || KEYWORDS.has(lower)) cls = 'keyword';
      else if (line[j] === '(') cls = 'func';
      toks.push({ text: word, cls });
      i = j;
      continue;
    }

    // single char (punctuation/space)
    toks.push({ text: ch, cls: 'plain' });
    i += 1;
  }

  // merge consecutive plain tokens for fewer spans
  const merged: Tok[] = [];
  for (const t of toks) {
    const last = merged[merged.length - 1];
    if (last && last.cls === t.cls) last.text += t.text;
    else merged.push({ ...t });
  }

  return merged.map((t, k) => (
    <span key={k} className={TOKEN_CLASS[t.cls] ?? TOKEN_CLASS.plain}>
      {t.text}
    </span>
  ));
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = React.useState(false);
  const lines = code.replace(/\n$/, '').split('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="group/code my-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 text-sm shadow-lg shadow-zinc-950/10">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-3 py-2">
        <span className="font-mono text-xs text-zinc-400">{lang || 'code'}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="cf-scroll overflow-x-auto p-4 leading-relaxed">
        <code className="font-mono text-[0.85rem]">
          {lines.map((line, idx) => (
            <div key={idx} className="min-h-[1.25em]">
              {highlightLine(line)}
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Block-level parsing.
 * ------------------------------------------------------------------ */

interface Block {
  type: 'code' | 'heading' | 'quote' | 'ul' | 'ol' | 'table' | 'hr' | 'p';
  // payload varies by type
  content?: string;
  lang?: string;
  level?: number;
  items?: string[];
  rows?: string[][];
}

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    const fence = /^```(\w*)\s*$/.exec(line.trim());
    if (fence) {
      const lang = fence[1] ?? '';
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence
      blocks.push({ type: 'code', content: buf.join('\n'), lang });
      continue;
    }

    // blank line
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, content: heading[2] });
      i += 1;
      continue;
    }

    // horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    // table (header row + separator row of --- )
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) &&
      lines[i + 1].includes('-')
    ) {
      const rows: string[][] = [];
      // header
      rows.push(splitTableRow(line));
      i += 2; // skip header + separator
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: 'table', rows });
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'quote', content: buf.join('\n') });
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // paragraph (gather until blank / block boundary)
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^```/.test(lines[i].trim()) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'p', content: buf.join('\n') });
  }

  return blocks;
}

function splitTableRow(row: string): string[] {
  return row
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());
}

const HEADING_CLASS: Record<number, string> = {
  1: 'text-xl font-semibold mt-6 mb-2.5 first:mt-0',
  2: 'text-lg font-semibold mt-5 mb-2 first:mt-0',
  3: 'text-base font-semibold mt-4 mb-1.5 first:mt-0',
  4: 'text-sm font-semibold mt-3 mb-1 first:mt-0',
  5: 'text-sm font-semibold mt-3 mb-1 first:mt-0',
  6: 'text-sm font-semibold mt-3 mb-1 first:mt-0',
};

function renderBlock(block: Block, key: number): React.ReactNode {
  switch (block.type) {
    case 'code':
      return <CodeBlock key={key} code={block.content ?? ''} lang={block.lang ?? ''} />;

    case 'heading': {
      const Tag = `h${block.level ?? 2}` as keyof React.JSX.IntrinsicElements;
      return (
        <Tag
          key={key}
          className={cn('tracking-tight text-foreground', HEADING_CLASS[block.level ?? 2])}
        >
          {renderInline(block.content ?? '')}
        </Tag>
      );
    }

    case 'hr':
      return <hr key={key} className="my-5 border-border" />;

    case 'quote':
      return (
        <blockquote
          key={key}
          className="my-4 rounded-r-lg border-l-2 border-primary/40 bg-muted/45 py-2 pl-4 pr-3 text-muted-foreground"
        >
          {(block.content ?? '').split('\n').map((l, idx) => (
            <p key={idx} className="leading-relaxed">
              {renderInline(l)}
            </p>
          ))}
        </blockquote>
      );

    case 'ul':
      return (
        <ul key={key} className="my-3 ml-1 space-y-1.5">
          {(block.items ?? []).map((it, idx) => (
            <li key={idx} className="flex gap-2 leading-relaxed">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
              <span>{renderInline(it)}</span>
            </li>
          ))}
        </ul>
      );

    case 'ol':
      return (
        <ol key={key} className="my-3 ml-1 space-y-1.5">
          {(block.items ?? []).map((it, idx) => (
            <li key={idx} className="flex gap-2.5 leading-relaxed">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {idx + 1}
              </span>
              <span className="pt-0.5">{renderInline(it)}</span>
            </li>
          ))}
        </ol>
      );

    case 'table': {
      const rows = block.rows ?? [];
      const [header, ...body] = rows;
      return (
        <div key={key} className="cf-scroll my-4 overflow-x-auto rounded-xl border">
          <table className="w-full border-collapse text-sm">
            {header && (
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  {header.map((cell, idx) => (
                    <th key={idx} className="px-3 py-2.5 text-left font-semibold text-foreground">
                      {renderInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {body.map((row, ridx) => (
                <tr key={ridx} className="border-b border-border/60 last:border-0">
                  {row.map((cell, cidx) => (
                    <td key={cidx} className="px-3 py-2.5 align-top text-muted-foreground">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case 'p':
    default:
      return (
        <p key={key} className="my-2.5 leading-7 first:mt-0 last:mb-0">
          {(block.content ?? '').split('\n').map((l, idx, arr) => (
            <React.Fragment key={idx}>
              {renderInline(l)}
              {idx < arr.length - 1 && <br />}
            </React.Fragment>
          ))}
        </p>
      );
  }
}

export const Markdown = React.memo(function Markdown({ content }: { content: string }) {
  const blocks = React.useMemo(() => parseBlocks(content), [content]);
  return (
    <div className="text-sm text-foreground/90">{blocks.map((b, i) => renderBlock(b, i))}</div>
  );
});
