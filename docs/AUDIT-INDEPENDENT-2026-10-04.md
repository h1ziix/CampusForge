# CampusForge — независимый глубокий аудит готовности к production

Дата: **4 октября 2026 года**, часовой пояс пользователя Asia/Qyzylorda. Проверена локальная рабочая копия `C:\Users\rausa\OneDrive\Рабочий стол\CampusForge` и изолированные копии её исходников. Principal engineering / AppSec / senior frontend review выполнены независимо, с разделением областей между тремя субагентами и перекрёстной проверкой спорных результатов.

Все сокращённые пути `evidence/`, `probes/`, `screenshots/` и имена областных отчётов ниже относятся к `docs/audit-2026-10-04-independent/`. Ссылки на исходники ведут к фактическим файлам этой рабочей копии; видимый диапазон строк указан в подписи ссылки.

## 1. Вердикт

**NO-GO: текущий проект нельзя допускать к production с настоящими пользовательскими документами и обещанием работающего AI.** Причина — подтверждённые дефекты безопасности, потери файлов/задач, отсутствие идемпотентной обработки, demo под видом результатов и неработающий production install/start контракт. Внешний production deployment не предоставлен и не проверен. Подтверждённых P0-инцидентов не найдено; условный Windows RCE в зависимости критичен, но OS/экспозиция реального production неизвестны.

Важное отличие от предыдущего отчёта: **исходники web способны пройти production build**. Проверено на чистой source snapshot после frozen install и явной Prisma Client generation. Первоначальная сборка основного checkout действительно падает, но отдельный compiler probe доказал проблему его установленного type layout. Actual Next App Router удерживает pending асинхронного transition; прежний вывод о неизбежном duplicate submit не подтверждён. Это уточнение не снимает остальные блокеры.

Приложение, `.env`, schema/migrations, пользовательские данные и Git history не исправлялись. В главном checkout проверено совпадение SHA256 **159 source/config файлов**; изменений нет. Сохранены только отчёты/probes/screenshots. Existing DB migrations, push, deployment и платные provider calls не выполнялись. Настоящие значения `.env` не выводились и в стенды не копировались.

## 2. Самые важные проблемы и порядок риска

Приоритет P1 — выпуск блокирует основной сценарий, безопасность, сохранность или запуск; P2 — значимый дефект, исправить до production; P3 — небольшой дефект/полировка. Приоритет означает срочность, а не успешность exploit. Для каждого подтверждённого finding ниже указаны условия и предел доказательства.

| Приоритет | ID | Подтверждённая проблема |
|---|---|---|
| P1 | SEC-01 | Controlled callbackUrl исполняет JavaScript после mock-success login через настоящий SignInForm/Next router; browser marker 42 |
| P1 | SEC-02 | Один localStorage key открывает историю другого пользователя/workspace, logout её оставляет |
| P1 | SEC-03 | Публичные credentials/signup выполняют expensive password operations без application throttling |
| P1 | RD-02 | Locked Next имеет актуальные применимые Server Action DoS advisories и conditional Windows RCE; Node baseline EOL |
| P1 | PF-02, PF-08 | Upload collision/cleanup и delete failure приводят к перезаписи, потере файлов либо orphan retention |
| P1 | PF-03, PF-05 | DB commit не гарантирует enqueue/recovery; HTTP producer бесконечно ждёт Redis без deadline |
| P1 | PF-04 | Нет stable logical AI operation: duplicate/replayed jobs, duplicate results, stale PROCESSING блокирует recovery |
| P1 | PF-06 | Multipart body 11 534 654 bytes принят при 1-byte выбранном файле, остальные parts игнорируются |
| P1 | PF-01 | Document AI UI/Assistant показывают локальные шаблоны, реальные DB results игнорируются; attachment bytes не анализируются |
| P1 | RD-01 | Prod-only установка лишает web/worker необходимых startup executables; worker artifact не собирается |
| P1 | FE-01, FE-02 | Composer нового чата выходит за viewport; mobile не имеет навигации по разделам/workspaces |
| P2 | Остальные | Password byte truncation, JWT onboarding spoof, cost/validation/retention, overflow/keyboard/dialogs, static dashboard, quality gates, Turbo env |

Номер finding сохраняет область аудита; один root cause не размножен на каждое последствие. UI evidence для callback/storage/demo относится к SEC/PF findings, а не создаёт повторные findings.

## 3. Фактически выполненные проверки

| Проверка / команда | Результат | Что это подтверждает / не подтверждает |
|---|---|---|
| AGENTS / project instructions | Прочитано | Отдельный AGENTS отсутствует в checkout/предках; применены переданные пользователем инструкции. README/runbook не найден |
| frontend-senior + shadcn / browser QA | Выполнено | UI source и rendered result; изменений UI не было. Motion-heavy implementation отсутствует, Motion skill не потребовался |
| `pnpm install --frozen-lockfile` в source snapshot без node_modules/.env/caches | PASS | Lock воспроизводит install, 324 packages; не подтверждает полностью независимую сеть registry: использован локальный pnpm store |
| `pnpm build --force` в основном checkout | FAIL | Compile JS PASS, type validity FAIL на sign-in TransitionFunction; local installation issue выяснена отдельно |
| Каждый package `tsc --noEmit --incremental false` | Web FAIL 10 TS2345; worker/db/ai/shared PASS | Повторный web check после завершения build исключил initial `.next` race, первый параллельный результат не использован как finding |
| Clean snapshot first build | FAIL | Prisma Client ещё не generated; ошибка typing workspace map, не ошибка бизнес-логики Workspace |
| Clean `prisma generate` → `pnpm build --force` | PASS | Настоящие compilation/type/static generation/optimization прошли, одна task web. DB migrations не выполнялись |
| Clean web typecheck | PASS | Experimental/canary augmentation присутствует в clean installation |
| Independent actual TS compiler/resolver + virtual aliases | PASS | Original diagnostic 10 → 0 с восстановлением только in-memory type resolution; originals не менялись |
| `CI=1 pnpm lint` | FAIL | Интерактивная initial ESLint configuration, не выполненный lint analysis |
| `pnpm format:check` | FAIL | Не найден declared-config formatter plugin; actual formatting compliance не проверена |
| `pnpm --dir packages/db exec prisma validate`, fake DATABASE_URL | PASS | Schema syntax; DB connection/application migration не проверены |
| `pnpm -r --if-present test` + inventory/scripts | Suite отсутствует | Command отработал, но ноль существующих тестов: test PASS не заявляется |
| `pnpm audit --json` / `--prod --json` | FAIL по advisories | Registry metadata: all 59 (7 critical/23 high/23 moderate/6 low); prod 48 (7/18/20/3). Unique GHSA 47/39; это не 59 exploit |
| Publisher advisory triage | Выполнена отдельно | Primary metadata/references/reachability; version match отделён от conditional exposure и недостижимого паттерна |
| `docker compose ... config --quiet` | PASS | Compose syntax; не readiness infrastructure |
| `docker info` | BLOCKED инфраструктурой | Docker daemon pipe отсутствует; контейнеры/real PostgreSQL/Redis/MinIO не поднимались |
| 17 actual-source pipeline scenarios | Exit 0 | 2 positive backend scenarios с synthetic responses; 15 failure/limits cases. Real external services заменены mocks |
| Actual BullMQ/ioredis producer outage | Дефект воспроизведён | Isolated close-only localhost TCP endpoint, 8 reconnects/1513 ms, enqueue pending, реальные Redis writes 0 |
| Actual SDK retries с mock fetch | Выполнено | 2 worker attempts → 6 transport requests; все responses synthetic, реальные provider calls/charges 0 |
| AppSec actual-source probes | Exit 0 | JWT/password/callback/storage/abuse/tenant tests; настоящая bcrypt cost12, DB/auth mutations mocked |
| Tenant matrix 6 actions | PASS отрицательных сценариев | Foreign workspace/object rejected, DB writes/S3 deletes/AI enqueues 0; не сертификация всех интеграционных ACL |
| Next App Router deferred task action | PASS проверенного сценария | Pending/disabled TRUE, один POST, mock error видим; runtime React canary, остальные формы не объявляются exhaustively tested |
| Public UI + closed original UI fixtures, 390/768/1024/1440, light/dark | Выполнено + screenshots | Настоящие компоненты/CSS/Next; auth/queries/actions fixtures. Browser не подтверждает реальные сессии или DB writes |
| CallbackUrl browser marker | Дефект воспроизведён | Original SignInForm/Next router + mock successful signIn; JavaScript marker 42, без exfiltration/live account |
| UI submit/cancel/history/flashcards/dialogs/upload states | Выполнено | Детали, matrix и screenshots в frontend evidence; отдельные load/empty/error states injected |
| Production-only install + advertised web/worker start | Install PASS, оба start FAIL | Отсутствующий dotenv до инициализации app, не отсутствие Redis/DB |
| Turbo env-only runtime presence probe | Дефект воспроизведён | S3_* и OPENAI_MODEL отфильтрованы, секреты synthetic |
| Git status/history/remotes/ls-files | Выполнено | master, HEAD/commits отсутствуют, tracked files 0, remotes 0; исходники untracked |
| Connected h1ziix GitHub | Выполнено read-only | 7 owner default-branch trees, truncated=false; owner next page empty, portfolio content отдельно проверен |
| Source invariant final check | PASS | 159 исходных source/config hashes неизменны; evidence/workspace-final-state.json |
| Live AI / live auth CRUD / disposable PostgreSQL migrations / external deploy / backups | НЕ ВЫПОЛНЕНО | Нет соответствующего стенда, paid AI запрещён, existing DB mutation запрещена; успех не заявляется |

### Карта архитектуры и фактический контракт запуска

| Package | Entry / модель исполнения | Проверенная роль |
|---|---|---|
| root campusforge | pnpm 10.33.0, Node 20.20.0 в аудите, `.nvmrc=20`, Turbo 2.9.6 | Root dev/build/lint orchestration; нет root test/typecheck/start/deploy contract |
| @campusforge/web | Next 14.2.35 App Router, `src/app`, middleware, Server Actions, 2 API route families | Auth/workspace/tasks/notes/documents/flashcard pages; separate client demo assistant |
| @campusforge/worker | `src/index.ts`, tsx, BullMQ | document-processing parse(PDF/TXT/MD); ai-pipeline summary/flashcard, concurrency2 each |
| @campusforge/db | TS exports `src/index.ts`, Prisma 5.22.0 | PostgreSQL schema/client; explicit generate needed; 2 SQL migrations |
| @campusforge/shared | TS exports, Zod 3.x | Schemas/constants/action result types |
| @campusforge/ai | TS exports, OpenAI SDK6.34.0 | JSON completion/prompts/validators/estimated usage; нет live chat API |

**Environment:** DATABASE_URL, AUTH_SECRET/NEXTAUTH_SECRET, NEXTAUTH_URL — DB/auth; REDIS_URL — queues; S3_ENDPOINT/REGION/BUCKET/ACCESS_KEY/SECRET_KEY — object store; OPENAI_API_KEY/MODEL — worker provider; NEXT_PUBLIC_APP_URL — public app setting. `.env.example` содержит template values. Настоящий файл проверен только на имена переменных, не выдан за валидную production конфигурацию. Fail-fast unified env schema отсутствует. Root Turbo передаёт не весь набор env: RD-04.

**Migrations:** initial migration создаёт schema domain/auth relations, последующая добавляет Document.summaryJson JSONB. Models Quiz/ResearchPaper/ResumeReview/AnalyticsEvent и расширенные AIJobType в schema не означают реализованные сценарии: worker handles только parse/summary/flashcard. Real migration application не выполнялась.

**Воспроизводимый source build, фактически проверенный:** создать безопасную копию исходников без `.env`/старых node_modules, frozen install → задать synthetic build env → `prisma generate` → `pnpm build --force`. Это source snapshot, **не настоящий Git checkout**: у локального Git пока нет коммита. Runbook/CI/release deployment нужно создать; текущий production-only start провален.

### GitHub: исходники и материалы портфолио

Authenticated profile — **h1ziix**. `list_repositories_by_affiliation(owner)` вернул Agentic-Ops, gold_palast.kz.github.io, h1ziix, jii-app, KazFoodV2, my_portfolio, StratWeb; offset100 пуст. Полные default-branch trees: 484/4/2/42/242/60/543 entries, каждый `truncated=false`. В них не найдена структура данного CampusForge monorepo; root package.json доступных JS проектов имеют другие names/architecture. Дополнительно installation listing показал archived пустой `BAITC-Hacks/hack-37044d42-iishka`; это не CampusForge source.

