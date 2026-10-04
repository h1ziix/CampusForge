'use client';

import * as React from 'react';
import type {
  AssistantSettings,
  AssistantState,
  Attachment,
  Conversation,
  Message,
  ModelId,
} from '@/lib/assistant/types';
import { generateResponse, generateFileAnalysis } from '@/lib/assistant/engine';
import { loadState, saveState } from '@/lib/assistant/storage';
import { AssistantSidebar } from './assistant-sidebar';
import { ChatView } from './chat-view';
import { SettingsDialog } from './settings-dialog';
import { identityNamespace, type LocalIdentity, type SensitiveLease } from '@/lib/privacy';
import { SessionEnded, usePrivacyLease } from '@/lib/use-privacy-lease';

interface AssistantAppProps {
  user: { name?: string | null; email?: string | null };
  identity: LocalIdentity;
}

const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function titleFrom(text: string, attachments: Attachment[]): string {
  if (text.trim()) {
    const clean = text.trim().replace(/\s+/g, ' ');
    return clean.length > 42 ? `${clean.slice(0, 42)}...` : clean;
  }
  if (attachments[0]) return attachments[0].name;
  return 'New chat';
}

/** Tokenize into words + whitespace so streaming preserves formatting. */
function tokenize(text: string): string[] {
  return text.match(/\s+|\S+/g) ?? [text];
}

const MemoSidebar = React.memo(AssistantSidebar);

export function AssistantApp(props: AssistantAppProps) {
  // A new principal/workspace receives a new React subtree, including drafts,
  // attachment previews, dialogs and all response/persistence timers.
  return <AssistantPrivacySession key={identityNamespace(props.identity)} {...props} />;
}

function AssistantPrivacySession(props: AssistantAppProps) {
  const { lease, revoked } = usePrivacyLease();
  if (revoked) return <SessionEnded />;
  if (!lease) return <div className="-m-6 h-[calc(100dvh-4rem)] bg-background" aria-busy="true" />;
  return <AssistantSession {...props} lease={lease} />;
}

