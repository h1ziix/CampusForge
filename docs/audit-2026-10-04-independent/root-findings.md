# Архитектура, сборка, зависимости и deployment: findings основного аудитора

## RD-01 — P1: заявленные production scripts требуют отсутствующих production dependencies; worker artifact не собирается

**Места:** `apps/web/package.json:8,42`; `apps/worker/package.json:5-8,18-23`; `turbo.json:13-15`; `packages/db/package.json:5`; `packages/ai/package.json:5`; `packages/shared/package.json:5`; `tsconfig.json:15` (`noEmit:true`).

**Условия:** обычная поставка с `pnpm install --prod --frozen-lockfile` и запуск через предоставленные `start` scripts. Для worker также важна поставка только build artifacts вместо полного дерева TS исходников/dev tools.

**Воспроизведение:** отдельная source snapshot из 159 файлов без `.env`, node_modules и build caches. Frozen install, явный Prisma generate и web build прошли. Затем production-only install прошёл; `pnpm --filter @campusforge/worker start` и `pnpm --filter @campusforge/web start` оба завершились exit 1: `dotenv is not recognized`. `.bin/dotenv` отсутствует у обоих, `.bin/tsx` отсутствует у worker. Логи: `evidence/prod-only-install.log`, `prod-worker-start.log`, `prod-web-start.log`, независимый `quality-crosscheck.json`. `turbo build` фактически исполняет одну web task: worker и TS workspace packages не имеют build script; `dist` artifact не возникает. Worker с полным dev install запускается через source TS runner — это альтернативная поставка, её нельзя объявлять невозможной.

**Expected / actual:** documented production install/start имеет все необходимые runtime tools и исполняемый worker. Actual — предложенный start не достигает инициализации приложения; web build не производит worker binary/JS bundle.

**Влияние:** deployment, удаляющий dev dependencies, не поднимет web и worker; без отдельного worker документы не парсятся, backend AI jobs не обрабатываются.

**Минимальное исправление:** для текущей модели source execution переместить реально нужные `dotenv-cli`/`tsx` в runtime dependencies либо убрать CLI dotenv из production startup и внедрять env на уровне процесса. Для artifact-based поставки собрать worker и workspace packages в JS, изменить package exports/start, явно включить generated Prisma Client и требуемые runtime assets. Не заменять `noEmit` на false без проверки package boundaries. Зафиксировать поддерживаемый install/build/start контракт.

**Проверка устранения:** в пустом release directory frozen production install → advertised start web/worker → readiness, synthetic parse и AI job на disposable инфраструктуре. Production artifact не зависит от локального TS compiler/dev node_modules. Не считать один успешный Next build доказательством работоспособного worker.

## RD-02 — P1: runtime baseline содержит affected Next и неподдерживаемый Node 20

**Места:** `apps/web/package.json:29-32`, `pnpm-lock.yaml` (Next 14.2.35, next-auth beta.25); `apps/web/src/server/actions/auth.ts:1`; другие modules с `use server`; `apps/web/next.config.mjs:1-15`; `.nvmrc:1` закрепляет Node 20.

**Условия:** внешний доступ к App Router deployment с Server Actions; дополнительно Windows filesystem для Windows RCE. Production OS, ingress и действующий deployment не известны. Сам аудит не исполнял RCE/DoS payloads.

**Доказательство:** настоящий `pnpm audit` и `pnpm audit --prod`; фактические версии подтверждены package resolution. [Next primary GHSA-m99w-x7hq-7vfj](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj) относится к App Router с хотя бы одним Server Action, версия 14.2.35 входит в affected range. CampusForge имеет оба условия, включая publicly rendered auth actions. [Windows RCE primary GHSA-p293-qw3h-jr36](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) охватывает эту версию при Windows hosting; текущая audit машина Windows, что не доказывает OS внешнего deployment. Указанные advisory patched minima: 15.5.21 для первого; 15.5.24/16.3.3 для Windows RCE. Это минимумы конкретных advisory, а не предложение считать любую такую версию безопасной относительно всех будущих/других advisory.