В [my_portfolio/data/portfolio.ts](https://github.com/h1ziix/my_portfolio/blob/main/data/portfolio.ts) есть карточка CampusForge, link `#contact`, Request project access и path `public/projects/campusforge-preview.mp4`. Видео существует в tree; его не скачивали/не анализировали. **Это описание и preview, а не исходники CampusForge или доказательство его production readiness.** Другие ветки, невыданные private repositories и иные аккаунты не охвачены. Local Git не привязан ни к одному найденному репозиторию. Metadata/paths сохранены в [evidence/github-evidence.json](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/evidence/github-evidence.json>).

## 4. Подробные подтверждённые findings

Далее приведены условия, точные source references, воспроизведения, expected/actual, влияние, минимальные исправления и критерии проверки. Детали написаны по самостоятельно просмотренному коду и новым исполненным probes; старый отчёт не является evidence.

### 4.1. Архитектура, сборка и deployment

#### RD-01 — P1: заявленные production scripts требуют отсутствующих production dependencies; worker artifact не собирается

**Места:** [apps/web/package.json:8,42](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/package.json:8>); [apps/worker/package.json:5-8,18-23](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/worker/package.json:5>); [turbo.json:13-15](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/turbo.json:13>); [packages/db/package.json:5](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/packages/db/package.json:5>); [packages/ai/package.json:5](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/packages/ai/package.json:5>); [packages/shared/package.json:5](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/packages/shared/package.json:5>); [tsconfig.json:15](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/tsconfig.json:15>) (`noEmit:true`).

**Условия:** обычная поставка с `pnpm install --prod --frozen-lockfile` и запуск через предоставленные `start` scripts. Для worker также важна поставка только build artifacts вместо полного дерева TS исходников/dev tools.

**Воспроизведение:** отдельная source snapshot из 159 файлов без `.env`, node_modules и build caches. Frozen install, явный Prisma generate и web build прошли. Затем production-only install прошёл; `pnpm --filter @campusforge/worker start` и `pnpm --filter @campusforge/web start` оба завершились exit 1: `dotenv is not recognized`. `.bin/dotenv` отсутствует у обоих, `.bin/tsx` отсутствует у worker. Логи: [evidence/prod-only-install.log](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/evidence/prod-only-install.log>), `prod-worker-start.log`, `prod-web-start.log`, независимый `quality-crosscheck.json`. `turbo build` фактически исполняет одну web task: worker и TS workspace packages не имеют build script; `dist` artifact не возникает. Worker с полным dev install запускается через source TS runner — это альтернативная поставка, её нельзя объявлять невозможной.

**Expected / actual:** documented production install/start имеет все необходимые runtime tools и исполняемый worker. Actual — предложенный start не достигает инициализации приложения; web build не производит worker binary/JS bundle.

**Влияние:** deployment, удаляющий dev dependencies, не поднимет web и worker; без отдельного worker документы не парсятся, backend AI jobs не обрабатываются.

**Минимальное исправление:** для текущей модели source execution переместить реально нужные `dotenv-cli`/`tsx` в runtime dependencies либо убрать CLI dotenv из production startup и внедрять env на уровне процесса. Для artifact-based поставки собрать worker и workspace packages в JS, изменить package exports/start, явно включить generated Prisma Client и требуемые runtime assets. Не заменять `noEmit` на false без проверки package boundaries. Зафиксировать поддерживаемый install/build/start контракт.

**Проверка устранения:** в пустом release directory frozen production install → advertised start web/worker → readiness, synthetic parse и AI job на disposable инфраструктуре. Production artifact не зависит от локального TS compiler/dev node_modules. Не считать один успешный Next build доказательством работоспособного worker.

#### RD-02 — P1: runtime baseline содержит affected Next и неподдерживаемый Node 20

**Места:** [apps/web/package.json:29-32](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/package.json:29>), `pnpm-lock.yaml` (Next 14.2.35, next-auth beta.25); [apps/web/src/server/actions/auth.ts:1](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/server/actions/auth.ts:1>); другие modules с `use server`; [apps/web/next.config.mjs:1-15](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/next.config.mjs:1>); [.nvmrc:1](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/.nvmrc:1>) закрепляет Node 20.

**Условия:** внешний доступ к App Router deployment с Server Actions; дополнительно Windows filesystem для Windows RCE. Production OS, ingress и действующий deployment не известны. Сам аудит не исполнял RCE/DoS payloads.

**Доказательство:** настоящий `pnpm audit` и `pnpm audit --prod`; фактические версии подтверждены package resolution. [Next primary GHSA-m99w-x7hq-7vfj](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj) относится к App Router с хотя бы одним Server Action, версия 14.2.35 входит в affected range. CampusForge имеет оба условия, включая publicly rendered auth actions. [Windows RCE primary GHSA-p293-qw3h-jr36](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) охватывает эту версию при Windows hosting; текущая audit машина Windows, что не доказывает OS внешнего deployment. Указанные advisory patched minima: 15.5.21 для первого; 15.5.24/16.3.3 для Windows RCE. Это минимумы конкретных advisory, а не предложение считать любую такую версию безопасной относительно всех будущих/других advisory.

**Дополнительная проверка runtime:** `.nvmrc=20`, фактический audit Node=20.20.0. На дату аудита Node 20 уже EOL: официальный [Node.js release schedule](https://github.com/nodejs/Release/blob/main/README.md#end-of-life-releases) указывает 2026-04-30. Это подтверждённый неподдерживаемый development/release baseline; реальный production Node не предоставлен. Node-specific exploit не проверялся. Поддерживаемый LTS runtime нужно выбрать вместе с обновлением Next и проверить на чистом artifact.

**Expected / actual:** релиз использует поддерживаемые исправленные runtime dependencies. Actual — lock воспроизводит известный affected Next, `.nvmrc` выбирает EOL Node; App Router/Server Action attack surface присутствует.

**Влияние:** доказана применимость условий advisory к коду, возможен unauthenticated denial of service; conditional Windows RCE имеет критическое влияние. Реальный exploit или факт скомпрометированного сервера не утверждаются.

**Минимальное исправление:** согласованно обновить Next/React/types/Auth/adapter и Node baseline на поддерживаемые линии, закрывающие актуальную triage таблицу, затем frozen install/build/browser/security regression. Не применять `audit --fix --force` без проверки migration compatibility. Нельзя исправить Windows RCE лишь application-level sanitizer.

**Проверка устранения:** patched locked versions, поддерживаемый Node в development/CI/deploy artifact, current publisher advisories/production audit; воспроизводимый production build, auth/session/redirect tests и реальные UI scenarios в обновлённом Next runtime.

**Важные отрицательные выводы:** registry `critical` не равен exploit приложения. [Auth.js fail-open primary](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-8fpg-xm3f-6cx3) описывает bare truthy auth check; CampusForge проверяет `req.auth?.user` и `session?.user?.id`, поэтому этот паттерн не подтверждён. Publisher severity для него Low, registry сообщил Critical. Email/OAuth findings требуют providers, которых в конфигурации нет. [AVIF optimizer RCE primary](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) требует affected sharp/libheif optimization; sharp не найден в lock, `next/image` не используется, AVIF exploitation не доказана. Общие RSC advisories нельзя исключать только по номинальному React 18: Next App Router содержит собственный compiled runtime. Остальные registry результаты и границы triage вынесены отдельно.

#### RD-03 — P2: lint/format gates не подготовлены к неинтерактивной проверке

**Места:** [apps/web/package.json:9,36-45](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/package.json:9>); root [package.json:7-9,16-19](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/package.json:7>); [.prettierrc:9](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/.prettierrc:9>); отсутствие ESLint config/dependencies в inventory.

**Условия:** developer/CI запускает заявленные `pnpm lint` и `pnpm format:check` на этом snapshot.

**Воспроизведение:** `CI=1 pnpm lint` exit 1, Next показывает выбор начальной настройки ESLint. `pnpm format:check` exit 1: не найден `prettier-plugin-tailwindcss`. Ничего из prompt не выбиралось, autoformat/installation не выполнялись. Логи [evidence/lint.log](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/evidence/lint.log>), `format.log`.

**Expected / actual:** обе команды неинтерактивно проверяют code quality и дают code-related diagnostics. Actual — проверки не доходят до анализа исходников. Scripts lint есть только у web; root typecheck/test gates и package lint scripts отсутствуют. `pnpm -r --if-present test` отработал без suite: это не PASS тестов.

**Влияние:** проект не имеет работающего объявленного quality gate; отсутствие предупреждений не означает соблюдение style/lint rules.

**Минимальное исправление:** добавить согласованные ESLint dependencies/config и declared formatter plugin (или намеренно удалить plugin из config), package typecheck scripts и root aggregate. Добавить tests именно на доказанные опасные сценарии, затем CI. Конфиги выбрать под целевую обновлённую Next линию.

**Проверка устранения:** fresh frozen install → lint/format/typecheck/test в CI без prompts, заранее намеренно нарушенное правило даёт ожидаемый failure. Для пустой test suite job не помечается прошедшим тестированием.

#### RD-04 — P2: Turbo strict environment теряет deployment-параметры S3 и модель AI

**Места:** [turbo.json:3-11,17-19](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/turbo.json:3>); [apps/web/src/lib/s3.ts:17-22,34](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/lib/s3.ts:17>); [apps/worker/src/lib/s3.ts:13-22](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/worker/src/lib/s3.ts:13>); [packages/ai/src/provider.ts:152](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/packages/ai/src/provider.ts:152>); [.env.example:20-30](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/.env.example:20>).

**Условия:** процессы запускаются через root `pnpm dev`/Turbo с env, введёнными платформой, и без физического root `.env`. При direct package start либо наличии `.env`, который загружает dotenv, этот дефект маскируется. Не все способы deployment используют Turbo.

**Воспроизведение:** actual Turbo 2.9.6 на isolated snapshot без `.env`. Только временный worker dev script подменён безопасным env-presence printer, после execution файл восстановлен. Перед запуском все перечисленные env заданы synthetic значениями. Через Turbo DATABASE_URL/AUTH_SECRET/REDIS_URL/OPENAI_API_KEY присутствуют; OPENAI_MODEL и все пять S3 parameters отсутствуют. Значения настоящего `.env` не копировались/не выводились. [evidence/turbo-env-probe.cjs](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/evidence/turbo-env-probe.cjs>), `turbo-env-result.json`, `turbo-dev-dry.json`.

**Expected / actual:** env настройки поддерживаемой модели запуска доходят до процесса. Actual — whitelist их отфильтровывает; AI model silently defaults, S3 client лишается endpoint/credentials/bucket configuration.

**Влияние:** uploads/parsing не работают в env-only root launch; оператор выбирает модель, но worker использует default. При build-time public variables возможны дополнительные cache pitfalls; они отдельно не доказаны.

**Минимальное исправление:** явно перечислить runtime env/passThroughEnv для соответствующих tasks, public build env включить в hashing. На production запускать процессы напрямую по documented контракту с fail-fast schema env validation; не полагаться на обязательный секретный `.env` в source directory.

**Проверка устранения:** этот же probe видит все supplied variables; чистый env-only запуск использует нужный endpoint/bucket/model. Проверить ошибку startup при missing required variables вместо позднего upload failure.

#### RD-05 — P2: workspace dashboard показывает постоянные данные вместо состояния workspace

**Места:** [apps/web/src/app/(dashboard)/w/[workspaceId]/dashboard/page.tsx:36-65,67-104,106-137,139-182,184-242,244-249,260-267](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/app/(dashboard)/w/[workspaceId]/dashboard/page.tsx:36>).

**Условия:** любой авторизованный member открывает dashboard, в том числе новый workspace без задач/документов. Реальные auth/workspace checks проходят, но значения domain metrics не зависят от workspace.

**Доказательство:** arrays объявлены на уровне module: Total Tasks=28, Documents=47, AI Conversations=143, Members=1, Workspace=Personal; tasks/notes/documents/activity/productivity имеют постоянные titles/dates. Page вызывает только auth и getWorkspaceForUser, не aggregate/domain queries. Original page отрендерен в browser fixture для обеих тем/четырёх widths ([ui-pages-results.txt](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/ui-pages-results.txt>), dashboard screenshots). Настоящие DB mutations не выполнялись: неизменность после них следует из полного source dataflow, а не приписанного e2e теста.

**Expected / actual:** пустой workspace показывает нули/empty states; новые записи и корректный type/member count отражаются на dashboard. Actual — UI показывает произвольные записи и метрики независимо от БД, включая неверное Personal для Team workspace.

**Влияние:** пользователь принимает фиктивные сроки/документы/статистику за свои, dashboard непригоден для управления работой. Это отдельный read-model defect: он не исправляется подключением OpenAI provider из PF-01.

**Минимальное исправление:** workspace-scoped aggregate/list queries и отображение действительных count/dates; пока они не готовы, явно обозначить dashboard как demo либо показывать честные empty states без invented metrics.

**Проверка устранения:** disposable empty PERSONAL/TEAM workspaces с разными memberships → правильные нули/type/member count; добавить/завершить task, upload document, сохранить note → только соответствующий workspace меняет dashboard после refresh.

### 4.2. Безопасность и приватность

#### SEC-01 — P1: callbackUrl после входа попадает в XSS/navigation sink

- **Точные места:** [apps/web/src/components/auth/sign-in-form.tsx:19](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/auth/sign-in-form.tsx:19>) читает query parameter; `:35` вызывает `router.push(callbackUrl)`; [apps/web/src/server/actions/auth.ts:76](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/server/actions/auth.ts:76>) использует `redirect: false`, поэтому результат Auth.js redirect validation не защищает последующий самостоятельный router push.
- **Условия:** неавторизованный пользователь открывает специально подготовленную ссылку sign-in и успешно входит. Пример безопасного test marker: `/sign-in?callbackUrl=javascript%3Awindow.__auditCallback%3D1`. Для external redirect достаточно `https://example.invalid/audit`.
- **Доказательство:** actual-source `sign-in-callback-url-sink` probe invokes реальный handleSubmit с success action mock; оба значения попадают в router.push без изменений. Фактически установленный `next/dist/client/components/app-router.js:165` формирует URL, `router-reducer/reducers/navigate-reducer.js:102` принимает external origin, `app-router.js:400` передаёт canonical URL в location.assign. Отдельный frontend browser probe запустил оригинальный SignInForm на настоящем Next 14.2.35 AppRouter и `/sign-in?callbackUrl=javascript%3Awindow.__auditCallback%3D42`; после submit `window.__auditCallback===42`. Артефакты: [ui-functional-results.txt](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/ui-functional-results.txt>), [probe-ui-functional.js](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/probe-ui-functional.js>). Auth action success mocked в TEMP; настоящий login/credentials/DB не использованы. Официальная [Next.js useRouter documentation](https://nextjs.org/docs/app/api-reference/functions/use-router) соответствует наблюдению.
- **Expected:** post-login navigation только по разрешённому локальному пути, fallback `/dashboard` для невалидного callback.
- **Actual:** query string полностью контролирует navigation sink после успешного входа.
- **Влияние:** DOM XSS при условии успешного входа по crafted URL и open redirect. Даже HttpOnly cookie не мешает исполненному JS читать localStorage и выполнять same-origin authenticated запросы от имени пользователя. Утечка или эксфильтрация не выполнялась.
- **Минимальное исправление:** централизованный parser callbackUrl: parse against trusted origin; разрешить только совпадающий origin и `http(s)`/локальный pathname; reject `//`, backslash-based host ambiguities, javascript/data schemes и control chars; возвращать только проверенные pathname+search+hash. Применить до router.push и добавить fallback.
- **Проверка устранения:** положительный `/w/<owned-id>/tasks`; негативные `javascript:`, mixed case/control chars, external `https:`, `//evil.invalid`, `/\\evil.invalid`, `data:`. В браузере после mock-success marker отсутствует и origin не меняется; отдельная live-auth проверка на disposable DB.

#### SEC-02 — P1: история чатов разделяет один origin-local ключ для всех пользователей и workspaces

- **Точные места:** [apps/web/src/lib/assistant/storage.ts:11](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/lib/assistant/storage.ts:11>), `:38`, `:44`, `:66`, `:73`; [apps/web/src/components/assistant/assistant-app.tsx:58](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/assistant/assistant-app.tsx:58>), `:68`; [apps/web/src/components/auth/sign-out-button.tsx:13](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/auth/sign-out-button.tsx:13>). `AssistantApp` получает только name/email ([apps/web/src/components/assistant/assistant-app.tsx:18](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/assistant/assistant-app.tsx:18>)), userId/workspaceId отсутствуют в persistence boundary.
- **Условия:** A сохраняет чат, переключает workspace либо выходит; B входит на том же origin в том же browser profile и открывает assistant. Auth action сама не требует shared browser, но privacy breach требует общего профиля браузера/компьютера.
- **Доказательство:** `assistant-storage-isolation-and-logout` записывает синтетический текст A через реальный saveState, загружает тем же реальным loadState от другого principal и вызывает реальный SignOutButton с mock signOut. Сохраняется один `campusforge:assistant:v1`; текст A остаётся и загружается B. Actual code не принимает identity/workspace inputs. Browser probe frontend-аудитора проверяет mock logout и rendered history после смены user fixture через `/audit?user=b`; это не реальный вход другого аккаунта. Workspace mixing следует из общего ключа и полного source dataflow, отдельная live последовательность смены workspace не запускалась.
- **Expected:** A/ws1, A/ws2, B/ws1 имеют изолированную историю; после logout чувствительные данные предыдущего аккаунта не доступны следующему аккаунту через приложение.
- **Actual:** вся история и настройки автоматически читаются из одного ключа; logout только вызывает NextAuth signOut.
- **Влияние:** утечка сообщений и attachment metadata на общем компьютере; workspace mixing; история отображается как принадлежащая текущему пользователю. Настоящий remote AI здесь не требуется — пользователь вводит реальные тексты даже в demo engine.
- **Минимальное исправление:** namespace storage по immutable userId+workspaceId; state reset при identity change; осознанная logout cleanup для чувствительного cached content. Старый несегментированный ключ нельзя автоматически импортировать в текущий аккаунт: его владельца определить невозможно. Надёжнее server persistence с membership checks и документированной retention policy.
- **Проверка устранения:** последовательность A/ws1→A/ws2→logout→B/ws1 с разными маркерами; ни один marker не пересекает границу. Refresh и back navigation не возвращают чужой content. Дополнительно проверить миграцию storage key и отключённый autosave.

#### SEC-03 — P1: публичные password endpoints не ограничивают перебор и дорогостоящую регистрацию

- **Точные места:** [apps/web/src/lib/auth.ts:33](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/lib/auth.ts:33>), `:39`, `:53`; [apps/web/src/server/actions/auth.ts:21](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/server/actions/auth.ts:21>), `:58`; [apps/web/src/server/services/auth.ts:24](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/server/services/auth.ts:24>), `:33`, `:36`. В маршрутах/config/infra не найдено limiter/captcha/lockout/abuse middleware. Credentials также доступны через NextAuth `/api/auth/callback/credentials`, не только UI action.
- **Условия:** публичный доступ к signup/credentials endpoints; злоумышленник автоматизирует попытки. Signup может использовать разные emails, поэтому unique email не является ограничением нагрузки.
- **Доказательство:** `credentials-no-application-throttle`: 12 вызовов реального authorize дают 12 mock DB lookups и 12 compare. `signup-no-application-throttle-and-enumeration`: 12 новых mock emails вызывают 12 hashes и transactions. Настоящее приложение использует bcrypt cost 12. Нагрузочная атака не выполнялась; защиту внешнего reverse proxy/WAF в неизвестном deployment не удалось проверить.
- **Expected:** контролируемый бюджет попыток на account+IP/network и signup; превышение budget прекращает работу до expensive bcrypt/DB operations и возвращает однозначный retry response.
- **Actual:** приложение выполняет дорогие операции на каждую валидную попытку; нет накопления/проверки попыток.
- **Влияние:** credential stuffing и online guessing без application control; нагрузка CPU/DB через регистрации и запросы к существующим пользователям; бесплатное создание пользователей/workspaces. Дополнительно signup явно раскрывает существование email ([apps/web/src/server/services/auth.ts:30](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/server/services/auth.ts:30>)), а signin для отсутствующего email не выполняет bcrypt и допускает timing enumeration. Это сопутствующие риски того же публичного password surface, не утверждение выполненного account takeover.
- **Минимальное исправление:** общий Redis limiter до bcrypt для обоих entrance paths, нормализованный account key+IP, bounded signup budget, безопасный proxy trust, наблюдаемость 429/retries; generic signup response если продукт требует защиты account existence. Не полагаться на disabled submit/button или только на UI server action.
- **Проверка устранения:** настоящий disposable auth stack: credentials action и NextAuth API share budget; after threshold no bcrypt/DB write, 429/retry; correct password cooldown recovery; parallel requests/restart/multiple instances; signup новых emails также ограничен. Не устраивать real user lockout тесты.

#### SEC-04 — P2: принимаемые пароли длиннее 72 UTF-8 bytes имеют неучитываемый suffix

- **Точные места:** [packages/shared/src/schemas/auth.ts:6](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/packages/shared/src/schemas/auth.ts:6>), `:9`, `:14`; [apps/web/src/server/services/auth.ts:33](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/server/services/auth.ts:33>); [apps/web/src/lib/auth.ts:53](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/lib/auth.ts:53>).
- **Условия:** пользователь создаёт пароль, превышающий bcrypt limit 72 bytes; schema принимает до 128 JS characters, а signin вообще не имеет max. Unicode может превысить byte limit существенно раньше character limit.
- **Доказательство:** real bcrypt cost 12 hash от `A.repeat(72)+'first-suffix'` принимает пароль с другим suffix. Оба валидны по реальной signup schema. Аналогично 24 `€` дают 72 bytes и разные суффиксы принимаются. Probe не печатает hash или реальный пароль. [Документация bcryptjs](https://github.com/dcodeIO/bcrypt.js/) подтверждает предел bytes и explicit `truncates()` check.
- **Expected:** изменение любого принятого символа пароля должно менять результат authentication, либо пароль явно отклоняется при превышении выбранного algorithm limit.
- **Actual:** suffix после 72 bytes игнорируется без предупреждения.
- **Влияние:** user-visible password policy обещает 128 characters, но effective secret меньше; разные пароли эквивалентны. Это не позволяет обойти неизвестные первые 72 bytes и не является универсальным bypass.
- **Минимальное исправление:** если оставить bcrypt — одинаковая byte-length validation в signup/signin, `TextEncoder`/bcrypt.truncates и явное сообщение. Для уже существующих long passwords определить миграционное поведение; не ломать их login молча. Альтернатива — versioned migration на algorithm без данного ограничения; не добавлять ad-hoc prehash без проектирования password storage migration.
- **Проверка устранения:** границы 71/72/73 bytes, Unicode, combining chars; signup отказ на oversize; accepted password suffix tamper fails; старый hash login/reset/migration явно проверены.

#### SEC-05 — P2: клиентский JWT update считается источником правды для onboarding/profile

- **Точные места:** [apps/web/src/lib/auth.config.ts:30](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/lib/auth.config.ts:30>), `:32`, `:35`, `:48`; [apps/web/src/middleware.ts:22](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/middleware.ts:22>), `:46`, `:55`; законный UI flow в [apps/web/src/components/onboarding/onboarding-form.tsx:35](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/onboarding/onboarding-form.tsx:35>).
- **Условия:** authenticated user вызывает session update с `{onboardingCompleted:true,name:'...'}` напрямую, не выполнив completeOnboardingAction/не записав обязательный профиль в БД.
- **Доказательство:** actual JWT callback меняет onboarding false→true и name без DB. Фактически установленный Auth.js `lib/index.js:56` проверяет CSRF для session update, `lib/actions/session.js:21` передаёт клиентский request.body.data как `session` в jwt callback и `:39` переиздаёт token. CSRF блокирует чужой browser request, но не собственный authenticated update пользователя. Probe также подтверждает, что `role:'ADMIN'` и `id:'user-b'` НЕ меняют token.
- **Expected:** trusted onboarding flag/name отражают сохранённый профиль БД, обязательные fields проверены action/schema.
- **Actual:** middleware верит client-derived signed flag и пропускает dashboard; БД может продолжать хранить onboardingCompleted=false и пустой профиль; произвольное имя попадает в подписанную сессию.
- **Влияние:** обход обязательного onboarding, рассогласование User↔session; display-name spoof собственного профиля. Tenant membership и ADMIN escalation этим не обходятся, поэтому приоритет P2.
- **Минимальное исправление:** на update в Node auth config перечитывать разрешённые поля User из БД; не принимать onboarding/name как trusted claim из клиента. Edge config оставить без Node imports; Node callback может override shared callback только для update. Profile changes должны сначала проходить серверную validation+DB write.
- **Проверка устранения:** client update не меняет name/onboarding до соответствующей DB write; after legitimate onboarding token соответствует DB; role/id попытки остаются игнорированными; malformed и oversized name не создают cookie growth.

### 4.3. Документы, очереди, сохранность данных и AI

#### PF-01 — P1: UI обещает AI-анализ и подменяет его шаблонами, настоящие DB результаты скрываются

**Файлы/строки:** [apps/web/src/components/document/document-detail-view.tsx:59-101,110-115,160-178,218-220,310-312](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/document/document-detail-view.tsx:59>); [apps/web/src/app/(dashboard)/w/[workspaceId]/documents/[documentId]/page.tsx:32-47](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/app/(dashboard)/w/[workspaceId]/documents/[documentId]/page.tsx:32>); [apps/web/src/components/assistant/assistant-app.tsx:169-191](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/assistant/assistant-app.tsx:169>); [apps/web/src/components/assistant/chat-input.tsx:65-95](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/assistant/chat-input.tsx:65>); [apps/web/src/lib/assistant/engine.ts:515-552](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/lib/assistant/engine.ts:515>); [apps/web/src/lib/assistant/types.ts:23-34](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/lib/assistant/types.ts:23>); [apps/web/src/components/assistant/settings-dialog.tsx:157-168,190-229,246-255](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/assistant/settings-dialog.tsx:157>).

**Условия:** обычный пользователь нажимает Generate Summary/Flashcards или отправляет вопрос/вложение в AI Assistant. Документ может иметь реальный `summaryJson`, real FlashcardSet, FAILED job либо ещё PENDING parsing — интерфейс всё равно исполняет шаблон.

**Доказанный поток:** page действительно выбирает summary/jobs/sets из DB и передаёт четыре props. `DocumentDetailView` destructures только `{ document: doc, workspaceId }`. Нажатия вызывают timeout → filename-derived template/static six cards. Ни imports actions, ни API invocation нет. Чат вызывает local synchronous function, даже не передавая историю conversation. Attachment interface содержит только metadata и image object URL; ingestion не читает file text. Engine `generateFileAnalysis` использует только первое имя/ext/size, выдавая утверждения «I've analyzed» и «What I see». Probe с одинаковой metadata и различным `content` даёт одинаковый ответ; это synthetic дополнение к доказанному отсутствию bytes в реальном interface. Отдельные свежие VM executions с различными systemPrompt/temperature дают identical response.

**Expected / actual:** expected — содержимое документа анализируется provider, показаны действительные results/error states, настройки применяются или обозначены неподдерживаемыми. Actual — общие claims о качестве документа, не основанные на его содержимом; backend AI результаты игнорируются. Generated flashcards не оказываются в DB list.

**Влияние:** основная заявленная ценность продукта не реализована end to end; учебные выводы могут полностью противоречить загруженному документу; UI успешно «генерирует» при отсутствующем OpenAI/Redis/worker. Это функциональный блокер, а не проблема качества одного prompt.

**Минимальное исправление:** либо явно обозначить весь локальный experience как demo, отключив claims о настоящем анализе, либо подключить существующие server actions, показать persisted summary/sets/status/error и refresh/polling. Assistant требуется отдельный backend chat/attachment pipeline; до его появления убрать claims об анализе bytes и отключить неработающие controls. Не запускать live UI generation до устранения PF-04/PF-07.

**Проверка устранения:** synthetic document с unique content sentinel → один POST/action → одна queue job → provider получает sentinel → валидированный result появляется на странице и после reload. Persisted DB sentinel result отображается до нажатия кнопки. Provider failure даёт error, а не demo result. Вложение с отличающимся содержимым меняет provider input; настройки либо влияют на input/behavior, либо marked unsupported.

#### PF-02 — P1: S3 ключи совпадают; второй upload и его cleanup повреждают первый документ

**Файлы/строки:** [apps/web/src/server/services/document.ts:29-36,45-60](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/server/services/document.ts:29>); [apps/web/src/lib/s3.ts:47-53](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/lib/s3.ts:47>); [packages/db/prisma/schema.prisma:191-210](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/packages/db/prisma/schema.prisma:191>) (`storageKey` не unique).

**Условия:** два upload в одном workspace в одну миллисекунду с одинаковым filename либо разными именами после sanitization. Например `a b.txt` и `a?b.txt` обе превращаются в `a_b.txt`. При parallel instances timestamps совпадают независимо от скорости single-instance S3.

**Воспроизведение:** actual `createDocument`, фиксированный timestamp, in-memory S3/Prisma. Первый file `alpha`, второй `bravo` → DB rows 2, objects 1; оба storageKey равны, первый считывает `bravo`. Во втором probe у второго insert failure: S3 overwrite уже произошёл, `deleteFromS3(storageKey)` removes общий объект → valid первая DB row остаётся без файла. Результат зафиксирован в `pipeline-results.json`.

**Expected / actual:** каждый upload имеет независимый immutable key; rollback удаляет только объект своей попытки. Actual — collision приводит к overwrite, rollback/delete удаляет общий объект.

**Влияние:** необратимая потеря/подмена пользовательского содержимого внутри workspace; parser может получить чужую версию файла. Timestamp с миллисекундами не является уникальным ID. Между разными workspace этот конкретный ключ не совпадает; cross-tenant overwrite не заявлен.

**Минимальное исправление:** предварительно создать UUID/CUID document/upload ID и использовать `documents/{workspaceId}/{uploadId}`; filename хранить как metadata. `storageKey @unique` как дополнительная DB проверка. При необходимости S3 conditional put; cleanup только принадлежавшего операции ID. Не считать `@unique` достаточным исправлением: он предотвратит DB insert, но без смены key cleanup всё ещё может удалить чужой объект.

**Проверка устранения:** 100+ одновременных upload одного имени и пары с colliding sanitization при fixed timestamp создают 100+ объектов с independent bytes. Reject одного DB insert не меняет соседние объекты; delete одного документа не влияет на другие.

#### PF-03 — P1: commit документа не гарантирует durable enqueue и recoverability

**Файлы/строки:** [apps/web/src/server/services/document.ts:42-72](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/server/services/document.ts:42>); [apps/web/src/app/api/workspaces/[workspaceId]/documents/upload/route.ts:95-111](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/app/api/workspaces/[workspaceId]/documents/upload/route.ts:95>); [apps/web/src/server/actions/document.ts:14-47](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/server/actions/document.ts:14>); [apps/worker/src/jobs/parse-document.ts:34-39,95-115](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/worker/src/jobs/parse-document.ts:34>).

**Условия:** S3 и DB успешно сохранены, после чего queue.add fails; web process crashes после DB commit до add; Redis принимает job, затем теряет данные, не отражённые в DB. Последнее — сценарий для isolated integration verification, не факт текущего Redis deploy.

**Воспроизведение / data flow:** в actual service mocked enqueue rejects. Catch только пишет log; return `{ok:true,documentId}`; route отвечает 201. В DB PENDING и queue 0. `rg` по всем app/package source не обнаруживает requeue action, outbox dispatcher, reconciliation/cron. Комментарий «can be retried manually or by a cron» не подкреплён кодом. Crash window следует из последовательности независимых `await`.

**Expected / actual:** acknowledged accepted upload имеет durable план обработки либо явный recoverable error. Actual — upload успешен, parsing никогда не начнётся без ручной операции вне приложения.

**Влияние:** постоянные PENDING документы, недоступность настоящих summary/flashcards, молчаливая потеря задач. Отдельный PF-05 описывает когда request не rejects, а зависает при Redis outage.

**Минимальное исправление:** Document и durable outbox event записать в одной Prisma transaction; dispatcher повторяет enqueue по stable parse job ID, помечает доставку только после успеха. Reconcile PENDING/PROCESSING с leased timestamps и queue state, явная retry/recovery operation. UI показывает очередь/ошибку, не обещает completion.

**Проверка устранения:** в isolated environment отключить Redis до enqueue, kill web после DB commit, restart dispatcher → документ должен получить одну parse job и COMPLETED. Delete/worker crash должны завершать status либо давать operable retry; никаких PENDING/PROCESSING без owner/lease/recovery path.

#### PF-04 — P1: AI-задача не имеет стабильной identity; duplicate requests/replay создают duplicates, crashed attempt блокирует recovery

**Файлы/строки:** [apps/web/src/server/actions/summary.ts:57-75](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/server/actions/summary.ts:57>); [apps/web/src/server/actions/flashcard.ts:56-74](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/server/actions/flashcard.ts:56>); [apps/web/src/lib/queue.ts:69-81,91-103](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/lib/queue.ts:69>); [apps/worker/src/jobs/generate-summary.ts:35-51,81-98](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/worker/src/jobs/generate-summary.ts:35>); [apps/worker/src/jobs/generate-flashcards.ts:42-58,102-124](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/worker/src/jobs/generate-flashcards.ts:42>); [packages/db/prisma/schema.prisma:222-236,300-321](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/packages/db/prisma/schema.prisma:222>).

**Условия/достижимость:** processors реально используют очередь и будут запущены при backend jobs. Сейчас UI кнопки не вызывают эти actions (PF-01). Доказано поведение actual functions, но exploit публичного Server Action ID не утверждается. Defects сохраняются при direct queue producer либо после ожидаемого подключения UI.

**Доказательство трёх последствий одной причины:**

1. Action ищет AIJob PENDING/PROCESSING, но не создаёт его. AIJob создаёт worker позднее. **Даже последовательные** повторные actions до старта worker проходят guard: четыре requests → четыре queued jobs, AIJobs 0. Race не требует двух requests в один exact instant. `queue.add` не задаёт `jobId`/deduplication.
2. Каждый вызов processor создаёт новую AIJob и без проверки прошлого результата вызывает provider. Actual same job data дважды → calls 2, AIJobs 2, FlashcardSets 2. Это моделирует redelivery после committed transaction до BullMQ ack; процесс не убивался. [BullMQ прямо требует idempotent processors](https://docs.bullmq.io/patterns/idempotent-jobs).
3. Процесс потерян во время AI-call: старая AIJob остаётся PROCESSING. Replay создаёт другую row, успешно COMPLETED, старую row не меняет. Actual source probe → `[PROCESSING, COMPLETED]`; следующий action rejects «already being generated». [BullMQ переводит stalled job обратно в waiting/failed](https://docs.bullmq.io/guide/jobs/stalled), но Prisma row с этой recovery не связана. Если падает parser, BullMQ retry normally повторно обновляет тот же Document; отсутствие всякого QueueScheduler само по себе не дефект (современный BullMQ его не требует).

**Expected / actual:** logical request/operation переживает attempts/replay и имеет одну result identity; queued job сразу видим; abandoned attempt не блокирует дальнейшую работу. Actual — job rows отражают invocation count, результат создаётся повторно, stale processing остаётся навечно.

**Влияние:** повторные расходы, duplicate study sets, nondeterministic overwrite summary, permanent lockout при routine worker restart/crash. Изолированная transaction защищает запись результата конкретной попытки, но не защищает весь at-least-once workflow.

**Минимальное исправление:** резервировать AI operation в DB до enqueue (transaction с outbox, уникальный operation/request key), передавать `aiJobId`/operationId в job, stable Bull jobId. Worker claims/reclaims lease этого operation, пишет attempt отдельно; output привязан unique к operation. На повторной доставке completed result возвращается без provider call. Reconciliation завершает stale lease. Queue-side ID полезен, но DB uniqueness и completed replay guard обязательны, особенно после удаления старых queue jobs.

**Проверка устранения:** 20 sequential/concurrent requests до worker → одна logical operation/job; две redeliveries после commit → одна result row и отсутствие повторного provider call после доступного committed result. Kill во время provider → replay завершает тот же operation, устаревшая попытка не блокирует regeneration. Отдельно учитывать неизвестный исход timeout: нельзя обещать exactly-once provider billing без provider idempotency/resume guarantees.

#### PF-05 — P1: HTTP producer ждёт Redis без конечного deadline

**Файлы/строки:** [apps/web/src/lib/queue.ts:15-21,51-59,74-81,96-103](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/lib/queue.ts:15>); [apps/web/src/server/services/document.ts:64-72](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/server/services/document.ts:64>).

**Условия:** REDIS_URL недоступен/теряет связь при awaited enqueue в upload/action. Web использует consumer-конфигурацию `maxRetriesPerRequest:null`. Ioredis defaults `enableOfflineQueue:true`.

**Воспроизведение:** `redis-outage-probe.cjs` исполняет unchanged queue module с настоящими установленными BullMQ 5.74.1/ioredis 5.10.1. Safe localhost TCP endpoint close-only, никаких Redis writes. Через 1513 ms/8 connection attempts promise всё ещё pending; собственный timeout отсутствует. Бесконечное ожидание выведено из configured unlimited retries/нет deadline, а не из длительного экспериментального wait. [BullMQ отдельно предписывает finite retry для HTTP producers](https://docs.bullmq.io/guide/connections).

**Expected / actual:** request за предсказуемое время сохраняет durable accepted state либо возвращает retryable failure. Actual — waits до восстановления Redis/внешнего request timeout. PF-03 catch не достигается, пока promise не rejects.

**Влияние:** hanging uploads/actions, stalled UI, удержание web resources; retries пользователя создают дополнительные документы. Наличие/значение upstream timeout не известно; оно не заменяет transactional durability.

**Минимальное исправление:** producer Redis connection отдельно от worker: конечные retry/deadlines/offline behavior, ошибки за несколько секунд. Надёжнее write outbox из PF-03 вместо direct HTTP→Redis dependency. Простая `Promise.race` не отменяет поздний enqueue и требует идемпотентной операции.

**Проверка устранения:** тот же outage probe завершает операцию явным отказом/deferred accepted в установленный deadline; восстановление Redis не создаёт untracked duplicate. Consumer может оставаться retry-forever отдельно.

#### PF-06 — P1: multipart лимит 10 MiB проверяет только выбранный file после разбора всего body

**Файлы/строки:** [apps/web/src/app/api/workspaces/[workspaceId]/documents/upload/route.ts:51-76,83-87](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/app/api/workspaces/[workspaceId]/documents/upload/route.ts:51>); [packages/shared/src/schemas/document.ts:17,38-42](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/packages/shared/src/schemas/document.ts:17>); [apps/web/next.config.mjs:1-15](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/next.config.mjs:1>) (никакого собственного upload route limit).

**Условия:** authenticated member отправляет multipart с маленьким допустимым первым `file` и большими дополнительными parts/повторными files; либо giant body с недопустимым file. Auth/member checks до parsing полезны, но не ограничивают объём допустимого member request.

**Воспроизведение:** реальный multipart encode/parser Node20 Request, 1 byte `ok.txt` + 11 MiB `ignored` file = 11 534 654 bytes. Actual route sees только `formData.get('file')`, validation succeeds, mock createDocument получает 1 byte, response 201. Handler не проверяет число parts/files/total body и уже распарсил весь запрос к моменту size validation. Один только `Content-Length` недостаточен для streaming/chunked input.

**Expected / actual:** total bytes и number of parts ограничены до/во время memory allocation; ровно одно permitted file. Actual — остальные части silently ignored после полной materialization.

**Влияние:** обход заявленного own-body ограничения и memory/bandwidth/resource abuse со стороны member; параллельные multipart requests повышают нагрузку. Реальный memory-exhaustion не запускался. Отсутствие внешнего reverse proxy/WAF лимита **не утверждается**, production deploy недоступен.

**Минимальное исправление:** ограничить total request bytes и multipart parts на ingress и в streaming parser/request stream; reject unexpected/duplicate files, overhead-inclusive body budget. Проверять MIME sniff/signature для PDF, не считать client file.type гарантией реального формата. Byte sniffing — дополнительная рекомендация, отдельный exploit не установлен.

**Проверка устранения:** probe большого ignored part получает 413/400 до createDocument; duplicate file parts rejected; chunked body без Content-Length имеет тот же limit; допускается один 10 MiB файл с разрешённым bounded overhead.

#### PF-07 — P2: successful AI attempts могут иметь нулевой/утерянный cost, retries/timeout не контролируются на уровне операции

**Файлы/строки:** [packages/ai/src/provider.ts:28-44,53-57,84-93,98-126,142-153](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/packages/ai/src/provider.ts:28>); [apps/worker/src/jobs/generate-summary.ts:71-75,81-98,113-121](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/worker/src/jobs/generate-summary.ts:71>); [apps/worker/src/jobs/generate-flashcards.ts:91-96,102-124,139-147](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/worker/src/jobs/generate-flashcards.ts:91>); [apps/web/src/lib/queue.ts:78-79,100-101](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/lib/queue.ts:78>).

**Условия:** API response получил usage, но JSON invalid/shape validation throws; response valid, но DB transaction fails; deployment задаёт supported OpenAI model вне трёх hardcoded pricing keys; transient transport/API failures вызывают SDK + Bull retries.

**Воспроизведение:** actual provider после response с 2148 billed synthetic tokens/`finish_reason:length` throws invalid JSON Error без usage/meta. Actual summary worker после successful provider и transaction failure writes только FAILED/error: tokenUsage/cost отсутствуют. Valid mocked `gpt-4.1` response 200 tokens → `estimatedCost=0`, поскольку `estimateCost` возвращает 0 для неизвестного pricing key. Модель gpt-4.1 не бесплатна: [официальная карточка указывает input/output стоимость](https://developers.openai.com/api/docs/models/gpt-4.1).

Installed SDK `packages/ai/node_modules/openai/src/client.ts:437,447,1121` подтверждает timeout 600000 ms и maxRetries 2; app их не задаёт. Actual SDK с mocked 500 fetch делает шесть transport attempts за две mocked Bull attempts. [Официальная документация SDK](https://github.com/openai/openai-node/blob/main/docs/configuration.md) описывает default retries/timeout. Нельзя считать каждый 500 оплаченной генерацией; billing неизвестного исхода при потерянном response/timeout остаётся риском, не экспериментально доказанным списанием.

**Expected / actual:** attempt-level telemetry учитывает полученный usage даже при output validation/DB errors; неизвестная pricing model помечается unknown, не free; retries/deadline/budget explicit. Actual — cost записывается только в result transaction после всех parsing шагов, failure обходится без usage; model/version/requestId не persisted на AIJob; множитель retries не отражён в логической job budget.

**Влияние:** отчёт о расходах занижает billing, ошибки provider/output/DB можно многократно повторять без видимой стоимости; долгие hangs занимают оба AI worker concurrency slots. При double retry budget операция может совершить до 6 HTTP requests, каждый с default десятиминутным deadline. Это не количественное измерение production costs.

Дополнительное подтверждённое privacy последствие error handling: [packages/ai/src/provider.ts:108](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/packages/ai/src/provider.ts:108>) включает первые 200 characters invalid generated output в Error.message; workers сохраняют сообщение в AIJob.errorMessage ([apps/worker/src/jobs/generate-summary.ts:105-120](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/worker/src/jobs/generate-summary.ts:105>), [apps/worker/src/jobs/generate-flashcards.ts:131-146](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/worker/src/jobs/generate-flashcards.ts:131>)) и пишут Error в logs. Эти characters могут включать содержимое частного документа. Публичная утечка не установлена, но sensitive source fragments оказываются в persisted diagnostic channels без redaction/retention. Безопаснее log error category/requestId и bounded non-content diagnostics.

**Минимальное исправление:** выделить durable AI attempt record с model/requestId/input-output usage/cost status; извлечь metadata до validation и прикрепить к typed errors; хранить result/error независимо от cost ledger. Для unknown pricing `null/UNKNOWN` либо config validation. Явно задать SDK retries/timeout и суммарный operation deadline/budget, errors classified by retryability, never retry configuration/validation бесконтрольно. Quotas/rate limiting coordinated with AppSec.

**Проверка устранения:** invalid JSON, wrong schema, finish_reason length/refusal, DB failure, timeout/lost response, retry-success имеют attempt records; полученный usage никуда не исчезает, unknown billing не отображается `$0`. Mock SDK retry probe подтверждает установленный transport budget. В crash window между received response и durable write невозможно восстановить exact usage только из процесса; нужен documented reconciliation по provider/project usage и status unknown.

#### PF-08 — P1: delete без durable saga теряет файл либо забывает неудалённый объект

**Файлы/строки:** [apps/web/src/server/services/document.ts:79-101](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/server/services/document.ts:79>); [apps/web/src/server/actions/document.ts:31-48](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/server/actions/document.ts:31>).

**Условия:** S3 delete succeeds, DB delete fails; S3 delete fails, DB succeeds; либо process dies между этими шагами. In-flight queue jobs могут продолжить работу по deleted metadata.

**Воспроизведение:** два actual service probes. Mock S3 deletion outage → action service ok true, DB rows 0, S3 objects 1: исчезает единственная DB reference. DB deletion outage после S3 success → operation throws, document остаётся в DB, S3 objects 0. Cleanup/reconciliation/idempotent tombstone code отсутствует.

**Expected / actual:** accepted deletion завершает eventual cleanup; failed deletion сохраняет recoverability/явный deleting state. Actual — irreversible binary delete до DB acknowledgement либо orphan object без ссылки и операционного retry.

**Влияние:** потеря исходного документа при DB outage, indefinite retention забытых пользовательских файлов при S3 outage, невозможно восстановить их связь обычным DB lookup. Бэкапы/versioning S3 deployment не проверены и могут смягчать recovery; они не отменяют логический дефект.

**Минимальное исправление:** DB tombstone `DELETING` + durable deletion outbox в transaction, async idempotent S3 deletion/retry, затем final DB purge. Tombstone хранит storageKey до подтверждения. Worker checks deletion/version state, queued operations cancelled/ignored; derive retention policy для results отдельно.

**Проверка устранения:** независимо inject DB/S3 failures и kill между шагами; accepted deletion после recovery очищает object и metadata, failed deletion не уничтожает доступный файл без recoverable tombstone. Multiple delete/retries без adverse effect.

#### PF-09 — P2: Redis job history сохраняется неограниченно

**Файлы/строки:** [apps/web/src/lib/queue.ts:52-59,74-81,96-103](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/lib/queue.ts:52>); [apps/worker/src/index.ts:20-43,59-89](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/worker/src/index.ts:20>); [packages/db/prisma/schema.prisma:300-321](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/packages/db/prisma/schema.prisma:300>).

**Условия:** обычная длительная эксплуатация с большим количеством document/AI tasks, включая failed jobs. В Queue/Worker options нет `removeOnComplete`, `removeOnFail`, periodic cleanup. В приложении также нет AIJob retention/deletion API, а `Document` relation удаляет ссылку через SetNull, сохраняя outputJson.

**Доказательство:** статически все три producer options ограничивают только attempts/backoff; complete/fail handlers только log. [BullMQ сохраняет finished jobs до configured removal](https://docs.bullmq.io/guide/queues/auto-removal-of-jobs); installed library source поддерживает те же options. Рост памяти actual production Redis и чужой external cleanup не измерялись. Документальные outputs retention считается отсутствующим в repo policy, а не доказанным нарушением установленного SLA.

**Expected / actual:** ограниченные history age/count и понятная политика retention. Actual — каждый completed/failed job может оставаться без конца до external/manual purge; DB AIJob outputs тоже без встроенного expiry.

**Влияние:** монотонный Redis history рост/персистентный sensitive metadata retention, eventual memory limits и отказ очереди; увеличение AIJob таблицы. Расходы/объём зависят от нагрузок и deployment settings.

**Минимальное исправление:** configured finite age/count successful/failed jobs; audit ledger сохранять с отдельным purpose retention. Durable DB idempotence должна работать и после Redis auto-removal (PF-04). Определить удаление parsedText/outputJson/cache при user-requested erasure и policy expiry.

**Проверка устранения:** enqueue large synthetic batch в isolated Redis → history/count ограничен; failure diagnostics остаются на нужный retention window, а operation dedupe сохраняется после queue purge; policy purge удаляет выбранные sensitive artifacts.

#### PF-10 — P2: output validation принимает пустые/бессодержательные учебные результаты

**Файлы/строки:** [packages/ai/src/prompts/summary.ts:84-129](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/packages/ai/src/prompts/summary.ts:84>); [packages/ai/src/prompts/flashcard.ts:107-141](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/packages/ai/src/prompts/flashcard.ts:107>).

**Условия:** provider возвращает structurally JSON output со строками из пробелов, пустыми section heading/content, keyTerms all nonstring/blank либо количеством карточек, противоречащим договору prompt.

**Воспроизведение:** actual `parseSummaryOutput({title:' ',tldr:' ',sections:[{heading:'',content:''}],keyTerms:[]})` succeeds. Actual `parseFlashcardOutput({title:' ',cards:[{front:' ',back:' '}]})` succeeds. Sections лишь strings, keyTerms invalid elements silently filtered, mandatory title/front/back требуют raw length>0 без trim. Prompt обещает 3–6 sections/10–30 cards, validator проверяет только nonempty array.

**Expected / actual:** meaningful обязательные поля/согласованный contract либо explicit quality failure. Actual — blank artifacts получают COMPLETED и могут попасть в persistent DB.

**Влияние:** empty/unusable study content, retry отсутствует поскольку output считается успешным; контракт качества молча расходится с prompt. Реальную вероятность такого OpenAI response не измеряли.

**Минимальное исправление:** schema с trimmed mandatory strings, deliberate count/length limits и validated keyTerms. Диапазон 10–30 должен быть либо enforced, либо явно ослаблен для коротких источников; не считать обязательное число карточек универсальным независимо от source density. Refusal/finish_reason отдельно классифицировать; не терять usage при rejecting output (PF-07).

**Проверка устранения:** blank/missing/wrong types/count overflow возвращают typed validation failure, valid reasonable sparse result принят по явному policy; failure usage сохраняется.

### 4.4. Интерфейс и пользовательские сценарии

#### FE-01 — P1: composer нового чата недоступен в основном viewport

- **Файлы/строки:** [apps/web/src/components/assistant/welcome-screen.tsx:46,63-71](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/assistant/welcome-screen.tsx:46>); [apps/web/src/components/assistant/chat-view.tsx:43,75-85](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/assistant/chat-view.tsx:43>); [apps/web/src/components/assistant/assistant-app.tsx:387](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/assistant/assistant-app.tsx:387>).
- **Условия:** новая беседа без сообщений; eight prompt cards сохраняют intrinsic min-height, body не получает scroll, весь assistant wrapper имеет fixed viewport height/overflow-hidden. Desktop дополнительно теряет544px на два sidebar.
- **Воспроизведение:** [probe-ui-visuals.js](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/probe-ui-visuals.js>). На390×844 textarea top1335/bottom1379, на1024×900 top945/bottom989, на1440×900 top871/bottom915. document body height совпадает с viewport, обычного vertical scroll для composer нет. На768×1024 top953/bottom997 — доступен. Light/dark одинаковые результаты. Screenshots `assistant-new-390-light.png`, `assistant-new-1024-dark.png`, `assistant-new-1440-light.png`.
- **Expected/actual:** пользователь нового чата всегда может ввести сообщение; фактически composer полностью или частично ниже viewport, mobile показывает только часть prompt chips. В активной беседе тот же composer помещается: это дефект welcome layout, а не отсутствующей инфраструктуры.
- **Влияние:** core chat flow на mobile не работает обычным способом; пользователь вынужден сначала выбрать canned prompt либо менять viewport.
- **Минимальное исправление:** сделать chat body `min-h-0 flex-1 overflow-y-auto`, welcome содержимым этого scroll area, composer `shrink-0`; уменьшить/свернуть количество cards на mobile при необходимости. Не добавлять body overflow к странице с фиксированным chat wrapper.
- **Проверка устранения:** новый чат на390×844,768×1024,1024×900,1440×900 + 200% zoom/открытая клавиатура; textarea/send доступны, prompts могут прокручиваться, outer document не растёт/не clips focus.

#### FE-02 — P1: mobile лишён workspace navigation

- **Файлы/строки:** [apps/web/src/components/layout/app-shell.tsx:27-37,42-56](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/layout/app-shell.tsx:27>); [apps/web/src/components/workspace/sidebar-workspace-nav.tsx:44-126](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/workspace/sidebar-workspace-nav.tsx:44>).
- **Условия:** viewport<768px, любая authenticated page.
- **Доказательство:** единственная navigation/switcher находится внутри `aside.hidden.md:block`; mobile header содержит только brand/theme/logout. На390px visible workspaceNavLinks=[]; в assistant кнопка Open chats открывает только conversation history, не Dashboard/Tasks/Notes/Documents/Flashcards/workspace switcher.
- **Expected/actual:** все разделы и workspace switcher достижимы на телефоне; actual отсутствуют и mobile menu trigger/альтернатива.
- **Влияние:** пользователь не может обычной navigation перейти к большинству функций или другому workspace, даже если backend полностью исправен.
- **Минимальное исправление:** добавить keyboard-accessible mobile navigation Sheet/Drawer, используя ту же workspace nav и switcher; видимый trigger, active route, focus return, Escape.
- **Проверка устранения:** на390px зайти из любого раздела во все другие и сменить workspace исключительно pointer/keyboard; links существуют в accessibility tree и видны после открытия mobile menu.

#### FE-03 — P2: общая content column и плотные rows дают горизонтальное переполнение

- **Файлы/строки:** [apps/web/src/components/layout/app-shell.tsx:40,60](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/layout/app-shell.tsx:40>); [apps/web/src/components/task/task-list.tsx:31,72,98-110](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/task/task-list.tsx:31>); [apps/web/src/components/document/document-list.tsx:64,104,124-145](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/document/document-list.tsx:64>); [apps/web/src/app/(dashboard)/w/[workspaceId]/dashboard/page.tsx:317,368,408,426](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/app/(dashboard)/w/[workspaceId]/dashboard/page.tsx:317>).
- **Условия:** narrow content area; задача с обычным title/status/priority/dueDate или документ с summary/status/delete controls.
- **Воспроизведение:** [probe-ui-pages.js](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/probe-ui-pages.js>) фиксирует390px scrollWidth: dashboard419, tasks587, documents495; на768px dashboard807/tasks843. Одинаково вlight/dark. Fixture task обычной длины, а не искусственный многокилобайтный payload; dashboard отрендерен из original static source. Screenshots `tasks-390-light.png`, `documents-390-light.png` показывают New Task/Upload/meta/header controls уходящими за правую границу.
- **Expected/actual:** основной content/button controls в ширинеviewport, rows переносятся/перестраиваются; actual родитель flex item не имеет `min-w-0`, dense row keeps `shrink-0`, растягивая весьshell.
- **Влияние:** основные действия и информация clipped, появляется horizontal page scrolling, header/logout также смещаются.
- **Минимальное исправление:** ограничить main column `min-w-0`, reflow list headers и row meta в column/grid наsmall widths; responsive dashboard table columns учитывать ширину после256pxsidebar, а не только viewport breakpoint.
- **Проверка устранения:** перечисленные fixture rows + длинныеfilename/title, все четыреwidths; `documentElement.scrollWidth <= innerWidth`, primary actions целиком видимы, status/date не теряются.

#### FE-04 — P2: глобальная flashcard keyboard обработка перехватывает activation других controls

- **Файлы/строки:** [apps/web/src/components/flashcard/flashcard-viewer.tsx:66-86](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/flashcard/flashcard-viewer.tsx:66>).
- **Условия:** viewer mounted, focus на Next/Previous/Restart/Shuffle или другом interactive element страницы; Enter/Space.
- **Воспроизведение:** [probe-ui-interactions.js](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/probe-ui-interactions.js>): focus Next card → Enter → progress 1/2, flipped=true; mouse click same Next → progress 2/2. Window listener любого Enter вызывает preventDefault и flip независимо от target.
- **Expected/actual:** Enter активирует focused button; actual переворачивает другую карточку и отменяет native button click. Аналогичный перехват мешает workspace/header controls.
- **Влияние:** keyboard пользователи не могут стандартно пользоваться controls; visual focus не соответствует действию.
- **Минимальное исправление:** flip клавиши обрабатывать на focusable card; глобальные arrow shortcuts ограничить viewer и исключить buttons/links/inputs/selects/textareas/contenteditable, сохранить native activation controls.
- **Проверка устранения:** keyboard-only next/prev/restart/shuffle; Enter/Space focused button выполняют назначенное действие, card focus flip работает; header/workspaces не меняют card.

#### FE-05 — P2: mobile chat drawer не имеет modal focus/keyboard semantics

- **Файлы/строки:** [apps/web/src/components/assistant/assistant-app.tsx:403-427](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/assistant/assistant-app.tsx:403>).
- **Условия:** width<1024px → Open chats.
- **Воспроизведение:** 390px, открыть drawer → Escape: Close sidebar still visible, dialogCount=0. 20 Tab переходов уходят в GPT-4.1/New chat/message buttons/composer/Sign Out под backdrop. [ui-interactions-results.txt](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/ui-interactions-results.txt>), screenshot drawer.
- **Expected/actual:** modal drawer имеет name/role, focus inside, Escape close, focus return; actual plain fixed div/backdrop без trap/inert/Escape.
- **Влияние:** keyboard/screenreader navigation попадает на фон, opaque overlay не соответствует фактическому focus, Escape не работает.
- **Минимальное исправление:** заменить custom overlay на существующий Radix Dialog/Sheet с Title, controlled open, focus return, Escape; если drawer intentionally nonmodal, убрать modal backdrop и предоставить правильную navigation semantics.
- **Проверка устранения:** focus после open в drawer, Tab/ShiftTab не уходят на фон, Escape закрывает, focus returns Open chats. Task dialog в том же стенде уже успешно прошёл этот контроль.

#### FE-06 — P2: значимые controls не имеют доступного имени

- **Файлы/строки:** [apps/web/src/components/assistant/model-selector.tsx:33-44](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/assistant/model-selector.tsx:33>); [apps/web/src/components/assistant/settings-dialog.tsx:96-106,158-171,177-203,219-240](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/assistant/settings-dialog.tsx:96>); [apps/web/src/components/document/document-list.tsx:135-145](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/document/document-list.tsx:135>).
- **Условия:** model picker <640px; любая settings dialog; document delete row.
- **Доказательство:** model name `hidden sm:inline` — mobile snapshot button без name. Settings language/default model select, temperature range, 5 switches имеют labels=[], ariaLabel=null, ariaLabelledBy=null; Row label сделан p. Document trash button name отсутствует (`unnamedButtons=1` во всех dimensions). [ui-final-results.txt](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/ui-final-results.txt>), [ui-pages-results.txt](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/ui-pages-results.txt>).
- **Expected/actual:** control сообщает purpose/название; actual узнать назначение из accessibility tree невозможно. Visual adjacent label не создаёт programmatic association.
- **Влияние:** screenreader пользователи не различают settings и delete/model controls.
- **Минимальное исправление:** connected label/id или aria-labelledby для каждого control; mobile model trigger aria-label с selected model; delete button aria-label с filename; switches должны принимать label/id.
- **Проверка устранения:** accessibility snapshot/axe checks должны дать nonempty unique names; keyboard/screenreader проверка каждой settings строки.

#### FE-07 — P2: переключение истории оставляет бесконечный persistent streaming marker

- **Файлы/строки:** [apps/web/src/components/assistant/assistant-app.tsx:129-150,302-318](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/assistant/assistant-app.tsx:129>); [apps/web/src/lib/assistant/storage.ts:26-35](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/lib/assistant/storage.ts:26>); [apps/web/src/components/assistant/message-bubble.tsx:76,170-180](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/assistant/message-bubble.tsx:76>).
- **Условия:** response уже streaming → выбрать другую history или New chat → вернуться.
- **Воспроизведение:** [probe-ui-functional.js](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/probe-ui-functional.js>): wasStreamingBeforeHistorySwitch=true; после switch/reopen caretCount=1, stopButtonCount=0, streamingRecords=1 в localStorage. Screenshot `assistant-history-interrupted-1440.png`. Handler cancels timers/flags, но не finalizes old message; stripVolatile удаляет object URL, status не удаляет.
- **Expected/actual:** interrupted response имеет finished/cancelled state с recovery; actual вечный caret, message actions не показаны из-за streaming=true, Stop недоступен. Состояние сохраняется через reload.
- **Влияние:** пользователь видит ложную ongoing generation; partial answer невозможно отменить через обычный control.
- **Минимальное исправление:** единый cancel response handler завершает исходный conv message перед switch/new/delete/unmount; не persist transient streaming status либо rehydrate как interrupted.
- **Проверка устранения:** stop thinking, stop streaming, switch history, new chat, delete active, reload; нет streaming status без active work, caret исчезает, partial response сохраняется с explicit cancelled indicator.

#### FE-08 — P3: keyboard focus на chat options остаётся невидимым

- **Файл/строки:** [apps/web/src/components/assistant/assistant-sidebar.tsx:221-229](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/assistant/assistant-sidebar.tsx:221>).
- **Условия:** inactive history row, Tab на Chat options без pointer hover.
- **Воспроизведение:** [probe-ui-final.js](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/probe-ui-final.js>): focused=true, computed opacity=0 на inactive button. Source показывает только group-hover opacity 100, focus variant отсутствует.
- **Expected/actual:** focused control видим; actual focus существует на полностью transparent button.
- **Влияние:** keyboard пользователь теряет место в navigation, не видит доступного menu.
- **Минимальное исправление:** focus-visible:opacity-100/group-focus-within и focus ring; при необходимости оставить menu always visible на touch.
- **Проверка устранения:** Tab через все history rows без mousemove; каждый focused options видим, menu open/close возвращает focus.

#### FE-09 — P3: две независимые theme state делают переключатель несогласованным

- **Файлы/строки:** [apps/web/src/components/layout/theme-toggle.tsx:10,21-35](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/layout/theme-toggle.tsx:10>); [apps/web/src/components/assistant/assistant-app.tsx:76-93](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/components/assistant/assistant-app.tsx:76>); [apps/web/src/app/layout.tsx:10-19](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/apps/web/src/app/layout.tsx:10>).
- **Условия:** global campusforge-theme=light, Assistant settings.theme=dark (достигается через settings), assistant mount.
- **Воспроизведение:** [probe-ui-final.js](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/probe-ui-final.js>): rootDark=true, toggleLabel="Switch to dark mode". Assistant imperatively sets root class, но ThemeToggle local state остаётся light; первый toggle снова sets dark и не меняет appearance.
- **Expected/actual:** одна effective theme и sync control; actual theme/icon/label/первый клик могут противоречить друг другу, вне assistant theme возвращается global value.
- **Влияние:** theme настройки нестабильны, visible control не соответствует действию; accessibility name неправдив.
- **Минимальное исправление:** один shared theme provider/storage key; Assistant settings должен вызывать provider, а не менять document element независимо.
- **Проверка устранения:** theme через global toggle/settings/system, route away/back, reload; appearance, icon, label, colorScheme соответствуют effective value первым кликом.

### 4.5. Существенные уточнения и границы deployment проверки

#### Отличие дефекта приложения от локальной установки

Текущая рабочая копия: build FAIL на sign-in async transition; web tsc 10 TS2345; остальные четыре packages tsc PASS. Это реальные выполненные результаты, но их нельзя переносить на любой чистый checkout.

Чистая source snapshot: `pnpm install --frozen-lockfile` PASS; первая build FAIL с implicit-any у workspace map из-за ещё не generated Prisma Client; `prisma generate` (без DB connection/migration) PASS; повторная build PASS, web tsc PASS. До prod-only install все 159 копированных source/config SHA совпадали с исходными. В главном checkout эти файлы также остались неизменны.

Независимый compiler probe установил: в исходном `.pnpm/node_modules/@types` react/react-dom оказались пустыми обычными directories; отсутствует experimental type resolution, ожидаемый Next canary overload не загружается. Подмена только in-memory filesystem resolution на реальные уже установленные direct types убирает 10 diagnostics. [evidence/quality-crosscheck.json](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/evidence/quality-crosscheck.json>), `types-original.json`, `types-clean.json`, [quality-verification.md](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/quality-verification.md>) описывают проверку. Мы не чинили эти directories.

Runtime/browser: Next 14.2.35 App Router использует React `18.3.0-canary-178c267a4e-20241218`; nominal dependency React 18.3.1 не описывает весь runtime. Actual deferred task action удерживает pending/disabled, отправлен один POST, error отображается. Поэтому прежняя гипотеза о неизбежных duplicate submits от async transition отвергнута для проверенного Next scenario. [React 18 standalone docs](https://18.react.dev/reference/react/useTransition) требуют synchronous scope, но это не заменяет измерения compiled Next runtime.

#### Provisioning/deployment: проверенные пробелы и пределы

- [infra/docker-compose.yml:1-2](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/infra/docker-compose.yml:1>) явно local development; PostgreSQL/Redis healthchecks присутствуют, MinIO healthcheck/init bucket отсутствуют (`:37-49`). Web/worker services в compose нет. Default passwords и порты — локальная конфигурация; публичная production экспозиция не доказана.
- `.env.example` документирует env names, но runbook/README, CI workflows, release artifact instructions, migration deploy script отсутствуют. В db scripts есть migrate dev/push/reset, но нет migrate deploy. Эти команды не исполнялись на существующей БД.
- Prisma schema и обе migrations просмотрены: initial tables/enums/indexes/FKs и затем summaryJson JSONB. Validate PASS проверяет schema syntax, не корректность применения SQL к deployment DB. Реальные migration deploy/rollback/backup restore не проверены.
- S3 PutObject используется с configured bucket, CreateBucket/HeadBucket/init helper нигде нет. Поэтому fresh MinIO volume потребует внешнего provisioning bucket. Мы не утверждаем, что production bucket отсутствует: его доступность не проверена.
- DB/S3 backup/versioning, Redis durability/eviction, monitoring/alerts, worker readiness, reverse proxy body limits/TLS, секреты deployment и его OS не доступны. Это условия допуска, не выдуманные текущие incident findings.
- Дополнительный запуск clean built server на loopback был отклонён автоматическим review (`blocked by policy`, без конкретной причины). Не обходился и не засчитан. Browser inspection выполнен на разрешённом isolated Next dev стенде. Заявленные prod-only scripts действительно запускались и падали до серверной инициализации.

## 5. Что работает, что является demo и что не проверено

### Подтверждено выполнением, с обозначенными границами

- Чистый frozen install и **web production build после Prisma generation**. Это не успешный production запуск всего monorepo.
- Public landing/sign-in/sign-up, обе темы и четыре viewport отрендерены; у auth pages горизонтального overflow нет. Closed screens используют оригинальные компоненты и styles; 57/57 проверенных UI source hashes совпали со стендом.
- Настоящий Next App Router поддерживает pending проверенного deferred async task action: button disabled, один POST, mock error отображён. Radix task dialog держит focus, закрывается Escape. Заявление про все forms/все latency/error/abort scenarios не делается.
- Flashcards pointer navigation/flip и обычный active-chat composer доступны на проверенных размерах. Stop во время thinking отменяет локальный timer: это отмена demo, не provider streaming cancellation.
- Actual source authorization guards отклоняют anonymous/nonmember и foreign-object cases в шести actions. Client JWT update не меняет id/ADMIN role. Password hashing настоящий bcrypt cost12; salt используется, hash в session не возвращается.
- Actual TXT processor скачивает mocked byte stream, декодирует UTF-8, повторный вызов завершает тот же Document. Actual summary/flashcard workers вместе с настоящими prompts/provider/validators транслируют synthetic provider JSON в DB transactions и COMPLETED artifacts; две positive probe cases. PostgreSQL boundary в памяти, provider responses synthetic.
- Backend принимает parsedText, имеет JSON-mode provider, output max tokens2048/4096, сохраняет successful token usage/cost. Плохие response/DB failure paths показывают пробелы PF-07/PF-10.
- React text escaping защищает raw HTML в notes/messages; static theme script не содержит user-controlled interpolation. Auth API CSRF и Next Server Action Origin protections присутствуют в установленном framework source.

### Demo/незавершённые сценарии

| Сценарий | Реальный поток сейчас | Чего нет |
|---|---|---|
| Chat question | UI → local keyword/template engine → timers → localStorage → UI | Chat action/API/queue/worker/provider/server conversation DB отсутствуют; conversation context не передаётся provider |
| Chat attachment | File picker → name/ext/size/image object URL → общий template | Document bytes не читаются для анализа, server ingestion/provider context отсутствуют |
| Model picker/settings | Меняет client model label/tint/persona и часть локального state | Не выбирает provider/model backend; language/temperature/system prompt/memory/notifications не дают обещанного AI эффекта |
| Document summary/cards button | UI → setTimeout → filename-derived summary/static cards → local state | Existing server actions не вызываются, true DB summary/jobs/sets props проигнорированы; результата в списке DB нет |
| Backend document AI | Action → Redis → worker → provider → validation → DB | Функции существуют и проверены mocks, но основной UI их не использует; live full integration не выполнена |
| Workspace dashboard | Auth/workspace query → module constants | Domain count/list aggregation; RD-05 |
| Quiz/research/resume/analytics | Models/enums в schema | Обнаруженного законченного UI/API/worker scenario нет; schema declaration не равна feature |

**Контент вложений в действующем backend:** PDF извлекается через pdf-parse, TXT/MD через UTF-8; OCR для scanned PDFs нет. Long text prompts ограничиваются примерно24 000 characters: это character heuristic, не измеренный token budget. Tail документа отрезается, note о truncation получает prompt; UI не сообщает пользователю scope, особенно при текущем demo. Real PDF/scanned/OCR/model-context behavior не тестировались.

### Подтверждённые gaps и гипотезы, не выданные за exploits

- **Markdown URL schemes:** actual renderer сохраняет javascript/data href, raw HTML escaped. Доставка attack payload жертве и click execution не подтверждены; нынешний engine локальный. До подключения внешнего AI необходим central URL allowlist. Это SEC-H01, отдельно от уже воспроизведённого callback XSS.
- **Upload CSRF:** Route Handler не проверяет Origin/token, но default auth cookie SameSite=Lax препятствует unrelated-site POST. Same-site compromised subdomain остаётся conditional threat; domain policy неизвестна. MIME доверяет клиенту, но raw object browser HTML delivery не найден: stored-XSS exploit не заявлен.
- **Роли/ревокация:** MEMBER может изменять workspace content по текущему коду. OWNER-only policy не задана, поэтому это не автоматически privilege escalation. ADMIN routes отсутствуют; future role revocation/session invalidation требуют отдельных tests.
- **Parser abuse/prompt injection:** timeout/memory isolation для PDF parser не реализованы; реальные adversarial PDFs/bombs не запускались. Document prompt injection не доказан как доступ к инструментам/другому tenant: provider работает с текстом, без agent tools. Vendored PDF.js advisory reachability, если установлена, разобрана в dependency triage; один npm audit не покрывает embedded код.
- **Worker payload trust/unknown job names:** Redis payload identity не перечитывается полностью из DB, unknown switch case resolves с warning. Existing producers отправляют известные names, hostile privileged Redis writer уже имеет инфраструктурный доступ. Публичный exploit не доказан; defensive validation/throw/alerts нужны перед новыми producers.
- **Performance:** некоторые document list queries не имеют metadata-select/pagination и тянут parsedText/summaryJson. Вероятный рост memory/traffic следует из source, но benchmark/production outage не проверены. Lighthouse, profiling, load capacity и manual screen reader/WCAG contrast audit не выполнялись.
- **Retention semantics:** удаление исходника может по продуктовой политике сохранять flashcards/summary; без policy это не автоматически нарушение erase. Однако PF-08/PF-09 доказывают orphan/безграничный history механизм. Deployment backups/S3 versioning/Redis AOF/eviction могут смягчить последствия, но не исследованы.

### Что осталось непроверенным

Live sign-up/sign-in/session/logout с реальной БД; application CRUD на PostgreSQL; настоящий MinIO bucket, upload/download/delete; реальная Redis queue delivery/lock/stalled handling; worker kill/restart integration; SQL migrations на disposable PostgreSQL; live paid provider и provider stream cancellation; production browser/server startup с действующей инфраструктурой; actual reverse proxy limits/TLS/headers; backups/restore, monitoring и внешний deployment.

Fixtures содержат fake user/auth actions и возвращают synthetic error/success. Они доказывают rendered UI и определённые real-source code paths, **не успех настоящей authentication или сохранения пользовательских данных**. Notes editor и все edge cases не прошли полную visual matrix. Непроверенные пункты нельзя закрыть одним успешным build или этим отчётом.

## 6. План исправлений по зависимостям и критерии допуска

Исправления в рамках аудита не применялись. Ниже порядок работы для следующего implementation этапа.

| Этап | Конкретная работа | Зависимость | Проверяемый критерий |
|---|---|---|---|
| 0. Зафиксировать baseline | Сохранить текущие исходники в Git/reviewable repository, lock и evidence; создать runbook/CI; восстановить broken local install | До дальнейшей разработки | Существующий commit+remote/backup, fresh checkout собирается без зависимости от старых node_modules, full package typecheck/lint/format/test |
| 1. Закрыть immediate AppSec | Callback URL allowlist, user/workspace storage namespace+logout policy, auth/signup rate budgets; обновить affected dependencies | Можно параллельно с data design | Marker/XSS callback не исполняется, A/ws1→A/ws2→B history не пересекается, превышение budget не вызывает bcrypt/DB; current primary advisory triage закрыта |
| 2. Защитить upload/delete | Immutable UUID keys, whole-body/part streaming limits; upload outbox; delete tombstone/outbox; finite HTTP Redis deadline | До подключения real AI UI | Collision/cleanup/deletion/11MiB probes проходят; DB/S3/Redis fault matrix и crash windows recoverable; нет acknowledged потерянной обработки |
| 3. Нормализовать AI lifecycle | DB logical operation ID до enqueue, stable Bull ID, leases/reconciliation, result uniqueness, per-attempt accounting/errors/deadlines/quotas, stricter content validation | Использует outbox из этапа2 | 20 duplicates → одна операция, redelivery completed → тот же результат, worker crash не оставляет blocking PROCESSING; received usage сохранён при validation/DB failure |
| 4. Восстановить правдивый UI | Отображать existing persisted summary/jobs/sets и реальные errors; generation action/polling; scoped dashboard queries; chat backend/attachment ingestion либо честная маркировка demo | Real generation после этапов2–3 | Unique document sentinel достигает provider input/DB/UI; reload сохраняет true results; два разных content inputs различаются; current empty workspace не показывает invented metrics |
| 5. Frontend исправления | FE-01/02 composer/mobile nav; FE-03 responsive rows; FE-04/05/06 keyboard/modal/names; FE-07 cancellation; затем FE-08/09 | Можно layout исправления параллельно; финальная QA после real UI | Все widths/light-dark без page overflow, composer доступен, keyboard links/buttons/dialogs правильны, history switch/reload без stale streaming, names/focus видимы |
| 6. Production packaging/provisioning | RD-01 worker/runtime deps/artifacts, RD-04 env contract; Prisma generate/build/migrate deploy; bucket init; worker/web readiness; queue retention и recovery/backup runbook | Схема этапов2–3 и исправленные dependencies | Empty isolated environment → documented install/provision/start → both ready; production-only dependencies достаточны; synthetic queued document flow, restart recovery и restore подтверждены |
| 7. Release rehearsal | Disposable PostgreSQL/Redis/MinIO, production artifact, automated regression из сохранённых probes и браузерная повторная QA | После всех этапов | Все P1/P2 закрыты либо формально устранены из scope; ни одна advertised core feature не является необозначенной demo; real infrastructure fault/tenant/UI tests green |

**Критерий допуска:** работоспособный fresh checkout/release artifact; закрыты callback/privacy/data-loss/queue lifecycle blockers; declared startup работает после prod-only install; healthchecks подтверждают web, worker, DB/Redis/bucket; actual actions сохраняют scoped данные и восстановление после faults; primary dependency advisories triaged/patched; UI правдиво показывает results/errors; полная visual/keyboard matrix пройдена. Наличие тестов без этих сценариев не заменяет критерий.

Проверка provider contract с mocks — обязательный безопасный этап. Для обещания именно live AI потребуется отдельный разрешённый smoke с ограниченным бюджетом и проверкой фактического usage; данный аудит paid calls не выполнял. Migration rehearsal только на disposable БД, до отдельного согласованного production release. При сохранении demo scope его нужно явно указать пользователю, не подменяя результат с реальным документом.

### Артефакты и воспроизведение

Подробные области и raw evidence находятся в `docs/audit-2026-10-04-independent/`:

- [agent-security.md](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/agent-security.md>), [agent-pipeline.md](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/agent-pipeline.md>), [agent-frontend.md](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/agent-frontend.md>), [root-findings.md](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/root-findings.md>), [quality-verification.md](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/quality-verification.md>), [dependency-triage.md](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/dependency-triage.md>).
- [security-probes.cjs](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/security-probes.cjs>) → [evidence/security-probes.json](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/evidence/security-probes.json>); [quality-crosscheck.cjs](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/quality-crosscheck.cjs>) → [evidence/quality-crosscheck.json](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/evidence/quality-crosscheck.json>).
- [probes/pipeline-probes.cjs](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/probes/pipeline-probes.cjs>) → [probes/pipeline-results.json](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/probes/pipeline-results.json>); [probes/redis-outage-probe.cjs](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/probes/redis-outage-probe.cjs>) → [probes/redis-outage-results.json](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/probes/redis-outage-results.json>). Scripts используют mocks/isolated endpoint, не real `.env`.
- [bootstrap-ui-stand.ps1](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/bootstrap-ui-stand.ps1>)/[run-ui-stand.ps1](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/run-ui-stand.ps1>), пять `probe-ui-*.js`, `ui-*-results.txt`, [evidence/ui-source-hashes.json](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/evidence/ui-source-hashes.json>). Fake-success auth стенд не является приложением для реальных данных; server/browser, созданные для аудита, остановлены.
- [evidence/build.log](<C:/Users/rausa/OneDrive/Рабочий стол/CampusForge/docs/audit-2026-10-04-independent/evidence/build.log>), `typecheck-*.log`, `clean-install.log`, `clean-build*.log`, `clean-prisma-generate.log`, `lint.log`, `format.log`, `prisma-validate.log`, dependency JSON, prod-start logs, Turbo env evidence, GitHub trees и workspace invariants.
- **78 screenshots** в `screenshots/`, включая все четыре widths/light-dark, loading/empty/error, callback marker, keyboard flashcards/drawer/focus, document demo и interrupted history.

Особенно наглядные screenshots: `assistant-new-390-light.png` (composer ниже viewport), `tasks-390-light.png` (overflow), `assistant-drawer-keyboard-390.png`, `document-generated-demo-390.png`, `sign-in-callback-390.png`, `task-deferred-action-390.png` (исправно работающий pending).

Код приложения/настоящие данные не изменены. Старый `docs/AUDIT-2026-10-04.txt` сохранён без изменений; его blanket вывод про production build и duplicate submits заменён измеренными условиями этого отчёта.

## 7. Приложение: актуальные первоисточники advisories и фактическая достижимость

Дата: 2026-10-04. Это приложение к единому dependency finding основного отчёта; 47 advisories не превращены в 47 дублирующих findings. Приложение, lockfile, зависимости и данные не менялись. Не выполнялись exploit, нагрузочные запросы, AI-вызовы или запросы к production.

### Что запускалось и что означает результат

Результаты реальных pnpm audit сохранены в evidence/dependency-audit.json и dependency-audit-prod.json. Metadata counts: all 59 (7 critical, 23 high, 23 moderate, 6 low), prod 48 (7 critical, 18 high, 20 moderate, 3 low). Это package/path aggregate registry; не число доказанных remote exploits. Уникальных advisory по GHSA: all **47**, prod **39**. Entries объектов advisories: all 50, prod 42; одинаковый GHSA для next-auth и нескольких @auth/core версий объединён в одну строку.

Для каждой строки найден publisher primary: security advisory в upstream repo, либо исправляющий commit/исходный issue для пяти записей без publisher advisory. Все 47 publisher URLs повторно прочитаны публичным HTTP GET (200), timestamps/SHA256/URL в evidence/dependency-publisher-fetch.json. Для существенных Next/Auth/PDF условий дополнительно прочитан текст первоисточников через browser search/open. Сохранённый последний evidence/dependency-primary.json содержит 6 успешных API records и 41 HTTP403 (GitHub anonymous API rate limit); не заявляем 47 сохранённых успешных API records. HTTP200/title/hash подтверждают получение publisher страницы, **сами по себе не доказывают эксплуатацию**. Диапазоны исправления сверены с опубликованным advisory/commit и registry; таблица приводит нижнюю patched границу конкретной записи, а не обещание общей совместимости обновления.

Статусы: «предпосылки подтверждены» — installed version и путь приложения совпадают с первоисточником, без атакующего payload; «условно» — deployment/input предпосылка неизвестна; «условие отсутствует/путь не найден» — source review исключил описанный сценарий в текущем checkout, но это не гарантирует безопасность будущей конфигурации. Severity в таблице — registry classification; приоритет проектного finding определяется reachable impact.

### Все уникальные advisories

| Advisory и первоисточник | Installed package / scope / severity | Нижняя patched граница данной записи | Достижимость в CampusForge |
|---|---|---|---|
| [GHSA-pxg6-pf52-xh8x](https://github.com/jshttp/cookie/security/advisories/GHSA-pxg6-pf52-xh8x) — Cookie attributes injection | cookie 0.6.0; prod graph; low | cookie: >=0.7.0 | Условие отсутствует: имя/path/domain cookie заданы Auth.js; пользовательские значения не становятся этими атрибутами. A1. |
| [GHSA-5jpx-9hw9-2fx4](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-5jpx-9hw9-2fx4) — Email misdelivery | next-auth 5.0.0-beta.25; prod graph; moderate | next-auth: >=5.0.0-beta.30 | Условие отсутствует: нет Email/Nodemailer provider, только Credentials. A1. |
| [GHSA-9g9p-9gw9-jx7f](https://github.com/vercel/next.js/security/advisories/GHSA-9g9p-9gw9-jx7f) — Remote image optimizer DoS | next 14.2.35; prod graph; moderate | next: >=15.5.10 | Условие отсутствует: нет images.remotePatterns/remote image источников. Для будущего remote optimizer перепроверить. N1. |
| [GHSA-h25m-26qc-wcjf](https://github.com/vercel/next.js/security/advisories/GHSA-h25m-26qc-wcjf) — RSC deserialization DoS | next 14.2.35; prod graph; high | next: >=15.0.8 | Предпосылки подтверждены: App Router и Server Functions. Publisher прямо включает Next 13/14; React18 в package.json не исключает framework RSC path. N2. Эксплойт не запускался. |
| [GHSA-ggv3-7p47-pfv8](https://github.com/vercel/next.js/security/advisories/GHSA-ggv3-7p47-pfv8) — Chunked external rewrite DoS | next 14.2.35; prod graph; moderate | next: >=15.5.13 | Условие отсутствует: external rewrites не настроены. N1. |
| [GHSA-3x4c-7xq6-9pq8](https://github.com/vercel/next.js/security/advisories/GHSA-3x4c-7xq6-9pq8) — Image cache disk exhaustion | next 14.2.35; prod graph; moderate | next: >=15.5.14 | Условно: встроенный optimizer включён по умолчанию даже без next/image import; нужны доступные изображения/варианты и self-hosted disk cache. Public image assets не найдены, production cache topology неизвестна. N1. |
| [GHSA-q4gf-8mx6-v5v3](https://github.com/vercel/next.js/security/advisories/GHSA-q4gf-8mx6-v5v3) — RSC CPU exhaustion | next 14.2.35; prod graph; high | next: >=15.5.15 | Предпосылки подтверждены: App Router/Server Functions, publisher включает Next13/14. N2. Нагрузочный exploit не запускался. |
| [GHSA-qx2v-qp2m-jg93](https://github.com/postcss/postcss/security/advisories/GHSA-qx2v-qp2m-jg93) — PostCSS style breakout XSS | postcss 8.4.31; prod graph; moderate | postcss: >=8.5.10 | Путь не найден: нужна обработка недоверенного CSS и вставка результата в inline style. PostCSS используется при build доверенного CSS; runtime user CSS parser отсутствует. C1. |
| [GHSA-gh4j-gqv2-49f6](https://github.com/NaturalIntelligence/fast-xml-parser/security/advisories/GHSA-gh4j-gqv2-49f6) — XMLBuilder comment/CDATA injection | fast-xml-parser 5.5.8; prod graph; moderate | fast-xml-parser: >=5.7.0 | Путь не найден: AWS SDK импортирует FXP XMLParser, а не его XMLBuilder; S3 XmlNode escaping реализован самим AWS SDK. Загруженный document не превращается в XML comment/CDATA. X1. |
| [GHSA-8h8q-6873-q5fj](https://github.com/vercel/next.js/security/advisories/GHSA-8h8q-6873-q5fj) — RSC Server Function DoS | next 14.2.35; prod graph; high | next: >=15.5.16 | Предпосылки подтверждены: App Router/Server Functions, publisher включает Next13/14. N2. Exploit не запускался. |
| [GHSA-3g8h-86w9-wvmq](https://github.com/vercel/next.js/security/advisories/GHSA-3g8h-86w9-wvmq) — Middleware redirect cache poisoning | next 14.2.35; prod graph; low | next: >=15.5.16 | Условно: middleware redirects есть, но нужен shared cache с неверным разделением x-nextjs-data/3xx. Production proxy/CDN не проверен. N1/N3. |
| [GHSA-ffhc-5mcf-pf4q](https://github.com/vercel/next.js/security/advisories/GHSA-ffhc-5mcf-pf4q) — Malformed CSP nonce cache poisoning | next 14.2.35; prod graph; moderate | next: >=15.5.16 | Условие в source отсутствует: CSP nonce/header reflection не настроены; внешняя proxy CSP/cache policy неизвестна. N1. |
| [GHSA-vfv6-92ff-j949](https://github.com/vercel/next.js/security/advisories/GHSA-vfv6-92ff-j949) — RSC cache-buster collision | next 14.2.35; prod graph; low | next: >=15.5.16 | Условно: App Router есть; нужен shared cache с неверным разделением RSC вариантов. Topology неизвестна. N2. |
| [GHSA-gx5p-jg67-6x7h](https://github.com/vercel/next.js/security/advisories/GHSA-gx5p-jg67-6x7h) — beforeInteractive script XSS | next 14.2.35; prod graph; moderate | next: >=15.5.16 | Условие отсутствует: next/script/beforeInteractive и недоверенные props таких scripts не найдены. N1. |
| [GHSA-h64f-5h5j-jqjh](https://github.com/vercel/next.js/security/advisories/GHSA-h64f-5h5j-jqjh) — Local image memory DoS | next 14.2.35; prod graph; moderate | next: >=15.5.16 | Условно: local optimizer defaults не отключены; controllable large local image source не найден. Отсутствие next/image import само по себе endpoint не отключает. N1. |
| [GHSA-c4j6-fc7j-m34r](https://github.com/vercel/next.js/security/advisories/GHSA-c4j6-fc7j-m34r) — WebSocket upgrade SSRF | next 14.2.35; prod graph; high | next: >=15.5.16 | Условно, приоритетно: start использует встроенный Node server, где upgrade handler proxy-ветка присутствует даже без app WebSocket code. Нужен проход Upgrade до origin; proxy blocking/egress неизвестны. N4. |
| [GHSA-wfc6-r584-vfw7](https://github.com/vercel/next.js/security/advisories/GHSA-wfc6-r584-vfw7) — RSC response cache poisoning | next 14.2.35; prod graph; moderate | next: >=15.5.16 | Условно: App Router есть; нужны shared cache и неверные Vary/cache rules. Production caching неизвестен. N2. |
| [GHSA-36qx-fr4f-26g5](https://github.com/vercel/next.js/security/advisories/GHSA-36qx-fr4f-26g5) — Pages Router i18n middleware bypass | next 14.2.35; prod graph; high | next: >=15.5.16 | Условие отсутствует: используется App Router, Pages Router+i18n не настроены. N1/N2. |
| [GHSA-5wm8-gmm8-39j9](https://github.com/NaturalIntelligence/fast-xml-builder/security/advisories/GHSA-5wm8-gmm8-39j9) — XMLBuilder attribute injection | fast-xml-builder 1.1.4; prod graph; high | fast-xml-builder: >=1.1.7 | Путь не найден: уязвимый fast-xml-builder транзитивный, но FXP builder не используется текущими S3 операциями; AWS использует собственный escaping. X1. |
| [GHSA-3qcw-2rhx-2726](https://github.com/vercel/turborepo/security/advisories/GHSA-3qcw-2rhx-2726) — Yarn Berry detection code execution | turbo 2.9.6; dev only; low | turbo: >=2.9.14 | Условно только build/tooling: требуется недоверенный Yarn Berry repo/config. Проект pnpm, yarnPath/.yarnrc.yml не найдены. Не remote app RCE. T1. |
| [GHSA-w5hq-g745-h8pq](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq) — UUID output buffer bounds | uuid 11.1.0; prod graph; moderate | uuid: >=11.1.1 | Путь не найден: требуется v3/v5/v6 с caller buffer; BullMQ использует v4 без buffer. U1. |
| [GHSA-g7r4-m6w7-qqqr](https://github.com/evanw/esbuild/security/advisories/GHSA-g7r4-m6w7-qqqr) — Windows esbuild dev-server file read | esbuild 0.27.7; dev only; low | esbuild: >=0.28.1 | Условие отсутствует: worker tsx использует трансформацию, esbuild serve/servedir не вызывается. Windows само по себе недостаточно. T1. |
| [GHSA-hcf7-66rw-9f5r](https://github.com/vercel/turborepo/security/advisories/GHSA-hcf7-66rw-9f5r) — Turbo login callback CSRF | turbo 2.9.6; dev only; moderate | turbo: >=2.9.14 | Условно только CLI workflow: turbo login/SSO callback не часть app и не настроен в project scripts. T1. |
| [GHSA-m99w-x7hq-7vfj](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj) — App Router Server Action DoS | next 14.2.35; prod graph; high | next: >=15.5.21 | Предпосылки подтверждены: App Router и используемые UI Server Actions. N2. Auth внутри action не устраняет framework deserialization до вызова. Exploit не запускался. |
| [GHSA-89xv-2m56-2m9x](https://github.com/vercel/next.js/security/advisories/GHSA-89xv-2m56-2m9x) — Custom-server Server Action SSRF | next 14.2.35; prod graph; high | next: >=15.5.21 | Условие отсутствует: start — next start, custom server не найден; publisher указывает origin pinning в next start/standalone 14.2+. N4. |
| [GHSA-68g3-v927-f742](https://github.com/vercel/next.js/security/advisories/GHSA-68g3-v927-f742) — fetch Request/init body cache confusion | next 14.2.35; prod graph; moderate | next: >=15.5.21 | Путь не найден: нет соответствующего server fetch с несовпадающими Request/init body. Единственный actual web fetch — client upload; OpenAI SDK работает в отдельном worker. N5. |
| [GHSA-4633-3j49-mh5q](https://github.com/vercel/next.js/security/advisories/GHSA-4633-3j49-mh5q) — Non-UTF8 fetch body cache collision | next 14.2.35; prod graph; moderate | next: >=15.5.21 | Путь не найден: нет server fetch с binary/non-UTF8 cached body в Next runtime. N5. |
| [GHSA-4c39-4ccg-62r3](https://github.com/vercel/next.js/security/advisories/GHSA-4c39-4ccg-62r3) — Edge Server Action unbounded body | next 14.2.35; prod graph; moderate | next: >=15.5.21 | Условие отсутствует: actions используют default Node runtime, runtime=edge для actions не найден. Edge middleware не равен Edge action. Upload multipart PF-06 — отдельная причина. N2. |
| [GHSA-p9j2-gv94-2wf4](https://github.com/vercel/next.js/security/advisories/GHSA-p9j2-gv94-2wf4) — Attacker-controlled rewrite host SSRF | next 14.2.35; prod graph; high | next: >=15.5.21 | Условие отсутствует: request-derived rewrite/redirect destination rules не настроены. N1. |
| [GHSA-955p-x3mx-jcvp](https://github.com/vercel/next.js/security/advisories/GHSA-955p-x3mx-jcvp) — Server Function endpoint disclosure | next 14.2.35; prod graph; moderate | next: >=15.5.21 | Предпосылки подтверждены: App Router с UI Server Actions. Disclosure IDs не даёт authentication bypass: handlers проверяют session/user/membership. A1/N2. Dynamic exploit не запускался. |
| [GHSA-6g55-p6wh-862q](https://github.com/postcss/postcss/security/advisories/GHSA-6g55-p6wh-862q) — CSS sourceMappingURL file disclosure | postcss 8.5.10, 8.4.31; prod graph; high | postcss: >=8.5.12 | Путь не найден в app: untrusted CSS sourceMappingURL не поступает в runtime PostCSS. Условный риск build недоверенного source/PR остаётся. C1. |
| [GHSA-fxqj-rqcc-2cmp](https://github.com/postcss/postcss/security/advisories/GHSA-fxqj-rqcc-2cmp) — Residual .map disclosure without from | postcss 8.5.10, 8.4.31; prod graph; moderate | postcss: >=8.5.23 | Путь не найден в app; тот же untrusted CSS source-map build boundary. Это неполное исправление раннего advisory, minimum version 8.5.23 для этой ветки. C1. |
| [GHSA-28wg-ghj8-5hjv](https://github.com/ai/nanoid/commit/e835c9b71eab832bc6106944bdd26ea96cf2c66d) — Negative nonsecure nanoid size loop | nanoid 3.3.11; prod graph; high | nanoid: >=3.3.16 | Путь не найден: PostCSS вызывает nonsecure nanoid(6), размер постоянный; app не передаёт пользовательский size. U2. |
| [GHSA-8fpg-xm3f-6cx3](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-8fpg-xm3f-6cx3) — Auth error object fail-open | next-auth 5.0.0-beta.25; prod graph; critical | next-auth: >=5.0.0-beta.32 | Уязвимый auth guard pattern отсутствует: middleware требует req.auth?.user, service требует session?.user?.id. Не используется truthiness только auth object. A1. |
| [GHSA-7rqj-j65f-68wh](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-7rqj-j65f-68wh) — Email homoglyph normalization | next-auth 5.0.0-beta.25; @auth/core 0.34.3, 0.37.4, 0.37.2; prod graph; critical | next-auth: >=5.0.0-beta.32; @auth/core: >=0.41.3 | Условие отсутствует: Email/magic-link provider не установлен в конфигурации, только Credentials. A1. |
| [GHSA-2v37-7h3g-55p8](https://github.com/ai/nanoid/commit/e10f8d40ce9d1ab47f66d65a16b48086432730d0) — Zero custom nanoid size loop | nanoid 3.3.11; prod graph; high | nanoid: >=3.3.18 | Путь не найден: customAlphabet/customRandom с user size не вызываются; PostCSS использует nonsecure фиксированный 6. U2. |
| [GHSA-r28c-9q8g-f849](https://github.com/postcss/postcss/security/advisories/GHSA-r28c-9q8g-f849) — CSS previous source-map traversal | postcss 8.5.10, 8.4.31; prod graph; high | postcss: >=8.5.18 | Путь не найден в app: нет runtime обработки user CSS; условно build недоверенного source. C1. |
| [GHSA-xmf8-cvqr-rfgj](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-xmf8-cvqr-rfgj) — Malformed Bearer getToken exception | next-auth 5.0.0-beta.25; @auth/core 0.34.3, 0.37.4, 0.37.2; prod graph; high | next-auth: >=5.0.0-beta.32; @auth/core: >=0.41.3 | Условие отсутствует: прямых getToken calls нет; auth() идёт через getSession→Auth с cookie header. Publisher прямо исключает auth-only apps. A2. |
| [GHSA-x445-f3h2-j279](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-x445-f3h2-j279) — Cross-provider OAuth cookie binding | next-auth 5.0.0-beta.25; @auth/core 0.34.3, 0.37.4, 0.37.2; prod graph; moderate | next-auth: >=5.0.0-beta.32; @auth/core: >=0.41.3 | Условие отсутствует: OAuth providers/account-link flow отсутствуют, только Credentials. A1. |
| [GHSA-w9m9-85wc-3x92](https://github.com/postcss/postcss-selector-parser/commit/5bc698cef66f8abd12610dc623e5d67cbc0f869d) — Selector AST recursion DoS | postcss-selector-parser 6.1.2; dev only; low | postcss-selector-parser: >=6.1.3 | Условно build/tooling: нужна обработка недоверенных CSS selectors; public endpoint отсутствует. C1. |
| [GHSA-c83g-rgw3-j3cx](https://github.com/browserslist/browserslist/security/advisories/GHSA-c83g-rgw3-j3cx) — Browserslist result cache OOM | browserslist 4.28.2; dev only; high | browserslist: >=4.28.7 | Условие отсутствует в app: нет long-lived runtime с user-controlled distinct queries; используется build Autoprefixer. C1. |
| [GHSA-73wf-gq98-2v4g](https://github.com/browserslist/browserslist/security/advisories/GHSA-73wf-gq98-2v4g) — Browserslist custom-stats crash | browserslist 4.28.2; dev only; high | browserslist: >=4.28.7 | Условно build/tooling: нужен недоверенный browserslist-stats.json; в checkout не найден, public user input path отсутствует. C1. |
| [GHSA-xwg4-73v4-xw9w](https://github.com/ai/nanoid/security/advisories/GHSA-xwg4-73v4-xw9w) — Secure nanoid size overflow | nanoid 3.3.11; prod graph; high | nanoid: >=3.3.12 | Путь не найден: требует secure API с огромным user size; PostCSS использует nonsecure nanoid(6). U2. |
| [GHSA-p293-qw3h-jr36](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) — Windows-hosted Next RCE | next 14.2.35; prod graph; critical | next: >=15.5.24 | Условно, критично: текущая машина Windows и affected App Router есть. Production ОС/hosting неизвестны; при Windows next start это release blocker. Exploit не запускался. N4. |
| [GHSA-w5vr-8v7q-w6rv](https://github.com/web-platform-dx/baseline-browser-mapping/commit/de733e2d8959559f7bb255d5927f3afcb6f31589) — Baseline invalid input process exit | baseline-browser-mapping 2.10.19; dev only; moderate | baseline-browser-mapping: >=2.11.0 | Условие отсутствует в app: invalid runtime user queries не поступают; только Browserslist build цепочка. C1. |
| [GHSA-2xp9-vwfh-vxw4](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) — AVIF image optimizer RCE | next 14.2.35; prod graph; critical | next: >=15.5.24 | Непроверено условие native decoder: sharp/libheif не подтверждены в installed/lockfile graph. Нужны image optimizer+уязвимый AVIF decoder; production artifact неизвестен. Не считать доказанным RCE. N1/N4. |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/micromatch/braces/issues/70) — Nested braces stack exhaustion | braces 3.0.3; dev only; high | braces: не опубликован | Условно build/tooling: user pattern не поступает в braces, Tailwind glob фиксирован. Primary issue не указывает исправленную версию, обещать simple patch upgrade нельзя. C1. |

### Source anchors для решений таблицы

- **A1.** apps/web/src/lib/auth.ts:26-63 — Credentials only, session JWT. apps/web/src/lib/auth.config.ts:15 — providers: [] для Edge; cookie attributes используют статические Auth.js defaults. apps/web/src/middleware.ts:21 требует req.auth?.user; apps/web/src/server/services/auth-helpers.ts:11-19 требует session.user.id. Отсутствие OAuth/email providers исключает соответствующие provider-specific advisories, но не отменяет остальные дефекты auth из AppSec отчёта.
- **A2.** rg getToken по apps/packages: application calls отсутствуют. apps/web/node_modules/next-auth/lib/index.js:7-14 getSession передаёт в Auth только cookie header; транзитивный session flow использует JWT decode, не exported getToken Bearer helper. Это согласуется с [publisher applicability](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-xmf8-cvqr-rfgj).
- **N1.** apps/web/next.config.mjs:1-15: images.remotePatterns/localPatterns, rewrites, CSP nonce и custom i18n не заданы. rg next/image/next/script/beforeInteractive по src не нашёл вызовов; public PNG/JPG/AVIF/SVG assets в checkout не найдены. **Отсутствие import next/image не отключает built-in optimizer endpoint**; image attack applicability зависит от доступных источников, native decoder и deployment.
- **N2.** apps/web/src/app/** — App Router. apps/web/src/server/actions/auth.ts:1, note.ts:1, task.ts:1, workspace.ts:1 — use server и реальные UI callers; action handlers по умолчанию Node runtime. Publisher RSC advisories явно включают Next13/14, поэтому direct React18 не основание снять их. Guards внутри action не являются защитой от дефекта framework request deserialization. Подтверждён источник/предпосылки, не исчерпание CPU в данном окружении.
- **N3.** apps/web/src/middleware.ts:28-56 — реальные redirects signin/onboarding. Как reverse proxy/CDN кеширует 3xx/RSC, для production неизвестно.
- **N4.** apps/web/package.json:8 — next start, custom server source отсутствует. apps/web/node_modules/next/dist/server/lib/router-server.js:441-486 содержит WebSocket upgrade handler с parsedUrl.protocol→proxyRequest; apps/web/node_modules/next/dist/server/lib/router-utils/resolve-routes.js:81 начинает parse req.url. [Publisher WebSocket SSRF](https://github.com/vercel/next.js/security/advisories/GHSA-c4j6-fc7j-m34r) касается built-in self-hosted Node server и не требует собственных WebSocket функций приложения. Reverse proxy Upgrade/egress и production ОС/native image dependencies неизвестны. Текущий host Windows подтверждён средой, но это не доказательство production hosting.
- **N5.** apps/web/src/components/document/upload-document-dialog.tsx:105 — client fetch upload. Server-side Next fetch с атакующими body/init/source charset не найден. apps/web/src/lib/assistant/engine.ts:62 содержит fetch лишь внутри демонстрационного текста ответа. Provider SDK исполняется в отдельном Node worker.
- **X1.** node_modules/.pnpm/@aws-sdk+xml-builder@3.972.17/node_modules/@aws-sdk/xml-builder/dist-cjs/xml-parser.js:5 — FXP XMLParser. index.js:12-32 — собственные escapeAttribute/escapeElement, :42-127 XmlNode AWS, FXP XMLBuilder не вызывается. Сопоставление parser и builder необходимо: advisory о builder не становится reachable только из-за package transitiveness.
- **U1.** apps/worker/node_modules/bullmq/dist/cjs/classes/queue.js:41, worker.js:66, flow-producer.js:194 используют uuid.v4(), без caller-provided buffer. Direct uuid v3/v5/v6 callers приложения не найдены.
- **U2.** apps/web/node_modules/postcss/lib/input.js:3 импортирует nanoid/non-secure; :80 вызывает nanoid(6). Размер не пользовательский, custom generator callers не найдены.
- **C1.** apps/web/postcss.config.mjs — build Tailwind/Autoprefixer; apps/web/tailwind.config.ts:5 — постоянный content glob. Runtime user CSS, source-map input, selectors, glob/query strings или browserslist-stats.json в checkout не найдены. Untrusted repository/PR build boundary остаётся отдельным условным supply-chain риском; публичный пользователь приложения не контролирует эти входы через найденный app flow.
- **T1.** package.json packageManager — pnpm; turbo build/dev scripts не запускают turbo login. apps/worker/package.json dev — tsx watch, serve/servedir esbuild не используется. Tool-only scope не означает безопасность произвольного checkout из недоверенного репозитория.

### Vendored PDF.js вне package advisory graph

pnpm audit не перечисляет исходники PDF.js, встроенные внутри pdf-parse1.1.4. apps/worker/src/jobs/parse-document.ts:65-69 передаёт untrusted uploaded PDF в pdfParse(buffer). node_modules/.pnpm/pdf-parse@1.1.4/node_modules/pdf-parse/lib/pdf-parse.js:14 вызывает getTextContent; :42 default version v1.10.100; :69-70 getDocument без isEvalSupported:false, disableWorker=true. Точные vendor excerpts/SHA256 и HTTP200 publisher источники сохранены в evidence/pdf-vendor-source-review.json; воспроизводящий read-only script probes/pdf-vendor-source.cjs.

В этом vendor коде подтверждён потенциально опасный glyph compiler: lib/pdf.js/v1.10.100/build/pdf.js:14544-14560 getPathGenerator конкатенирует glyph args и создаёт new Function; :15638-15651 единственный найденный caller — CanvasGraphics.paintChar. [Mozilla CVE-2024-4367 / GHSA-wgrm-67xf-hhpq](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq) указывает affected pdfjs-dist <=4.1.392, patched4.2.67, workaround isEvalSupported:false. Установленный vendored1.10.100 старее исправления и опасный source присутствует.

Однако текущий CampusForge parser не вызывает page.render/canvas glyph painting. pdf.js:3807 sendWithStream(GetTextContent) → pdf.worker.js:25414-25428 → :32077-32114 extractTextContent → PartialEvaluator.getTextContent. На этом статически прослеженном пути CVE glyph compiler sink не найден. **RCE именно через current getTextContent flow не подтверждён**; malicious PDF/exploit не исполнялся, global eval/Function не использовались для атакующего кода. Это явный vendored-code blind spot и проверяемая гипотеза, а не утверждение «PDF безопасны» или подтверждённый app RCE.

В актуальном [Mozilla GHSA-hq66-cqwq-w95j](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j) есть другая scripting проблема для >=5.6.83; её range не совпадает с vendored1.10.100 и browser enableScripting viewer отсутствует. Не переносим её на данный worker автоматически. Проекту нужен maintained text parser с отключённым eval и отдельным process/resource deadline, затем изолированный malicious-PDF regression; это также закроет отсутствие PDF CPU/page/time limits из pipeline отчёта.

### Минимальный порядок исправления и admission checks

1. **P1 / release blocker:** обновить Next на поддерживаемую совместимую ветку, покрывающую весь набор advisories; нижняя граница 15.5.24 покрывает перечисленные Next записи этой таблицы, но это не разрешение оставить unsupported branch или игнорировать React/Auth совместимость. При production Windows GHSA-p293 — критичный conditional impact; до patch origin не допускать наружу. Для self-hosted origin отдельно проверить Upgrade filtering/egress. Версионная замена без rerun build/React transition checks не считается закрытием.
2. Обновить согласованно next-auth/@auth/core/prisma-adapter; убрать лишнюю прямую устаревшую @auth/core копию, если приложение её не использует. Повторить malformed-token, signin/logout, JWT update и workspace authorization regressions. Provider-specific advisories не предъявлены как действующие auth bypass.
3. Устранить транзитивные версии PostCSS>=8.5.23, nanoid>=3.3.18, cookie>=0.7.0, UUID>=11.1.1, FXP>=5.7.0 и builder>=1.1.7 в совместимой цепочке; проверить оба prod и build graphs после frozen install. Для braces не выдумывать опубликованный patch: заменить/ограничить вызывающий tooling путь либо оформить явно ограниченный exception с подтверждёнными fixed input boundaries.
4. Обновить Turbo/esbuild/Autoprefixer/Browserslist/selector parser tooling; CI для недоверенных PR запускать без production secrets/privileged network. Это conditional build boundary, не доказанная атака пользовательского UI.
5. Admission: lockfile diff проверен, clean frozen install и build/typecheck/lint выполнены; audit(all/prod) повторён; каждый оставшийся advisory имеет issuer source, actual caller/preconditions и owner/expiry. Native decoder и production ОС/proxy/cache topology установлены по deploy artifact, а не предположению. Vendored PDF анализ нужен отдельно от чистого npm audit.
