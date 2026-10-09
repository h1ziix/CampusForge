'use client';

import { PanelLeft, SquarePen } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Attachment, Conversation, ModelId } from '@/lib/assistant/types';
import { ModelSelector } from './model-selector';
import { WelcomeScreen } from './welcome-screen';
import { MessageList } from './message-list';
import { ChatInput } from './chat-input';

interface ChatViewProps {
  documentsHref: string;
  conversation: Conversation | null;
  model: ModelId;
  user: { name?: string | null; email?: string | null };
  isTyping: boolean;
  isStreaming: boolean;
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
  onRegenerate: () => void;
  onEdit: (id: string, content: string) => void;
  onFeedback: (id: string, value: 'like' | 'dislike') => void;
  onModelChange: (model: ModelId) => void;
  onOpenSidebar: () => void;
  onNewChat: () => void;
}

export function ChatView({
  documentsHref,
  conversation,
  model,
  user,
  isTyping,
  isStreaming,
  onSend,
  onStop,
  onRegenerate,
  onEdit,
  onFeedback,
  onModelChange,
  onOpenSidebar,
  onNewChat,
}: ChatViewProps) {
  const hasMessages = !!conversation && conversation.messages.length > 0;
  const busy = isTyping || isStreaming;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenSidebar}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground lg:hidden"
            aria-label="Open chats"
          >
            <PanelLeft className="h-5 w-5" />
          </button>
          <ModelSelector value={model} onChange={onModelChange} />
        </div>

        <button
          onClick={onNewChat}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-95"
          aria-label="New chat"
          title="New chat"
        >
          <SquarePen className="h-[18px] w-[18px]" />
        </button>
      </header>

      <section
        aria-label="Assistant demo limitations"
        className="shrink-0 border-b bg-muted/40 px-4 py-3 sm:px-6"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Assistant demo</p>
              <Badge variant="outline">Local mock</Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Scripted replies run in your browser. Selected models are not called. Attachment
              contents and workspace materials are not analyzed here.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild className="shrink-0 self-start">
            <Link href={documentsHref}>Open Documents</Link>
          </Button>
        </div>
      </section>

      {/* Body */}
      {hasMessages ? (
        <MessageList
          messages={conversation!.messages}
          isTyping={isTyping}
          model={model}
          userName={user.name}
          onRegenerate={onRegenerate}
          onEdit={onEdit}
          onFeedback={onFeedback}
        />
      ) : (
        <WelcomeScreen model={model} userName={user.name} onPick={(p) => onSend(p, [])} />
      )}

      {/* Input */}
      <ChatInput onSend={onSend} onStop={onStop} busy={busy} />
    </div>
  );
}
