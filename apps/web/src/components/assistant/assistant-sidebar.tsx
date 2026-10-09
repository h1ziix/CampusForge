'use client';

import * as React from 'react';
import {
  Plus,
  Search,
  Settings,
  MessageSquare,
  MoreHorizontal,
  Trash2,
  Pencil,
  Pin,
  PinOff,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Conversation } from '@/lib/assistant/types';
import { getModel } from '@/lib/assistant/models';
import { cn } from '@/lib/utils';

interface AssistantSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  user: { name?: string | null; email?: string | null };
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onPin: (id: string) => void;
  onOpenSettings: () => void;
  onClose?: () => void;
}

interface HistoryGroup {
  label: string;
  items: Conversation[];
  pinned?: boolean;
}

const DAY = 24 * 60 * 60 * 1000;

function groupLabel(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < DAY) return 'Today';
  if (diff < 2 * DAY) return 'Yesterday';
  if (diff < 7 * DAY) return 'Previous 7 days';
  if (diff < 30 * DAY) return 'Previous 30 days';
  return 'Older';
}

const GROUP_ORDER = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'];

export function AssistantSidebar({
  conversations,
  activeId,
  user,
  onNewChat,
  onSelect,
  onDelete,
  onRename,
  onPin,
  onOpenSettings,
  onClose,
}: AssistantSidebarProps) {
  const [query, setQuery] = React.useState('');
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameDraft, setRenameDraft] = React.useState('');

  const filtered = React.useMemo(() => {
    const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!query.trim()) return sorted;
    const q = query.toLowerCase();
    return sorted.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q)),
    );
  }, [conversations, query]);

  const groups = React.useMemo<HistoryGroup[]>(() => {
    const pinned = filtered.filter((c) => c.pinned);
    const rest = filtered.filter((c) => !c.pinned);

    const map = new Map<string, Conversation[]>();
    for (const c of rest) {
      const label = groupLabel(c.updatedAt);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(c);
    }
    const dateGroups: HistoryGroup[] = GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
      label: g,
      items: map.get(g)!,
    }));

    return pinned.length > 0
      ? [{ label: 'Pinned', items: pinned, pinned: true }, ...dateGroups]
      : dateGroups;
  }, [filtered]);

  const commitRename = (id: string) => {
    const t = renameDraft.trim();
    if (t) onRename(id, t);
    setRenamingId(null);
  };

  const initials = (user.name || user.email || 'U')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex h-full w-full flex-col bg-muted/30 dark:bg-background/40">
      {/* Brand / header */}
      <div className="flex h-16 items-center justify-between px-3">
        <div className="flex items-center gap-2 px-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-blue-600 text-white shadow-sm ring-1 ring-white/20">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Assistant demo</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* New chat */}
      <div className="px-3">
        <Button onClick={onNewChat} className="h-10 w-full justify-start gap-2 rounded-lg">
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="h-9 w-full rounded-lg border border-input bg-background/80 pl-8 pr-3 text-sm outline-none transition-all duration-200 placeholder:text-muted-foreground/80 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
      </div>

      {/* History */}
      <nav className="cf-scroll flex-1 overflow-y-auto px-2 py-1">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border bg-background text-muted-foreground shadow-sm">
              <MessageSquare className="h-5 w-5" />
            </span>
            <p className="mt-2 text-sm text-muted-foreground">
              {query ? 'No chats match your search.' : 'No conversations yet.'}
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-2">
              <p className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                {group.pinned && <Pin className="h-3 w-3" />}
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((c) => {
                  const active = c.id === activeId;
                  const model = getModel(c.model);
                  const ModelIcon = model.icon;
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        'group/item relative flex items-center gap-2 rounded-lg px-2 py-2.5 text-sm transition-all duration-200',
                        active
                          ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                          : 'hover:bg-background/70 hover:shadow-sm',
                      )}
                    >
                      {renamingId === c.id ? (
                        <input
                          value={renameDraft}
                          autoFocus
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onBlur={() => commitRename(c.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(c.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          className="h-7 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                        />
                      ) : (
                        <button
                          onClick={() => onSelect(c.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <ModelIcon className={cn('h-3.5 w-3.5 shrink-0', model.color)} />
                          <span className="truncate font-medium">{c.title}</span>
                          {c.pinned && !group.pinned && (
                            <Pin className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/70" />
                          )}
                        </button>
                      )}

                      {renamingId !== c.id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className={cn(
                                'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground',
                                active ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100',
                              )}
                              aria-label="Chat options"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="cf-pop w-40 rounded-lg">
                            <DropdownMenuItem onClick={() => onPin(c.id)}>
                              {c.pinned ? (
                                <>
                                  <PinOff className="mr-2 h-4 w-4" />
                                  Unpin
                                </>
                              ) : (
                                <>
                                  <Pin className="mr-2 h-4 w-4" />
                                  Pin
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setRenamingId(c.id);
                                setRenameDraft(c.title);
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => onDelete(c.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </nav>

      {/* Footer: profile + settings */}
      <div className="border-t p-2">
        <div className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-background/60">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-600 text-xs font-semibold text-white shadow-sm ring-1 ring-white/20">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name || 'Student'}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email || 'CampusForge'}</p>
          </div>
          <button
            onClick={onOpenSettings}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-all duration-200 hover:rotate-45 hover:bg-accent hover:text-foreground"
            aria-label="Settings"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
