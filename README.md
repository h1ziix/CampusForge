# CampusForge

R3 добавляет независимые UUID object keys, ограниченный multipart reader и durable upload/parse/delete lifecycle в PostgreSQL. Результаты failure tests и границы проверки: [R3](docs/releases/R3.md). Допуск к production по-прежнему требует остальных релизов и проверок инфраструктуры.

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

## Документы: upload, recovery и удаление (R3)

Upload принимает ровно один part `file`. Дополнительные файлы, duplicate file parts и текстовые поля отклоняются. Лимиты: файл 10 MiB, всё multipart body 10 MiB + 64 KiB, part headers 8 KiB, boundary 70 символов, filename 500 символов и 2048 UTF-8 bytes, MIME metadata 128 bytes. Неподдерживаемые текстовые поля ограничены 1 KiB до отказа. `Content-Length` лишь позволяет отказать раньше: фактически прочитанные bytes ограничиваются и без заголовка. Reader прекращает чтение и отменяет stream при переполнении, abort или deadline 30 секунд. PDF проверяется по расширению и signature, TXT/Markdown — по расширению, UTF-8 и отсутствию binary controls; MIME клиента не считается доказательством безопасности содержимого. Это проверка пригодности для parser, не антивирус.

До S3 Put PostgreSQL сохраняет `DocumentUploadIntent` с UUID и уникальным ключом. S3 Put имеет conditional create, ownership metadata и deadline 30 секунд. После Put одна короткая транзакция создаёт Document и `DocumentTask` PARSE и финализирует intent. HTTP `201` означает файл сохранён и задача обработки durable (`processingStatus=PENDING`), parsing ещё может ожидать. В upload request path нет Redis. При неоднозначном DB ответе сервис проверяет persisted acceptance; если подтвердить его нельзя, возвращает ошибку с просьбой обновить список перед повтором. Принятый документ никогда не компенсируется cleanup своего FINALIZED intent.

Compiled worker запускает dispatcher/reconciler вместе с BullMQ consumers. Его можно запустить на нескольких instances: PostgreSQL claims с токеном/lease выбирают одного владельца, expired claims восстанавливаются; Redis delivery повторяется с backoff. Task остаётся незавершённой до persisted parsing result, поэтому потеря/удаление Redis job record не теряет работу. Stable parse ID: `parse-{documentId}-v1`. Уже завершённый document пропускает повторную доставку; parsing lease и guarded result commit не допускают публикацию старой попытки после recovery или tombstone. При исчерпании пяти parse attempts документ остаётся FAILED для диагностики; cleanup/dispatch инфраструктурные retries продолжаются. Recovery не вызывает AI provider.

Незавершённый upload после десятиминутного lease обнаруживается ledger sweep. Cleanup проверяет ownership metadata и повторяет Delete через 24-часовой quarantine, учитывая неоднозначный исход прерванного Put. Receipt остаётся в PostgreSQL. S3/Redis вызовы не выполняются внутри DB транзакций. Данные ledger/outbox следует мониторить: overdue tasks, expired leases, failed parsing и количество cleanup attempts. Worker должен работать постоянно; без него upload сохраняется, но parsing и физическое удаление ждут.

Delete action подтверждает durable tombstone и cleanup intent. С этого commit документ исчезает из обычных queries и недоступен generation/новому parsing; физический S3 Delete выполняется фоном. S3 failure сохраняет retryable task. После S3 success транзакция удаляет tombstoned Document и отмечает receipt завершённым; её failure безопасно повторяет идемпотентный S3 Delete. Повторный delete через тот же workspace и уже отсутствующий объект безопасны. Существующие flashcards/quizzes/AIJob сохраняются согласно прежнему `SetNull`; R3 не вводит полное стирание производных материалов, backups или S3 versions.

AI actions после R4 принимают обязательный `idempotencyKey` и сохраняют операцию вместе с task в PostgreSQL; Redis отсутствует в HTTP path. Worker consumers сохраняют долгоживущую connection policy; dispatcher использует отдельный ограниченный producer и durable retries. Контракт генерации, расходов и неизвестных исходов описан ниже.

## Безопасный порядок миграции R3

Новая migration: `20261005120000_document_durable_lifecycle`. Старые migrations не переписаны. Проверки R3 применяют её только на свежей disposable БД с отдельными ports, bucket и synthetic credentials. Для существующего target сначала backup/rollback plan, остановка старых web/worker writers, read-only preflight дубликатов и сверка S3 ownership; затем отдельное административное `pnpm db:deploy` из full build workspace и запуск только нового web/worker artifact.

