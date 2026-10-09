import { AppShell } from '@/components/layout/app-shell';

// Only synthetic identities. The shell and navigation are copied from production.
export default function NavigationFixture() {
  return (
    <AppShell
      user={{ id: 'r2-user-a', name: 'Synthetic learner' }}
      workspaces={[
        {
          id: 'r3-navigation-workspace',
          name: `Primary workspace ${'UnbrokenStudyWorkspace'.repeat(8)}`,
          type: 'PERSONAL',
          role: 'OWNER',
        },
        ...Array.from({ length: 24 }, (_, index) => ({
          id: `r3-navigation-${index}`,
          name: `Study workspace ${index + 1} ${'LongWorkspaceName'.repeat(7)}`,
          type: 'TEAM',
          role: 'OWNER',
        })),
      ]}
    >
      <h1 className="text-2xl font-bold">Navigation fixture</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Synthetic workspaces for keyboard, focus and scroll regression checks.
      </p>
      <button type="button" className="mt-6 rounded-md border p-3">
        Page action outside navigation
      </button>
    </AppShell>
  );
}
