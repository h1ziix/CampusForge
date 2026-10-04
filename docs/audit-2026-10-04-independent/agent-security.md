# CampusForge: независимый AppSec-аудит

Дата: 4 октября 2026 года. Рабочая копия: `C:\Users\rausa\OneDrive\Рабочий стол\CampusForge`.

Этот документ — отдельная область общего аудита, не итоговый production verdict. Исходники приложения, `.env`, пользовательские данные, миграции и внешние системы не изменялись. Добавлены только audit artifacts. Предыдущий `docs/AUDIT-2026-10-04.txt` прочитан после самостоятельного изучения основных auth/authorization/upload/storage путей; его выводы не использованы как доказательства. Инструкции AGENTS из сообщения пользователя применены; отдельного AGENTS в переданном проекте не обнаружено. `.claude/launch.json` содержит только способ запуска web.

## Метод и выполненные проверки

Изучены все публичные API routes, middleware, NextAuth callbacks/providers, auth actions/services, workspace layout/page guards, все существующие workspace mutations и queries, shared Zod schemas, Prisma relations, S3 upload path, assistant renderer/storage/logout, document detail persistence. Проверены фактические установленные Next 14.2.35, React/ReactDOM 18.3.1 и NextAuth 5.0.0-beta.25. Dependency advisories и production инфраструктура проверяются root-аудитором; queue/storage consistency — pipeline-аудитором; browser UI — frontend-аудитором.

Исполняемый probe: `node docs/audit-2026-10-04-independent/security-probes.cjs`. Результат: exit 0, все assertions прошли. TS/TSX реального проекта транслируется в памяти; внешние auth/Prisma/S3/queue границы замещены mocks. Bcrypt-проверка использует настоящий bcryptjs и cost 12, как приложение. Нет network/paid-AI/DB writes. JSON результата: `evidence/security-probes.json`.

| Проверка | Фактически выполнено | Результат и предел доказательства |
|---|---|---|
| JWT update | Настоящий `auth.config.ts` callback, подставленный клиентский update | Onboarding/name меняются без DB; id/role injection отклонены |
| Password equivalence | Настоящий bcryptjs cost 12 + настоящая signup schema | Разные ASCII/Unicode suffix после 72 bytes аутентифицируются одинаково |
| Credentials abuse | Настоящий authorize, 12 попыток; DB/bcrypt boundaries mocked | Все 12 вызывают DB и compare; application throttle отсутствует; реальная нагрузочная атака не выполнялась |
| Signup abuse/enumeration | Настоящий `createUser`, 12 новых mock emails | 12 hashes/transactions; существующий email имеет отдельный ответ; DB не использована |
| Assistant privacy | Настоящий storage и настоящий SignOutButton, mock origin-local storage/signOut | Глобальный ключ; пользователь B/workspace B получает данные A; logout не удаляет данные |
| Sign-in callback | Настоящий submit handler, successful auth action mocked; отдельный настоящий Next/browser стенд frontend-аудитора | `javascript:` и external URL без изменений передаются в router.push; настоящий браузер исполнил marker42 после mock-success login |
| Markdown | Настоящий Markdown + настоящий ReactDOM server renderer | `javascript:`/`data:` href остаются; raw HTML экранируется; click execution этим probe не проверяется |
| Tenant/action matrix | Настоящие helpers/actions/services, in-memory DB | 6 типов action отклоняют foreign object и foreign workspace; 0 DB/S3/AI mutations |
| CSRF/cookie defaults | Чтение фактически установленных Auth.js/Next source | CSRF для Auth.js API и Origin guard Server Actions присутствуют; browser integration этого не подтверждала |
| Очевидные embedded secrets | `rg -l` шаблонов OpenAI/GitHub/AWS/private keys в apps/packages/infra/.claude, исключая `.env`/build/docs | Совпадений не найдено; `git check-ignore .env` подтверждает ignore; это ограниченный pattern scan, не сертификация отсутствия секретов |

## Подтверждённые findings

### SEC-01 — P1: callbackUrl после входа попадает в XSS/navigation sink

