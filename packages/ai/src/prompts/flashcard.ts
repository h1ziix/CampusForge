/**
 * @campusforge/ai — Flashcard generation prompt.
 *
 * Modular prompt definition for generating structured flashcard sets.
 * The system prompt defines the AI's role and output schema.
 * The user prompt builder formats immutable input; token admission rejects oversized input.
 * Supports generation from either raw document text or an existing summary.
 *
 * Output schema (enforced via JSON mode + validation):
 * {
 *   title: string              — A concise title for the flashcard set
 *   cards: [                   — 1-30 substantive flashcards
 *     { front: string, back: string }
 *   ]
 * }
 */

import type { Flashcard, FlashcardSetOutput } from '../types';
import { boundOutput, outputArray, outputObject, outputString } from '../validation';

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
- Generate 1-30 substantive flashcards. Aim for 10-30 when the document's density supports them; never invent filler to reach a count.
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

/**
 * Build the user message for the flashcard prompt from raw document text.
 * Preserve complete versioned input. The caller enforces the finite token ceiling.
 */
export function buildFlashcardUserPrompt(text: string, filename?: string): string {
  const filenameHint = filename ? `Document filename: ${filename}\n\n` : '';
  return `${filenameHint}--- DOCUMENT TEXT ---\n${text}`;
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
  boundOutput(raw);
  const obj = outputObject(raw, ['title', 'cards'], 'Flashcard output');
  const cards: Flashcard[] = outputArray(obj.cards, 1, 30, 'Flashcard cards').map((value, i) => {
    const card = outputObject(value, ['front', 'back'], `Card ${i}`);
    return {
      front: outputString(card.front, 2000, `Card ${i} front`),
      back: outputString(card.back, 4000, `Card ${i} back`),
    };
  });
  return {
    title: outputString(obj.title, 240, 'Flashcard title'),
    cards,
  };
}
