# Независимый аудит документов, очередей, сохранности данных и AI

Дата: 4 октября 2026. Область: upload API → S3 → Prisma → BullMQ → worker → OpenAI → validation → DB → UI. Исходники приложения не изменялись. `.env` не читался и не загружался, существующая БД/Redis/S3 не использовались, платных AI-вызовов — 0. Прочитаны инструкции пользователя и `docs/AUDIT-PROMPT.txt`. Физического `AGENTS.md` в корне нет; пользовательские инструкции применяются как переданные в чате. Предыдущий аудит не использовался как доказательство.

## Вывод по области

Эта часть проекта **не готова к production**. Рабочие backend-процессоры существуют, но основные AI-кнопки страницы документа и весь чат показывают локально сочинённые ответы. В сохранности документов есть воспроизводимая коллизия S3 keys с перезаписью/удалением чужого файла внутри workspace. Отказы после промежуточной записи оставляют несогласованные DB/S3/queue состояния. Жизненный цикл AI-задачи не переносит повторную доставку и завершение упавшего worker: создаются дополнительные результаты либо остаётся бессрочный `PROCESSING`. Учёт стоимости не включает часть выполненных попыток.

Ни одного P0 в этой области не установлено. P1 ниже — блокеры выпуска. Наличие этих ошибок не означает, что реальные внешние сервисы были повреждены: опасные сценарии воспроизводились изолированно.

## Исполненные проверки

| Проверка | Результат и доказательство | Граница |
|---|---|---|
| `node docs/audit-2026-10-04-independent/probes/pipeline-probes.cjs` | Exit 0; 17 отдельных scenarios с assertion-ами. Полный JSON: `probes/pipeline-results.json`. Два положительных сценария backend, остальные воспроизводят дефекты/ограничение truncation. | Выполняются **неизменённые TS-функции приложения**, транспилированные TypeScript в VM; внешние зависимости заменены in-memory mocks. Это не E2E с настоящей Prisma/S3/Redis/OpenAI. |
| TXT parser, повторный запуск | UTF-8 текст сохранён, `COMPLETED`, два запуска дают одинаковый текст. | S3 async stream и Prisma mocked; настоящий `processDocumentJob`. PDF parser не вызывался. |
| Summary и flashcard happy path | Настоящие worker-функции → настоящий `AIProvider.completeJSON` → реальные prompt builders и validators → mock Prisma transaction. Две `COMPLETED` AIJob с 300 tokens, summary и набор карточек сохранены; flashcards получают persisted summary. | Responses API синтетические, качество настоящей генерации и provider credentials не проверены. |
| S3 collision и rollback cleanup | Два документа → один S3 key/object; первый получает содержимое второго. При провале второго DB insert cleanup удаляет объект первого. | Fixed `Date.now` моделирует два upload в одну миллисекунду; MIME/content синтетические. |
| Enqueue failure | Upload success, DB `PENDING`, queued jobs 0. | Queue add принудительно rejects, проверяется actual service catch. |
| DB/S3 deletion failures | S3 failure → DB row удалён, объект остался; DB failure после S3 delete → row остался без файла. | Изолированные failures, actual `deleteDocument`. |
| Duplicate generation before worker | Четыре последовательных summary/flashcard actions accepted, jobs queued 4, DB AIJob 0. | Functions исполняются directly; публичная доступность неиспользуемых server actions не утверждается. |
| Replay после DB commit | Одна и та же job data дважды → два provider calls и два FlashcardSets. | Моделируется повторная доставка actual processor, настоящий процесс worker не убивался. |
| Crash/stalled попытка | Старый `PROCESSING` + новый `COMPLETED` → последующий action permanently rejects. | Первый provider promise оставлен unresolved, затем запущен actual processor повторно. Redis lock recovery не запускался. |
| Cost/validation errors | Billed usage в синтетическом provider response пропадает при parse failure и DB transaction failure; неизвестная pricing model получает `estimatedCost=0`. | Billing API не запрашивался. |
| SDK retry budget | Installed OpenAI 6.34.0 с mocked `fetch` 500: два worker attempts → шесть HTTP attempts; defaults 2 retries, 600000 ms timeout. | Все HTTP responses синтетические; шесть transport attempts **не равны шести доказанным списаниям**. |
| Whole multipart body | Настоящий Node `Request.formData()` распарсил 11 534 654 bytes с `file` 1 byte и ignored part 11 MiB; actual route ответил 201. | Auth/membership/create service mocked. Наличие внешнего proxy limit не проверялось; вывод о собственном handler. |
| `node docs/audit-2026-10-04-independent/probes/redis-outage-probe.cjs` | Exit 0. Actual queue source + installed BullMQ 5.74.1 / ioredis 5.10.1; 8 соединений, promise pending через 1513 ms; `maxRetriesPerRequest=null`, `enableOfflineQueue=true`. | Изолированный loopback TCP server сразу закрывает connections, настоящего Redis нет и Redis writes 0. Это bounded observation, не ожидание «бесконечно» по времени. |
| Source trace UI/backend | Подтверждены разрыв UI/worker, metadata-only attachment analysis, inert settings, отсутствие outbox/reconciliation/retention в tracked app source. | Browser/pixel QA поручены отдельной области; этот отчёт не заявляет screenshot/E2E проверку. |

