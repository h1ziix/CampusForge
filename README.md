# CampusForge

R1 обеспечивает воспроизводимую сборку и контракт загрузки production runtime.
R2 добавляет безопасные auth redirects, ограничения password endpoints, trusted session updates и изоляцию локальной истории. Это **не разрешение на production**: live auth/Redis integration, сохранность документов, реальные AI-сценарии и остальные acceptance пункты требуют отдельных проверок. Итоги и границы доказательства: [R1](docs/releases/R1.md), [R2](docs/releases/R2.md).

## Требования

- Node.js **24.21.0**, поддерживаемая LTS-линия 24; версия закреплена в `.nvmrc`, engines и CI.
- pnpm **10.33.0** (`npm install --global pnpm@10.33.0`, если его ещё нет).
- Для локальной инфраструктуры: Docker Compose с работающим daemon.
- Сборка и runtime одного release artifact: одинаковые Node major, OS, architecture и совместимые системные библиотеки. Prisma engine и PDF native assets зависят от платформы; для Linux собирайте отдельный Linux artifact.

## Чистая установка и проверки

Эти команды не требуют настоящей `.env`, доступа к БД или AI provider:

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm typecheck
pnpm lint
pnpm format:check
pnpm exec playwright install chromium
pnpm test
pnpm env:probe
pnpm build
```

`typecheck` и `lint` проверяют все пять пакетов. `test` запускает содержательные package suites; web suite использует Chromium и настоящий Next App Router с копиями исходных компонентов, deferred synthetic Server Action и без БД. `pnpm test:browser` запускает этот web regression отдельно. На Linux CI установка браузера: `pnpm exec playwright install --with-deps chromium`.

`pnpm db:generate` создаёт единый Prisma Client в `packages/db/generated/client`; adapter type-only import разрешается к этому же client через точный TypeScript alias. Это генерация кода, без соединения и миграций. `pnpm build` повторяет generation и запускает dependency-ordered сборки всех пяти пакетов. Worker и библиотеки компилируются в CommonJS `dist`; Next собирается с Webpack. Ни type checking, ни проверки сборки не отключены.

Prisma schema validation с **synthetic** URL:

```powershell
$env:DATABASE_URL = 'postgresql://synthetic:synthetic@127.0.0.1:15432/synthetic'
pnpm db:validate
Remove-Item Env:DATABASE_URL
```

На POSIX: `DATABASE_URL=postgresql://synthetic:synthetic@127.0.0.1:15432/synthetic pnpm db:validate`. Validation не соединяется с БД.

`pnpm format` форматирует только allowlist исходников, конфигурации, tests, scripts, README и новых release docs. Прошлые audit evidence, screenshots, generated files, lockfile и чужие артефакты исключены. Не запускайте общий `prettier --write .`.

`pnpm verify:clean` автоматически повторяет полный gate в новом временном каталоге с пустым pnpm store, без `.env`, прежних node_modules, generated artifacts и caches. Он устанавливает Chromium, выполняет synthetic Prisma validation, все quality checks, env probe и build; результаты сохраняет в `docs/releases/evidence/r1-clean-results.json` и отдельных logs. Исходники проекта и пользовательскую инфраструктуру не изменяет.

## Environment

Build-time: только необязательный публичный `NEXT_PUBLIC_APP_URL`; Next встраивает его в web artifact, Turbo учитывает в cache key. Для смены значения нужна новая сборка. Runtime secrets не нужны для clean build и не входят в build cache hashing.

Runtime web: `DATABASE_URL`, `AUTH_URL` (или `NEXTAUTH_URL`), `AUTH_SECRET` (или `NEXTAUTH_SECRET`, минимум 32 символа), `REDIS_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`. Runtime worker: `DATABASE_URL`, `REDIS_URL`, все пять `S3_*`, `OPENAI_API_KEY`, `OPENAI_MODEL`. `AUTH_*` имеет приоритет над legacy alias. `AUTH_TRUST_HOST=true` допустим только при доверенном ingress, который задаёт корректные Host/forwarded headers.

Production-переменные передаёт service manager/secret store. Start wrappers проверяют обязательные имена и URL protocols до импорта приложения; диагностика не печатает значения. Проверить конфигурацию в исходной build workspace: `pnpm env:check web` или `pnpm env:check worker`. `pnpm env:probe` использует исключительно synthetic env и проверяет передачу `S3_*` и `OPENAI_MODEL` через настоящий Turbo strict `dev` task.

Password endpoints используют Redis limiter с deadline 1500 ms и fail-closed поведением: при outage login/signup временно недоступны. По умолчанию источник общий (`unknown`), поскольку произвольный `X-Forwarded-For` не считается доверенным IP. Для IP budgets задайте `AUTH_RATE_LIMIT_TRUST_PROXY=true` и `AUTH_RATE_LIMIT_IP_HEADER` только за ingress, который удаляет клиентский header, записывает единственный проверенный IP и блокирует прямой доступ к origin. Эти параметры передаются через Turbo; подробные бюджеты и proxy policy: [R2 auth](docs/releases/R2-auth.md).

