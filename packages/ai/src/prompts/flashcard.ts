/**
 * @campusforge/ai — Flashcard generation prompt.
 *
 * Modular prompt definition for generating structured flashcard sets.
 * The system prompt defines the AI's role and output schema.
 * The user prompt builder handles text truncation and formatting.
 * Supports generation from either raw document text or an existing summary.
 *
 * Output schema (enforced via JSON mode + validation):
 * {
 *   title: string              — A concise title for the flashcard set
 *   cards: [                   — 10-30 flashcards
 *     { front: string, back: string }
 *   ]
 * }
 */

import type { Flashcard, FlashcardSetOutput } from '../types';

// ─── System Prompt ──────────────────────────────────────────

export const FLASHCARD_SYSTEM_PROMPT = `You are a study assistant for university students. Your job is to create effective flashcards from academic documents that help students learn and retain key concepts.

Given a document's text (or a summary of a document), produce a structured JSON flashcard set with this exact schema:

{
  "title": "A concise, descriptive title for this flashcard set",
  "cards": [
    {
      "front": "Question, term, or concept prompt",
      "back": "Answer, definition, or explanation"
    }
  ]
}

Rules:
- Generate between 10 and 30 flashcards depending on the document's density.
- "title" should reflect the document's subject matter, not just the filename.
- Each "front" should be a clear, self-contained question or term that tests one concept.
- Each "back" should be a concise but complete answer (1-3 sentences).
- Cover the most important concepts, definitions, relationships, and facts.
- Vary question types: definitions, cause-effect, comparisons, applications, key facts.
- Order cards from foundational concepts to more advanced ones.
- Write in clear, student-friendly language.
- Do not invent information not present in the document.
- Always respond with valid JSON matching the schema above. No extra keys.`;

// ─── User Prompt Builder ────────────────────────────────────

/** Max characters of document text to send. ~12k tokens at ~4 chars/token. */
const MAX_TEXT_LENGTH = 48_000;

/**
 * Build the user message for the flashcard prompt from raw document text.
 * Truncates long documents with a note so the AI knows it's partial.
 */
export function buildFlashcardUserPrompt(text: string, filename?: string): string {
  let documentText = text;
  let truncationNote = '';

  if (text.length > MAX_TEXT_LENGTH) {
    documentText = text.slice(0, MAX_TEXT_LENGTH);
    truncationNote =
      '\n\n[NOTE: This document was truncated. Create flashcards only from the content provided above.]';
  }

  const filenameHint = filename ? `Document filename: ${filename}\n\n` : '';

  return `${filenameHint}--- DOCUMENT TEXT ---\n${documentText}${truncationNote}`;
}

/**
 * Build the user message for the flashcard prompt from a summary JSON.
 * Used when generating flashcards from an already-generated summary.
 */
export function buildFlashcardFromSummaryPrompt(
  summary: {
    title: string;
    tldr: string;
    sections: { heading: string; content: string }[];
    keyTerms: string[];
  },
  filename?: string,
): string {
  const filenameHint = filename ? `Document filename: ${filename}\n\n` : '';

  const sectionsText = summary.sections.map((s) => `### ${s.heading}\n${s.content}`).join('\n\n');

  const keyTermsText =
    summary.keyTerms.length > 0 ? `\n\nKey Terms: ${summary.keyTerms.join(', ')}` : '';

  return `${filenameHint}--- DOCUMENT SUMMARY ---\nTitle: ${summary.title}\n\nTL;DR: ${summary.tldr}\n\n${sectionsText}${keyTermsText}\n\nGenerate flashcards covering the key concepts, terms, and relationships described in this summary.`;
}

// ─── Output Validation ──────────────────────────────────────

/**
 * Validate and parse the raw JSON from the AI into a FlashcardSetOutput.
 * Throws with a descriptive message if the shape is wrong.
 *
 * This is intentionally NOT a Zod schema — it's a simple runtime check
 * that keeps the AI package dependency-light, consistent with the summary
 * pipeline's approach.
 */
export function parseFlashcardOutput(raw: unknown): FlashcardSetOutput {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Flashcard output is not an object');
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.title !== 'string' || obj.title.length === 0) {
    throw new Error('Flashcard output missing or empty "title"');
  }

  if (!Array.isArray(obj.cards) || obj.cards.length === 0) {
    throw new Error('Flashcard output missing or empty "cards" array');
  }

  const cards: Flashcard[] = obj.cards.map((c: unknown, i: number) => {
    if (!c || typeof c !== 'object') {
      throw new Error(`Card ${i} is not an object`);
    }
    const card = c as Record<string, unknown>;
    if (typeof card.front !== 'string' || card.front.length === 0) {
      throw new Error(`Card ${i} missing or empty "front"`);
    }
    if (typeof card.back !== 'string' || card.back.length === 0) {
      throw new Error(`Card ${i} missing or empty "back"`);
    }
    return { front: card.front, back: card.back };
  });

  return {
    title: obj.title,
    cards,
  };
}