После source/probe аудита frontend-агент независимо сообщил browser confirmation PF-01: actual DocumentDetailView с DB-props sentinel `TRUTH_MARKER_42 real database summary` не показывает sentinel; нажатия Generate дают `POST requests[]`, затем filename-based summary и demo cards. Его evidence: `ui-functional-results.txt`, `probe-ui-functional.js`, `screenshots/document-summary-loading-390.png`, `screenshots/document-generated-demo-390.png`. Это corroboration отдельного агента; stand использует mocked auth/DB/actions/props и не считается full backend E2E.

Нужно воспроизвести probes из project root. Они блокируют неожиданные импорты и не импортируют настоящий DB/S3 client. Основной probe зависит от установленного `typescript`, `zod` и `openai`; отдельный outage probe также от установленного `bullmq`/`ioredis`.

## Карта реализации

| Сценарий | Фактический поток | Состояние |
|---|---|---|
| Upload document | `upload-document-dialog.tsx:95-122` → fetch upload route → auth/membership → metadata Zod → S3 upload → Document PENDING → Redis parse job | Backend реализован; внешнее happy path взаимодействие в этом аудите не запускалось. |
| Parse TXT/MD | BullMQ `parse` → `processDocumentJob` → S3 Buffer → UTF-8 → `Document.parsedText`, COMPLETED | Actual function проходит synthetic UTF-8 probe; source supports MD так же. |
| Parse PDF | S3 → `pdf-parse@1.1.4` → text → DB | Source реализован; настоящие PDF/scanned PDF/hostile PDF не проверялись. OCR отсутствует. |
| UI Generate Summary | `DocumentDetailView` → timeout 1.5–2.5s → `buildSummary(doc.filename)` → localStorage | **Demo.** Document text, queue, worker/provider не участвуют. |
| UI Generate Flashcards на странице документа | `DocumentDetailView` → timeout 2s → статические шесть `DEMO_FLASHCARDS` → localStorage | **Demo.** Нет `FlashcardSet` в DB и нет результата на отдельной backend-странице Flashcards. |
| Backend summary | `generateSummaryAction` → Redis summary job → worker → parsedText → OpenAI JSON → parser → Document.summaryJson + AIJob COMPLETED transaction | Реальный integration code, synthetic backend path проходит. **UI caller отсутствует**: `rg generateSummaryAction` находит только объявление. |
| Backend flashcards | `generateFlashcardsAction` → Redis → worker → summaryJson либо parsedText → OpenAI → parser → FlashcardSet + AIJob transaction | То же; UI caller отсутствует. |
| Display persisted summary | Server page читает DB summary/jobs и передаёт props | Client component эти props не использует. |
| Display persisted FlashcardSet | Workspace Flashcards list/detail queries → `FlashcardSetDetailView` → `FlashcardViewer` | Реальные DB shape и UI есть; viewer browser coverage в отчёте frontend. |
| Assistant chat | React handlers → local `generateResponse`/`generateFileAnalysis` → timers word-by-word → localStorage | **Demo**, providers/model labels — оформление. Conversation history не передаётся в generation. |
| Attachments in Assistant | Берутся filename/ext/size; image preview `blob:`; имитируется progress | Bytes документа не читаются и не upload-ятся. Для images engine не анализирует preview pixels. Учитывается только первое вложение. |
| Assistant settings | Theme, autosave, model flavor, responseLength меняют поведение/оформление | Language, temperature, systemPrompt, memory, notifications не влияют на генерацию. Internet/voice честно отмечены Soon/disabled. |
| Quizzes/research/resume/explanations | Enums и Prisma models есть | Нет маршрутов/AI processors для этих scenarios; в worker switch только summary/flashcard. |

## Подтверждённые findings

### PF-01 — P1: UI обещает AI-анализ и подменяет его шаблонами, настоящие DB результаты скрываются

**Файлы/строки:** `apps/web/src/components/document/document-detail-view.tsx:59-101,110-115,160-178,218-220,310-312`; `apps/web/src/app/(dashboard)/w/[workspaceId]/documents/[documentId]/page.tsx:32-47`; `apps/web/src/components/assistant/assistant-app.tsx:169-191`; `apps/web/src/components/assistant/chat-input.tsx:65-95`; `apps/web/src/lib/assistant/engine.ts:515-552`; `apps/web/src/lib/assistant/types.ts:23-34`; `apps/web/src/components/assistant/settings-dialog.tsx:157-168,190-229,246-255`.

**Условия:** обычный пользователь нажимает Generate Summary/Flashcards или отправляет вопрос/вложение в AI Assistant. Документ может иметь реальный `summaryJson`, real FlashcardSet, FAILED job либо ещё PENDING parsing — интерфейс всё равно исполняет шаблон.

