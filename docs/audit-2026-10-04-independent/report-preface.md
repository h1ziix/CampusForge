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

В [my_portfolio/data/portfolio.ts](https://github.com/h1ziix/my_portfolio/blob/main/data/portfolio.ts) есть карточка CampusForge, link `#contact`, Request project access и path `public/projects/campusforge-preview.mp4`. Видео существует в tree; его не скачивали/не анализировали. **Это описание и preview, а не исходники CampusForge или доказательство его production readiness.** Другие ветки, невыданные private repositories и иные аккаунты не охвачены. Local Git не привязан ни к одному найденному репозиторию. Metadata/paths сохранены в `evidence/github-evidence.json`.

## 4. Подробные подтверждённые findings

Далее приведены условия, точные source references, воспроизведения, expected/actual, влияние, минимальные исправления и критерии проверки. Детали написаны по самостоятельно просмотренному коду и новым исполненным probes; старый отчёт не является evidence.
