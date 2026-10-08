/**
 * @campusforge/ai — Document summary prompt.
 *
 * Modular prompt definition for generating structured document summaries.
 * The system prompt defines the AI's role and output schema.
 * The user prompt builder formats the immutable input; token admission rejects oversized input.
 *
 * Output schema (enforced via JSON mode + validation):
 * {
 *   title: string        — A concise descriptive title for the document
 *   tldr: string         — 1-2 sentence executive summary
 *   sections: [          — 1-6 substantive thematic sections
 *     { heading, content }
 *   ]
 *   keyTerms: string[]   — Important terms, concepts, or definitions
 * }
 */

import type { DocumentSummary, SummarySection } from '../types';
import { boundOutput, outputArray, outputObject, outputString } from '../validation';

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
- "sections" must have 1-6 substantive entries. Aim for 3-6 when the source supports them; never invent filler. Do not mirror the document's own headings literally; synthesize thematic sections.
- "keyTerms" must list 1-10 important terms, concepts, or definitions. Aim for 3-10 when supported by the source.
- Write in clear, student-friendly language.
- Do not invent information not present in the document.
- Always respond with valid JSON matching the schema above. No extra keys.`;

// ─── User Prompt Builder ────────────────────────────────────

/**
 * Build the user message for the summary prompt.
 * Preserve the complete versioned input. The caller enforces the finite token ceiling.
 */
export function buildSummaryUserPrompt(text: string, filename?: string): string {
  const filenameHint = filename ? `Document filename: ${filename}\n\n` : '';
  return `${filenameHint}--- DOCUMENT TEXT ---\n${text}`;
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
  boundOutput(raw);
  const obj = outputObject(raw, ['title', 'tldr', 'sections', 'keyTerms'], 'Summary');
  const sections: SummarySection[] = outputArray(obj.sections, 1, 6, 'Summary sections').map(
    (section, i) => {
      const sec = outputObject(section, ['heading', 'content'], `Section ${i}`);
      return {
        heading: outputString(sec.heading, 240, `Section ${i} heading`),
        content: outputString(sec.content, 8000, `Section ${i} content`),
      };
    },
  );
  return {
    title: outputString(obj.title, 240, 'Summary title'),
    tldr: outputString(obj.tldr, 2000, 'Summary tldr'),
    sections,
    keyTerms: outputArray(obj.keyTerms, 1, 10, 'Summary keyTerms').map((term, i) =>
      outputString(term, 120, `Summary keyTerms ${i}`),
    ),
  };
}