**Доказанный поток:** page действительно выбирает summary/jobs/sets из DB и передаёт четыре props. `DocumentDetailView` destructures только `{ document: doc, workspaceId }`. Нажатия вызывают timeout → filename-derived template/static six cards. Ни imports actions, ни API invocation нет. Чат вызывает local synchronous function, даже не передавая историю conversation. Attachment interface содержит только metadata и image object URL; ingestion не читает file text. Engine `generateFileAnalysis` использует только первое имя/ext/size, выдавая утверждения «I've analyzed» и «What I see». Probe с одинаковой metadata и различным `content` даёт одинаковый ответ; это synthetic дополнение к доказанному отсутствию bytes в реальном interface. Отдельные свежие VM executions с различными systemPrompt/temperature дают identical response.

**Expected / actual:** expected — содержимое документа анализируется provider, показаны действительные results/error states, настройки применяются или обозначены неподдерживаемыми. Actual — общие claims о качестве документа, не основанные на его содержимом; backend AI результаты игнорируются. Generated flashcards не оказываются в DB list.

**Влияние:** основная заявленная ценность продукта не реализована end to end; учебные выводы могут полностью противоречить загруженному документу; UI успешно «генерирует» при отсутствующем OpenAI/Redis/worker. Это функциональный блокер, а не проблема качества одного prompt.

**Минимальное исправление:** либо явно обозначить весь локальный experience как demo, отключив claims о настоящем анализе, либо подключить существующие server actions, показать persisted summary/sets/status/error и refresh/polling. Assistant требуется отдельный backend chat/attachment pipeline; до его появления убрать claims об анализе bytes и отключить неработающие controls. Не запускать live UI generation до устранения PF-04/PF-07.

**Проверка устранения:** synthetic document с unique content sentinel → один POST/action → одна queue job → provider получает sentinel → валидированный result появляется на странице и после reload. Persisted DB sentinel result отображается до нажатия кнопки. Provider failure даёт error, а не demo result. Вложение с отличающимся содержимым меняет provider input; настройки либо влияют на input/behavior, либо marked unsupported.

### PF-02 — P1: S3 ключи совпадают; второй upload и его cleanup повреждают первый документ

**Файлы/строки:** `apps/web/src/server/services/document.ts:29-36,45-60`; `apps/web/src/lib/s3.ts:47-53`; `packages/db/prisma/schema.prisma:191-210` (`storageKey` не unique).

**Условия:** два upload в одном workspace в одну миллисекунду с одинаковым filename либо разными именами после sanitization. Например `a b.txt` и `a?b.txt` обе превращаются в `a_b.txt`. При parallel instances timestamps совпадают независимо от скорости single-instance S3.

**Воспроизведение:** actual `createDocument`, фиксированный timestamp, in-memory S3/Prisma. Первый file `alpha`, второй `bravo` → DB rows 2, objects 1; оба storageKey равны, первый считывает `bravo`. Во втором probe у второго insert failure: S3 overwrite уже произошёл, `deleteFromS3(storageKey)` removes общий объект → valid первая DB row остаётся без файла. Результат зафиксирован в `pipeline-results.json`.

**Expected / actual:** каждый upload имеет независимый immutable key; rollback удаляет только объект своей попытки. Actual — collision приводит к overwrite, rollback/delete удаляет общий объект.

**Влияние:** необратимая потеря/подмена пользовательского содержимого внутри workspace; parser может получить чужую версию файла. Timestamp с миллисекундами не является уникальным ID. Между разными workspace этот конкретный ключ не совпадает; cross-tenant overwrite не заявлен.

**Минимальное исправление:** предварительно создать UUID/CUID document/upload ID и использовать `documents/{workspaceId}/{uploadId}`; filename хранить как metadata. `storageKey @unique` как дополнительная DB проверка. При необходимости S3 conditional put; cleanup только принадлежавшего операции ID. Не считать `@unique` достаточным исправлением: он предотвратит DB insert, но без смены key cleanup всё ещё может удалить чужой объект.

**Проверка устранения:** 100+ одновременных upload одного имени и пары с colliding sanitization при fixed timestamp создают 100+ объектов с independent bytes. Reject одного DB insert не меняет соседние объекты; delete одного документа не влияет на другие.

### PF-03 — P1: commit документа не гарантирует durable enqueue и recoverability

**Файлы/строки:** `apps/web/src/server/services/document.ts:42-72`; `apps/web/src/app/api/workspaces/[workspaceId]/documents/upload/route.ts:95-111`; `apps/web/src/server/actions/document.ts:14-47`; `apps/worker/src/jobs/parse-document.ts:34-39,95-115`.

**Условия:** S3 и DB успешно сохранены, после чего queue.add fails; web process crashes после DB commit до add; Redis принимает job, затем теряет данные, не отражённые в DB. Последнее — сценарий для isolated integration verification, не факт текущего Redis deploy.

