'use client';

import * as React from 'react';
import {
  Check,
  Copy,
  RefreshCw,
  Pencil,
  ThumbsUp,
  ThumbsDown,
  User as UserIcon,
  FileText,
  FileImage,
} from 'lucide-react';
import { getModel } from '@/lib/assistant/models';
import type { Message } from '@/lib/assistant/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Markdown } from './markdown';

interface MessageBubbleProps {
  message: Message;
  userName?: string | null;
  onRegenerate: () => void;
  onEdit: (id: string, newContent: string) => void;
  onFeedback: (id: string, value: 'like' | 'dislike') => void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ActionButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-90',
        active && 'bg-accent text-primary',
      )}
    >
      {children}
    </button>
  );
}

export function MessageBubble({
  message,
  userName,
  onRegenerate,
  onEdit,
  onFeedback,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(message.content);
  const streaming = message.status === 'streaming';

  const model = getModel(message.model ?? 'gpt-4.1');
  const ModelIcon = model.icon;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const saveEdit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== message.content) onEdit(message.id, trimmed);
    setEditing(false);
  };

  return (
    <div className={cn('animate-fade-in-up group flex gap-3.5', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm ring-1 ring-inset ring-black/5 dark:ring-white/10',
          isUser
            ? 'bg-secondary text-secondary-foreground'
            : cn('bg-gradient-to-br text-white ring-white/20', model.gradient),
        )}
      >
        {isUser ? <UserIcon className="h-4 w-4" /> : <ModelIcon className="h-4 w-4" />}
      </div>

      {/* Body */}
      <div className={cn('flex min-w-0 max-w-[min(90%,44rem)] flex-col', isUser && 'items-end')}>
        {/* Meta line */}
        <div
          className={cn(
            'mb-1.5 flex items-center gap-2 px-1 text-xs text-muted-foreground',
            isUser && 'flex-row-reverse',
          )}
        >
          <span className="font-medium text-foreground/80">
            {isUser ? userName || 'You' : model.name}
          </span>
          <span>{formatTime(message.createdAt)}</span>
        </div>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className={cn('mb-2 flex flex-wrap gap-2', isUser && 'justify-end')}>
            {message.attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm"
              >
                {att.kind === 'image' ? (
                  att.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={att.previewUrl}
                      alt={att.name}
                      className="h-9 w-9 rounded object-cover"
                    />
                  ) : (
                    <FileImage className="h-5 w-5 text-primary" />
                  )
                ) : (
                  <FileText className="h-5 w-5 text-primary" />
                )}
                <div className="flex flex-col">
                  <span className="max-w-[12rem] truncate font-medium">{att.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {att.ext.toUpperCase()} / {att.size}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        {editing ? (
          <div className="w-full rounded-2xl border bg-card p-2 shadow-sm">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(8, draft.split('\n').length + 1)}
              autoFocus
              className="w-full resize-none rounded-lg bg-transparent p-2 text-sm leading-6 outline-none"
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setDraft(message.content);
                }}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={saveEdit}>
                Save &amp; submit
              </Button>
            </div>
          </div>
        ) : isUser ? (
          <div className="whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground shadow-md">
            {message.content}
          </div>
        ) : (
          <div className="rounded-2xl rounded-tl-sm border bg-card px-4 py-3.5 shadow-sm">
            <Markdown content={message.content} />
            {streaming && <span className="cf-caret ml-0.5 inline-block align-text-bottom" />}
          </div>
        )}

        {/* Actions */}
        {!editing && !streaming && (
          <div
            className={cn(
              'mt-1.5 flex translate-y-1 items-center gap-0.5 px-1 opacity-0 transition-all duration-200 focus-within:translate-y-0 focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100',
              isUser && 'flex-row-reverse',
            )}
          >
            <ActionButton label="Copy" onClick={copy}>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </ActionButton>

            {isUser ? (
              <ActionButton
                label="Edit message"
                onClick={() => {
                  setDraft(message.content);
                  setEditing(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </ActionButton>
            ) : (
              <>
                <ActionButton label="Regenerate" onClick={onRegenerate}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </ActionButton>
                <ActionButton
                  label="Good response"
                  active={message.feedback === 'like'}
                  onClick={() => onFeedback(message.id, 'like')}
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                </ActionButton>
                <ActionButton
                  label="Bad response"
                  active={message.feedback === 'dislike'}
                  onClick={() => onFeedback(message.id, 'dislike')}
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                </ActionButton>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
