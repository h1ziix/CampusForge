import { Suspense } from 'react';
import { SignInForm } from '@/components/auth/sign-in-form';

export default function SyntheticSignIn() {
  return (
    <main className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <p className="text-muted-foreground mb-4 text-sm">
          Synthetic successful action; no real authentication.
        </p>
        <Suspense>
          <SignInForm />
        </Suspense>
      </div>
    </main>
  );
}
