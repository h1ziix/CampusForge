import { auth } from '@/lib/auth';
import RealOnboarding from './real-onboarding';

export default async function RealOnboardingPage() {
  const session = await auth();
  return <RealOnboarding session={session} />;
}
