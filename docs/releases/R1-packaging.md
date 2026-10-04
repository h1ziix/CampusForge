# R1: production packaging

## Contract

R1 ships a **built workspace artifact**. The build machine performs the frozen full dependency installation, Prisma generation, package builds, worker compilation, and Next build. `pnpm release:pack <fresh-release-directory>` copies the manifests and lockfile, `.next` without caches, start wrappers, compiled package/worker JavaScript, migrations/schema, and the generated runtime Prisma Client/native engine. It excludes `.env`, `node_modules`, source audit evidence, screenshots, and build caches. It refuses to overwrite an existing target.

On the runtime machine, inside that artifact:

```sh
pnpm install --prod --frozen-lockfile --ignore-scripts
pnpm --filter @campusforge/web start
pnpm --filter @campusforge/worker start
```

Start commands run independently with runtime variables supplied by the process manager. They validate required variable names, then run Next and compiled worker JS through Node; `dotenv-cli`, `tsx`, TypeScript, and Turbo are not runtime requirements. Keep optional dependencies enabled: PDF parsing and Next use native packages installed from the lockfile.

Build and runtime must use Node 24, the same OS/architecture, and a compatible native-library environment. For Linux this includes the Prisma engine's libc/OpenSSL family. Build on the destination platform rather than copying Windows-generated Prisma engines to Linux. `release-manifest.json` records Node, OS, architecture, engine filenames, and the lockfile SHA256. A different platform requires a new build and a new artifact.

Prisma generation creates one canonical client in `packages/db/generated/client`, imported/exported by `@campusforge/db`. Web TypeScript resolves the Auth.js adapter's type-only `@prisma/client` import to that same output. This avoids incompatible nominal types from two independent generated runtime copies, without casts or generated-code patches. The output travels with the artifact and survives a new production installation with lifecycle scripts disabled. The pinned `@prisma/client` package remains a production dependency. Next externalizes `@campusforge/db`, keeping the client and native engine paths package-relative.

Workspace package `main`/runtime exports target CommonJS `dist` files; prebuild TypeScript checks resolve the source type exports. The assembler changes release-only type exports to the shipped `dist` declarations; no release metadata points to omitted TS source files. The worker's compilation resolves already-built package declarations and emits only worker source files. Package builds must precede worker and web builds.

## PDF parser

