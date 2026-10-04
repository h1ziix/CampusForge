'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { completeOnboardingAction } from '@/server/actions/auth';

const currentYear = new Date().getFullYear();

export function OnboardingForm({ userName }: { userName?: string | null }) {
  const router = useRouter();
  const { update } = useSession();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await completeOnboardingAction(formData);

      if (!result.success) {
        setError(result.error);
        return;
      }

      // An empty update triggers Node auth to re-read claims from the saved DB profile.
      const session = await update({});
      if (!session?.user?.onboardingCompleted) {
        setError('Profile saved, but your session could not refresh. Please try again.');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Complete your profile</CardTitle>
        <CardDescription>Tell us about yourself to personalize CampusForge</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-error-foreground"
            >
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              defaultValue={userName || ''}
              required
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="university">University</Label>
            <Input
              id="university"
              name="university"
              type="text"
              placeholder="MIT, Stanford, etc."
              required
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="major">Major</Label>
            <Input
              id="major"
              name="major"
              type="text"
              placeholder="Computer Science"
              required
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="graduationYear">Graduation Year</Label>
            <Input
              id="graduationYear"
              name="graduationYear"
              type="number"
              min={2020}
              max={2035}
              defaultValue={currentYear + 1}
              required
              disabled={isPending}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Saving...' : 'Continue to Dashboard'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
