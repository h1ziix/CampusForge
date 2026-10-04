import { cn } from '@/lib/utils';
import { TASK_STATUS_LABELS } from '@campusforge/shared';

const statusColors: Record<string, string> = {
  TODO: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700',
  IN_PROGRESS:
    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/35 dark:text-blue-300 dark:border-blue-800/60',
  DONE: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/35 dark:text-green-300 dark:border-green-800/60',
  CANCELLED:
    'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800/60 dark:text-gray-400 dark:border-gray-700',
};

interface TaskStatusBadgeProps {
  status: string;
  className?: string;
}

/**
 * Colored status badge for CampusForge tasks.
 */
export function TaskStatusBadge({ status, className }: TaskStatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium leading-none shadow-sm',
        statusColors[status] ?? statusColors.TODO,
        className,
      )}
    >
      {TASK_STATUS_LABELS[status] ?? status}
    </span>
  );
}
