'use client';

import { getModel } from '@/lib/assistant/models';
import type { ModelId } from '@/lib/assistant/types';
import { cn } from '@/lib/utils';

/**
 * Animated "assistant is thinking" indicator shown before the response streams.
 * Mirrors the model's avatar so it feels like the selected model is replying.
 */
export function TypingIndicator({ model }: { model: ModelId }) {
  const def = getModel(model);
  const Icon = def.icon;

  return (
    <div className="animate-fade-in-up flex gap-3.5">
      <div
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm ring-1 ring-white/20',
          def.gradient,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border bg-card px-4 py-3 shadow-sm">
        <span className="cf-dot h-2 w-2 rounded-full bg-muted-foreground/70" />
        <span className="cf-dot cf-dot-2 h-2 w-2 rounded-full bg-muted-foreground/70" />
        <span className="cf-dot cf-dot-3 h-2 w-2 rounded-full bg-muted-foreground/70" />
        <span className="ml-1 text-xs text-muted-foreground">{def.name} is thinking...</span>
      </div>
    </div>
  );
}
