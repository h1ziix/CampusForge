'use client';

import {
  FileText,
  Lightbulb,
  Code,
  Briefcase,
  PenLine,
  BarChart3,
  LayoutTemplate,
  Database,
  type LucideIcon,
} from 'lucide-react';
import { SUGGESTED_PROMPTS } from '@/lib/assistant/engine';
import { getModel } from '@/lib/assistant/models';
import type { ModelId } from '@/lib/assistant/types';
import { cn } from '@/lib/utils';

const ICONS: Record<string, LucideIcon> = {
  FileText,
  Lightbulb,
  Code,
  Briefcase,
  PenLine,
  BarChart3,
  LayoutTemplate,
  Database,
};

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
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
      <div
        className={cn(
          'cf-float mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ring-1 ring-white/20',
          def.gradient,
        )}
      >
        <Icon className="h-8 w-8" />
      </div>

      <h1 className="text-balance text-center text-3xl font-semibold tracking-tight sm:text-4xl">
        How can I help you{firstName ? `, ${firstName}` : ''} today?
      </h1>
      <p className="mt-4 max-w-xl text-pretty text-center text-sm leading-6 text-muted-foreground sm:text-base">
        Ask questions, analyze files, draft plans, write code, or turn your workspace context into
        polished output.
      </p>

      <div className="mt-10 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {SUGGESTED_PROMPTS.map((prompt, idx) => {
          const PromptIcon = ICONS[prompt.icon] ?? Lightbulb;
          return (
            <button
              key={prompt.title}
              onClick={() => onPick(prompt.title)}
              style={{ animationDelay: `${idx * 45}ms` }}
              className="animate-fade-in-up group flex min-h-24 items-start gap-3 rounded-xl border bg-card/90 p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card hover:shadow-md"
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
  );
}
