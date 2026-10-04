# Дополнительная независимая проверка quality/build выводов

Дата: 4 октября 2026 года. Это уточнение результатов общего аудита; приложение и node_modules основной рабочей копии не менялись.

**Корректная классификация:** первоначальный web build/typecheck FAIL с 10 TS2345 воспроизводится в основной рабочей копии, но вызван состоянием её установленного virtual store/type resolution. Это не доказательство универсальной несобираемости исходников или несовместимости async transitions во всём CampusForge. Чистая snapshot-копия после frozen install и явной Prisma Client generation успешно выполняет production web build. Production-only start scripts при этом действительно не работают без devDependencies.

## Что проверено независимо

Запущено `node docs/audit-2026-10-04-independent/quality-crosscheck.cjs`, exit 0. Артефакт: `evidence/quality-crosscheck.json`. Probe использует настоящий TypeScript 5.5.4 и filesystem read-only; virtual alias host существует только в памяти процесса.

| Проверка | Результат |
|---|---|
| Original hoisted React type directories | `.pnpm/node_modules/@types/react` и `react-dom` — обычные пустые directories, не symlinks; package/experimental files отсутствуют |
| Direct web type links | `apps/web/node_modules/@types/react` и `react-dom` — symlinks к полным фактическим пакетам 18.3.28/18.3.7 |
| Original `react/experimental` resolution от `next/types/index.d.ts` | Не разрешён |
| Original actual compiler program | 10 TS2345 в async startTransition call sites |
| Тот же compiler/source с aliases только двух пустых directories к уже установленным полным type packages | Experimental type resolved; diagnostics 0 |
| SHA256 snapshot inventory | Все 159 файлов совпали с записанными hashes и в оригинале, и в clean snapshot; source edits не объясняют различие |
| Clean snapshot после prod-only prune | Отсутствуют web/worker `.bin/dotenv.CMD` и worker `.bin/tsx.CMD` |

В основной копии TypeScript находит обычный `@types/react/index.d.ts`, но Next `types/index.d.ts:3` дополнительно требует `react/experimental`, а `:5` — `react-dom/experimental`. `@types/react/experimental.d.ts:37` импортирует canary; `canary.d.ts:81` добавляет async overload для TransitionStartFunction и `:89` для startTransition. Пустые hoisted directories не дают Next загрузить эту augmentation. После её предоставления только в compiler filesystem host исходный код проходит без правок.

Следовательно, факт initial FAIL сохраняется в таблице проверок как факт данной рабочей копии. Формулировку «React 18 async callbacks не работают и поэтому исходники никогда не собираются» необходимо исключить. Причина возникновения пустых directories не установлена: повреждённая/неполная установка доказана, связь с OneDrive либо конкретной операцией pnpm — гипотеза. Минимальное действие для основного checkout — восстановление installation layout через контролируемую чистую установку, с повторением typecheck/build; audit эту мутацию не выполнял.

## Clean build: сильный контрпример, ограниченный scope

Проверены root-аудитором сохранённые logs:

- `evidence/clean-install.log`: frozen install pnpm 10.33.0, lockfile unchanged, 324 packages, никаких application code edits.
- `evidence/clean-build.log`: первый clean build FAIL из-за отсутствующей полноценной generated Prisma typing (`ws` implicitly any в `apps/web/src/app/(dashboard)/layout.tsx:34`).
- `evidence/clean-prisma-generate.log`: явный `prisma generate` v5.22.0 успешен; это generation, не DB migration.
- `evidence/clean-build-after-generate.log`: compile, type validity, static pages и optimization прошли; Next 14.2.35; `Tasks: 1 successful, 1 total`, remote cache disabled, forced execution.
- `evidence/types-clean.json`: diagnostics пусты.

Эти команды выполнены root-аудитором, повторно мной не запускались: к моменту независимого review clean snapshot уже pruned до prod-only dependencies. Независимо перепроверены содержимое logs и 159-file hash invariance.

У clean snapshot `.env` исходного проекта не копировался (`clean-snapshot.json:3`, `envCopied:false`). Прохождение build не означает проверку настоящих PostgreSQL/Redis/S3/auth/AI workflows: динамические routes при сборке не подтверждают соединения и сохранность данных. Кроме того, Turbo сообщает packages in scope 5, но выполняет только **один** build task — web. У worker нет build script; standalone worker artifact этим PASS не создан. Отдельные package typechecks в общей таблице следует указывать по реально выполненным командам.