Upload POST требует `Origin`, точно совпадающий с origin настроенного `AUTH_URL`/`NEXTAUTH_URL`; `Host` и forwarded headers его не заменяют. Logout удаляет только чувствительные CampusForge assistant/document caches на этом устройстве, сохраняя theme и scoped preferences. Старый общий assistant key автоматически не импортируется. Политика хранения: [R2 privacy](docs/releases/R2-privacy.md).

## Локальная разработка

```sh
docker compose -f infra/docker-compose.yml config --quiet
docker compose -f infra/docker-compose.yml up -d
```

Создайте `.env` из `.env.example` и заполните её локальными значениями. PostgreSQL: localhost:5432, Redis:6379, MinIO S3:9000, console:9001. На **новой локальной** MinIO создайте bucket `campusforge` через console. Compose не создаёт bucket автоматически. Не используйте пользовательскую/production БД как тестовый стенд.

Для новой disposable локальной БД, после проверки URL оператор может выполнить `pnpm db:migrate`; команда изменяет schema. В рамках R1 никакие миграции не выполнялись.

```sh
pnpm dev:web
# или web + worker (worker требует заполненный OPENAI_API_KEY/MODEL)
pnpm dev
```

Dev использует dev-only dotenv/tsx; root заранее генерирует Prisma и собирает workspace libraries. Изменив library source, повторите `pnpm build:packages`. Production start этих CLI не требует.

## Release artifact и production start

Выбран способ поставки worker: **compiled CommonJS**, `apps/worker/dist/index.js`, со всеми workspace `dist` и generated Prisma engine в общем built-workspace artifact. PDF parser остаётся отдельной production dependency; его worker/native assets устанавливаются из lockfile, без bundling или копирования случайного node_modules layout.

В build workspace после успешных quality gates:

```sh
pnpm build
pnpm release:pack /absolute/path/to/new-release-directory
```

В Windows укажите новый путь, например `pnpm release:pack C:/releases/CampusForge-R1`. Команда отказывается перезаписывать существующий каталог. Artifact содержит manifests, lockfile, `.next` без cache, `dist`, runtime start scripts, Prisma client/engine и migrations metadata; `.env`, node_modules, audit evidence и dev caches не копируются. `release-manifest.json` фиксирует platform/arch/Node и SHA256 lockfile.

На runtime-хосте в каталоге artifact:

```sh
pnpm install --prod --frozen-lockfile --ignore-scripts
# Переменные предоставляет service manager. Запускайте как отдельные services:
pnpm --filter @campusforge/web start --port 3000 --hostname 127.0.0.1
pnpm --filter @campusforge/worker start
```

Lifecycle scripts здесь намеренно не выполняются: Prisma уже generated в build artifact; compiler и dev CLI runtime-хосту не нужны. Не удаляйте optional dependencies: PDF parser использует native canvas package. Не устанавливайте зависимости одного OS artifact на другую платформу.

Из full build workspace можно проверить production-only artifact без настоящей инфраструктуры:

```sh
node scripts/probe-release.mjs /absolute/path/to/installed-release-directory
```

Probe проверяет compiled package imports, Prisma native engine с ожидаемым connection failure на закрытом synthetic localhost без query, извлечение текста synthetic PDF, настоящий web HTTP и загрузку worker с изолированной synthetic конфигурацией; останавливает только собственные дочерние процессы. `infrastructureReady=false` — ожидаемое ограничение этой проверки. Сообщение worker `Runtime loaded; Redis readiness pending` подтверждает загрузку кода; `Redis ready` относится только к Redis. Оно не подтверждает PostgreSQL/S3/provider readiness или end-to-end обработку документов.

## Миграции при будущем релизе

Только из административной **full build workspace** с dev tooling, проверенным target URL и утверждённым планом backup/rollback:

```sh
pnpm db:deploy
```

Это Prisma `migrate deploy`, отдельное явное действие оператора. Оно не запускается install, build, start, CI или release probes. R1 его не выполнял на существующей БД. Production-only artifact не предполагает наличия Prisma CLI.

## CI и ограничения

`.github/workflows/quality.yml` закрепляет Node/pnpm, frozen install, generation, пять typechecks, lint, format, unit/browser tests и build; проверки используют synthetic env. Hosted CI execution, disposable migrations и реальная DB/Redis/S3/AI readiness должны проверяться отдельно. `pnpm audit --json` и `pnpm audit --prod --json` оцениваются с issuer advisory и reachability; текущая triage находится в [docs/releases/R1-dependencies.md](docs/releases/R1-dependencies.md).
