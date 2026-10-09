'use client';

import * as React from 'react';
import { ArrowDown } from 'lucide-react';
import type { Message, ModelId } from '@/lib/assistant/types';
import { MessageBubble } from './message-bubble';
import { TypingIndicator } from './typing-indicator';

interface MessageListProps {
  messages: Message[];
  isTyping: boolean;
  model: ModelId;
  userName?: string | null;
  onRegenerate: () => void;
  onEdit: (id: string, content: string) => void;
  onFeedback: (id: string, value: 'like' | 'dislike') => void;
}

/**
 * Scrollable transcript. Auto-scrolls to the bottom as content streams in,
 * but backs off if the user has scrolled up to read history.
 */
export function MessageList({
  messages,
  isTyping,
  model,
  userName,
  onRegenerate,
  onEdit,
  onFeedback,
}: MessageListProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = React.useState(true);

  const checkAtBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(distance < 120);
  }, []);

  // Auto-scroll on new content while the user is pinned to the bottom.
  React.useEffect(() => {
    if (atBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  }, [messages, isTyping, atBottom]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    setAtBottom(true);
  };

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div ref={scrollRef} onScroll={checkAtBottom} className="cf-scroll h-full overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-7 sm:px-6">
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              userName={userName}
              onRegenerate={onRegenerate}
              onEdit={onEdit}
              onFeedback={onFeedback}
            />
          ))}
          {isTyping && <TypingIndicator model={model} />}
          <div ref={bottomRef} className="h-px" />
        </div>
      </div>

      {/* Jump-to-latest button */}
      {!atBottom && (
        <button
          onClick={scrollToBottom}
          className="animate-fade-in-up absolute bottom-4 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border bg-card text-foreground shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:scale-105"
          aria-label="Scroll to latest"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
