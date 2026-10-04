import type { Metadata } from 'next';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getWorkspaceForUser } from '@/server/queries/workspace';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TaskPriorityBadge } from '@/components/task/task-priority-badge';
import { WORKSPACE_TYPE_LABELS } from '@campusforge/shared';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Bot,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  FileCheck2,
  FileText,
  Files,
  Layers3,
  NotebookTabs,
  Sparkles,
  UploadCloud,
  Users,
  Zap,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Dashboard',
};

const dashboardStats = [
  {
    label: 'Total Tasks',
    value: 28,
    helper: 'Across active projects',
    icon: CheckCircle2,
    tone: 'text-slate-600 bg-slate-100 dark:bg-slate-800/70 dark:text-slate-300',
  },
  {
    label: 'To Do',
    value: 6,
    helper: 'Ready for planning',
    icon: Circle,
    tone: 'text-slate-600 bg-slate-100 dark:bg-slate-800/70 dark:text-slate-300',
  },
  {
    label: 'In Progress',
    value: 9,
    helper: 'Moving this week',
    icon: Clock,
    tone: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300',
  },
  {
    label: 'Done',
    value: 13,
    helper: 'Completed recently',
    icon: CheckCircle2,
    tone: 'text-green-600 bg-green-50 dark:bg-green-950/40 dark:text-green-300',
  },
];

const upcomingTasks = [
  {
    title: 'Finish AI Assistant polish',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    dueDate: 'Jun 28',
  },
  {
    title: 'Deploy production build',
    status: 'TODO',
    priority: 'URGENT',
    dueDate: 'Jun 29',
  },
  {
    title: 'Optimize authentication flow',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    dueDate: 'Jul 01',
  },
  {
    title: 'Review API documentation',
    status: 'TODO',
    priority: 'MEDIUM',
    dueDate: 'Jul 02',
  },
  {
    title: 'Improve mobile responsiveness',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    dueDate: 'Jul 04',
  },
  {
    title: 'Prepare product launch',
    status: 'TODO',
    priority: 'HIGH',
    dueDate: 'Jul 08',
  },
];

const recentNotes = [
  {
    title: 'AI Assistant Improvements',
    preview:
      'Streaming states, source-aware responses, and final QA notes before the showcase recording.',
    updatedAt: 'Updated today',
  },
  {
    title: 'Meeting Notes',
    preview:
      'Reviewed launch blockers, dashboard polish tasks, and the production deployment checklist.',
    updatedAt: 'Updated yesterday',
  },
  {
    title: 'Pricing Strategy',
    preview:
      'Compared solo, student, and team tiers with early customer feedback from discovery calls.',
    updatedAt: 'Updated Jun 25',
  },
  {
    title: 'Product Roadmap',
    preview:
      'Next milestones: richer document parsing, study analytics, and collaborative workspaces.',
    updatedAt: 'Updated Jun 23',
  },
  {
    title: 'Customer Feedback',
    preview:
      'Users want faster uploads, cleaner task reminders, and more visible AI-generated summaries.',
    updatedAt: 'Updated Jun 21',
  },
  {
    title: 'Weekly Planning',
    preview:
      'Focus areas for the week: mobile refinements, auth reliability, and demo account content.',
    updatedAt: 'Updated Jun 17',
  },
];

