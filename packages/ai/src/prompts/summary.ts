/**
 * @campusforge/ai — Document summary prompt.
 *
 * Modular prompt definition for generating structured document summaries.
 * The system prompt defines the AI's role and output schema.
 * The user prompt builder handles text truncation and formatting.
 *
 * Output schema (enforced via JSON mode + validation):
 * {
 *   title: string        — A concise descriptive title for the document
 *   tldr: string         — 1-2 sentence executive summary
 *   sections: [          — 3-6 thematic sections
 *     { heading, content }
 *   ]
 *   keyTerms: string[]   — Important terms, concepts, or definitions
 * }
 */

import type { DocumentSummary, SummarySection } from '../types';

// ─── System Prompt ──────────────────────────────────────────

export const SUMMARY_SYSTEM_PROMPT = `You are a study assistant for university students. Your job is to summarize academic documents clearly and accurately.

Given a document's text, produce a structured JSON summary with this exact schema:

{
  "title": "A concise, descriptive title for the document",
  "tldr": "A 1-2 sentence executive summary capturing the main point",
  "sections": [
    {
      "heading": "Section heading",
      "content": "2-4 sentence summary of this section's key ideas"
    }
  ],
  "keyTerms": ["term1", "term2", "term3"]
}

Rules:
- "title" should reflect the actual content, not just the filename.
- "tldr" must be concise: 1-2 sentences max.
- "sections" should have 3-6 entries covering the document's main themes. Do not mirror the document's own headings literally; synthesize thematic sections.
- "keyTerms" should list 3-10 important terms, concepts, or definitions from the document.
- Write in clear, student-friendly language.
- Do not invent information not present in the document.
- Always respond with valid JSON matching the schema above. No extra keys.`;

// ─── User Prompt Builder ────────────────────────────────────

/** Max characters of document text to send. ~12k tokens at ~4 chars/token. */
const MAX_TEXT_LENGTH = 48_000;

/**
 * Build the user message for the summary prompt.
 * Truncates long documents with a note so the AI knows it's partial.
 */
export function buildSummaryUserPrompt(text: string, filename?: string): string {
  let documentText = text;
  let truncationNote = '';

  if (text.length > MAX_TEXT_LENGTH) {
    documentText = text.slice(0, MAX_TEXT_LENGTH);
    truncationNote =
      '\n\n[NOTE: This document was truncated. Summarize only the content provided above.]';
  }

  const filenameHint = filename ? `Document filename: ${filename}\n\n` : '';

  return `${filenameHint}--- DOCUMENT TEXT ---\n${documentText}${truncationNote}`;
}

// ─── Output Validation ──────────────────────────────────────

/**
 * Validate and parse the raw JSON from the AI into a DocumentSummary.
 * Throws with a descriptive message if the shape is wrong.
 *
 * This is intentionally NOT a Zod schema — it's a simple runtime check
 * that keeps the AI package dependency-light. The shared package owns
 * the canonical Zod schemas if we need them at API boundaries later.
 */
export function parseSummaryOutput(raw: unknown): DocumentSummary {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Summary output is not an object');
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.title !== 'string' || obj.title.length === 0) {
    throw new Error('Summary missing or empty "title"');
  }

  if (typeof obj.tldr !== 'string' || obj.tldr.length === 0) {
    throw new Error('Summary missing or empty "tldr"');
  }

  if (!Array.isArray(obj.sections) || obj.sections.length === 0) {
    throw new Error('Summary missing or empty "sections" array');
  }

  const sections: SummarySection[] = obj.sections.map((s: unknown, i: number) => {
    if (!s || typeof s !== 'object') {
      throw new Error(`Section ${i} is not an object`);
    }
    const sec = s as Record<string, unknown>;
    if (typeof sec.heading !== 'string' || typeof sec.content !== 'string') {
      throw new Error(`Section ${i} missing "heading" or "content"`);
    }
    return { heading: sec.heading, content: sec.content };
  });

  if (!Array.isArray(obj.keyTerms)) {
    throw new Error('Summary missing "keyTerms" array');
  }

  const keyTerms: string[] = obj.keyTerms.filter(
    (t: unknown): t is string => typeof t === 'string' && t.length > 0,
  );

  return {
    title: obj.title,
    tldr: obj.tldr,
    sections,
    keyTerms,
  };
}
