import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { requireWorkspaceMember } from '@/server/services/auth-helpers';
import { AssistantApp } from '@/components/assistant/assistant-app';

export const metadata: Metadata = {
  title: 'AI Assistant',
};

/**
 * CampusForge AI Assistant — workspace-scoped.
 *
 * Server component: validates auth + workspace membership, then hands off to
 * the fully client-side assistant. The assistant runs entirely in the browser
 * (mock engine + localStorage) — no external AI APIs are called.
 */
export default async function AssistantPage({
  params: paramsPromise,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const params = await paramsPromise;
  const session = await auth();
  if (typeof session?.user?.id !== 'string' || !session.user.id) notFound();

  await requireWorkspaceMember(session.user.id, params.workspaceId);

  return (
    <AssistantApp
      identity={{ userId: session.user.id, workspaceId: params.workspaceId }}
      user={{ name: session.user.name, email: session.user.email }}
    />
  );
}