const recentDocuments = [
  {
    filename: 'API Documentation.pdf',
    size: '2.4 MB',
    uploadedAt: 'Jun 27, 2026',
    author: 'Sultan',
    iconTone: 'text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-300',
  },
  {
    filename: 'Database Schema.pdf',
    size: '1.1 MB',
    uploadedAt: 'Jun 26, 2026',
    author: 'Sultan',
    iconTone: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300',
  },
  {
    filename: 'Product Roadmap.pdf',
    size: '3.8 MB',
    uploadedAt: 'Jun 24, 2026',
    author: 'Sultan',
    iconTone: 'text-violet-600 bg-violet-50 dark:bg-violet-950/40 dark:text-violet-300',
  },
  {
    filename: 'Investor Pitch Deck.pdf',
    size: '7.6 MB',
    uploadedAt: 'Jun 21, 2026',
    author: 'Sultan',
    iconTone: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  {
    filename: 'Marketing Strategy.docx',
    size: '842 KB',
    uploadedAt: 'Jun 18, 2026',
    author: 'Sultan',
    iconTone: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950/40 dark:text-cyan-300',
  },
  {
    filename: 'UI Guidelines.pdf',
    size: '4.2 MB',
    uploadedAt: 'Jun 14, 2026',
    author: 'Sultan',
    iconTone: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300',
  },
];

const recentActivity: Array<{
  label: string;
  time: string;
  icon: LucideIcon;
  tone: string;
}> = [
  {
    label: 'Uploaded API Documentation.pdf',
    time: '12 min ago',
    icon: UploadCloud,
    tone: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300',
  },
  {
    label: 'Completed AI Assistant UI',
    time: '1 hr ago',
    icon: CheckCircle2,
    tone: 'text-green-600 bg-green-50 dark:bg-green-950/40 dark:text-green-300',
  },
  {
    label: 'Created Product Roadmap',
    time: '3 hrs ago',
    icon: NotebookTabs,
    tone: 'text-violet-600 bg-violet-50 dark:bg-violet-950/40 dark:text-violet-300',
  },
  {
    label: 'Generated SQL Query',
    time: 'Yesterday',
    icon: Sparkles,
    tone: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300',
  },
  {
    label: 'Uploaded Investor Pitch Deck',
    time: 'Jun 21',
    icon: FileCheck2,
    tone: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  {
    label: 'Created Flashcard Set',
    time: 'Jun 19',
    icon: BookOpenCheck,
    tone: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950/40 dark:text-cyan-300',
  },
];

const productivity = [
  { day: 'Mon', completed: 4 },
  { day: 'Tue', completed: 6 },
  { day: 'Wed', completed: 5 },
  { day: 'Thu', completed: 8 },
  { day: 'Fri', completed: 7 },
];

const workspaceInsights = [
  { label: 'AI Conversations', value: '143', icon: Bot },
  { label: 'Documents', value: '47', icon: Files },
  { label: 'Flashcards', value: '12', icon: Layers3 },
  { label: 'Tasks Completed', value: '287', icon: Zap },
  { label: 'Last Active', value: 'Today', icon: Clock },
];

const quickInfo = [
  { label: 'Members', value: '1', icon: Users },
  { label: 'Notes', value: '18', icon: NotebookTabs },
  { label: 'Documents', value: '47', icon: Files },
  { label: 'Workspace', value: 'Personal', icon: Layers3 },
];

/**
 * Workspace-scoped dashboard page.
 * Shows workspace stats, task breakdown, and upcoming tasks.
 */
export default async function WorkspaceDashboardPage({
  params: paramsPromise,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const params = await paramsPromise;
  const session = await auth();
  if (!session?.user?.id) notFound();

  const workspace = await getWorkspaceForUser(params.workspaceId, session.user.id);
  if (!workspace) notFound();

  const firstName = session.user.name?.split(' ')[0] || 'Sultan';
  const maxProductivity = Math.max(...productivity.map((day) => day.completed));

  return (
    <div className="space-y-6 lg:space-y-7">
      {/* Header */}
      <div className="cf-surface flex flex-col gap-5 rounded-lg p-6 sm:flex-row sm:items-center sm:justify-between lg:p-7">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">Good afternoon, {firstName}.</p>
          <h1 className="mt-1 truncate text-3xl font-semibold tracking-tight sm:text-4xl">
            Ready to build today?
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Your workspace has fresh product notes, uploaded docs, and active launch tasks waiting
            for review.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border bg-background/70 px-2.5 py-1">
              Workspace: {workspace.name}
            </span>
            <span className="rounded-full border bg-background/70 px-2.5 py-1">
              Last active today
            </span>
          </div>
        </div>
        <Badge variant="secondary" className="h-fit w-fit px-3 py-1.5">
          {WORKSPACE_TYPE_LABELS[workspace.type] ?? workspace.type}
        </Badge>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {dashboardStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="cf-hover group">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardDescription className="font-medium">{stat.label}</CardDescription>
                <span
                  className={`rounded-lg p-2.5 ring-1 ring-inset ring-black/5 dark:ring-white/10 ${stat.tone}`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-semibold tracking-tight">{stat.value}</p>
                <p className="mt-2 text-xs text-muted-foreground">{stat.helper}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Upcoming tasks */}
      <Card className="cf-surface">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Upcoming Tasks</CardTitle>
            <CardDescription>Active software work sorted by launch urgency</CardDescription>
          </div>
          <Link href={`/w/${params.workspaceId}/tasks`}>
            <Button variant="ghost" size="sm" className="gap-1">
              View All
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="space-y-2.5">
            {upcomingTasks.map((task) => (
              <div
                key={task.title}
                className="flex flex-col gap-3 rounded-lg border bg-background/70 p-3.5 transition-all duration-200 hover:border-primary/20 hover:bg-muted/30 hover:shadow-sm sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted ring-1 ring-inset ring-border/60">
                    {task.status === 'IN_PROGRESS' ? (
                      <Clock className="h-4 w-4 text-blue-600" />
                    ) : (
                      <Circle className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{task.title}</p>
                    <p className="mt-1">
                      <span className="rounded-full border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {task.status === 'IN_PROGRESS' ? 'In progress' : 'To do'}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                  <TaskPriorityBadge priority={task.priority} />
                  <span className="flex min-w-20 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    {task.dueDate}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Notes */}
      <Card className="cf-surface">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Recent Notes</CardTitle>
            <CardDescription>
              Research, planning, and product decisions captured this month
            </CardDescription>
          </div>
          <Link href={`/w/${params.workspaceId}/notes`}>
            <Button variant="ghost" size="sm" className="gap-1">
              View All
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {recentNotes.map((note) => (
              <Link
                key={note.title}
                href={`/w/${params.workspaceId}/notes`}
                className="group block rounded-lg border bg-background/70 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-muted/30 hover:shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/10 transition-colors group-hover:bg-primary/15">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold tracking-tight">{note.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {note.preview}
                    </p>
                    <p className="mt-3 text-xs font-medium text-muted-foreground">
                      {note.updatedAt}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Documents */}
      <Card className="cf-surface">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Recent Documents</CardTitle>
            <CardDescription>Uploaded product, technical, and go-to-market files</CardDescription>
          </div>
          <Link href={`/w/${params.workspaceId}/documents`}>
            <Button variant="ghost" size="sm" className="gap-1">
              View All
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border bg-background/70">
            {recentDocuments.map((doc) => (
              <Link
                key={doc.filename}
                href={`/w/${params.workspaceId}/documents`}
                className="grid gap-3 border-b p-4 transition-colors duration-200 last:border-b-0 hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_120px_140px_100px]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-black/5 dark:ring-white/10 ${doc.iconTone}`}
                  >
                    <FileText className="h-[18px] w-[18px]" />
                    <span className="absolute -bottom-1 rounded border bg-card px-1 text-[8px] font-bold uppercase leading-3 text-muted-foreground">
                      {doc.filename.split('.').pop()}
                    </span>
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{doc.filename}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Uploaded by {doc.author}</p>
                  </div>
                </div>
                <div className="flex items-center text-xs font-medium text-muted-foreground md:justify-end">
                  {doc.size}
                </div>
                <div className="flex items-center text-xs text-muted-foreground md:justify-end">
                  {doc.uploadedAt}
                </div>
                <div className="flex items-center md:justify-end">
                  <Badge
                    variant="outline"
                    className="border-green-200 bg-green-50 text-green-700 dark:border-green-800/60 dark:bg-green-950/35 dark:text-green-300"
                  >
                    Ready
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        {/* Recent Activity */}
        <Card className="cf-surface">
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <CardDescription>Latest workspace updates and AI actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative space-y-3 before:absolute before:left-[17px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-border">
              {recentActivity.map((activity) => {
                const Icon = activity.icon;
                return (
                  <div
                    key={activity.label}
                    className="relative flex items-center gap-3 rounded-lg border bg-background/80 p-3 transition-all duration-200 hover:border-primary/20 hover:bg-muted/30 hover:shadow-sm"
                  >
                    <span
                      className={`z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-4 ring-card ${activity.tone}`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{activity.label}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">{activity.time}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Productivity */}
          <Card className="cf-surface">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Tasks Completed This Week</CardTitle>
                  <CardDescription>Mon to Fri delivery rhythm</CardDescription>
                </div>
                <span className="rounded-md bg-primary/10 p-2 text-primary">
                  <BarChart3 className="h-4 w-4" />
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex h-36 items-end gap-3">
                {productivity.map((day) => (
                  <div key={day.day} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex h-24 w-full items-end rounded-lg bg-muted/60 px-1.5 pb-1.5 ring-1 ring-inset ring-border/50">
                      <div
                        className="w-full rounded-md bg-gradient-to-t from-primary to-blue-400 shadow-sm transition-all duration-200"
                        style={{ height: `${(day.completed / maxProductivity) * 100}%` }}
                        title={`${day.completed} completed`}
                      />
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground">{day.day}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Workspace Insights */}
          <Card className="cf-surface">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Workspace Insights</CardTitle>
              <CardDescription>Compact account usage snapshot</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5">
                {workspaceInsights.map((insight) => {
                  const Icon = insight.icon;
                  return (
                    <div
                      key={insight.label}
                      className="flex items-center justify-between gap-4 rounded-lg p-2 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex min-w-0 items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="truncate">{insight.label}</span>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tracking-tight">
                        {insight.value}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quick info */}
      <div className="grid gap-4 md:grid-cols-4">
        {quickInfo.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="cf-hover">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardDescription>{item.label}</CardDescription>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tracking-tight">{item.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
