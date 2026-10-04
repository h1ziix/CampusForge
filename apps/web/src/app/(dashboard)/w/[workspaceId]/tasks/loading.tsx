import { TaskListSkeleton } from '@/components/task/task-list';

/**
 * Loading state for the tasks page.
 * Next.js automatically wraps the page in a Suspense boundary using this file.
 * Shows skeleton UI while server component data is fetched.
 */
export default function TasksLoading() {
  return (
    <div className="space-y-6">
      <TaskListSkeleton />
    </div>
  );
}
