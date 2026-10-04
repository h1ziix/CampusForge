'use client';

import { SessionProvider } from 'next-auth/react';
import { OnboardingForm } from '@/components/onboarding/onboarding-form';

export default function OnboardingRegression() {
  return (
    <SessionProvider session={null}>
      <main className="bg-background flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md">
          <OnboardingForm userName="R2 synthetic user" />
        </div>
      </main>
    </SessionProvider>
  );
}
