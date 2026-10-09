import { APP_NAME } from '@campusforge/shared';

/**
 * Shared layout for CampusForge auth pages (sign-in, sign-up).
 * Centered card on a clean background with branding.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold">{APP_NAME}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your study workspace · Early preview</p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
