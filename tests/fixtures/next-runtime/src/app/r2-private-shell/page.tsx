import { AuthenticatedPrivacyBoundary } from '@/components/auth/authenticated-privacy-boundary';

export default function PrivateShellRegression() {
  return (
    <AuthenticatedPrivacyBoundary userId="r2-user-a">
      <main>
        R2_A_VERIFIED_PRIVATE_SHELL
        <textarea aria-label="Synthetic private draft" />
      </main>
    </AuthenticatedPrivacyBoundary>
  );
}