**Дополнительная проверка runtime:** `.nvmrc=20`, фактический audit Node=20.20.0. На дату аудита Node 20 уже EOL: официальный [Node.js release schedule](https://github.com/nodejs/Release/blob/main/README.md#end-of-life-releases) указывает 2026-04-30. Это подтверждённый неподдерживаемый development/release baseline; реальный production Node не предоставлен. Node-specific exploit не проверялся. Поддерживаемый LTS runtime нужно выбрать вместе с обновлением Next и проверить на чистом artifact.

**Expected / actual:** релиз использует поддерживаемые исправленные runtime dependencies. Actual — lock воспроизводит известный affected Next, `.nvmrc` выбирает EOL Node; App Router/Server Action attack surface присутствует.

**Влияние:** доказана применимость условий advisory к коду, возможен unauthenticated denial of service; conditional Windows RCE имеет критическое влияние. Реальный exploit или факт скомпрометированного сервера не утверждаются.

**Минимальное исправление:** согласованно обновить Next/React/types/Auth/adapter и Node baseline на поддерживаемые линии, закрывающие актуальную triage таблицу, затем frozen install/build/browser/security regression. Не применять `audit --fix --force` без проверки migration compatibility. Нельзя исправить Windows RCE лишь application-level sanitizer.

**Проверка устранения:** patched locked versions, поддерживаемый Node в development/CI/deploy artifact, current publisher advisories/production audit; воспроизводимый production build, auth/session/redirect tests и реальные UI scenarios в обновлённом Next runtime.

**Важные отрицательные выводы:** registry `critical` не равен exploit приложения. [Auth.js fail-open primary](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-8fpg-xm3f-6cx3) описывает bare truthy auth check; CampusForge проверяет `req.auth?.user` и `session?.user?.id`, поэтому этот паттерн не подтверждён. Publisher severity для него Low, registry сообщил Critical. Email/OAuth findings требуют providers, которых в конфигурации нет. [AVIF optimizer RCE primary](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) требует affected sharp/libheif optimization; sharp не найден в lock, `next/image` не используется, AVIF exploitation не доказана. Общие RSC advisories нельзя исключать только по номинальному React 18: Next App Router содержит собственный compiled runtime. Остальные registry результаты и границы triage вынесены отдельно.

## RD-03 — P2: lint/format gates не подготовлены к неинтерактивной проверке

**Места:** `apps/web/package.json:9,36-45`; root `package.json:7-9,16-19`; `.prettierrc:9`; отсутствие ESLint config/dependencies в inventory.

**Условия:** developer/CI запускает заявленные `pnpm lint` и `pnpm format:check` на этом snapshot.

**Воспроизведение:** `CI=1 pnpm lint` exit 1, Next показывает выбор начальной настройки ESLint. `pnpm format:check` exit 1: не найден `prettier-plugin-tailwindcss`. Ничего из prompt не выбиралось, autoformat/installation не выполнялись. Логи `evidence/lint.log`, `format.log`.

**Expected / actual:** обе команды неинтерактивно проверяют code quality и дают code-related diagnostics. Actual — проверки не доходят до анализа исходников. Scripts lint есть только у web; root typecheck/test gates и package lint scripts отсутствуют. `pnpm -r --if-present test` отработал без suite: это не PASS тестов.

**Влияние:** проект не имеет работающего объявленного quality gate; отсутствие предупреждений не означает соблюдение style/lint rules.

**Минимальное исправление:** добавить согласованные ESLint dependencies/config и declared formatter plugin (или намеренно удалить plugin из config), package typecheck scripts и root aggregate. Добавить tests именно на доказанные опасные сценарии, затем CI. Конфиги выбрать под целевую обновлённую Next линию.

**Проверка устранения:** fresh frozen install → lint/format/typecheck/test в CI без prompts, заранее намеренно нарушенное правило даёт ожидаемый failure. Для пустой test suite job не помечается прошедшим тестированием.

## RD-04 — P2: Turbo strict environment теряет deployment-параметры S3 и модель AI

**Места:** `turbo.json:3-11,17-19`; `apps/web/src/lib/s3.ts:17-22,34`; `apps/worker/src/lib/s3.ts:13-22`; `packages/ai/src/provider.ts:152`; `.env.example:20-30`.

**Условия:** процессы запускаются через root `pnpm dev`/Turbo с env, введёнными платформой, и без физического root `.env`. При direct package start либо наличии `.env`, который загружает dotenv, этот дефект маскируется. Не все способы deployment используют Turbo.

**Воспроизведение:** actual Turbo 2.9.6 на isolated snapshot без `.env`. Только временный worker dev script подменён безопасным env-presence printer, после execution файл восстановлен. Перед запуском все перечисленные env заданы synthetic значениями. Через Turbo DATABASE_URL/AUTH_SECRET/REDIS_URL/OPENAI_API_KEY присутствуют; OPENAI_MODEL и все пять S3 parameters отсутствуют. Значения настоящего `.env` не копировались/не выводились. `evidence/turbo-env-probe.cjs`, `turbo-env-result.json`, `turbo-dev-dry.json`.

**Expected / actual:** env настройки поддерживаемой модели запуска доходят до процесса. Actual — whitelist их отфильтровывает; AI model silently defaults, S3 client лишается endpoint/credentials/bucket configuration.

**Влияние:** uploads/parsing не работают в env-only root launch; оператор выбирает модель, но worker использует default. При build-time public variables возможны дополнительные cache pitfalls; они отдельно не доказаны.

**Минимальное исправление:** явно перечислить runtime env/passThroughEnv для соответствующих tasks, public build env включить в hashing. На production запускать процессы напрямую по documented контракту с fail-fast schema env validation; не полагаться на обязательный секретный `.env` в source directory.

**Проверка устранения:** этот же probe видит все supplied variables; чистый env-only запуск использует нужный endpoint/bucket/model. Проверить ошибку startup при missing required variables вместо позднего upload failure.

## RD-05 — P2: workspace dashboard показывает постоянные данные вместо состояния workspace

**Места:** `apps/web/src/app/(dashboard)/w/[workspaceId]/dashboard/page.tsx:36-65,67-104,106-137,139-182,184-242,244-249,260-267`.

**Условия:** любой авторизованный member открывает dashboard, в том числе новый workspace без задач/документов. Реальные auth/workspace checks проходят, но значения domain metrics не зависят от workspace.

**Доказательство:** arrays объявлены на уровне module: Total Tasks=28, Documents=47, AI Conversations=143, Members=1, Workspace=Personal; tasks/notes/documents/activity/productivity имеют постоянные titles/dates. Page вызывает только auth и getWorkspaceForUser, не aggregate/domain queries. Original page отрендерен в browser fixture для обеих тем/четырёх widths (`ui-pages-results.txt`, dashboard screenshots). Настоящие DB mutations не выполнялись: неизменность после них следует из полного source dataflow, а не приписанного e2e теста.

**Expected / actual:** пустой workspace показывает нули/empty states; новые записи и корректный type/member count отражаются на dashboard. Actual — UI показывает произвольные записи и метрики независимо от БД, включая неверное Personal для Team workspace.

**Влияние:** пользователь принимает фиктивные сроки/документы/статистику за свои, dashboard непригоден для управления работой. Это отдельный read-model defect: он не исправляется подключением OpenAI provider из PF-01.

**Минимальное исправление:** workspace-scoped aggregate/list queries и отображение действительных count/dates; пока они не готовы, явно обозначить dashboard как demo либо показывать честные empty states без invented metrics.

**Проверка устранения:** disposable empty PERSONAL/TEAM workspaces с разными memberships → правильные нули/type/member count; добавить/завершить task, upload document, сохранить note → только соответствующий workspace меняет dashboard после refresh.

## Отличие дефекта приложения от локальной установки

Текущая рабочая копия: build FAIL на sign-in async transition; web tsc 10 TS2345; остальные четыре packages tsc PASS. Это реальные выполненные результаты, но их нельзя переносить на любой чистый checkout.

Чистая source snapshot: `pnpm install --frozen-lockfile` PASS; первая build FAIL с implicit-any у workspace map из-за ещё не generated Prisma Client; `prisma generate` (без DB connection/migration) PASS; повторная build PASS, web tsc PASS. До prod-only install все 159 копированных source/config SHA совпадали с исходными. В главном checkout эти файлы также остались неизменны.

Независимый compiler probe установил: в исходном `.pnpm/node_modules/@types` react/react-dom оказались пустыми обычными directories; отсутствует experimental type resolution, ожидаемый Next canary overload не загружается. Подмена только in-memory filesystem resolution на реальные уже установленные direct types убирает 10 diagnostics. `evidence/quality-crosscheck.json`, `types-original.json`, `types-clean.json`, `quality-verification.md` описывают проверку. Мы не чинили эти directories.

Runtime/browser: Next 14.2.35 App Router использует React `18.3.0-canary-178c267a4e-20241218`; nominal dependency React 18.3.1 не описывает весь runtime. Actual deferred task action удерживает pending/disabled, отправлен один POST, error отображается. Поэтому прежняя гипотеза о неизбежных duplicate submits от async transition отвергнута для проверенного Next scenario. [React 18 standalone docs](https://18.react.dev/reference/react/useTransition) требуют synchronous scope, но это не заменяет измерения compiled Next runtime.

## Provisioning/deployment: проверенные пробелы и пределы

- `infra/docker-compose.yml:1-2` явно local development; PostgreSQL/Redis healthchecks присутствуют, MinIO healthcheck/init bucket отсутствуют (`:37-49`). Web/worker services в compose нет. Default passwords и порты — локальная конфигурация; публичная production экспозиция не доказана.
- `.env.example` документирует env names, но runbook/README, CI workflows, release artifact instructions, migration deploy script отсутствуют. В db scripts есть migrate dev/push/reset, но нет migrate deploy. Эти команды не исполнялись на существующей БД.
- Prisma schema и обе migrations просмотрены: initial tables/enums/indexes/FKs и затем summaryJson JSONB. Validate PASS проверяет schema syntax, не корректность применения SQL к deployment DB. Реальные migration deploy/rollback/backup restore не проверены.
- S3 PutObject используется с configured bucket, CreateBucket/HeadBucket/init helper нигде нет. Поэтому fresh MinIO volume потребует внешнего provisioning bucket. Мы не утверждаем, что production bucket отсутствует: его доступность не проверена.
- DB/S3 backup/versioning, Redis durability/eviction, monitoring/alerts, worker readiness, reverse proxy body limits/TLS, секреты deployment и его OS не доступны. Это условия допуска, не выдуманные текущие incident findings.
- Дополнительный запуск clean built server на loopback был отклонён автоматическим review (`blocked by policy`, без конкретной причины). Не обходился и не засчитан. Browser inspection выполнен на разрешённом isolated Next dev стенде. Заявленные prod-only scripts действительно запускались и падали до серверной инициализации.
