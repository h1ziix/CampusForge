/**
 * @campusforge/ai — Shared types for AI pipeline.
 *
 * These types define the contract between prompts, the provider,
 * and the persistence layer. They are NOT generic AI types —
 * they are CampusForge domain types.
 */

// ─── Summary Output ─────────────────────────────────────────

/** A single section in a document summary. */
export interface SummarySection {
  heading: string;
  content: string;
}

/** Structured output from the summary pipeline. */
export interface DocumentSummary {
  title: string;
  tldr: string;
  sections: SummarySection[];
  keyTerms: string[];
}

// ─── Flashcard Output ───────────────────────────────────────

/** A single flashcard with a front (question/term) and back (answer/definition). */
export interface Flashcard {
  front: string;
  back: string;
}

/** Structured output from the flashcard pipeline. */
export interface FlashcardSetOutput {
  title: string;
  cards: Flashcard[];
}

// ─── AI Completion ──────────────────────────────────────────

/** Metadata returned alongside every AI completion. */
export interface CompletionMeta {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCost: number;
}

/** Result of an AI completion call. */
export interface CompletionResult<T> {
  data: T;
  meta: CompletionMeta;
}