The worker now uses `pdf-parse` 2.4.5 with its shipped CJS entry, types, PDF worker, and native dependencies. `extractPdfText` passes a copied `Uint8Array`, sets `isEvalSupported: false`, omits added page-number markers, and destroys the parser in `finally`. No generated PDF assets are manually copied out of `node_modules` or bundled into worker JS. The runtime install restores the whole pinned package and its native optional packages. The [publisher API](https://github.com/mehmet-kozan/pdf-parse) and [load options](https://github.com/mehmet-kozan/pdf-parse/blob/main/docs/options.md) document this class API and evaluation option.

These R1 changes do not implement malicious-document process isolation, CPU/page/time limits, idempotent AI jobs, or the later pipeline findings. The synthetic regression proves text parsing/runtime asset resolution for the checked fixture; it is not a comprehensive PDF security test.

## Verification

Reusable smoke command from the build workspace:

```sh
pnpm release:probe <installed-release-directory>
```

The probe uses its own synthetic variables and unavailable local service endpoints. It checks the artifact/lock/platform contract, absence of dev-only startup CLIs, actual workspace JS imports, Prisma native engine loading (expected `P1001` against a closed local port), actual compiled PDF text parsing, rejection of missing runtime variables before startup, safe configuration diagnostics, the worker's module-loaded message, and HTTP 200 from the real Next `/sign-in` runtime. It sends no jobs and performs no database queries, S3 operations, or AI calls. Own child processes are terminated after the bounded probe. The result explicitly records `infrastructureReady: false`.

Worker messages now distinguish loaded modules from Redis queue readiness. A queue-ready message only verifies Redis; it explicitly leaves database, S3, and AI readiness unchecked. Connection failures use fixed messages without endpoint or credential values.

Structural checks executed during implementation: Node 24 `node --check scripts/package-release.mjs` and `node --check scripts/probe-release.mjs` passed. Web typecheck passed after canonical Prisma type resolution was configured. ESLint passed for both release scripts. The coordinated final clean snapshot passed installation, generation, schema validation, all five package typechecks, lint, format, tests, environment forwarding, and all five build tasks; the root R1 report records those full gate results.

## Executed release checks

Executed on 4 October 2026 with Node **24.21.0**, pnpm **10.33.0**, Windows x64. Final artifacts came from `C:/Users/rausa/AppData/Local/Temp/campusforge-r1-clean-xU6zKr`; after the clean build, the separately linted Windows start-wrapper URL correction was copied to that snapshot. The wrapper is a runtime launcher and is not included in Next compilation.

| Command / assertion                                                                                                               | Actual result                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node <clean-snapshot>/scripts/package-release.mjs <fresh-runtime-directory>/release`                                             | PASS; `.next`, compiled worker/packages, generated Prisma runtime/native engine, and projected declaration exports assembled.                                                                                        |
| In the release: `pnpm install --prod --frozen-lockfile --ignore-scripts --store-dir ../.pnpm-store`                               | PASS, 142 packages, reused 0, initially empty separate store, dev dependencies skipped, 1m 25.5s.                                                                                                                    |
| From the full source workspace: `node scripts/probe-release.mjs <installed-release> --ui-output docs/releases/evidence/public-ui` | PASS, exit 0.                                                                                                                                                                                                        |
| Runtime-only imports and tools                                                                                                    | Compiled `db`, `ai`, `shared`, Next, and PDF parser loaded; `tsx`, `dotenv-cli`, and Turbo absent.                                                                                                                   |
| Native Prisma engine                                                                                                              | Loaded; connection to the probe's closed localhost port produced expected `P1001`. No database query or migration ran.                                                                                               |
| Compiled PDF helper                                                                                                               | Synthetic valid PDF text extracted through the actual installed parser/worker assets.                                                                                                                                |
| Missing runtime environment                                                                                                       | Both launchers exited 1 before application startup; diagnostics contained variable names and did not disclose the synthetic invalid value.                                                                           |
| Actual production processes                                                                                                       | Next `/sign-in` returned HTTP 200; worker stayed running after loading its compiled modules.                                                                                                                         |
| Production public UI, 390 and 1440 px                                                                                             | HTTP 200, visible/enabled fields, Email → Password keyboard focus, no horizontal overflow, 0 page errors, 0 Server Action requests, 0 external requests; system font preserved. Screenshots saved for visual review. |
| Infrastructure readiness                                                                                                          | **Not established.** Probe endpoints deliberately had no PostgreSQL/Redis/S3 services; no jobs or AI calls executed.                                                                                                 |

Evidence: [artifact assembly](evidence/r1-production-package.log), [fresh production install](evidence/r1-production-install.log), [runtime results](evidence/r1-production-probe.json), and [public UI results](evidence/public-ui/public-ui-results.json). The release directory is recorded in `evidence/r1-production-target.txt`; it is a disposable local artifact, not a deployment.

The preliminary run exposed two concrete issues and retained its separate logs: a too-narrow synthetic PDF page cropped the test text (the fixture now uses 600 pt), and a Windows web launcher attempted to dynamically import a raw `C:` path. The final launcher uses `pathToFileURL`, and the final artifact was freshly assembled and installed before the successful probe. No `node_modules` files were hand-patched.

RD-01 is addressed for this release contract. Runtime readiness with real disposable infrastructure, complete document processing, platform-specific Linux verification, and the later R2–R7 security/data/workflow findings remain outside this proof. R1 is not production approval.
