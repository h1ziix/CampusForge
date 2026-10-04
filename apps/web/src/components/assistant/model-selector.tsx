'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MODEL_LIST, getModel } from '@/lib/assistant/models';
import type { ModelId } from '@/lib/assistant/types';
import { cn } from '@/lib/utils';

interface ModelSelectorProps {
  value: ModelId;
  onChange: (model: ModelId) => void;
}

/**
 * Fake model picker shown in the chat header. Switching models is purely
 * cosmetic - it changes the avatar icon/color and a light response flavor.
 */
export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const current = getModel(value);
  const CurrentIcon = current.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 rounded-lg px-2.5 font-semibold">
          <span
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-md ring-1 ring-inset ring-black/5 dark:ring-white/10',
              current.tint,
            )}
          >
            <CurrentIcon className={cn('h-4 w-4', current.color)} />
          </span>
          <span className="hidden sm:inline">{current.name}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="cf-pop w-72 rounded-xl p-1.5">
        <DropdownMenuLabel className="px-2 py-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          Choose a model
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {MODEL_LIST.map((m) => {
          const Icon = m.icon;
          const active = m.id === value;
          return (
            <DropdownMenuItem
              key={m.id}
              onClick={() => onChange(m.id)}
              className="flex items-start gap-3 rounded-lg py-2.5"
            >
              <span
                className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-black/5 dark:ring-white/10',
                  m.tint,
                )}
              >
                <Icon className={cn('h-4 w-4', m.color)} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{m.name}</span>
                  {active && <Check className="h-3.5 w-3.5 text-primary" />}
                </div>
                <span className="truncate text-xs leading-5 text-muted-foreground">
                  {m.tagline}
                </span>
                <span className="mt-0.5 text-[11px] text-muted-foreground/70">
                  {m.vendor} / {m.context}
                </span>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