**Воспроизведение / data flow:** в actual service mocked enqueue rejects. Catch только пишет log; return `{ok:true,documentId}`; route отвечает 201. В DB PENDING и queue 0. `rg` по всем app/package source не обнаруживает requeue action, outbox dispatcher, reconciliation/cron. Комментарий «can be retried manually or by a cron» не подкреплён кодом. Crash window следует из последовательности независимых `await`.

**Expected / actual:** acknowledged accepted upload имеет durable план обработки либо явный recoverable error. Actual — upload успешен, parsing никогда не начнётся без ручной операции вне приложения.

**Влияние:** постоянные PENDING документы, недоступность настоящих summary/flashcards, молчаливая потеря задач. Отдельный PF-05 описывает когда request не rejects, а зависает при Redis outage.

**Минимальное исправление:** Document и durable outbox event записать в одной Prisma transaction; dispatcher повторяет enqueue по stable parse job ID, помечает доставку только после успеха. Reconcile PENDING/PROCESSING с leased timestamps и queue state, явная retry/recovery operation. UI показывает очередь/ошибку, не обещает completion.

**Проверка устранения:** в isolated environment отключить Redis до enqueue, kill web после DB commit, restart dispatcher → документ должен получить одну parse job и COMPLETED. Delete/worker crash должны завершать status либо давать operable retry; никаких PENDING/PROCESSING без owner/lease/recovery path.

### PF-04 — P1: AI-задача не имеет стабильной identity; duplicate requests/replay создают duplicates, crashed attempt блокирует recovery

**Файлы/строки:** `apps/web/src/server/actions/summary.ts:57-75`; `apps/web/src/server/actions/flashcard.ts:56-74`; `apps/web/src/lib/queue.ts:69-81,91-103`; `apps/worker/src/jobs/generate-summary.ts:35-51,81-98`; `apps/worker/src/jobs/generate-flashcards.ts:42-58,102-124`; `packages/db/prisma/schema.prisma:222-236,300-321`.

**Условия/достижимость:** processors реально используют очередь и будут запущены при backend jobs. Сейчас UI кнопки не вызывают эти actions (PF-01). Доказано поведение actual functions, но exploit публичного Server Action ID не утверждается. Defects сохраняются при direct queue producer либо после ожидаемого подключения UI.

**Доказательство трёх последствий одной причины:**

