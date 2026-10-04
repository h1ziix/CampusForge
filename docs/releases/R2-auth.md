# R2 authentication и session policy

Проверки: 2026-10-05, Asia/Qyzylorda. Это domain report; общий итог и полный quality gate находятся в [R2.md](R2.md). Настоящая `.env` и существующая БД не использовались; migrations, Git commit/push и deployment не выполнялись.

## Актуальное воспроизведение

Перед изменениями regression agent сохранил и проверил оригинальный код на установленном Next 16.3.8 / React 19.3.0 / NextAuth beta.32. [Source baseline](R2-evidence/baseline-source.json) использует явно обозначенные Prisma/auth boundaries mocks и настоящий bcryptjs. Client JWT update менял name/onboarding; 12 credentials requests выполняли 12 DB/compare calls; 12 signup requests выполняли 12 hashes. Bcrypt принимал разные suffix после 72 UTF-8 bytes.

[Browser baseline](R2-evidence/baseline-runtime.json) использует настоящий Next runtime, оригинальный SignInForm и synthetic successful Server Action, **не настоящий login**. На текущем Next `javascript:` уже блокируется framework с page error, marker не исполняется. Внешний HTTPS callback по-прежнему меняет origin. Старый audit XSS marker на Next 14 не переносится на Next 16 как доказанный текущий exploit.

## Redirect policy — SEC-01

`safePostLoginPath` используется прямо перед `router.push` в SignInForm и в Auth.js redirect callback. На выходе только pathname + search + hash. Разрешены local routes и абсолютные HTTP(S) URLs строго того же trusted origin. Невалидное значение ведёт на `/dashboard`.

Отклоняются внешние origins, credentials в URL, protocol-relative URLs, опасные schemes, backslashes, malformed percent encoding, encoded slash/backslash, nested `%25`, C0/C1 controls, U+2028/U+2029 и BOM, включая decoded варианты. Raw spaces отвергаются; обычный `%20` в query допустим. Вход ограничен 2048 символами. Это намеренно строгая политика: неоднозначные encoded routes не восстанавливаются. Auth.js base origin определяется существующей runtime `AUTH_URL`/trusted ingress policy; клиент использует `window.location.origin`.

Membership guards не изменяют смысл: безопасный callback не предоставляет доступ к чужому workspace. Route access продолжает проверяться server layout/query/service.

## Password request budget — SEC-03

Защита реализована в credentials provider `authorize` и signup service `createUser`, до любых Prisma/bcrypt operations. SignInAction делегирует тому же provider, поэтому API и action расходуют один budget без двойного счёта. SignupAction передаёт настоящие request headers в service. Source budget общий для обоих password endpoints; отдельный signup source budget не позволяет обойти регистрацию сменой emails.

| Budget                                | Лимит | Окно     |
| ------------------------------------- | ----- | -------- |
| Все password requests на source       | 60    | 15 минут |
| Credentials на normalized account     | 10    | 15 минут |
| Signup на normalized account          | 3     | 60 минут |
| Signup на source, независимо от email | 5     | 60 минут |

Окно начинается с первой принятой попытки. Redis Lua проверяет и изменяет все counters атомарно; каждый counter имеет PEXPIRE. Denied requests не продлевают обычный cooldown. Все ключи имеют hash tag `{password}` для одного Redis Cluster slot. Источники/accounts сохраняются как HMAC-SHA256 с AUTH_SECRET / NEXTAUTH_SECRET; raw emails/IP не входят в keys или diagnostics. Экземпляры приложения используют общий Redis. Ограничения работают для failed и successful attempts; смена AUTH_SECRET сбрасывает namespace соответствующих HMAC keys и требует обычного rotation admission review.

Limiter имеет общий deadline **1500 ms** на connect + eval, connect/command timeouts также конечны. Offline queue/retries отключены. При Redis outage, неверном ответе или missing secret/Redis URL password request **fail closed**, DB/bcrypt не вызываются. Диагностика печатает только fixed message, без URL/credentials. Следующий запрос может создать новое соединение; unlimited/in-memory production fallback отсутствует. Timer освобождается после результата.

По умолчанию все requests получают `unknown` source: application Request не содержит надёжного socket peer, а произвольный X-Forwarded-For не считается идентичностью. Это безопасный общий бюджет, который ограничивает доступность при большом числе пользователей до настройки ingress.

Разделение IP допускается только при `AUTH_RATE_LIMIT_TRUST_PROXY=true`. `AUTH_RATE_LIMIT_IP_HEADER` по умолчанию `x-campusforge-client-ip`. Оператор должен закрыть origin от прямого доступа и настроить единственный доверенный ingress, который **удаляет пользовательский header и записывает один проверенный canonical client IP**. Header с list, whitespace или invalid IP получает unknown bucket. Обычные X-Forwarded-For/X-Real-IP игнорируются, если оператор явно не выбрал их в конфигурации; выбирать их безопасно только при такой же strip/overwrite policy. IPv6 приводится к canonical URL host representation. Эта topology policy требует отдельной production проверки.

SignInAction и SignupAction возвращают понятный error/retry message. Прямой Auth.js credentials API сохраняет framework error protocol: `CredentialsSignin` code `rate_limited` или `temporarily_unavailable`, **не произвольный HTTP 429**. UI action выводит оставшийся cooldown в секундах; outage предлагает retry через 30 секунд. Auth API consumers должны обрабатывать error code, а не считать redirect успешным login.