```sql
SELECT "storageKey", COUNT(*)
FROM "Document"
GROUP BY "storageKey"
HAVING COUNT(*) > 1;
```

Если preflight возвращает строки, миграция уникальности завершится ошибкой. Автоматического переименования/удаления пользовательских объектов нет: требуется отдельный reviewed recovery plan. Не запускайте `db:push`, reset или synthetic integration против пользовательской БД. Migration материализует tasks для старых PENDING/PROCESSING/FAILED документов, сохраняя object keys и COMPLETED результаты.

`pnpm verify:r3` запускает generation/validation, все packages typecheck/lint, format check, tests, env probe и build с synthetic environment; evidence пишет только в R3. `pnpm verify:r3:release` создаёт новый временный bundle, устанавливает production dependencies, проверяет compiled dispatcher/lifecycle imports и запускает synthetic runtime probe. Отдельный disposable integration runner и его фактические команды описаны в [R3](docs/releases/R3.md). Release packaging требует compiled dispatcher и DB lifecycle module; dev TS/CLI не нужны runtime services.

## AI generation: durable lifecycle и расходы (R4)

R4 меняет backend summary/flashcard actions и workers. UI-кнопки остаются вне этого релиза. Формы backend actions требуют `documentId`, `workspaceId` и `idempotencyKey` (1–128 ASCII letters/digits/`.`/`_`/`-`). Ключ создаёт клиент один раз на сознательную генерацию и повторно использует при сетевой ошибке. Ответ содержит `documentId`, `operationId`, `status`; это receipt принятой работы, а не готовый AI output. Новый ключ разрешает новую генерацию в пределах budget/concurrency policy. Тот же ключ с другим документом, текстом, типом, filename, моделью или effective parameters отклоняется.

Authentication/membership сохраняются; DB acceptance повторяет membership и ACTIVE/COMPLETED document checks. Одна транзакция резервирует workspace budget, создаёт логическую `AIJob` и AI task в существующем `DocumentTask` outbox. Workspace row lock и unique `(workspaceId,idempotencyKey)` сериализуют admission. Текст snapshot и SHA256 version фиксируются до enqueue; очередь передаёт только operation ID. Flashcards используют этот immutable document text, чтобы изменённый summary не стал скрытым входом. Terminal operation очищает свой snapshot; исходный Document и пользовательские artifacts следуют прежней продуктовой retention policy.

Операция: `PENDING → PROCESSING → COMPLETED/FAILED/UNCERTAIN/CANCELLED`; известный retryable HTTP rejection даёт `RETRY_WAIT → PROCESSING`. Lease по умолчанию 60 секунд, heartbeat через треть lease. Atomic claim и token/expiry/deadline fences запрещают старому worker публиковать результат. Artifact, result receipt, completion и budget settlement транзакционны. Completed redelivery возвращает receipt без provider call, включая commit-before-ack и удалённую Redis history. Новый worker восстанавливает просроченную claim без внешней попытки; потерянная STARTED attempt становится UNCERTAIN и автоматически не повторяется. Полученный ledger без сохранённого output становится FAILED с сохранённым usage. Document tombstone сериализуется с publication; поздний результат не создаёт новый доступный artifact.

SDK retries отключены, BullMQ `attempts=1`; разрешённые retries принадлежат DB lifecycle. Defaults: максимум 3 внешние попытки; connection/time-to-headers 5 секунд, request 30 секунд, вся операция **с момента admission** 120 секунд. Backoff exponential с jitter 0.75–1.25 и пределом 30 секунд, соблюдает Retry-After как минимальную задержку; если она не помещается в operation deadline, retry не выполняется. HTTP 429/5xx допускают bounded retry; credentials, invalid input/output и частичный ответ terminal. Network/timeout/abort и crash после STARTED означают неизвестный внешний исход без automatic retry. HTTP 5xx может скрывать расходы: его попытка сохраняет UNKNOWN accounting и удерживает резерв даже после успешного retry. Abort ограничивает ожидание и отменяет transport по возможности; он не гарантирует отсутствие provider billing или остановку удалённого вычисления.