1. Action ищет AIJob PENDING/PROCESSING, но не создаёт его. AIJob создаёт worker позднее. **Даже последовательные** повторные actions до старта worker проходят guard: четыре requests → четыре queued jobs, AIJobs 0. Race не требует двух requests в один exact instant. `queue.add` не задаёт `jobId`/deduplication.
2. Каждый вызов processor создаёт новую AIJob и без проверки прошлого результата вызывает provider. Actual same job data дважды → calls 2, AIJobs 2, FlashcardSets 2. Это моделирует redelivery после committed transaction до BullMQ ack; процесс не убивался. [BullMQ прямо требует idempotent processors](https://docs.bullmq.io/patterns/idempotent-jobs).
3. Процесс потерян во время AI-call: старая AIJob остаётся PROCESSING. Replay создаёт другую row, успешно COMPLETED, старую row не меняет. Actual source probe → `[PROCESSING, COMPLETED]`; следующий action rejects «already being generated». [BullMQ переводит stalled job обратно в waiting/failed](https://docs.bullmq.io/guide/jobs/stalled), но Prisma row с этой recovery не связана. Если падает parser, BullMQ retry normally повторно обновляет тот же Document; отсутствие всякого QueueScheduler само по себе не дефект (современный BullMQ его не требует).

**Expected / actual:** logical request/operation переживает attempts/replay и имеет одну result identity; queued job сразу видим; abandoned attempt не блокирует дальнейшую работу. Actual — job rows отражают invocation count, результат создаётся повторно, stale processing остаётся навечно.

**Влияние:** повторные расходы, duplicate study sets, nondeterministic overwrite summary, permanent lockout при routine worker restart/crash. Изолированная transaction защищает запись результата конкретной попытки, но не защищает весь at-least-once workflow.

**Минимальное исправление:** резервировать AI operation в DB до enqueue (transaction с outbox, уникальный operation/request key), передавать `aiJobId`/operationId в job, stable Bull jobId. Worker claims/reclaims lease этого operation, пишет attempt отдельно; output привязан unique к operation. На повторной доставке completed result возвращается без provider call. Reconciliation завершает stale lease. Queue-side ID полезен, но DB uniqueness и completed replay guard обязательны, особенно после удаления старых queue jobs.

**Проверка устранения:** 20 sequential/concurrent requests до worker → одна logical operation/job; две redeliveries после commit → одна result row и отсутствие повторного provider call после доступного committed result. Kill во время provider → replay завершает тот же operation, устаревшая попытка не блокирует regeneration. Отдельно учитывать неизвестный исход timeout: нельзя обещать exactly-once provider billing без provider idempotency/resume guarantees.

### PF-05 — P1: HTTP producer ждёт Redis без конечного deadline

**Файлы/строки:** `apps/web/src/lib/queue.ts:15-21,51-59,74-81,96-103`; `apps/web/src/server/services/document.ts:64-72`.

**Условия:** REDIS_URL недоступен/теряет связь при awaited enqueue в upload/action. Web использует consumer-конфигурацию `maxRetriesPerRequest:null`. Ioredis defaults `enableOfflineQueue:true`.

**Воспроизведение:** `redis-outage-probe.cjs` исполняет unchanged queue module с настоящими установленными BullMQ 5.74.1/ioredis 5.10.1. Safe localhost TCP endpoint close-only, никаких Redis writes. Через 1513 ms/8 connection attempts promise всё ещё pending; собственный timeout отсутствует. Бесконечное ожидание выведено из configured unlimited retries/нет deadline, а не из длительного экспериментального wait. [BullMQ отдельно предписывает finite retry для HTTP producers](https://docs.bullmq.io/guide/connections).

**Expected / actual:** request за предсказуемое время сохраняет durable accepted state либо возвращает retryable failure. Actual — waits до восстановления Redis/внешнего request timeout. PF-03 catch не достигается, пока promise не rejects.

**Влияние:** hanging uploads/actions, stalled UI, удержание web resources; retries пользователя создают дополнительные документы. Наличие/значение upstream timeout не известно; оно не заменяет transactional durability.

**Минимальное исправление:** producer Redis connection отдельно от worker: конечные retry/deadlines/offline behavior, ошибки за несколько секунд. Надёжнее write outbox из PF-03 вместо direct HTTP→Redis dependency. Простая `Promise.race` не отменяет поздний enqueue и требует идемпотентной операции.

**Проверка устранения:** тот же outage probe завершает операцию явным отказом/deferred accepted в установленный deadline; восстановление Redis не создаёт untracked duplicate. Consumer может оставаться retry-forever отдельно.

### PF-06 — P1: multipart лимит 10 MiB проверяет только выбранный file после разбора всего body

**Файлы/строки:** `apps/web/src/app/api/workspaces/[workspaceId]/documents/upload/route.ts:51-76,83-87`; `packages/shared/src/schemas/document.ts:17,38-42`; `apps/web/next.config.mjs:1-15` (никакого собственного upload route limit).

**Условия:** authenticated member отправляет multipart с маленьким допустимым первым `file` и большими дополнительными parts/повторными files; либо giant body с недопустимым file. Auth/member checks до parsing полезны, но не ограничивают объём допустимого member request.

**Воспроизведение:** реальный multipart encode/parser Node20 Request, 1 byte `ok.txt` + 11 MiB `ignored` file = 11 534 654 bytes. Actual route sees только `formData.get('file')`, validation succeeds, mock createDocument получает 1 byte, response 201. Handler не проверяет число parts/files/total body и уже распарсил весь запрос к моменту size validation. Один только `Content-Length` недостаточен для streaming/chunked input.

**Expected / actual:** total bytes и number of parts ограничены до/во время memory allocation; ровно одно permitted file. Actual — остальные части silently ignored после полной materialization.

**Влияние:** обход заявленного own-body ограничения и memory/bandwidth/resource abuse со стороны member; параллельные multipart requests повышают нагрузку. Реальный memory-exhaustion не запускался. Отсутствие внешнего reverse proxy/WAF лимита **не утверждается**, production deploy недоступен.

**Минимальное исправление:** ограничить total request bytes и multipart parts на ingress и в streaming parser/request stream; reject unexpected/duplicate files, overhead-inclusive body budget. Проверять MIME sniff/signature для PDF, не считать client file.type гарантией реального формата. Byte sniffing — дополнительная рекомендация, отдельный exploit не установлен.

**Проверка устранения:** probe большого ignored part получает 413/400 до createDocument; duplicate file parts rejected; chunked body без Content-Length имеет тот же limit; допускается один 10 MiB файл с разрешённым bounded overhead.

### PF-07 — P2: successful AI attempts могут иметь нулевой/утерянный cost, retries/timeout не контролируются на уровне операции

**Файлы/строки:** `packages/ai/src/provider.ts:28-44,53-57,84-93,98-126,142-153`; `apps/worker/src/jobs/generate-summary.ts:71-75,81-98,113-121`; `apps/worker/src/jobs/generate-flashcards.ts:91-96,102-124,139-147`; `apps/web/src/lib/queue.ts:78-79,100-101`.

**Условия:** API response получил usage, но JSON invalid/shape validation throws; response valid, но DB transaction fails; deployment задаёт supported OpenAI model вне трёх hardcoded pricing keys; transient transport/API failures вызывают SDK + Bull retries.

**Воспроизведение:** actual provider после response с 2148 billed synthetic tokens/`finish_reason:length` throws invalid JSON Error без usage/meta. Actual summary worker после successful provider и transaction failure writes только FAILED/error: tokenUsage/cost отсутствуют. Valid mocked `gpt-4.1` response 200 tokens → `estimatedCost=0`, поскольку `estimateCost` возвращает 0 для неизвестного pricing key. Модель gpt-4.1 не бесплатна: [официальная карточка указывает input/output стоимость](https://developers.openai.com/api/docs/models/gpt-4.1).

Installed SDK `packages/ai/node_modules/openai/src/client.ts:437,447,1121` подтверждает timeout 600000 ms и maxRetries 2; app их не задаёт. Actual SDK с mocked 500 fetch делает шесть transport attempts за две mocked Bull attempts. [Официальная документация SDK](https://github.com/openai/openai-node/blob/main/docs/configuration.md) описывает default retries/timeout. Нельзя считать каждый 500 оплаченной генерацией; billing неизвестного исхода при потерянном response/timeout остаётся риском, не экспериментально доказанным списанием.

**Expected / actual:** attempt-level telemetry учитывает полученный usage даже при output validation/DB errors; неизвестная pricing model помечается unknown, не free; retries/deadline/budget explicit. Actual — cost записывается только в result transaction после всех parsing шагов, failure обходится без usage; model/version/requestId не persisted на AIJob; множитель retries не отражён в логической job budget.

**Влияние:** отчёт о расходах занижает billing, ошибки provider/output/DB можно многократно повторять без видимой стоимости; долгие hangs занимают оба AI worker concurrency slots. При double retry budget операция может совершить до 6 HTTP requests, каждый с default десятиминутным deadline. Это не количественное измерение production costs.

Дополнительное подтверждённое privacy последствие error handling: `provider.ts:108` включает первые 200 characters invalid generated output в Error.message; workers сохраняют сообщение в AIJob.errorMessage (`generate-summary.ts:105-120`, `generate-flashcards.ts:131-146`) и пишут Error в logs. Эти characters могут включать содержимое частного документа. Публичная утечка не установлена, но sensitive source fragments оказываются в persisted diagnostic channels без redaction/retention. Безопаснее log error category/requestId и bounded non-content diagnostics.

**Минимальное исправление:** выделить durable AI attempt record с model/requestId/input-output usage/cost status; извлечь metadata до validation и прикрепить к typed errors; хранить result/error независимо от cost ledger. Для unknown pricing `null/UNKNOWN` либо config validation. Явно задать SDK retries/timeout и суммарный operation deadline/budget, errors classified by retryability, never retry configuration/validation бесконтрольно. Quotas/rate limiting coordinated with AppSec.

**Проверка устранения:** invalid JSON, wrong schema, finish_reason length/refusal, DB failure, timeout/lost response, retry-success имеют attempt records; полученный usage никуда не исчезает, unknown billing не отображается `$0`. Mock SDK retry probe подтверждает установленный transport budget. В crash window между received response и durable write невозможно восстановить exact usage только из процесса; нужен documented reconciliation по provider/project usage и status unknown.

### PF-08 — P1: delete без durable saga теряет файл либо забывает неудалённый объект

**Файлы/строки:** `apps/web/src/server/services/document.ts:79-101`; `apps/web/src/server/actions/document.ts:31-48`.

**Условия:** S3 delete succeeds, DB delete fails; S3 delete fails, DB succeeds; либо process dies между этими шагами. In-flight queue jobs могут продолжить работу по deleted metadata.

**Воспроизведение:** два actual service probes. Mock S3 deletion outage → action service ok true, DB rows 0, S3 objects 1: исчезает единственная DB reference. DB deletion outage после S3 success → operation throws, document остаётся в DB, S3 objects 0. Cleanup/reconciliation/idempotent tombstone code отсутствует.

**Expected / actual:** accepted deletion завершает eventual cleanup; failed deletion сохраняет recoverability/явный deleting state. Actual — irreversible binary delete до DB acknowledgement либо orphan object без ссылки и операционного retry.

**Влияние:** потеря исходного документа при DB outage, indefinite retention забытых пользовательских файлов при S3 outage, невозможно восстановить их связь обычным DB lookup. Бэкапы/versioning S3 deployment не проверены и могут смягчать recovery; они не отменяют логический дефект.

**Минимальное исправление:** DB tombstone `DELETING` + durable deletion outbox в transaction, async idempotent S3 deletion/retry, затем final DB purge. Tombstone хранит storageKey до подтверждения. Worker checks deletion/version state, queued operations cancelled/ignored; derive retention policy для results отдельно.

**Проверка устранения:** независимо inject DB/S3 failures и kill между шагами; accepted deletion после recovery очищает object и metadata, failed deletion не уничтожает доступный файл без recoverable tombstone. Multiple delete/retries без adverse effect.

### PF-09 — P2: Redis job history сохраняется неограниченно

**Файлы/строки:** `apps/web/src/lib/queue.ts:52-59,74-81,96-103`; `apps/worker/src/index.ts:20-43,59-89`; `packages/db/prisma/schema.prisma:300-321`.

**Условия:** обычная длительная эксплуатация с большим количеством document/AI tasks, включая failed jobs. В Queue/Worker options нет `removeOnComplete`, `removeOnFail`, periodic cleanup. В приложении также нет AIJob retention/deletion API, а `Document` relation удаляет ссылку через SetNull, сохраняя outputJson.

**Доказательство:** статически все три producer options ограничивают только attempts/backoff; complete/fail handlers только log. [BullMQ сохраняет finished jobs до configured removal](https://docs.bullmq.io/guide/queues/auto-removal-of-jobs); installed library source поддерживает те же options. Рост памяти actual production Redis и чужой external cleanup не измерялись. Документальные outputs retention считается отсутствующим в repo policy, а не доказанным нарушением установленного SLA.

**Expected / actual:** ограниченные history age/count и понятная политика retention. Actual — каждый completed/failed job может оставаться без конца до external/manual purge; DB AIJob outputs тоже без встроенного expiry.

**Влияние:** монотонный Redis history рост/персистентный sensitive metadata retention, eventual memory limits и отказ очереди; увеличение AIJob таблицы. Расходы/объём зависят от нагрузок и deployment settings.

**Минимальное исправление:** configured finite age/count successful/failed jobs; audit ledger сохранять с отдельным purpose retention. Durable DB idempotence должна работать и после Redis auto-removal (PF-04). Определить удаление parsedText/outputJson/cache при user-requested erasure и policy expiry.

**Проверка устранения:** enqueue large synthetic batch в isolated Redis → history/count ограничен; failure diagnostics остаются на нужный retention window, а operation dedupe сохраняется после queue purge; policy purge удаляет выбранные sensitive artifacts.

### PF-10 — P2: output validation принимает пустые/бессодержательные учебные результаты

**Файлы/строки:** `packages/ai/src/prompts/summary.ts:84-129`; `packages/ai/src/prompts/flashcard.ts:107-141`.

**Условия:** provider возвращает structurally JSON output со строками из пробелов, пустыми section heading/content, keyTerms all nonstring/blank либо количеством карточек, противоречащим договору prompt.

**Воспроизведение:** actual `parseSummaryOutput({title:' ',tldr:' ',sections:[{heading:'',content:''}],keyTerms:[]})` succeeds. Actual `parseFlashcardOutput({title:' ',cards:[{front:' ',back:' '}]})` succeeds. Sections лишь strings, keyTerms invalid elements silently filtered, mandatory title/front/back требуют raw length>0 без trim. Prompt обещает 3–6 sections/10–30 cards, validator проверяет только nonempty array.

**Expected / actual:** meaningful обязательные поля/согласованный contract либо explicit quality failure. Actual — blank artifacts получают COMPLETED и могут попасть в persistent DB.

**Влияние:** empty/unusable study content, retry отсутствует поскольку output считается успешным; контракт качества молча расходится с prompt. Реальную вероятность такого OpenAI response не измеряли.

**Минимальное исправление:** schema с trimmed mandatory strings, deliberate count/length limits и validated keyTerms. Диапазон 10–30 должен быть либо enforced, либо явно ослаблен для коротких источников; не считать обязательное число карточек универсальным независимо от source density. Refusal/finish_reason отдельно классифицировать; не терять usage при rejecting output (PF-07).

**Проверка устранения:** blank/missing/wrong types/count overflow возвращают typed validation failure, valid reasonable sparse result принят по явному policy; failure usage сохраняется.

## Подтверждённые ограничения и гипотезы, не отдельные defects

- **Truncation:** оба raw-text builders ограничивают первые 48 000 JS characters (`summary.ts:50-71`, `flashcard.ts:50-71`) и добавляют note провайдеру. Probe подтверждает, что unique sentinel после 48k не передаётся. Это сознательное реализованное ограничение; chunking/full-document coverage нет. Budget задан characters, не точными tokens. Для default provider models этот probe не доказывает context overflow. Пользовательское disclosure partial analysis стоит добавить при подключении реального UI; пока UI полностью demo.
- **Prompt injection:** raw uploaded document и filename вставляются в user message, system prompt не отделяет внутри источника инструкции от данных. Возможна подмена summary/learning content через adversarial text. Нет tools, filesystem/network actions или других tenant documents у provider, поэтому privilege escalation/exfiltration этим путём **не доказаны**. Нужны offline prompt fixtures и отдельно разрешённые live evals; paid AI не запускался.
- **PDF abuse:** worker materializes весь S3 body (`parse-document.ts:21-28,58-68`) и PDF parser исполняется в том же Node process, где оба workers. Нет wall-clock/memory/text-output limits/sandbox. 10 MiB compressed PDF может быть дорог для parse; конкретный hostile PDF/CPU freeze не запускался, поэтому это **гипотеза**, не доказанный exploit. Нельзя автоматически приписывать pdf.js/browser advisories node pdf-parse path без reachable-code проверки.
- **Empty scanned PDFs:** OCR нет, `parsedText=''` считается COMPLETED. Backend actions correctly reject empty text. Это поддерживаемая text-extraction область с отсутствием OCR; UI demo эту разницу скрывает (PF-01). Настоящий scanned PDF не проверен.
- **Worker trust:** processors получают documentId/workspaceId/userId из Redis и выбирают Document только по id (`generate-summary.ts:54-56`, `generate-flashcards.ts:61-63`). Action проверяет workspace scope до enqueue. Привилегированный Redis writer мог бы подделать workspaceId для FlashcardSet; такому actor уже доступна инфраструктура. Публичный cross-tenant exploit не установлен. Для defense in depth verify document workspace/operation ownership в worker и убрать невалидированные payload identity.
- **Unknown job type:** worker switch default warns и resolve, поэтому misrouted job может стать completed без результата (`index.ts:33-36,79-82`). В repo producers используют только parse/summary/flashcard; public user-controlled arbitrary jobName не найден. Рекомендация throw typed unrecoverable error + alert; без конкретного producer trigger самостоятельный P1/P2 не заявлен.
- **List query performance:** document `findMany` без select/pagination (`server/queries/document.ts:33-36`, recent query `92-96`) получает parsedText/summaryJson, хотя list возвращает metadata. Для большого workspace это лишний DB traffic/memory; performance load test не выполнялся. Минимально metadata select и pagination, затем measure realistic corpus. Не считать доказанным production outage.
- **Deletion retention semantics:** `Document.aiJobs onDelete:SetNull` оставляет summary outputs в AIJob; FlashcardSet SetNull оставляет учебные карточки. Удаление исходника не обязательно должно уничтожать derivative study content, поэтому это вопрос явной retention/erase policy, не автоматически privacy breach.
- **Backups/AOF/bucket lifecycle:** `.env`/live infrastructure не инспектировались; свойства production Redis persistence, S3 versioning/lifecycle и backups неизвестны. Repo compose volume сам по себе не доказывает durable queue acceptance после crash.
- **Crash probes:** реальный процесс не убивался и BullMQ lock timeout не ожидался. Actual functions исполнялись повторно/с незавершённой provider попыткой, что доказывает state machine defect, но не полную инфраструктурную crash-recovery проверку.

## Что работает по проверенному коду

- Auth/member verification upload происходит до materialization файла; valid metadata проверяется shared schema; no public download URL route с guessed storageKey найден.
- В обычном S3 upload failure сервис не создаёт Document; DB insert failure пытается cleanup (безусловность cleanup опасна только при keys collision/failure).
- TXT parse работает с UTF-8 и идемпотентно перезаписывает тот же Document. Parsing error catch ставит FAILED и rethrows для retry; initial update missing document вне try, поскольку deleted row уже не нуждается в FAILED.
- Backend summary и flashcards реально получают parsedText, отправляют OpenAI JSON-mode messages, проверяют output shape и atomic transaction сохраняет artifact/status. Synthetic integration это подтверждает; real provider success не заявляется.
- Flashcards предпочитают persisted summary, а при его отсутствии берут parsed text. Output max tokens — 2048 summary/default и 4096 flashcards, temperature default 0.3.
- Queries документов/sets scoped по workspace. Membership/role/privacy полный coverage находится в отдельном AppSec отчёте; этот отчёт не повторяет общий localStorage finding.
- Assistant themes/autosave/length/flavor/feedback/export/clear history реально меняют client state. Эти client conveniences не превращают engine в provider integration.

## План исправления и допуска по зависимостям

1. **Защитить uploaded data:** PF-02 unique immutable object keys и PF-06 streaming whole-body/parts limit. Release gate — collision/oversized probes больше не воспроизводят дефект; delete другого upload не влияет на соседей.
2. **Durable operations:** PF-03 upload outbox, PF-08 delete tombstone/saga, PF-05 bounded HTTP producer. Спроектировать единый stable operation identity до реализации очередной UI генерации. Release gate — safe fault matrix S3/DB/Redis failures + process crashes приводит к recoverable terminal/effectively retryable состояниям.
3. **AI lifecycle/budget:** PF-04 stable AIJobId/leases/results uniqueness, PF-07 per-attempt telemetry/configured budgets, PF-10 output contract. Release gate — duplicate submissions/redelivery/kill recovery не создают лишний result, не оставляют stale PROCESSING, billing received usage не теряется на validation/DB failures.
4. **Реальное UI:** PF-01 подключить server actions/actual DB result и states; chat attachment/backend pipeline реализовать отдельно либо честно ограничить demo. Release gate — sentinel actual provider input/output, errors, retries, reload и workspace-scoped history. Live AI smoke требует отдельного разрешения на оплачиваемые calls; этот аудит их не совершал.
5. **Эксплуатация:** PF-09 bounded queue retention, erase/derived data policy, healthchecks/observability/recovery runbook. Worker artifact/migration/bootstrap production checks находятся в основном отчёте. Release gate — load test с realistic document corpus и failure detection; isolated full integration MinIO/PostgreSQL/Redis; backup/restore rehearsal отдельно подтверждён.

До решения шагов 1–4 продукт можно демонстрировать только с честным обозначением имитаций, а не выпускать как рабочий production AI document assistant.