function AssistantSession({
  user,
  identity,
  lease,
}: AssistantAppProps & { lease: SensitiveLease }) {
  const [state, setState] = React.useState<AssistantState>(() => loadState(identity, lease));
  const [isTyping, setIsTyping] = React.useState(false);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);

  const cancelRef = React.useRef(0);
  const timersRef = React.useRef<number[]>([]);

  // Debounced persistence. When auto-save is off, only the settings persist -
  // conversations stay in memory for the session and are not written to storage.
  React.useEffect(() => {
    if (!lease.isValid()) return;
    // Disabling autosave removes previously stored conversations immediately.
    if (!state.settings.autoSave) {
      saveState(identity, state, lease);
      return;
    }
    const t = window.setTimeout(() => saveState(identity, state, lease), 400);
    return () => window.clearTimeout(t);
  }, [state, identity, lease]);

  // Apply the theme preference to the whole app.
  React.useEffect(() => {
    const root = document.documentElement;
    const apply = (dark: boolean) => root.classList.toggle('dark', dark);

    if (state.settings.theme === 'dark') {
      apply(true);
    } else if (state.settings.theme === 'light') {
      apply(false);
    } else {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      apply(mq.matches);
      const handler = (e: MediaQueryListEvent) => apply(e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [state.settings.theme]);

  // Clean up timers on unmount.
  React.useEffect(
    () => () => {
      cancelRef.current += 1;
      timersRef.current.forEach((t) => window.clearInterval(t));
      timersRef.current = [];
    },
    [],
  );

  const active = state.conversations.find((c) => c.id === state.activeId) ?? null;
  const currentModel: ModelId = active?.model ?? state.settings.model;

  /* -------------------------------------------------------------- *
   * Low-level helpers
   * -------------------------------------------------------------- */

  const updateConv = React.useCallback(
    (convId: string, updater: (msgs: Message[]) => Message[], touch = true) => {
      setState((prev) => ({
        ...prev,
        conversations: prev.conversations.map((c) =>
          c.id === convId
            ? { ...c, messages: updater(c.messages), updatedAt: touch ? Date.now() : c.updatedAt }
            : c,
        ),
      }));
    },
    [],
  );

  const clearTimers = () => {
    timersRef.current.forEach((t) => window.clearInterval(t));
    timersRef.current = [];
  };

  const streamResponse = React.useCallback(
    (convId: string, fullText: string, model: ModelId, token: number) => {
      const tokens = tokenize(fullText);
      const msgId = uid('m');

      updateConv(convId, (msgs) => [
        ...msgs,
        {
          id: msgId,
          role: 'assistant',
          content: '',
          model,
          createdAt: Date.now(),
          status: 'streaming',
        },
      ]);
      setIsTyping(false);
      setIsStreaming(true);

      let i = 0;
      const step = 2; // tokens per tick -> natural reading pace
      const interval = window.setInterval(() => {
        if (token !== cancelRef.current || !lease.isValid()) {
          window.clearInterval(interval);
          return;
        }
        i += step;
        const slice = tokens.slice(0, i).join('');
        // Don't bump updatedAt on every token - avoids needless history churn.
        if (i >= tokens.length) {
          window.clearInterval(interval);
          updateConv(
            convId,
            (msgs) =>
              msgs.map((m) =>
                m.id === msgId ? { ...m, content: fullText, status: undefined } : m,
              ),
            false,
          );
          setIsStreaming(false);
        } else {
          updateConv(
            convId,
            (msgs) => msgs.map((m) => (m.id === msgId ? { ...m, content: slice } : m)),
            false,
          );
        }
      }, 22);
      timersRef.current.push(interval);
    },
    [updateConv, lease],
  );

  /** Run the "thinking" delay, then stream a response for a user message. */
  const respondTo = React.useCallback(
    (convId: string, userMessage: Message, model: ModelId) => {
      cancelRef.current += 1;
      const token = cancelRef.current;
      setIsTyping(true);

      const ctx = {
        model,
        temperature: state.settings.temperature,
        responseLength: state.settings.responseLength,
        systemPrompt: state.settings.systemPrompt,
      };

      const delay = 1500 + Math.random() * 1000; // ~1.5-2.5s
      const t = window.setTimeout(() => {
        if (token !== cancelRef.current || !lease.isValid()) return;
        const full =
          userMessage.attachments && userMessage.attachments.length > 0
            ? generateFileAnalysis(userMessage.attachments, ctx)
            : generateResponse(userMessage.content, ctx);
        streamResponse(convId, full, model, token);
      }, delay);
      timersRef.current.push(t as unknown as number);
    },
    [state.settings, streamResponse, lease],
  );

  /* -------------------------------------------------------------- *
   * Public handlers
   * -------------------------------------------------------------- */

  const handleSend = React.useCallback(
    (text: string, attachments: Attachment[]) => {
      if (isTyping || isStreaming) return;

      const userMessage: Message = {
        id: uid('m'),
        role: 'user',
        content: text,
        createdAt: Date.now(),
        attachments: attachments.length ? attachments : undefined,
      };

      let convId = state.activeId;
      const model = active?.model ?? state.settings.model;

      if (!convId || !state.conversations.some((c) => c.id === convId)) {
        // Create a fresh conversation on first message.
        convId = uid('c');
        const conv: Conversation = {
          id: convId,
          title: titleFrom(text, attachments),
          model,
          messages: [userMessage],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setState((prev) => ({
          ...prev,
          conversations: [conv, ...prev.conversations],
          activeId: convId,
        }));
      } else {
        const id = convId;
        updateConv(id, (msgs) => [...msgs, userMessage]);
        // Give the thread a title if it's still the default.
        setState((prev) => ({
          ...prev,
          conversations: prev.conversations.map((c) =>
            c.id === id && (c.messages.length === 0 || c.title === 'New chat')
              ? { ...c, title: titleFrom(text, attachments) }
              : c,
          ),
        }));
      }

      respondTo(convId, userMessage, model);
    },
    [
      isTyping,
      isStreaming,
      state.activeId,
      state.conversations,
      state.settings.model,
      active,
      respondTo,
      updateConv,
    ],
  );

  const handleStop = React.useCallback(() => {
    cancelRef.current += 1;
    clearTimers();
    setIsTyping(false);
    setIsStreaming(false);
    if (state.activeId) {
      updateConv(state.activeId, (msgs) =>
        msgs.map((m) => (m.status === 'streaming' ? { ...m, status: undefined } : m)),
      );
    }
  }, [state.activeId, updateConv]);

  const handleRegenerate = React.useCallback(() => {
    if (!active || isTyping || isStreaming) return;
    const convId = active.id;
    const msgs = active.messages;
    // Find the last user message; drop everything after it.
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;
    const userMessage = msgs[lastUserIdx];
    updateConv(convId, (m) => m.slice(0, lastUserIdx + 1));
    respondTo(convId, userMessage, active.model);
  }, [active, isTyping, isStreaming, respondTo, updateConv]);

  const handleEdit = React.useCallback(
    (id: string, newContent: string) => {
      if (!active || isTyping || isStreaming) return;
      const convId = active.id;
      const idx = active.messages.findIndex((m) => m.id === id);
      if (idx === -1) return;
      const edited: Message = { ...active.messages[idx], content: newContent };
      updateConv(convId, (m) => [...m.slice(0, idx), edited]);
      respondTo(convId, edited, active.model);
    },
    [active, isTyping, isStreaming, respondTo, updateConv],
  );

  const handleFeedback = React.useCallback(
    (id: string, value: 'like' | 'dislike') => {
      if (!active) return;
      updateConv(active.id, (msgs) =>
        msgs.map((m) =>
          m.id === id ? { ...m, feedback: m.feedback === value ? null : value } : m,
        ),
      );
    },
    [active, updateConv],
  );

  const handleNewChat = React.useCallback(() => {
    cancelRef.current += 1;
    clearTimers();
    setIsTyping(false);
    setIsStreaming(false);
    setState((prev) => ({ ...prev, activeId: null }));
    setMobileSidebarOpen(false);
  }, []);

  const handleSelect = React.useCallback((id: string) => {
    cancelRef.current += 1;
    clearTimers();
    setIsTyping(false);
    setIsStreaming(false);
    setState((prev) => ({ ...prev, activeId: id }));
    setMobileSidebarOpen(false);
  }, []);

  const handleDelete = React.useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      conversations: prev.conversations.filter((c) => c.id !== id),
      activeId: prev.activeId === id ? null : prev.activeId,
    }));
  }, []);

  const handleRename = React.useCallback((id: string, title: string) => {
    setState((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
    }));
  }, []);

  const handlePin = React.useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)),
    }));
  }, []);

  const handleModelChange = React.useCallback(
    (model: ModelId) => {
      if (active) {
        setState((prev) => ({
          ...prev,
          conversations: prev.conversations.map((c) => (c.id === active.id ? { ...c, model } : c)),
          settings: { ...prev.settings, model },
        }));
      } else {
        setState((prev) => ({ ...prev, settings: { ...prev.settings, model } }));
      }
    },
    [active],
  );

  const handleSettingsChange = React.useCallback((patch: Partial<AssistantSettings>) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
  }, []);

  const handleExport = React.useCallback(() => {
    const blob = new Blob([JSON.stringify(state.conversations, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campusforge-chats-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state.conversations]);

  const handleClearHistory = React.useCallback(() => {
    cancelRef.current += 1;
    clearTimers();
    setIsTyping(false);
    setIsStreaming(false);
    setState((prev) => ({ ...prev, conversations: [], activeId: null }));
    setSettingsOpen(false);
  }, []);

  /* -------------------------------------------------------------- */

  return (
    <div className="-m-6 flex h-[calc(100dvh-4rem)] overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-72 shrink-0 border-r bg-muted/30 dark:bg-background/40 lg:block">
        <MemoSidebar
          conversations={state.conversations}
          activeId={state.activeId}
          user={user}
          onNewChat={handleNewChat}
          onSelect={handleSelect}
          onDelete={handleDelete}
          onRename={handleRename}
          onPin={handlePin}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </aside>

      {/* Mobile sidebar drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="animate-fade-in absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="cf-slide-in absolute left-0 top-0 h-full w-72 border-r bg-background shadow-2xl">
            <AssistantSidebar
              conversations={state.conversations}
              activeId={state.activeId}
              user={user}
              onNewChat={handleNewChat}
              onSelect={handleSelect}
              onDelete={handleDelete}
              onRename={handleRename}
              onPin={handlePin}
              onOpenSettings={() => {
                setMobileSidebarOpen(false);
                setSettingsOpen(true);
              }}
              onClose={() => setMobileSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main chat area */}
      <ChatView
        conversation={active}
        model={currentModel}
        user={user}
        isTyping={isTyping}
        isStreaming={isStreaming}
        onSend={handleSend}
        onStop={handleStop}
        onRegenerate={handleRegenerate}
        onEdit={handleEdit}
        onFeedback={handleFeedback}
        onModelChange={handleModelChange}
        onOpenSidebar={() => setMobileSidebarOpen(true)}
        onNewChat={handleNewChat}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={state.settings}
        onChange={handleSettingsChange}
        onExport={handleExport}
        onClearHistory={handleClearHistory}
      />
    </div>
  );
}