Signup existing/new accounts получают одинаковый public success shape и одинаковую bcrypt cost-12 работу; duplicate P2002 race тоже не раскрывает существование account. Сообщение после signup нейтральное. Missing credentials accounts выполняют dummy bcrypt cost-12 compare; absent/wrong-password возвращают одинаковую ошибку. Абсолютная constant-time защита не заявляется: transaction latency, imported bcrypt costs и инфраструктура могут давать timing различия.

## Password bytes и legacy compatibility — SEC-04

Новые пароли проверяются по UTF-8 bytes: 8 или больше JS characters, максимум **72 bytes**. Unpaired Unicode surrogates отклоняются. Password не нормализуется, не обрезается и не prehash-ится. Политика проверяется shared schema и signup service; форма показывает byte policy, а сервер проверяет Unicode byte length независимо от HTML maxLength.

Новые hashes записываются в существующий passwordHash column с policy marker `bcrypt72-v1:` перед обычным bcrypt hash. Это metadata, без prehash и без schema migration. Provider снимает marker для bcrypt compare и отдельно отклоняет password >72 bytes или malformed Unicode для marked hash; даже добавленный suffix к принятому 72-byte password не аутентифицируется. Один compare выполняется и при таком отказе, сохраняя generic public outcome.

Sign-in сохраняет прежнюю bcrypt comparison для существующих **unmarked** hashes и допускает до **512 UTF-8 bytes**. Старый signup позволял 128 UTF-16 code units, максимум 384 UTF-8 bytes; новый sign-in bound покрывает **все пароли, которые мог создать предыдущий app signup**, включая >72-byte пароли. Скрытого отказа таким пользователям не вводится.

Legacy bcrypt hash не содержит original password length: нельзя надёжно определить, был ли у него suffix. Для legacy >72-byte credentials bcrypt продолжает игнорировать suffix; synthetic test это явно подтверждает через настоящий provider и настоящий bcrypt. Это сохранённое legacy ограничение, а не устранённая криптографическая equivalence. Новые signup пароли не имеют неучитываемого suffix. Algorithm и DB schema не менялись; policy version marker добавляется только новым signup hashes. Существующие hashes не переписывались и не автоматически мигрируются при login.

Импортированные вне прежнего signup пароли >512 bytes не поддерживаются этой bounded sign-in policy; оператор должен организовать проверенный reset через поддерживаемый будущий account-recovery flow. В проекте нет публичного password reset endpoint; R2 не добавляет незащищённый administrative reset или самодельную migration. Для текущих app-created accounts reset/migration не требуется для сохранения login.

## Trusted session updates — SEC-05

Edge-safe `auth.config.ts` игнорирует client update payload целиком. Node `auth.ts` на trigger update читает user из Prisma **только по id существующего encrypted JWT**, не по payload.id/name/role/onboarding. Из DB обновляются name/email/role/onboarding; отсутствующий user инвалидирует session. Name/email bounded до действующего schema размера, поэтому oversized client update не увеличивает cookie claims.

CompleteOnboardingAction сохраняет профиль через requireAuth + schema. Затем OnboardingForm вызывает `update({})`; navigation разрешается только когда refreshed session подтверждает saved onboarding flag. Client больше не утверждает onboarding/name самостоятельно. Middleware и requireAuth проверяют nonempty string identity; OnboardingPage дополнительно защищена server boundary. Middleware-compatible config не импортирует Prisma, bcrypt, Redis, Node crypto/net; Node зависимости остаются только в full auth.

Middleware convention не заменён на proxy: это отдельная compatibility decision, для которой R2 не обнаружил необходимости. R1 warnings не скрываются; их финальный статус приведён в общем build report.

## Выполненные domain проверки и пределы доказательства

В Node **24.21.0** выполнен `node --test apps/web/tests/auth-security.test.mjs`: **11 passed, 0 failed/skipped**. Tests загружают актуальные TS modules приложения. Unit boundaries Prisma/NextAuth/Redis явно mocked; реальные bcryptjs cost-12 tests используют только synthetic passwords, включая actual provider strict/legacy password policy. Проверены redirect ambiguity matrix, ASCII/Unicode 71/72/73 bytes, accepted last-character mismatch, strict-hash appended suffix rejection и legacy suffix compatibility, provider/action shared budget до DB/compare, concurrent contexts, rotating emails/source, spoofed headers, mock Redis outage/deadline/recovery, JWT injection/oversized update, trusted onboarding write/refresh, middleware redirects, anonymous и foreign membership guards.

`pnpm --filter @campusforge/web typecheck`, `pnpm --filter @campusforge/shared typecheck`, web/shared lint проходили. Первая попытка pnpm на system Node 20.20.0 была отклонена engines policy; проверки повторены через закреплённый Node 24.21.0. Полные итоговые команды, browser screenshots, actual NextAuth entrances и machine-readable evidence представлены в [R2.md](R2.md).

Unit synthetic atomic store **не доказывает** исполнение Lua настоящим Redis, Redis Cluster, несколько реальных server instances, TTL persistence/restart или real DB credentials login. Auth.js fixture browser/API evidence с synthetic Prisma/Redis следует читать отдельно от live authorization. Disposable PostgreSQL/Redis integration, production proxy topology и реальная auth readiness остаются отдельными acceptance пунктами, если инфраструктура недоступна. Наличие helper/tests само по себе не объявляет findings production-closed.
