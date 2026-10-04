/** Assistant content is scoped to a server-verified user and workspace. */
import type { AssistantState, AssistantSettings, Conversation } from './types';
import { seedConversations } from './seed';
import { identityNamespace, type LocalIdentity, type SensitiveLease } from '@/lib/privacy';

export const DEFAULT_SETTINGS: AssistantSettings = {
  theme: 'system',
  language: 'English',
  model: 'gpt-4.1',
  temperature: 0.7,
  responseLength: 'balanced',
  systemPrompt:
    'You are CampusForge AI, a helpful, concise assistant for students and academic teams.',
  memory: true,
  notifications: false,
  autoSave: true,
};

export const assistantStorageKey = (identity: LocalIdentity) =>
  `campusforge:assistant:v2:${identityNamespace(identity)}`;
export const assistantPreferencesKey = (identity: LocalIdentity) =>
  `campusforge:assistant:prefs:v2:${identityNamespace(identity)}`;

function preferences(value: unknown): Omit<AssistantSettings, 'systemPrompt'> {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const { systemPrompt: _drop, ...defaults } = DEFAULT_SETTINGS;
  return {
    theme: ['system', 'light', 'dark'].includes(String(input.theme))
      ? (input.theme as AssistantSettings['theme'])
      : defaults.theme,
    language:
      typeof input.language === 'string' && input.language.length <= 64
        ? input.language
        : defaults.language,
    model: ['gpt-4.1', 'claude-4-sonnet', 'gemini-2.5-pro', 'deepseek', 'mistral-large'].includes(
      String(input.model),
    )
      ? (input.model as AssistantSettings['model'])
      : defaults.model,
    temperature:
      typeof input.temperature === 'number' && Number.isFinite(input.temperature)
        ? Math.min(1, Math.max(0, input.temperature))
        : defaults.temperature,
    responseLength: ['concise', 'balanced', 'detailed'].includes(String(input.responseLength))
      ? (input.responseLength as AssistantSettings['responseLength'])
      : defaults.responseLength,
    memory: typeof input.memory === 'boolean' ? input.memory : defaults.memory,
    notifications:
      typeof input.notifications === 'boolean' ? input.notifications : defaults.notifications,
    autoSave: typeof input.autoSave === 'boolean' ? input.autoSave : defaults.autoSave,
  };
}

function validConversations(value: unknown): value is Conversation[] {
  return (
    Array.isArray(value) &&
    value.every(
      (conversation: Conversation) =>
        conversation &&
        typeof conversation.id === 'string' &&
        typeof conversation.title === 'string' &&
        Array.isArray(conversation.messages) &&
        conversation.messages.every(
          (message) =>
            message &&
            typeof message.id === 'string' &&
            typeof message.content === 'string' &&
            ['user', 'assistant'].includes(message.role) &&
            (message.attachments === undefined ||
              (Array.isArray(message.attachments) &&
                message.attachments.every(
                  (attachment) =>
                    attachment &&
                    typeof attachment.id === 'string' &&
                    typeof attachment.name === 'string' &&
                    typeof attachment.ext === 'string' &&
                    typeof attachment.size === 'string' &&
                    ['image', 'document'].includes(attachment.kind),
                ))),
        ),
    )
  );
}

function stripVolatile(conversations: Conversation[]): Conversation[] {
  return conversations.map((conversation) => ({
    ...conversation,
    messages: conversation.messages.map((message) => ({
      ...message,
      status: undefined,
      attachments: message.attachments?.map(({ previewUrl: _drop, ...metadata }) => metadata),
    })),
  }));
}

export function loadState(identity: LocalIdentity, lease: SensitiveLease): AssistantState {
  let settings = { ...DEFAULT_SETTINGS };
  const empty = () => ({ conversations: [], activeId: null, settings });
  if (typeof window === 'undefined' || !lease.isValid()) return empty();
  try {
    settings = {
      ...settings,
      ...preferences(
        JSON.parse(window.localStorage.getItem(assistantPreferencesKey(identity)) ?? '{}'),
      ),
    };
    if (!settings.autoSave) return empty();
    const raw = window.localStorage.getItem(assistantStorageKey(identity));
    if (raw) {
      const saved = JSON.parse(raw) as Partial<AssistantState> & { epoch?: string };
      if (saved.epoch !== lease.epoch || !validConversations(saved.conversations)) return empty();
      return {
        conversations: settings.autoSave ? stripVolatile(saved.conversations) : [],
        activeId: settings.autoSave && typeof saved.activeId === 'string' ? saved.activeId : null,
        settings: {
          ...settings,
          systemPrompt:
            typeof saved.settings?.systemPrompt === 'string'
              ? saved.settings.systemPrompt
              : DEFAULT_SETTINGS.systemPrompt,
        },
      };
    }
  } catch {
    return empty();
  }
  // The old campusforge:assistant:v1 is deliberately never read or imported.
  return { conversations: settings.autoSave ? seedConversations() : [], activeId: null, settings };
}

export function saveState(
  identity: LocalIdentity,
  state: AssistantState,
  lease: SensitiveLease,
): void {
  if (typeof window === 'undefined' || !lease.isValid()) return;
  try {
    window.localStorage.setItem(
      assistantPreferencesKey(identity),
      JSON.stringify(preferences(state.settings)),
    );
    if (!lease.isValid()) return;
    if (!state.settings.autoSave) {
      window.localStorage.removeItem(assistantStorageKey(identity));
      return;
    }
    window.localStorage.setItem(
      assistantStorageKey(identity),
      JSON.stringify({
        epoch: lease.epoch,
        conversations: stripVolatile(state.conversations),
        activeId: state.activeId,
        settings: { systemPrompt: state.settings.systemPrompt },
      }),
    );
  } catch {
    /* Quota or blocked storage does not break the offline assistant. */
  }
}