В инструкции воспроизводимого запуска нужно явно закрепить sequence `pnpm install --frozen-lockfile` → `pnpm db:generate` → проверка environment → `pnpm build`. Не следует трактовать initial Prisma generation gap как runtime defect `Workspace` query или исправлять `ws` аннотацией `any`.

## Async transition и duplicate submits: вывод standalone React probe отозван

Рассмотрены frontend-аудитором сохранённые результаты настоящего Next AppRouter стенда:

- `ui-interactions-results.txt:2`: оригинальный CreateTaskDialog с deferred mock server action после 250 ms имеет `disabled:true`, текст `Creating...`, `requests:1`. Повторный submit через UI не выполнен, поскольку control disabled; итог только один POST. Mock вернул контролируемую ошибку, которая отображена.
- `ui-runtime-react-results.txt:2`: runtime React version `18.3.0-canary-178c267a4e-20241218`, deferred async useTransition control имеет `disabled:true`, итог count 1.
- Установленный Next `dist/build/create-compiler-aliases.js:188` alias-ит AppRouter/RSC React на `next/dist/compiled/react`; этот пакет в `cjs/react.development.js:26` содержит именно наблюдаемую canary version. Package dependency React 18.3.1 нельзя автоматически считать runtime каждой Next AppRouter component.

Browser runs выполнены frontend-аудитором на TEMP стенде с исходными компонентами и настоящим Next AppRouter/server-action transport; auth/DB действия замещены mocks. Я перепроверил artifacts и installed Next alias source, сам browser probe повторно не запускал.

Таким образом, blanket finding «startTransition(async) вызывает enabled submit/duplicates в CampusForge» не подтверждается и противоречит актуальному app-runtime probe. Standalone react-dom18.3.1 без NextAppRouter проверяет другую runtime boundary. Его результаты нельзя переносить на это приложение. Подтверждён только конкретный CreateTaskDialog pending сценарий, а не все формы/ошибки/прерывания.

Release regression gate всё равно нужен: real disposable backend + задержка success/failure/network abort для login/signup/onboarding/task/note/delete/workspace actions; проверить loading/disabled/recovery и отсутствие второго UI request. Одновременно server idempotence/queue duplicate findings остаются действительными: client button guard не исключает параллельные HTTP requests, replay/redelivery и worker retries.

## Production-only start: подтверждённый deployment contract defect

**Точные места:** `apps/web/package.json:8` требует `dotenv`; `:42` хранит dotenv-cli только в devDependencies. `apps/worker/package.json:7` требует `dotenv` и `tsx`; `:21`, `:22` хранят оба только в devDependencies. Worker build script отсутствует.

**Условия:** build с full dev dependencies, затем стандартное production-only installation/prune и запуск объявленных start scripts на машине без глобальных dotenv/tsx.

**Доказательство:** `evidence/prod-only-install.log` удаляет devDependencies; `prod-web-start.log` и `prod-worker-start.log` оба заканчиваются exit 1: `'dotenv' is not recognized`. Read-only check подтвердил отсутствие обеих dotenv commands и worker tsx command в clean snapshot. Непосредственно после dotenv устранения worker tsx не запускался: отсутствие dependency/script path подтверждено статически, дополнительный фактический failure не выдумывается.

**Expected/actual:** production artifact должен запускать web/worker с одними production runtime dependencies; объявленные команды останавливаются до инициализации app или infrastructure. Это configuration/deployment failure, не отсутствие Redis/Postgres/MinIO.

**Влияние:** нельзя использовать текущие start scripts как автономный production launch contract после standard prod prune; успешный Next build не делает worker deployable. Установка всех devDependencies либо глобальных executables может обойти конкретный failure, но такое deployment окружение не документировано и здесь не проверялось.

**Минимальное исправление:** задать поддерживаемый production artifact/run contract: runtime environment через platform/process manager, web `next start` без dev-only wrapper; worker compiled JS build и `node dist/index.js` либо явно supported tsx runtime dependency с deployment packaging. Explicit Prisma generate/build ordering и migration-deploy должны быть частью reviewed deployment pipeline (миграции audit не выполняет).

**Проверка устранения:** disposable clean build → prod-only prune → declared web/worker start commands проходят dependency initialization; bounded healthchecks показывают ожидаемое состояние infrastructure; worker artifact paths реально существуют. На test infrastructure проверить полный queued document flow. Не разделять один production packaging корень на несколько дублирующих findings.