- **Точные места:** `apps/web/src/components/auth/sign-in-form.tsx:19` читает query parameter; `:35` вызывает `router.push(callbackUrl)`; `apps/web/src/server/actions/auth.ts:76` использует `redirect: false`, поэтому результат Auth.js redirect validation не защищает последующий самостоятельный router push.
- **Условия:** неавторизованный пользователь открывает специально подготовленную ссылку sign-in и успешно входит. Пример безопасного test marker: `/sign-in?callbackUrl=javascript%3Awindow.__auditCallback%3D1`. Для external redirect достаточно `https://example.invalid/audit`.
- **Доказательство:** actual-source `sign-in-callback-url-sink` probe invokes реальный handleSubmit с success action mock; оба значения попадают в router.push без изменений. Фактически установленный `next/dist/client/components/app-router.js:165` формирует URL, `router-reducer/reducers/navigate-reducer.js:102` принимает external origin, `app-router.js:400` передаёт canonical URL в location.assign. Отдельный frontend browser probe запустил оригинальный SignInForm на настоящем Next 14.2.35 AppRouter и `/sign-in?callbackUrl=javascript%3Awindow.__auditCallback%3D42`; после submit `window.__auditCallback===42`. Артефакты: `ui-functional-results.txt`, `probe-ui-functional.js`. Auth action success mocked в TEMP; настоящий login/credentials/DB не использованы. Официальная [Next.js useRouter documentation](https://nextjs.org/docs/app/api-reference/functions/use-router) соответствует наблюдению.
- **Expected:** post-login navigation только по разрешённому локальному пути, fallback `/dashboard` для невалидного callback.
- **Actual:** query string полностью контролирует navigation sink после успешного входа.
- **Влияние:** DOM XSS при условии успешного входа по crafted URL и open redirect. Даже HttpOnly cookie не мешает исполненному JS читать localStorage и выполнять same-origin authenticated запросы от имени пользователя. Утечка или эксфильтрация не выполнялась.
- **Минимальное исправление:** централизованный parser callbackUrl: parse against trusted origin; разрешить только совпадающий origin и `http(s)`/локальный pathname; reject `//`, backslash-based host ambiguities, javascript/data schemes и control chars; возвращать только проверенные pathname+search+hash. Применить до router.push и добавить fallback.
- **Проверка устранения:** положительный `/w/<owned-id>/tasks`; негативные `javascript:`, mixed case/control chars, external `https:`, `//evil.invalid`, `/\\evil.invalid`, `data:`. В браузере после mock-success marker отсутствует и origin не меняется; отдельная live-auth проверка на disposable DB.

### SEC-02 — P1: история чатов разделяет один origin-local ключ для всех пользователей и workspaces

- **Точные места:** `apps/web/src/lib/assistant/storage.ts:11`, `:38`, `:44`, `:66`, `:73`; `apps/web/src/components/assistant/assistant-app.tsx:58`, `:68`; `apps/web/src/components/auth/sign-out-button.tsx:13`. `AssistantApp` получает только name/email (`assistant-app.tsx:18`), userId/workspaceId отсутствуют в persistence boundary.
- **Условия:** A сохраняет чат, переключает workspace либо выходит; B входит на том же origin в том же browser profile и открывает assistant. Auth action сама не требует shared browser, но privacy breach требует общего профиля браузера/компьютера.
- **Доказательство:** `assistant-storage-isolation-and-logout` записывает синтетический текст A через реальный saveState, загружает тем же реальным loadState от другого principal и вызывает реальный SignOutButton с mock signOut. Сохраняется один `campusforge:assistant:v1`; текст A остаётся и загружается B. Actual code не принимает identity/workspace inputs. Browser probe frontend-аудитора проверяет mock logout и rendered history после смены user fixture через `/audit?user=b`; это не реальный вход другого аккаунта. Workspace mixing следует из общего ключа и полного source dataflow, отдельная live последовательность смены workspace не запускалась.
- **Expected:** A/ws1, A/ws2, B/ws1 имеют изолированную историю; после logout чувствительные данные предыдущего аккаунта не доступны следующему аккаунту через приложение.
- **Actual:** вся история и настройки автоматически читаются из одного ключа; logout только вызывает NextAuth signOut.
- **Влияние:** утечка сообщений и attachment metadata на общем компьютере; workspace mixing; история отображается как принадлежащая текущему пользователю. Настоящий remote AI здесь не требуется — пользователь вводит реальные тексты даже в demo engine.
- **Минимальное исправление:** namespace storage по immutable userId+workspaceId; state reset при identity change; осознанная logout cleanup для чувствительного cached content. Старый несегментированный ключ нельзя автоматически импортировать в текущий аккаунт: его владельца определить невозможно. Надёжнее server persistence с membership checks и документированной retention policy.
- **Проверка устранения:** последовательность A/ws1→A/ws2→logout→B/ws1 с разными маркерами; ни один marker не пересекает границу. Refresh и back navigation не возвращают чужой content. Дополнительно проверить миграцию storage key и отключённый autosave.

### SEC-03 — P1: публичные password endpoints не ограничивают перебор и дорогостоящую регистрацию

- **Точные места:** `apps/web/src/lib/auth.ts:33`, `:39`, `:53`; `apps/web/src/server/actions/auth.ts:21`, `:58`; `apps/web/src/server/services/auth.ts:24`, `:33`, `:36`. В маршрутах/config/infra не найдено limiter/captcha/lockout/abuse middleware. Credentials также доступны через NextAuth `/api/auth/callback/credentials`, не только UI action.
- **Условия:** публичный доступ к signup/credentials endpoints; злоумышленник автоматизирует попытки. Signup может использовать разные emails, поэтому unique email не является ограничением нагрузки.
- **Доказательство:** `credentials-no-application-throttle`: 12 вызовов реального authorize дают 12 mock DB lookups и 12 compare. `signup-no-application-throttle-and-enumeration`: 12 новых mock emails вызывают 12 hashes и transactions. Настоящее приложение использует bcrypt cost 12. Нагрузочная атака не выполнялась; защиту внешнего reverse proxy/WAF в неизвестном deployment не удалось проверить.
- **Expected:** контролируемый бюджет попыток на account+IP/network и signup; превышение budget прекращает работу до expensive bcrypt/DB operations и возвращает однозначный retry response.
- **Actual:** приложение выполняет дорогие операции на каждую валидную попытку; нет накопления/проверки попыток.
- **Влияние:** credential stuffing и online guessing без application control; нагрузка CPU/DB через регистрации и запросы к существующим пользователям; бесплатное создание пользователей/workspaces. Дополнительно signup явно раскрывает существование email (`services/auth.ts:30`), а signin для отсутствующего email не выполняет bcrypt и допускает timing enumeration. Это сопутствующие риски того же публичного password surface, не утверждение выполненного account takeover.
- **Минимальное исправление:** общий Redis limiter до bcrypt для обоих entrance paths, нормализованный account key+IP, bounded signup budget, безопасный proxy trust, наблюдаемость 429/retries; generic signup response если продукт требует защиты account existence. Не полагаться на disabled submit/button или только на UI server action.
- **Проверка устранения:** настоящий disposable auth stack: credentials action и NextAuth API share budget; after threshold no bcrypt/DB write, 429/retry; correct password cooldown recovery; parallel requests/restart/multiple instances; signup новых emails также ограничен. Не устраивать real user lockout тесты.

### SEC-04 — P2: принимаемые пароли длиннее 72 UTF-8 bytes имеют неучитываемый suffix

- **Точные места:** `packages/shared/src/schemas/auth.ts:6`, `:9`, `:14`; `apps/web/src/server/services/auth.ts:33`; `apps/web/src/lib/auth.ts:53`.
- **Условия:** пользователь создаёт пароль, превышающий bcrypt limit 72 bytes; schema принимает до 128 JS characters, а signin вообще не имеет max. Unicode может превысить byte limit существенно раньше character limit.
- **Доказательство:** real bcrypt cost 12 hash от `A.repeat(72)+'first-suffix'` принимает пароль с другим suffix. Оба валидны по реальной signup schema. Аналогично 24 `€` дают 72 bytes и разные суффиксы принимаются. Probe не печатает hash или реальный пароль. [Документация bcryptjs](https://github.com/dcodeIO/bcrypt.js/) подтверждает предел bytes и explicit `truncates()` check.
- **Expected:** изменение любого принятого символа пароля должно менять результат authentication, либо пароль явно отклоняется при превышении выбранного algorithm limit.
- **Actual:** suffix после 72 bytes игнорируется без предупреждения.
- **Влияние:** user-visible password policy обещает 128 characters, но effective secret меньше; разные пароли эквивалентны. Это не позволяет обойти неизвестные первые 72 bytes и не является универсальным bypass.
- **Минимальное исправление:** если оставить bcrypt — одинаковая byte-length validation в signup/signin, `TextEncoder`/bcrypt.truncates и явное сообщение. Для уже существующих long passwords определить миграционное поведение; не ломать их login молча. Альтернатива — versioned migration на algorithm без данного ограничения; не добавлять ad-hoc prehash без проектирования password storage migration.
- **Проверка устранения:** границы 71/72/73 bytes, Unicode, combining chars; signup отказ на oversize; accepted password suffix tamper fails; старый hash login/reset/migration явно проверены.

### SEC-05 — P2: клиентский JWT update считается источником правды для onboarding/profile

- **Точные места:** `apps/web/src/lib/auth.config.ts:30`, `:32`, `:35`, `:48`; `apps/web/src/middleware.ts:22`, `:46`, `:55`; законный UI flow в `apps/web/src/components/onboarding/onboarding-form.tsx:35`.
- **Условия:** authenticated user вызывает session update с `{onboardingCompleted:true,name:'...'}` напрямую, не выполнив completeOnboardingAction/не записав обязательный профиль в БД.
- **Доказательство:** actual JWT callback меняет onboarding false→true и name без DB. Фактически установленный Auth.js `lib/index.js:56` проверяет CSRF для session update, `lib/actions/session.js:21` передаёт клиентский request.body.data как `session` в jwt callback и `:39` переиздаёт token. CSRF блокирует чужой browser request, но не собственный authenticated update пользователя. Probe также подтверждает, что `role:'ADMIN'` и `id:'user-b'` НЕ меняют token.
- **Expected:** trusted onboarding flag/name отражают сохранённый профиль БД, обязательные fields проверены action/schema.
- **Actual:** middleware верит client-derived signed flag и пропускает dashboard; БД может продолжать хранить onboardingCompleted=false и пустой профиль; произвольное имя попадает в подписанную сессию.
- **Влияние:** обход обязательного onboarding, рассогласование User↔session; display-name spoof собственного профиля. Tenant membership и ADMIN escalation этим не обходятся, поэтому приоритет P2.
- **Минимальное исправление:** на update в Node auth config перечитывать разрешённые поля User из БД; не принимать onboarding/name как trusted claim из клиента. Edge config оставить без Node imports; Node callback может override shared callback только для update. Profile changes должны сначала проходить серверную validation+DB write.
- **Проверка устранения:** client update не меняет name/onboarding до соответствующей DB write; after legitimate onboarding token соответствует DB; role/id попытки остаются игнорированными; malformed и oversized name не создают cookie growth.

## Подтверждённые code gaps без доказанного exploit

### SEC-H01 — P2 при подключении внешнего AI: Markdown не фильтрует URL schemes

`apps/web/src/components/assistant/markdown.tsx:56` парсит ссылку, `:61` передаёт href без проверки protocol; `message-bubble.tsx:165` рендерит assistant content. Real renderer probe оставляет `javascript:` и `data:text/html` в DOM. Raw HTML при этом правильно escaped. `target=_blank` и `rel=noopener noreferrer` присутствуют; browser click execution и attacker-to-victim persisted delivery здесь не доказаны. Нынешний assistant engine берёт ответы из локальных templates, не из внешнего AI. File-analysis templates интерполируют filename (`engine.ts:535`, `:542`), что расширяет непривилегированный input surface, но не даёт доказанного cross-user stored XSS. Не следует называть этот gap подтверждённым exploitable XSS без runtime/entry-point evidence.

Минимальная защита до real AI: allow-list `http(s)`, нужные `mailto` и локальные paths; reject javascript/data/vbscript/control whitespace. Regression: настоящий renderer на encoded/mixed-case schemes, обычные HTTPS/local links, unsafe href отсутствует. Одна central URL policy может обслуживать этот sink и post-login navigation, но policy для email/local ссылки различается.

### SEC-H02 — conditional CSRF upload и spoofed MIME

`apps/web/src/app/api/workspaces/[workspaceId]/documents/upload/route.ts:25` и `:34` выполняют auth+membership, но Origin/CSRF token check отсутствует; Route Handler не получает встроенный Server Action Origin guard. Auth.js default session cookie (`@auth/core/lib/utils/cookie.js:50`) — HttpOnly, SameSite=Lax, Secure на HTTPS. Поэтому arbitrary unrelated-site POST обычно не получит session cookie, и отсутствие handler guard не доказательство универсального CSRF. Attacker-controlled same-site subdomain — условная угроза, deployment domain isolation не известна. Рекомендация: explicit trusted-origin/token enforcement; браузерный интеграционный same-site/cross-site probe на disposable auth environment.

Upload metadata schema проверяет declared MIME и 10 MiB выбранного file, но не magic bytes (`packages/shared/src/schemas/document.ts:32`, `:38`; upload route `:71`). MIME устанавливает клиент. Произвольные bytes могут быть приняты под текстовым MIME. В текущем проекте raw uploaded object не выдаётся/не вставляется как HTML в browser, поэтому stored XSS через uploaded HTML не доказан. Parser budget/multipart total limits и collisions относятся к отдельному pipeline report. Для PDF нужны content validation и bounded parser, для текста — явный decode/size policy; tests на spoofed MIME/invalid PDF.

### SEC-H03 — роли и отзывание сессий требуют product/deployment policy

Все существующие workspace mutations допускают любого MEMBER, не только OWNER. `requireWorkspaceMember` возвращает role, actions его не используют. Отдельные действия управления участниками/workspace ownership отсутствуют. Без documented OWNER-only policy нельзя считать совместное редактирование IDOR/privilege escalation. User role в JWT берётся из БД при login и не обновляется на обычных requests; ADMIN routes сейчас отсутствуют. Token revocation/role change behavior следует проверить до появления admin features, но текущая эксплуатируемая ADMIN elevation не найдена.

## Положительно проверенные защиты

- `requireAuth` проверяет именно `session.user.id`, middleware — `req.auth.user`, а не просто truthy auth object. Anonymous helper call отклонён настоящей функцией.
- Membership bound to `(session.user.id,workspaceId)`; workspace layouts требуют actual membership. Queries single objects фильтруются по id+workspaceId; mutation services также сначала проверяют принадлежность object. Независимый probe covers task update, note update, document delete, flashcard-set delete, summary/flashcard generation.
- Требование membership нельзя обойти передачей foreign object ID с собственной workspace: все шесть action типов вернули отказ, ни одна запись/queue/S3 mutation не выполнена.
- Task assignee проверяется на принадлежность той же workspace в create/update service.
- JWT client update не меняет id и role. Поле ADMIN нельзя получить только session.update.
- Bcrypt cost 12 и per-hash salt используются, passwordHash не включён в returned credential user/session; email нормализуется к lowercase+trim на storage/login.
- Zod ограничивает длины основных domain fields; ORM queries не используют interpolated raw SQL в просмотренном исходном коде. Не найдено public endpoint возвращающего passwordHash, S3 credentials или API key.
- Markdown raw HTML рендерится как React text. User messages также рендерятся как text; dangerouslySetInnerHTML в root layout содержит только статический theme init script, без user interpolation.
- NextAuth API в фактически установленном Auth.js требует CSRF для credentials callback/signin/signout/session update. Next Server Actions проверяют Origin против Host/X-Forwarded-Host и default 1 MiB action body limit. Server-side NextAuth helper uses skipCSRFCheck внутри уже защищённого framework action; это само по себе не отключение защиты public API.
- S3 filename заменяет небезопасные path characters; workspaceId upload validation требует CUID. Это блокирует filename traversal, но не устраняет timestamp collisions (отдельный finding pipeline).

## Не проверено и пределы

Не выполнены настоящие login/signup/logout на PostgreSQL, live JWT endpoint update, cookie browser integration, real concurrency при membership revoke/delete, network brute force, production WAF/proxy/TLS/S3 policy, malware processing, authenticated cross-site/same-site upload, provider paid calls. Module mocks доказывают ветки приложенческого кода; они не доказывают готовность инфраструктуры. Не делались DB migrations/production deployment/push. `.env` не выводился и не изменялся. Actual secrets values не читались для этого отчёта.

Первый порядок security fixes: callback URL validation → storage principal/workspace isolation/logout → password endpoint abuse controls → bcrypt byte policy → DB-authoritative JWT update → explicit upload Origin/content checks и Markdown URL policy до real external AI. Release criteria дополнить настоящими disposable integration тестами на две user identities/две workspaces; текущий mock matrix сохранить как regression harness после адаптации expected assertions к исправленному поведению.
