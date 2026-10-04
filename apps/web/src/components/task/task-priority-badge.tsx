import { cn } from '@/lib/utils';
import { TASK_PRIORITY_LABELS } from '@campusforge/shared';

const priorityColors: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700',
  MEDIUM:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/35 dark:text-amber-300 dark:border-amber-800/60',
  HIGH: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/35 dark:text-orange-300 dark:border-orange-800/60',
  URGENT:
    'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/35 dark:text-red-300 dark:border-red-800/60',
};

interface TaskPriorityBadgeProps {
  priority: string;
  className?: string;
}

/**
 * Colored priority badge for CampusForge tasks.
 */
export function TaskPriorityBadge({ priority, className }: TaskPriorityBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium leading-none shadow-sm',
        priorityColors[priority] ?? priorityColors.MEDIUM,
        className,
      )}
    >
      {TASK_PRIORITY_LABELS[priority] ?? priority}
    </span>
  );
}
