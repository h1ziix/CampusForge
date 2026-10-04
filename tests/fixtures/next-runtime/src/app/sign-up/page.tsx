import { SignUpForm } from '@/components/auth/sign-up-form';

export default function SyntheticSignUp() {
  return (
    <main className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <SignUpForm />
      </div>
    </main>
  );
}
