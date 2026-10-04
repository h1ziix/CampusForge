# R2: local privacy and storage (SEC-02)

The assistant and document AI demo remain local browser features. No remote AI,
database migration or real user data was used for this change.

## Application boundary and retention policy

- The workspace assistant and document pages pass `userId` from `auth()` and
  `workspaceId` only after `requireWorkspaceMember` succeeds. The authenticated
  layout requires a nonempty string user ID. Names, emails, query parameters and
  client-selected identities are not storage principals.
- Assistant content uses
  `campusforge:assistant:v2:<encoded-userId>:<encoded-workspaceId>`; document cache
  uses `campusforge:doc-ai:v2:<encoded-userId>:<encoded-workspaceId>:<encoded-documentId>`.
  Encoded components prevent separator collisions. Each identity/workspace has a
  fresh React subtree, including drafts, sidebar searches, attachment metadata,
  previews, dialogs and timers.
- The previous global `campusforge:assistant:v1` and per-document ownerless cache
  are never read or imported. Their owners cannot be established. They are
  removed at the next explicit logout.
- Logout first revokes all live sensitive cache leases, then removes **all**
  CampusForge assistant content and document AI cache namespaces on that device
  (including other accounts/workspaces and legacy keys), before Auth.js signout.
  Theme (`campusforge-theme`), scoped non-sensitive assistant preferences and
  unrelated origin keys are retained. `localStorage.clear()` is never used.
- Cleanup precedes network logout. If Auth.js logout cannot complete, local
  content remains hidden and an explicit Retry sign out action provides pending
  and error feedback. Clearing a local cache alone does not revoke a server
  cookie. No background retry or automatic logout request is introduced.
- Only theme, language, default model, temperature, response length, memory,
  notifications and autosave are retained as preferences under
  `campusforge:assistant:prefs:v2:<user>:<workspace>`. Custom system prompts remain
  sensitive and are removed with content. History exports are explicit user
  downloads; logout cannot erase downloaded files.
- Turning autosave off immediately removes persisted conversations and custom
  system prompts while retaining in-memory content until navigation/logout.
  The preference survives reload. Content persistence is otherwise debounced.
  Volatile image object URLs and interrupted streaming status are not restored.

## Revocation and stale work

Every content write carries the lease for its original identity and logout epoch.
Leases check the durable epoch before writing; a suspended tab cannot recreate
old history before receiving its storage event. Storage events and
BroadcastChannel revoke other live tabs. Logout unmounts sensitive subtrees,
cancels response/progress/persistence timers, revokes image URLs and clears the
React Query cache. Stale callbacks also check their lease before changing state.

BFCache restoration revokes the old in-memory lease and reloads through the
server auth boundary. The authenticated shell checks the current
`/api/auth/session` using `no-store` before exposing cached RSC children and on
tab focus. A different/absent session revokes private caches; an unavailable
session service keeps the content hidden and offers a reload. This identity
check supplements the server membership checks; it does not replace them.

Storage read/write/quota errors are nonfatal, and a changed durable epoch hides
content even if deletion fails. If a browser simultaneously blocks persistent
storage and BroadcastChannel, other tabs cannot receive a durable application
revocation message. Authentication guards and distinct namespaces still apply,
but physical deletion from inaccessible storage cannot be guaranteed. Browser
storage is not encryption or protection against a user inspecting DevTools or
other same-origin scripts.

## Evidence

- Before edits, `pnpm exec playwright test tests/browser/react-lifecycle.spec.ts
--grep 'assistant hydrates' --reporter=json` passed with the actual old source
  on Next 16.3.8 / React 19.3.0. It rendered synthetic content from the unscoped
  legacy key, confirming the old storage entrance remains vulnerable on that
  runtime. The launcher inherited host Node **20.20.0**, not supported R1 Node 24;
  this preliminary reproduction is kept honestly in
  [R2-evidence/baseline-storage.json](R2-evidence/baseline-storage.json). It is not
  real authentication or a supported Node acceptance result.
- `node --test apps/web/tests/privacy.test.mjs` on Node **24.21.0**: **9/9 PASS**.
  Actual application TypeScript modules run in separate VM realms; only storage,
  events and BroadcastChannel are simulated. Cases cover user/workspace markers,
  suffix-safe namespace components, volatile attachment stripping, autosave,
  corrupt/blocked storage, legacy refusal, key-scoped deletion, retained
  preferences, both transport fallbacks, deletion failure, stale write fences and
  BFCache re-entry. Two actual server-page tests also verify the identity
  handoff and malformed/foreign principal rejection, with auth, membership and
  document-query boundaries explicitly mocked. Machine-readable TAP:
  [R2-evidence/privacy-tests.tap](R2-evidence/privacy-tests.tap).
- `pnpm --filter @campusforge/web typecheck` on Node 24.21.0: PASS.
- Targeted ESLint on the touched privacy/storage/components and privacy test:
  exit 0. The root-level invocation reports the existing Next legacy
  `no-html-link-for-pages` lookup message; the web lint runs from its own workspace.
- Supported-runtime browser regression, screenshots, visual inspection and
  full-workspace quality gates are recorded by the coordinating R2 review in
  [R2.md](R2.md). They must be read before assigning a final SEC-02 status.
- The initial assistant screenshots were visually inspected at 390, 768, 1024
  and 1440 in light and dark. Existing spacing and styling remain consistent.
  The pre-existing FE-01 welcome-screen overflow still pushes/clips the composer,
  especially on mobile; this is outside R2 and was deliberately not redesigned.
  Horizontal-overflow checks alone do not establish composer visibility.
- Newly introduced local-session fallback screenshots were inspected in light
  at 390px (focus, pending and error). The coordinating review found insufficient
  dark-theme error contrast; the error now uses the semantic `text-error-foreground` token.
  Final screenshots and keyboard states must be read from the complete matrix.

Disposable real auth/database acceptance remains separate: actual A/ws1 → A/ws2
→ logout → B/ws1 with live sessions, DB-backed membership and logout cookies has
not been established by these unit tests or fixture login. No production
readiness or admission is claimed.

## Changed files in this area

`apps/web/src/lib/privacy.ts`, `lib/use-privacy-lease.tsx`,
`lib/assistant/storage.ts`, `lib/query-client.tsx`,
`components/assistant/assistant-app.tsx`, `chat-input.tsx`, `settings-dialog.tsx`,
`components/auth/sign-out-button.tsx`, `authenticated-privacy-boundary.tsx`,
`components/layout/app-shell.tsx`, `components/document/document-detail-view.tsx`,
`app/(dashboard)/layout.tsx`, the workspace assistant/document server pages,
`apps/web/tests/privacy.test.mjs`, and this document/evidence. Fixture/test source
updates are owned by the R2 regression review.
