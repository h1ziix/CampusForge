import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { APP_NAME } from '@campusforge/shared';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="container flex h-16 items-center justify-between">
          <span className="text-xl font-bold tracking-tight">{APP_NAME}</span>
          <nav aria-label="Account" className="flex items-center gap-2 sm:gap-4">
            <Button asChild variant="ghost" size="sm">
              <Link href="/sign-in">Sign In</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-up">Create account</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center sm:py-20">
        <Badge variant="secondary">Pre-pilot prototype</Badge>
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
          Start with
          <br />
          <span className="text-primary">a short note.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Keep your materials in one workspace and practise with saved flashcard sets. We are
          building a focused path from a short note to a saved summary, cards, and a study session.
        </p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/sign-up">Create your workspace</Link>
        </Button>

        <ol className="mt-12 grid w-full max-w-3xl gap-6 border-y py-6 text-left sm:grid-cols-3 sm:gap-8">
          <li>
            <p className="text-sm font-semibold">1. Upload a short note</p>
            <p className="mt-1 text-sm text-muted-foreground">Save a file for text extraction.</p>
          </li>
          <li>
            <p className="text-sm font-semibold">2. Summary &amp; cards</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Request generation from extracted text within the AI input budget.
            </p>
          </li>
          <li>
            <p className="text-sm font-semibold">3. Practise</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Open a saved card set when one is available.
            </p>
          </li>
        </ol>
        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Upload one UTF-8 TXT, Markdown, or PDF with selectable text, up to 10 MiB. Start with a
          short TXT note. Scans, images, and DOCX are not supported. AI generation has a separate
          input budget; long material is rejected without truncation. Check generated answers
          against your source.
        </p>
      </main>

      {/* Footer */}
      <footer className="border-t bg-background/80 py-6">
        <div className="container text-center text-sm text-muted-foreground">
          {APP_NAME} · A focused study workflow, in development.
        </div>
      </footer>
    </div>
  );
}
