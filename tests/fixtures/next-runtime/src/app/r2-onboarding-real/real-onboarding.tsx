'use client';

import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';
import { OnboardingForm } from '@/components/onboarding/r2-onboarding-real-form';

export default function RealOnboarding({ session }: { session: Session | null }) {
  return (
    <SessionProvider session={session}>
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md">
          <OnboardingForm userName={session?.user.name} />
        </div>
      </main>
    </SessionProvider>
  );
}
