import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@campusforge/shared';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="container flex h-16 items-center justify-between">
          <span className="text-xl font-bold tracking-tight">{APP_NAME}</span>
          <nav className="flex items-center gap-4">
            <Link href="/sign-in">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm">Get Started</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
          Your AI-powered
          <br />
          <span className="text-primary">academic workspace</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          {APP_NAME} helps students manage deadlines, collaborate in teams, study with AI, and
          prepare for careers - all in one place.
        </p>
        <div className="mt-10 flex gap-4">
          <Link href="/sign-up">
            <Button size="lg">Start for Free</Button>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-background/80 py-6">
        <div className="container text-center text-sm text-muted-foreground">
          {APP_NAME} - Built for students who ship.
        </div>
      </footer>
    </div>
  );
}
