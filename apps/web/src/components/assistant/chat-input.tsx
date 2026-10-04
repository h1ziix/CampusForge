'use client';

import * as React from 'react';
import { ArrowUp, Paperclip, Square, X, FileText, FileImage } from 'lucide-react';
import type { Attachment } from '@/lib/assistant/types';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
  busy: boolean;
  /** Imperatively set the input text (used by suggested prompts / edit). */
  initialText?: string;
}

interface PendingAttachment extends Attachment {
  analyzing: boolean;
  progress: number;
}

const ACCEPT = '.pdf,.docx,.txt,.png,.jpg,.jpeg';
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let attCounter = 0;

export function ChatInput({ onSend, onStop, busy, initialText }: ChatInputProps) {
  const [text, setText] = React.useState(initialText ?? '');
  const [previousInitialText, setPreviousInitialText] = React.useState(initialText);
  const [attachments, setAttachments] = React.useState<PendingAttachment[]>([]);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const timers = React.useRef<number[]>([]);
  const previewUrls = React.useRef(new Set<string>());

  // Prop changes replace the draft before its next render; effects only handle focus.
  if (initialText !== previousInitialText) {
    setPreviousInitialText(initialText);
    if (initialText !== undefined) setText(initialText);
  }

  React.useEffect(() => {
    if (initialText !== undefined) {
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    }
  }, [initialText]);

  // Auto-grow the textarea.
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  React.useEffect(() => {
    const activeTimers = timers.current;
    const activePreviews = previewUrls.current;
    return () => {
      activeTimers.forEach((t) => window.clearInterval(t));
      activePreviews.forEach((url) => URL.revokeObjectURL(url));
      activePreviews.clear();
    };
  }, []);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const ext = (file.name.split('.').pop() ?? '').toLowerCase();
      const kind = IMAGE_EXT.has(ext) ? 'image' : 'document';
      const att: PendingAttachment = {
        id: `att-${++attCounter}-${Date.now()}`,
        name: file.name,
        ext,
        size: formatSize(file.size),
        kind,
        previewUrl: kind === 'image' ? URL.createObjectURL(file) : undefined,
        analyzing: true,
        progress: 0,
      };
      if (att.previewUrl) previewUrls.current.add(att.previewUrl);
      setAttachments((prev) => [...prev, att]);

      // Fake "Analyzing document..." progress over ~1.5s.
      const start = Date.now();
      const duration = 1500;
      const timer = window.setInterval(() => {
        const elapsed = Date.now() - start;
        const pct = Math.min(100, Math.round((elapsed / duration) * 100));
        setAttachments((prev) =>
          prev.map((a) => (a.id === att.id ? { ...a, progress: pct, analyzing: pct < 100 } : a)),
        );
        if (pct >= 100) window.clearInterval(timer);
      }, 80);
      timers.current.push(timer);
    });
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
        previewUrls.current.delete(target.previewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  };

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !busy;

  const submit = () => {
    if (!canSend) return;
    const clean: Attachment[] = attachments.map(({ analyzing: _a, progress: _p, ...rest }) => rest);
    onSend(text.trim(), clean);
    setText('');
    setAttachments([]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const stillAnalyzing = attachments.some((a) => a.analyzing);

  return (
    <div className="px-4 pb-4 pt-2 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-2xl border bg-card/95 shadow-lg shadow-slate-950/[0.04] transition-all duration-200 focus-within:border-primary/30 focus-within:shadow-xl focus-within:shadow-slate-950/[0.06] focus-within:ring-1 focus-within:ring-ring/30 dark:bg-card">
          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b px-3 py-3">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="relative flex w-56 items-center gap-2.5 rounded-xl border bg-background/80 px-3 py-2.5 shadow-sm"
                >
                  {att.kind === 'image' && att.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={att.previewUrl}
                      alt={att.name}
                      className="h-9 w-9 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/10">
                      {att.kind === 'image' ? (
                        <FileImage className="h-4 w-4" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{att.name}</p>
                    {att.analyzing ? (
                      <>
                        <p className="text-[11px] text-muted-foreground">Analyzing document...</p>
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-150"
                            style={{ width: `${att.progress}%` }}
                          />
                        </div>
                      </>
                    ) : (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                        Ready / {att.ext.toUpperCase()} / {att.size}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => removeAttachment(att.id)}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm transition-all duration-200 hover:scale-105 hover:text-foreground"
                    aria-label="Remove attachment"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input row */}
          <div className="flex items-end gap-2 p-2.5">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-95"
              aria-label="Attach file"
              title="Attach PDF, DOCX, TXT, PNG, or JPG"
            >
              <Paperclip className="h-[18px] w-[18px]" />
            </button>

            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Message CampusForge AI..."
              className="cf-scroll max-h-[200px] flex-1 resize-none bg-transparent py-2.5 text-sm leading-6 outline-none placeholder:text-muted-foreground/80"
            />

            {busy ? (
              <button
                onClick={onStop}
                className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background shadow-sm transition-all duration-200 hover:scale-105 hover:shadow-md active:scale-95"
                aria-label="Stop generating"
                title="Stop generating"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!canSend || stillAnalyzing}
                className={cn(
                  'mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all duration-200',
                  canSend && !stillAnalyzing
                    ? 'bg-primary text-primary-foreground shadow-sm hover:scale-105 hover:bg-primary/90 hover:shadow-md active:scale-95'
                    : 'cursor-not-allowed bg-muted text-muted-foreground',
                )}
                aria-label="Send message"
              >
                <ArrowUp className="h-[18px] w-[18px]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