`AIAttempt` STARTED сохраняется до каждого вызова. Received usage, actual model, request correlation и версия pricing сохраняются **до** JSON/schema validation и artifact transaction. Пустой usage и неизвестная цена остаются `null`; они никогда не означают `$0`. `estimatedCost` — USD estimate, не invoice. Approved pricing identifiers и официальные источники закреплены в [R4](docs/releases/R4.md). Неизвестная requested model запрещена на admission; неизвестная actual model сохраняет ledger, отклоняет output и удерживает резерв. Accounting write failure переводит operation/attempt в UNCERTAIN; при полной DB outage retained STARTED восстанавливается после lease. Ответ, потерянный между provider и durable accounting, невозможно восстановить из процесса: оператор сверяет project/provider usage, безопасные request IDs и временные окна, сохраняя неопределённость до подтверждения.

Input ceiling 16,000 использует консервативную сумму UTF-8 bytes всех prompt messages плюс framing margin; это upper bound, не точный tokenizer. Character truncation удалён: oversized source отклоняется. Output ceiling 2,048 tokens и 65,536 UTF-8 bytes. Validators trim строки, требуют meaningful поля, ограничивают длины; summary 1–6 sections и 1–10 key terms, flashcards 1–30. Sparse source допускает малый результат без искусственного наполнения. Extra fields отклоняются. Repair calls отсутствуют. Schema validity не подтверждает фактическую правильность AI.

Все `AI_*` defaults и ranges проверяются runtime validation и передаются через Turbo; [.env.example](.env.example) содержит параметры. Web и worker должны получать согласованную policy и `OPENAI_MODEL`; API key нужен только worker. Default reservation покрывает max input/output всех 3 attempts. Workspace lifetime budget $1 (`AI_WORKSPACE_BUDGET_MICROS=1000000`), per-operation ceiling $0.10, максимум 2 admitted nonterminal operations на workspace. Atomic reservation не списывается повторно при delivery. Известный terminal outcome освобождает остаток резерва и добавляет received estimate; unknown/missing/unpriced outcome освобождает concurrency slot, сохраняет **весь** резерв и добавляет известные расходы консервативно. Автоматического reset или списания uncertain reserve нет; adjustment требует отдельного reviewed reconciliation. Это внутренний admission control, не жёсткий лимит provider invoice.

Queue history ограничена: completed age 1 day/count 1000, failed age 7 days/count 1000; periodic cleanup раз в минуту чистит до 100 records каждого состояния. Active/waiting/delayed work не очищается. DB operation identity, input hash, numeric accounting ledger и artifacts не удаляются queue cleanup. После 90 дней settled terminal attempts compact correlation/error metadata bounded batches (default 100); uncertain records сохраняют diagnostics до reconciliation. Минимальные identity/numeric ledger сохраняются бессрочно ради idempotency/accounting; это явная техническая policy, а не изменение retention пользовательских материалов.

Recovery, dispatcher и cleanup входят в compiled worker и запускаются автоматически:

```sh
pnpm start:worker
pnpm verify:r4
pnpm verify:r4:integration
pnpm verify:r4:release
```

Verify использует synthetic env и отдельные evidence. Integration создаёт новые run-labelled disposable PostgreSQL/Redis containers с отдельными ports, применяет migration chain только к новой БД и использует deterministic provider transport. Не запускайте старые verify-команды для получения R4 evidence: их output destinations относятся к прежним релизам. Детальная failure/concurrency matrix и ограничения: [docs/releases/R4.md](docs/releases/R4.md).

Diagnostics: считайте `AIJob` по `status/accountingStatus`, overdue `deadlineAt/leaseUntil`, pending `DocumentTask(kind=AI)`, STARTED/UNCERTAIN attempts, held `AIWorkspaceBudget.reservedMicros` и backlog cleanup. Логи используют IDs и safe error codes; raw document/provider text не попадает в публичные ошибки. Не повторяйте uncertain operation с новым key без проверки риска повторной оплаты и бюджета.

Новая migration `20261008120000_ai_durable_lifecycle` additive; старые migrations не переписаны. Legacy PENDING/PROCESSING summary/flashcard receipts помечаются FAILED/LEGACY_UNKNOWN без вызова provider, поскольку их исход и вход восстановить достоверно нельзя. Для существующей БД: backup/rollback plan → остановить **все старые web/worker writers** → проверить legacy operations и согласовать их recovery → отдельно выполнить административный `pnpm db:deploy` из full build workspace → запустить согласованный новый web/worker artifact → проверить pending/uncertain/backlog. Эти действия не выполняются автоматически build/start и не выполнялись на пользовательской БД. R4 не является разрешением на production.
