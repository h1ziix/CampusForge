/**
 * @campusforge/ai
 *
 * AI provider abstraction for CampusForge.
 * Wraps OpenAI SDK with structured outputs, prompt management,
 * and token/cost tracking.
 */

// Provider
export { AIProvider, getAIProvider } from './provider';
export type { AIProviderConfig } from './provider';

// Types
export type {
  DocumentSummary,
  SummarySection,
  Flashcard,
  FlashcardSetOutput,
  CompletionMeta,
  CompletionResult,
} from './types';

// Prompts
export {
  SUMMARY_SYSTEM_PROMPT,
  buildSummaryUserPrompt,
  parseSummaryOutput,
  FLASHCARD_SYSTEM_PROMPT,
  buildFlashcardUserPrompt,
  buildFlashcardFromSummaryPrompt,
  parseFlashcardOutput,
} from './prompts';
