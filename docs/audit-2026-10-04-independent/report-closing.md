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

- `agent-security.md`, `agent-pipeline.md`, `agent-frontend.md`, `root-findings.md`, `quality-verification.md`, `dependency-triage.md`.
- `security-probes.cjs` → `evidence/security-probes.json`; `quality-crosscheck.cjs` → `evidence/quality-crosscheck.json`.
- `probes/pipeline-probes.cjs` → `probes/pipeline-results.json`; `probes/redis-outage-probe.cjs` → `probes/redis-outage-results.json`. Scripts используют mocks/isolated endpoint, не real `.env`.
- `bootstrap-ui-stand.ps1`/`run-ui-stand.ps1`, пять `probe-ui-*.js`, `ui-*-results.txt`, `evidence/ui-source-hashes.json`. Fake-success auth стенд не является приложением для реальных данных; server/browser, созданные для аудита, остановлены.
- `evidence/build.log`, `typecheck-*.log`, `clean-install.log`, `clean-build*.log`, `clean-prisma-generate.log`, `lint.log`, `format.log`, `prisma-validate.log`, dependency JSON, prod-start logs, Turbo env evidence, GitHub trees и workspace invariants.
- **78 screenshots** в `screenshots/`, включая все четыре widths/light-dark, loading/empty/error, callback marker, keyboard flashcards/drawer/focus, document demo и interrupted history.

Особенно наглядные screenshots: `assistant-new-390-light.png` (composer ниже viewport), `tasks-390-light.png` (overflow), `assistant-drawer-keyboard-390.png`, `document-generated-demo-390.png`, `sign-in-callback-390.png`, `task-deferred-action-390.png` (исправно работающий pending).

Код приложения/настоящие данные не изменены. Старый `docs/AUDIT-2026-10-04.txt` сохранён без изменений; его blanket вывод про production build и duplicate submits заменён измеренными условиями этого отчёта.
