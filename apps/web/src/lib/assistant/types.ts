/**
 * Type definitions for the CampusForge AI Assistant (frontend demo).
 *
 * Everything here is client-side only. There is no backend AI — responses are
 * produced by the local mock engine in `engine.ts`. These types describe the
 * conversation/message data that lives in React state and localStorage.
 */

export type Role = 'user' | 'assistant';

export type ModelId =
  'gpt-4.1' | 'claude-4-sonnet' | 'gemini-2.5-pro' | 'deepseek' | 'mistral-large';

export type Feedback = 'like' | 'dislike' | null;

export type ResponseLength = 'concise' | 'balanced' | 'detailed';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface Attachment {
  id: string;
  name: string;
  /** Lowercased extension without the dot, e.g. "pdf", "png". */
  ext: string;
  /** Human-readable size, e.g. "1.2 MB". */
  size: string;
  /** "image" | "document" — drives preview rendering. */
  kind: 'image' | 'document';
  /** Object URL for image previews (browser-only, not persisted across reloads). */
  previewUrl?: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  /** Which model produced an assistant message (badges/avatars use this). */
  model?: ModelId;
  createdAt: number;
  /** 'streaming' while the answer is being typed out, otherwise undefined. */
  status?: 'streaming';
  feedback?: Feedback;
  attachments?: Attachment[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  model: ModelId;
  createdAt: number;
  updatedAt: number;
  /** Pinned conversations surface in their own group at the top of history. */
  pinned?: boolean;
  /** Marks the seeded demo threads so we can show a subtle label. */
  seeded?: boolean;
}

export interface AssistantSettings {
  theme: ThemePreference;
  language: string;
  model: ModelId;
  /** 0–1, affects how "creative" the mock flourishes are. */
  temperature: number;
  responseLength: ResponseLength;
  systemPrompt: string;
  /** Remember context across chats (cosmetic in this build). */
  memory: boolean;
  /** Desktop/push notifications (cosmetic in this build). */
  notifications: boolean;
  /** Persist conversations to local storage. */
  autoSave: boolean;
}

export interface AssistantState {
  conversations: Conversation[];
  activeId: string | null;
  settings: AssistantSettings;
}
