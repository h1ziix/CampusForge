'use client';

import { MessageSquare, CalendarDays } from 'lucide-react';
import { getModel } from '@/lib/assistant/models';
import type { ModelId } from '@/lib/assistant/types';
import { cn } from '@/lib/utils';

const DEMO_PROMPTS = [
  {
    icon: MessageSquare,
    title: 'Try a greeting',
    subtitle: 'See how a scripted reply appears',
    prompt: 'Hello',
  },
  {
    icon: CalendarDays,
    title: 'Show a study plan example',
    subtitle: 'A generic sample, without your material',
    prompt: 'Show a study plan example',
  },
];

interface WelcomeScreenProps {
  model: ModelId;
  userName?: string | null;
  onPick: (prompt: string) => void;
}

/**
 * Empty-state hero shown when a conversation has no messages.
 * Greets the user and offers tappable suggested prompts.
 */
export function WelcomeScreen({ model, userName, onPick }: WelcomeScreenProps) {
  const def = getModel(model);
  const Icon = def.icon;
  const firstName = userName?.split(' ')[0];

  return (
    <div className="cf-scroll min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-6 sm:px-6 sm:py-10">
        <div
          className={cn(
            'mb-5 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ring-1 ring-white/20',
            def.gradient,
          )}
        >
          <Icon className="h-6 w-6" />
        </div>

        <h1 className="text-balance text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          Explore the demo{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="mt-4 max-w-xl text-pretty text-center text-sm leading-6 text-muted-foreground sm:text-base">
          Try the chat interface with local sample replies. Upload supported notes in Documents; its
          summary and card previews also use sample content until content-based generation is
          connected.
        </p>

        <div className="mt-6 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          {DEMO_PROMPTS.map((prompt) => {
            const PromptIcon = prompt.icon;
            return (
              <button
                key={prompt.title}
                onClick={() => onPick(prompt.prompt)}
                className="group flex items-start gap-3 rounded-xl border bg-card/90 p-4 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-inset ring-border transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                  <PromptIcon className="h-[18px] w-[18px]" />
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold leading-tight tracking-tight">
                    {prompt.title}
                  </span>
                  <span className="mt-1 text-xs leading-5 text-muted-foreground">
                    {prompt.subtitle}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
