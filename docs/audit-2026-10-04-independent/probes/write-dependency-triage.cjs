// Report-only generation; no dependency install, app mutation, credentials, or network.
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(__dirname, '..');
const all = JSON.parse(fs.readFileSync(path.join(dir, 'evidence/dependency-audit.json'), 'utf8'));
const prod = JSON.parse(fs.readFileSync(path.join(dir, 'evidence/dependency-audit-prod.json'), 'utf8'));
const upstream = new Map(JSON.parse(fs.readFileSync(path.join(dir, 'evidence/dependency-publisher-fetch.json'), 'utf8')).map(x => [x.id, x]));
const prodIds = new Set(Object.values(prod.advisories).map(a => a.url.split('/').pop()));
const groups = new Map();
for (const a of Object.values(all.advisories)) {
  const id = a.url.split('/').pop();
  groups.set(id, [...(groups.get(id) || []), a]);
}
// Each reachability judgment is independent of registry severity/package presence.
const judgement = {
  'GHSA-pxg6-pf52-xh8x': ['Cookie attributes injection', 'Условие отсутствует: имя/path/domain cookie заданы Auth.js; пользовательские значения не становятся этими атрибутами. A1.'],
  'GHSA-5jpx-9hw9-2fx4': ['Email misdelivery', 'Условие отсутствует: нет Email/Nodemailer provider, только Credentials. A1.'],
  'GHSA-9g9p-9gw9-jx7f': ['Remote image optimizer DoS', 'Условие отсутствует: нет images.remotePatterns/remote image источников. Для будущего remote optimizer перепроверить. N1.'],
  'GHSA-h25m-26qc-wcjf': ['RSC deserialization DoS', 'Предпосылки подтверждены: App Router и Server Functions. Publisher прямо включает Next 13/14; React18 в package.json не исключает framework RSC path. N2. Эксплойт не запускался.'],
  'GHSA-ggv3-7p47-pfv8': ['Chunked external rewrite DoS', 'Условие отсутствует: external rewrites не настроены. N1.'],
  'GHSA-3x4c-7xq6-9pq8': ['Image cache disk exhaustion', 'Условно: встроенный optimizer включён по умолчанию даже без next/image import; нужны доступные изображения/варианты и self-hosted disk cache. Public image assets не найдены, production cache topology неизвестна. N1.'],
  'GHSA-q4gf-8mx6-v5v3': ['RSC CPU exhaustion', 'Предпосылки подтверждены: App Router/Server Functions, publisher включает Next13/14. N2. Нагрузочный exploit не запускался.'],
  'GHSA-qx2v-qp2m-jg93': ['PostCSS style breakout XSS', 'Путь не найден: нужна обработка недоверенного CSS и вставка результата в inline style. PostCSS используется при build доверенного CSS; runtime user CSS parser отсутствует. C1.'],
  'GHSA-gh4j-gqv2-49f6': ['XMLBuilder comment/CDATA injection', 'Путь не найден: AWS SDK импортирует FXP XMLParser, а не его XMLBuilder; S3 XmlNode escaping реализован самим AWS SDK. Загруженный document не превращается в XML comment/CDATA. X1.'],
  'GHSA-8h8q-6873-q5fj': ['RSC Server Function DoS', 'Предпосылки подтверждены: App Router/Server Functions, publisher включает Next13/14. N2. Exploit не запускался.'],
  'GHSA-3g8h-86w9-wvmq': ['Middleware redirect cache poisoning', 'Условно: middleware redirects есть, но нужен shared cache с неверным разделением x-nextjs-data/3xx. Production proxy/CDN не проверен. N1/N3.'],
  'GHSA-ffhc-5mcf-pf4q': ['Malformed CSP nonce cache poisoning', 'Условие в source отсутствует: CSP nonce/header reflection не настроены; внешняя proxy CSP/cache policy неизвестна. N1.'],
  'GHSA-vfv6-92ff-j949': ['RSC cache-buster collision', 'Условно: App Router есть; нужен shared cache с неверным разделением RSC вариантов. Topology неизвестна. N2.'],
  'GHSA-gx5p-jg67-6x7h': ['beforeInteractive script XSS', 'Условие отсутствует: next/script/beforeInteractive и недоверенные props таких scripts не найдены. N1.'],
  'GHSA-h64f-5h5j-jqjh': ['Local image memory DoS', 'Условно: local optimizer defaults не отключены; controllable large local image source не найден. Отсутствие next/image import само по себе endpoint не отключает. N1.'],
  'GHSA-c4j6-fc7j-m34r': ['WebSocket upgrade SSRF', 'Условно, приоритетно: start использует встроенный Node server, где upgrade handler proxy-ветка присутствует даже без app WebSocket code. Нужен проход Upgrade до origin; proxy blocking/egress неизвестны. N4.'],
  'GHSA-wfc6-r584-vfw7': ['RSC response cache poisoning', 'Условно: App Router есть; нужны shared cache и неверные Vary/cache rules. Production caching неизвестен. N2.'],
  'GHSA-36qx-fr4f-26g5': ['Pages Router i18n middleware bypass', 'Условие отсутствует: используется App Router, Pages Router+i18n не настроены. N1/N2.'],
  'GHSA-5wm8-gmm8-39j9': ['XMLBuilder attribute injection', 'Путь не найден: уязвимый fast-xml-builder транзитивный, но FXP builder не используется текущими S3 операциями; AWS использует собственный escaping. X1.'],
  'GHSA-3qcw-2rhx-2726': ['Yarn Berry detection code execution', 'Условно только build/tooling: требуется недоверенный Yarn Berry repo/config. Проект pnpm, yarnPath/.yarnrc.yml не найдены. Не remote app RCE. T1.'],
  'GHSA-w5hq-g745-h8pq': ['UUID output buffer bounds', 'Путь не найден: требуется v3/v5/v6 с caller buffer; BullMQ использует v4 без buffer. U1.'],
  'GHSA-g7r4-m6w7-qqqr': ['Windows esbuild dev-server file read', 'Условие отсутствует: worker tsx использует трансформацию, esbuild serve/servedir не вызывается. Windows само по себе недостаточно. T1.'],
  'GHSA-hcf7-66rw-9f5r': ['Turbo login callback CSRF', 'Условно только CLI workflow: turbo login/SSO callback не часть app и не настроен в project scripts. T1.'],
  'GHSA-m99w-x7hq-7vfj': ['App Router Server Action DoS', 'Предпосылки подтверждены: App Router и используемые UI Server Actions. N2. Auth внутри action не устраняет framework deserialization до вызова. Exploit не запускался.'],
  'GHSA-89xv-2m56-2m9x': ['Custom-server Server Action SSRF', 'Условие отсутствует: start — next start, custom server не найден; publisher указывает origin pinning в next start/standalone 14.2+. N4.'],
  'GHSA-68g3-v927-f742': ['fetch Request/init body cache confusion', 'Путь не найден: нет соответствующего server fetch с несовпадающими Request/init body. Единственный actual web fetch — client upload; OpenAI SDK работает в отдельном worker. N5.'],
  'GHSA-4633-3j49-mh5q': ['Non-UTF8 fetch body cache collision', 'Путь не найден: нет server fetch с binary/non-UTF8 cached body в Next runtime. N5.'],
  'GHSA-4c39-4ccg-62r3': ['Edge Server Action unbounded body', 'Условие отсутствует: actions используют default Node runtime, runtime=edge для actions не найден. Edge middleware не равен Edge action. Upload multipart PF-06 — отдельная причина. N2.'],
  'GHSA-p9j2-gv94-2wf4': ['Attacker-controlled rewrite host SSRF', 'Условие отсутствует: request-derived rewrite/redirect destination rules не настроены. N1.'],
  'GHSA-955p-x3mx-jcvp': ['Server Function endpoint disclosure', 'Предпосылки подтверждены: App Router с UI Server Actions. Disclosure IDs не даёт authentication bypass: handlers проверяют session/user/membership. A1/N2. Dynamic exploit не запускался.'],
  'GHSA-6g55-p6wh-862q': ['CSS sourceMappingURL file disclosure', 'Путь не найден в app: untrusted CSS sourceMappingURL не поступает в runtime PostCSS. Условный риск build недоверенного source/PR остаётся. C1.'],
  'GHSA-fxqj-rqcc-2cmp': ['Residual .map disclosure without from', 'Путь не найден в app; тот же untrusted CSS source-map build boundary. Это неполное исправление раннего advisory, minimum version 8.5.23 для этой ветки. C1.'],
  'GHSA-28wg-ghj8-5hjv': ['Negative nonsecure nanoid size loop', 'Путь не найден: PostCSS вызывает nonsecure nanoid(6), размер постоянный; app не передаёт пользовательский size. U2.'],
  'GHSA-8fpg-xm3f-6cx3': ['Auth error object fail-open', 'Уязвимый auth guard pattern отсутствует: middleware требует req.auth?.user, service требует session?.user?.id. Не используется truthiness только auth object. A1.'],
  'GHSA-7rqj-j65f-68wh': ['Email homoglyph normalization', 'Условие отсутствует: Email/magic-link provider не установлен в конфигурации, только Credentials. A1.'],
  'GHSA-2v37-7h3g-55p8': ['Zero custom nanoid size loop', 'Путь не найден: customAlphabet/customRandom с user size не вызываются; PostCSS использует nonsecure фиксированный 6. U2.'],
  'GHSA-r28c-9q8g-f849': ['CSS previous source-map traversal', 'Путь не найден в app: нет runtime обработки user CSS; условно build недоверенного source. C1.'],
  'GHSA-xmf8-cvqr-rfgj': ['Malformed Bearer getToken exception', 'Условие отсутствует: прямых getToken calls нет; auth() идёт через getSession→Auth с cookie header. Publisher прямо исключает auth-only apps. A2.'],
  'GHSA-x445-f3h2-j279': ['Cross-provider OAuth cookie binding', 'Условие отсутствует: OAuth providers/account-link flow отсутствуют, только Credentials. A1.'],
  'GHSA-w9m9-85wc-3x92': ['Selector AST recursion DoS', 'Условно build/tooling: нужна обработка недоверенных CSS selectors; public endpoint отсутствует. C1.'],
  'GHSA-c83g-rgw3-j3cx': ['Browserslist result cache OOM', 'Условие отсутствует в app: нет long-lived runtime с user-controlled distinct queries; используется build Autoprefixer. C1.'],
  'GHSA-73wf-gq98-2v4g': ['Browserslist custom-stats crash', 'Условно build/tooling: нужен недоверенный browserslist-stats.json; в checkout не найден, public user input path отсутствует. C1.'],
  'GHSA-xwg4-73v4-xw9w': ['Secure nanoid size overflow', 'Путь не найден: требует secure API с огромным user size; PostCSS использует nonsecure nanoid(6). U2.'],
  'GHSA-p293-qw3h-jr36': ['Windows-hosted Next RCE', 'Условно, критично: текущая машина Windows и affected App Router есть. Production ОС/hosting неизвестны; при Windows next start это release blocker. Exploit не запускался. N4.'],
  'GHSA-w5vr-8v7q-w6rv': ['Baseline invalid input process exit', 'Условие отсутствует в app: invalid runtime user queries не поступают; только Browserslist build цепочка. C1.'],
  'GHSA-2xp9-vwfh-vxw4': ['AVIF image optimizer RCE', 'Непроверено условие native decoder: sharp/libheif не подтверждены в installed/lockfile graph. Нужны image optimizer+уязвимый AVIF decoder; production artifact неизвестен. Не считать доказанным RCE. N1/N4.'],
  'GHSA-vfj7-8cjw-p6xm': ['Nested braces stack exhaustion', 'Условно build/tooling: user pattern не поступает в braces, Tailwind glob фиксирован. Primary issue не указывает исправленную версию, обещать simple patch upgrade нельзя. C1.'],
};
for (const id of groups.keys()) if (!judgement[id]) throw new Error(`Missing judgment ${id}`);
if (groups.size !== 47 || prodIds.size !== 39) throw new Error('Unexpected counts');
const rows = [...groups].map(([id, ads]) => {
  const [title, reason] = judgement[id];
  const packages = ads.map(a => `${a.module_name} ${[...new Set(a.findings.map(f => f.version))].join(', ')}`).join('; ');
  const patches = ads.map(a => `${a.module_name}: ${a.patched_versions === '<0.0.0' ? 'не опубликован' : a.patched_versions}`).join('; ');
  return `| [${id}](${upstream.get(id).url}) — ${title} | ${packages}; ${prodIds.has(id) ? 'prod graph' : 'dev only'}; ${[...new Set(ads.map(a => a.severity))].join('/')} | ${patches} | ${reason} |`;
});
const report = `# Независимая проверка advisory reachability — CampusForge

Дата: 2026-10-04. Это приложение к единому dependency finding основного отчёта; 47 advisories не превращены в 47 дублирующих findings. Приложение, lockfile, зависимости и данные не менялись. Не выполнялись exploit, нагрузочные запросы, AI-вызовы или запросы к production.

## Что запускалось и что означает результат

Результаты реальных pnpm audit сохранены в evidence/dependency-audit.json и dependency-audit-prod.json. Metadata counts: all 59 (7 critical, 23 high, 23 moderate, 6 low), prod 48 (7 critical, 18 high, 20 moderate, 3 low). Это package/path aggregate registry; не число доказанных remote exploits. Уникальных advisory по GHSA: all **47**, prod **39**. Entries объектов advisories: all 50, prod 42; одинаковый GHSA для next-auth и нескольких @auth/core версий объединён в одну строку.

Для каждой строки найден publisher primary: security advisory в upstream repo, либо исправляющий commit/исходный issue для пяти записей без publisher advisory. Все 47 publisher URLs повторно прочитаны публичным HTTP GET (200), timestamps/SHA256/URL в evidence/dependency-publisher-fetch.json. Для существенных Next/Auth/PDF условий дополнительно прочитан текст первоисточников через browser search/open. Сохранённый последний evidence/dependency-primary.json содержит 6 успешных API records и 41 HTTP403 (GitHub anonymous API rate limit); не заявляем 47 сохранённых успешных API records. HTTP200/title/hash подтверждают получение publisher страницы, **сами по себе не доказывают эксплуатацию**. Диапазоны исправления сверены с опубликованным advisory/commit и registry; таблица приводит нижнюю patched границу конкретной записи, а не обещание общей совместимости обновления.

Статусы: «предпосылки подтверждены» — installed version и путь приложения совпадают с первоисточником, без атакующего payload; «условно» — deployment/input предпосылка неизвестна; «условие отсутствует/путь не найден» — source review исключил описанный сценарий в текущем checkout, но это не гарантирует безопасность будущей конфигурации. Severity в таблице — registry classification; приоритет проектного finding определяется reachable impact.

## Все уникальные advisories

| Advisory и первоисточник | Installed package / scope / severity | Нижняя patched граница данной записи | Достижимость в CampusForge |
|---|---|---|---|
${rows.join('\n')}

## Source anchors для решений таблицы

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

## Vendored PDF.js вне package advisory graph

pnpm audit не перечисляет исходники PDF.js, встроенные внутри pdf-parse1.1.4. apps/worker/src/jobs/parse-document.ts:65-69 передаёт untrusted uploaded PDF в pdfParse(buffer). node_modules/.pnpm/pdf-parse@1.1.4/node_modules/pdf-parse/lib/pdf-parse.js:14 вызывает getTextContent; :42 default version v1.10.100; :69-70 getDocument без isEvalSupported:false, disableWorker=true. Точные vendor excerpts/SHA256 и HTTP200 publisher источники сохранены в evidence/pdf-vendor-source-review.json; воспроизводящий read-only script probes/pdf-vendor-source.cjs.

В этом vendor коде подтверждён потенциально опасный glyph compiler: lib/pdf.js/v1.10.100/build/pdf.js:14544-14560 getPathGenerator конкатенирует glyph args и создаёт new Function; :15638-15651 единственный найденный caller — CanvasGraphics.paintChar. [Mozilla CVE-2024-4367 / GHSA-wgrm-67xf-hhpq](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq) указывает affected pdfjs-dist <=4.1.392, patched4.2.67, workaround isEvalSupported:false. Установленный vendored1.10.100 старее исправления и опасный source присутствует.

Однако текущий CampusForge parser не вызывает page.render/canvas glyph painting. pdf.js:3807 sendWithStream(GetTextContent) → pdf.worker.js:25414-25428 → :32077-32114 extractTextContent → PartialEvaluator.getTextContent. На этом статически прослеженном пути CVE glyph compiler sink не найден. **RCE именно через current getTextContent flow не подтверждён**; malicious PDF/exploit не исполнялся, global eval/Function не использовались для атакующего кода. Это явный vendored-code blind spot и проверяемая гипотеза, а не утверждение «PDF безопасны» или подтверждённый app RCE.

В актуальном [Mozilla GHSA-hq66-cqwq-w95j](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j) есть другая scripting проблема для >=5.6.83; её range не совпадает с vendored1.10.100 и browser enableScripting viewer отсутствует. Не переносим её на данный worker автоматически. Проекту нужен maintained text parser с отключённым eval и отдельным process/resource deadline, затем изолированный malicious-PDF regression; это также закроет отсутствие PDF CPU/page/time limits из pipeline отчёта.

## Минимальный порядок исправления и admission checks

1. **P1 / release blocker:** обновить Next на поддерживаемую совместимую ветку, покрывающую весь набор advisories; нижняя граница 15.5.24 покрывает перечисленные Next записи этой таблицы, но это не разрешение оставить unsupported branch или игнорировать React/Auth совместимость. При production Windows GHSA-p293 — критичный conditional impact; до patch origin не допускать наружу. Для self-hosted origin отдельно проверить Upgrade filtering/egress. Версионная замена без rerun build/React transition checks не считается закрытием.
2. Обновить согласованно next-auth/@auth/core/prisma-adapter; убрать лишнюю прямую устаревшую @auth/core копию, если приложение её не использует. Повторить malformed-token, signin/logout, JWT update и workspace authorization regressions. Provider-specific advisories не предъявлены как действующие auth bypass.
3. Устранить транзитивные версии PostCSS>=8.5.23, nanoid>=3.3.18, cookie>=0.7.0, UUID>=11.1.1, FXP>=5.7.0 и builder>=1.1.7 в совместимой цепочке; проверить оба prod и build graphs после frozen install. Для braces не выдумывать опубликованный patch: заменить/ограничить вызывающий tooling путь либо оформить явно ограниченный exception с подтверждёнными fixed input boundaries.
4. Обновить Turbo/esbuild/Autoprefixer/Browserslist/selector parser tooling; CI для недоверенных PR запускать без production secrets/privileged network. Это conditional build boundary, не доказанная атака пользовательского UI.
5. Admission: lockfile diff проверен, clean frozen install и build/typecheck/lint выполнены; audit(all/prod) повторён; каждый оставшийся advisory имеет issuer source, actual caller/preconditions и owner/expiry. Native decoder и production ОС/proxy/cache topology установлены по deploy artifact, а не предположению. Vendored PDF анализ нужен отдельно от чистого npm audit.
`;
fs.writeFileSync(path.join(dir, 'dependency-triage.md'), report);
console.log(JSON.stringify({ output: 'dependency-triage.md', uniqueAll: groups.size, uniqueProd: prodIds.size, rows: rows.length }));
