import { DocumentDetailView } from '@/components/document/document-detail-view';
import { generationIdentity, generationSnapshot } from '@/fixture/document-generation';

export const dynamic = 'force-dynamic';

export default async function GenerationFixture({
  searchParams,
}: {
  searchParams: Promise<{ document?: string }>;
}) {
  const { document = 'botany' } = await searchParams;
  return (
    <main className="mx-auto max-w-3xl p-6">
      <p className="text-muted-foreground mb-6 text-xs">
        Isolated browser contract fixture · synthetic persistence and AI adapter
      </p>
      <DocumentDetailView
        {...generationSnapshot(document)}
        identity={generationIdentity}
        workspaceId={generationIdentity.workspaceId}
      />
    </main>
  );
}
