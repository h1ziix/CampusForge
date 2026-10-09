import Link from 'next/link';
import { ArrowRight, FileText, Layers3, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentStatusBadge } from '@/components/document/document-status-badge';
import { UploadDocumentButton } from '@/components/document/upload-document-button';
import type { DocumentRow } from '@/server/queries/document';
import type { FlashcardSetListRow } from '@/server/queries/flashcard';

interface StudyDashboardProps {
  workspaceId: string;
  workspaceName: string;
  documents: DocumentRow[];
  flashcardSets: FlashcardSetListRow[];
}

export function StudyDashboard({
  workspaceId,
  workspaceName,
  documents,
  flashcardSets,
}: StudyDashboardProps) {
  const base = `/w/${workspaceId}`;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <p className="break-words text-sm font-medium text-muted-foreground">{workspaceName}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Your study workspace</h1>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="max-w-xl">
            <Badge variant="secondary">Early preview</Badge>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              Start with a short set of notes
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Upload your material and check its text extraction status. Open saved flashcards below
              to practise at your own pace.
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              TXT (UTF-8) is the simplest starting point. PDF needs selectable text. Up to 10 MiB
              per file.
            </p>
          </div>
          <div className="shrink-0">
            <UploadDocumentButton workspaceId={workspaceId} />
          </div>
        </CardContent>
      </Card>
      <div className="rounded-lg border border-dashed px-4 py-3 text-sm leading-6 text-muted-foreground">
        <span className="font-medium text-foreground">Your notes → summary → Study.</span> Open a
        document to check its AI input budget and request a summary or flashcards. Results are saved
        in your workspace. Verify generated answers against your source.
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-lg">Recent documents</CardTitle>
            <Link
              href={`${base}/documents`}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              All documents
            </Link>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <FileText className="mb-1 size-7 text-muted-foreground" aria-hidden="true" />
                <h3 className="font-medium">No documents yet</h3>
                <p className="max-w-xs text-sm leading-6 text-muted-foreground">
                  Upload your first notes above. Only documents from this workspace will appear
                  here.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col divide-y">
                {documents.map((document) => (
                  <li key={document.id}>
                    <Link
                      href={`${base}/documents/${document.id}`}
                      className="group flex min-w-0 items-center gap-3 rounded-md py-4 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <FileText
                        className="size-5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" title={document.filename}>
                          {document.filename}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">Text extraction</span>
                          <DocumentStatusBadge status={document.processingStatus} />
                          {document.hasSummary && <Badge variant="secondary">Saved summary</Badge>}
                        </div>
                      </div>
                      <ArrowRight
                        className="size-4 shrink-0 text-muted-foreground group-hover:text-primary"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-lg">Saved flashcards</CardTitle>
            <Link
              href={`${base}/flashcards`}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              All sets
            </Link>
          </CardHeader>
          <CardContent>
            {flashcardSets.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Layers3 className="mb-1 size-7 text-muted-foreground" aria-hidden="true" />
                <h3 className="font-medium">No saved sets yet</h3>
                <p className="max-w-xs text-sm leading-6 text-muted-foreground">
                  Generate flashcards from a document to save your first set here.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col divide-y">
                {flashcardSets.map((set) => (
                  <li key={set.id} className="flex min-w-0 flex-wrap items-center gap-3 py-4">
                    <div className="min-w-0 flex-1 basis-36">
                      <h3 className="truncate text-sm font-medium" title={set.title}>
                        {set.title}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {set.cardCount} {set.cardCount === 1 ? 'card' : 'cards'}
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`${base}/flashcards/${set.id}`} aria-label={`Study ${set.title}`}>
                        Study <ArrowRight className="ml-2 size-3.5" aria-hidden="true" />
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <section aria-labelledby="study-path" className="pb-2">
        <h2 id="study-path" className="text-sm font-semibold">
          Your study path
        </h2>
        <ol className="mt-4 grid gap-5 text-sm sm:grid-cols-3">
          {[
            {
              icon: Upload,
              title: '1. Upload notes',
              text: 'Use a short, permitted text file and check its extraction status.',
            },
            {
              icon: FileText,
              title: '2. Summary & cards',
              text: 'Check the input budget, request generation and follow its server status.',
            },
            {
              icon: Layers3,
              title: '3. Study a saved set',
              text: 'Flip cards, shuffle and review. Learning progress is not saved yet.',
            },
          ].map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h3 className="font-medium">{title}</h3>
                <p className="mt-1 leading-6 text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
