# Независимый frontend audit CampusForge — 2026-10-04

## Вердикт и границы проверки

Frontend не готов к production: имеются подтверждённые блокирующие проблемы с вводом нового чата и мобильной навигацией, переполнение страниц, нарушения клавиатурной доступности и несогласованность состояния. Документы и чат визуально обещают настоящий AI, но фактически отображают локальные шаблоны; доказательства этого переданы pipeline reviewer, чтобы главный отчёт не дублировал одну причину несколькими findings. Доказанный JavaScript callbackUrl sink и утечка localStorage между пользователями переданы AppSec reviewer.

Прочитаны frontend-senior полностью, shadcn, Playwright; для проверки CSS motion прочитаны Motion skill и best-practices. В каталоге проекта физического AGENTS.md нет; применены переданные пользователем AGENTS instructions. Исходники приложения, .env, пользовательские данные не менялись. Предыдущий AUDIT-2026-10-04.txt не использовался как доказательство. Изменены только файлы аудита.

Стенд: отдельная копия web в `%TEMP%/campusforge-independent-ui-audit-20261004`, Next dev на **127.0.0.1:3107**, оригинальные UI-компоненты и CSS. Middleware, auth, workspace queries, Server Actions и upload handler заменены **только в TEMP** фикстурами. DATABASE_URL/REDIS_URL адресуют localhost:1; .env проекта не копировался и не загружался; provider не вызывался; worker не запускался. Подключены существующие node_modules через junction, зависимости не менялись. Для закрытых компонентов используется дополнительный `/audit` route с переданными fixture props; `/`, `/sign-in`, `/sign-up` — оригинальные public pages. Dashboard рендерит оригинальную страницу с fake user/workspace query.

**Это проверка настоящего интерфейса на fixture boundaries, а не успешный end-to-end auth/upload/DB/S3/worker/provider тест.** Next dev также не подтверждает production artifact/startup. Browser Chromium, четыре viewport: **390×844, 768×1024, 1024×900, 1440×900**; light/dark. Screenshots сохранены в `screenshots/`; визуально просмотрены новая/активная беседа, все размеры/light-dark новой беседы, public auth/landing, dashboard, переполненные списки, dialogs/error states. Для воспроизводимых screenshots CSS animations завершены `animations:'disabled'`; это техника capture, не изменение CSS. Неполные промежуточные снимки активного чата были пересняты после устранения capture timing и не считаются дефектом приложения.

## Исполненные проверки

| Проверка | Фактический результат | Доказательство |
|---|---|---|
| Assistant new/active, четыре viewport × light/dark | Активная беседа помещается; новый composer clipped на 390/1024/1440 выбранной высоты | `ui-visuals-results.txt`, 16 screenshots `assistant-{new,active}-*.png` |
| Public landing, sign-in, sign-up | Все четыре ширины/light-dark отрендерены; sign-in/signup без горизонтального overflow | `ui-pages-results.txt`, `landing-*.png`, `sign-{in,up}-*.png` |
| Dashboard/tasks/documents, четыре ширины/light-dark | Подтверждён overflow на mobile и части tablet; counts dashboard статические | `ui-pages-results.txt`, соответствующие screenshots |
| Task dialog focus/loading/error/Escape | Начальный focus task-title; 18 Tab остаются внутри; Pending disabled; fake action error показана; Escape закрывает | `ui-interactions-results.txt`, `task-deferred-action-390.png`, `task-mock-error-390.png` |
| Duplicate task submit | Deferred Server Action 2s: disabled=true, Creating..., один POST; duplicate через UI **не воспроизведён** | `ui-interactions-results.txt` |
| React/Next async transition | Runtime React **18.3.0-canary-178c267a4e-20241218**; async ordinary Promise 2s тоже удерживает pending | `ui-runtime-react-results.txt` |
| Flashcards keyboard/pointer | Focused Next+Enter переворачивает текущую карточку, прогресс остаётся1/2; pointer Next даёт2/2 | `ui-interactions-results.txt`, `flashcards-keyboard-390.png` |
| Assistant mobile drawer | Escape не закрывает, dialog role отсутствует, Tab уходит на закрытый фоном интерфейс | `ui-interactions-results.txt`, `assistant-drawer-keyboard-390.png` |
| Stop generating | Отмена thinking действительно предотвращает появление ответа | `ui-functional-results.txt` |
| Streaming/history switching | После переключения остаётся persistent status=streaming и caret без Stop | `ui-functional-results.txt`, `assistant-history-interrupted-1440.png` |
| Document реальные results props | Переданный DB summary marker не показан; generation делает0POST и выводит filename template/static cards | `ui-functional-results.txt`, `document-generated-demo-390.png` |
| Upload empty/error | Empty file validation показана; mocked503 отображает error, dialog остаётся открыт | `ui-pages-results.txt`, `upload-{validation-empty-error,api-error}-390.png` |
| Labels/focus/themes | Unnamed settings controls, unnamed mobile model trigger/delete; focused inactive Chat options opacity0; theme state конфликтует | `ui-final-results.txt`, `settings-accessibility-1440.png` |
| callbackUrl | Success auth action **mocked**; original router.push executes `javascript:window.__auditCallback=42`, marker42 | `ui-functional-results.txt`, AppSec finding |
| Privacy/logout | Bob fixture видит Alice history; original signOut + mocked auth endpoints redirects/sign-in, storage остаётся | `ui-functional-results.txt`, `ui-final-results.txt`, AppSec finding |
| Reduced motion | Source has reduce override for custom keyframe classes; полноценная performance/accessibility сертификация не проводилась | `globals.css:222-232` |

**Коррекция важной гипотезы:** номинальный dependency React18.3.1 не означает, что runtime App Router использует обычный стабильный React18. В этом проекте browser исполнил canary18.3.0 и корректно удержал async pending. Нельзя объявлять universal duplicate submissions или universal clean-build failure по одному `startTransition(async ...)` в source. Build/typecheck разницу installed-tree vs чистой установки исследовал root reviewer; этот frontend audit подтверждает именно положительный runtime исход.

## Подтверждённые findings

### FE-01 — P1: composer нового чата недоступен в основном viewport

- **Файлы/строки:** `apps/web/src/components/assistant/welcome-screen.tsx:46,63-71`; `chat-view.tsx:43,75-85`; `assistant-app.tsx:387`.
- **Условия:** новая беседа без сообщений; eight prompt cards сохраняют intrinsic min-height, body не получает scroll, весь assistant wrapper имеет fixed viewport height/overflow-hidden. Desktop дополнительно теряет544px на два sidebar.
- **Воспроизведение:** `probe-ui-visuals.js`. На390×844 textarea top1335/bottom1379, на1024×900 top945/bottom989, на1440×900 top871/bottom915. document body height совпадает с viewport, обычного vertical scroll для composer нет. На768×1024 top953/bottom997 — доступен. Light/dark одинаковые результаты. Screenshots `assistant-new-390-light.png`, `assistant-new-1024-dark.png`, `assistant-new-1440-light.png`.
- **Expected/actual:** пользователь нового чата всегда может ввести сообщение; фактически composer полностью или частично ниже viewport, mobile показывает только часть prompt chips. В активной беседе тот же composer помещается: это дефект welcome layout, а не отсутствующей инфраструктуры.
- **Влияние:** core chat flow на mobile не работает обычным способом; пользователь вынужден сначала выбрать canned prompt либо менять viewport.
- **Минимальное исправление:** сделать chat body `min-h-0 flex-1 overflow-y-auto`, welcome содержимым этого scroll area, composer `shrink-0`; уменьшить/свернуть количество cards на mobile при необходимости. Не добавлять body overflow к странице с фиксированным chat wrapper.
- **Проверка устранения:** новый чат на390×844,768×1024,1024×900,1440×900 + 200% zoom/открытая клавиатура; textarea/send доступны, prompts могут прокручиваться, outer document не растёт/не clips focus.

### FE-02 — P1: mobile лишён workspace navigation

- **Файлы/строки:** `apps/web/src/components/layout/app-shell.tsx:27-37,42-56`; `components/workspace/sidebar-workspace-nav.tsx:44-126`.
- **Условия:** viewport<768px, любая authenticated page.
- **Доказательство:** единственная navigation/switcher находится внутри `aside.hidden.md:block`; mobile header содержит только brand/theme/logout. На390px visible workspaceNavLinks=[]; в assistant кнопка Open chats открывает только conversation history, не Dashboard/Tasks/Notes/Documents/Flashcards/workspace switcher.
- **Expected/actual:** все разделы и workspace switcher достижимы на телефоне; actual отсутствуют и mobile menu trigger/альтернатива.
- **Влияние:** пользователь не может обычной navigation перейти к большинству функций или другому workspace, даже если backend полностью исправен.
- **Минимальное исправление:** добавить keyboard-accessible mobile navigation Sheet/Drawer, используя ту же workspace nav и switcher; видимый trigger, active route, focus return, Escape.
- **Проверка устранения:** на390px зайти из любого раздела во все другие и сменить workspace исключительно pointer/keyboard; links существуют в accessibility tree и видны после открытия mobile menu.

### FE-03 — P2: общая content column и плотные rows дают горизонтальное переполнение

- **Файлы/строки:** `apps/web/src/components/layout/app-shell.tsx:40,60`; `components/task/task-list.tsx:31,72,98-110`; `components/document/document-list.tsx:64,104,124-145`; `app/(dashboard)/w/[workspaceId]/dashboard/page.tsx:317,368,408,426`.
- **Условия:** narrow content area; задача с обычным title/status/priority/dueDate или документ с summary/status/delete controls.
- **Воспроизведение:** `probe-ui-pages.js` фиксирует390px scrollWidth: dashboard419, tasks587, documents495; на768px dashboard807/tasks843. Одинаково вlight/dark. Fixture task обычной длины, а не искусственный многокилобайтный payload; dashboard отрендерен из original static source. Screenshots `tasks-390-light.png`, `documents-390-light.png` показывают New Task/Upload/meta/header controls уходящими за правую границу.
- **Expected/actual:** основной content/button controls в ширинеviewport, rows переносятся/перестраиваются; actual родитель flex item не имеет `min-w-0`, dense row keeps `shrink-0`, растягивая весьshell.
- **Влияние:** основные действия и информация clipped, появляется horizontal page scrolling, header/logout также смещаются.
- **Минимальное исправление:** ограничить main column `min-w-0`, reflow list headers и row meta в column/grid наsmall widths; responsive dashboard table columns учитывать ширину после256pxsidebar, а не только viewport breakpoint.
- **Проверка устранения:** перечисленные fixture rows + длинныеfilename/title, все четыреwidths; `documentElement.scrollWidth <= innerWidth`, primary actions целиком видимы, status/date не теряются.

### FE-04 — P2: глобальная flashcard keyboard обработка перехватывает activation других controls

- **Файлы/строки:** `apps/web/src/components/flashcard/flashcard-viewer.tsx:66-86`.
- **Условия:** viewer mounted, focus на Next/Previous/Restart/Shuffle или другом interactive element страницы; Enter/Space.
- **Воспроизведение:** `probe-ui-interactions.js`: focus Next card → Enter → progress 1/2, flipped=true; mouse click same Next → progress 2/2. Window listener любого Enter вызывает preventDefault и flip независимо от target.
- **Expected/actual:** Enter активирует focused button; actual переворачивает другую карточку и отменяет native button click. Аналогичный перехват мешает workspace/header controls.
- **Влияние:** keyboard пользователи не могут стандартно пользоваться controls; visual focus не соответствует действию.
- **Минимальное исправление:** flip клавиши обрабатывать на focusable card; глобальные arrow shortcuts ограничить viewer и исключить buttons/links/inputs/selects/textareas/contenteditable, сохранить native activation controls.
- **Проверка устранения:** keyboard-only next/prev/restart/shuffle; Enter/Space focused button выполняют назначенное действие, card focus flip работает; header/workspaces не меняют card.

### FE-05 — P2: mobile chat drawer не имеет modal focus/keyboard semantics

- **Файлы/строки:** `apps/web/src/components/assistant/assistant-app.tsx:403-427`.
- **Условия:** width<1024px → Open chats.
- **Воспроизведение:** 390px, открыть drawer → Escape: Close sidebar still visible, dialogCount=0. 20 Tab переходов уходят в GPT-4.1/New chat/message buttons/composer/Sign Out под backdrop. `ui-interactions-results.txt`, screenshot drawer.
- **Expected/actual:** modal drawer имеет name/role, focus inside, Escape close, focus return; actual plain fixed div/backdrop без trap/inert/Escape.
- **Влияние:** keyboard/screenreader navigation попадает на фон, opaque overlay не соответствует фактическому focus, Escape не работает.
- **Минимальное исправление:** заменить custom overlay на существующий Radix Dialog/Sheet с Title, controlled open, focus return, Escape; если drawer intentionally nonmodal, убрать modal backdrop и предоставить правильную navigation semantics.
- **Проверка устранения:** focus после open в drawer, Tab/ShiftTab не уходят на фон, Escape закрывает, focus returns Open chats. Task dialog в том же стенде уже успешно прошёл этот контроль.

### FE-06 — P2: значимые controls не имеют доступного имени

- **Файлы/строки:** `apps/web/src/components/assistant/model-selector.tsx:33-44`; `settings-dialog.tsx:96-106,158-171,177-203,219-240`; `components/document/document-list.tsx:135-145`.
- **Условия:** model picker <640px; любая settings dialog; document delete row.
- **Доказательство:** model name `hidden sm:inline` — mobile snapshot button без name. Settings language/default model select, temperature range, 5 switches имеют labels=[], ariaLabel=null, ariaLabelledBy=null; Row label сделан p. Document trash button name отсутствует (`unnamedButtons=1` во всех dimensions). `ui-final-results.txt`, `ui-pages-results.txt`.
- **Expected/actual:** control сообщает purpose/название; actual узнать назначение из accessibility tree невозможно. Visual adjacent label не создаёт programmatic association.
- **Влияние:** screenreader пользователи не различают settings и delete/model controls.
- **Минимальное исправление:** connected label/id или aria-labelledby для каждого control; mobile model trigger aria-label с selected model; delete button aria-label с filename; switches должны принимать label/id.
- **Проверка устранения:** accessibility snapshot/axe checks должны дать nonempty unique names; keyboard/screenreader проверка каждой settings строки.

### FE-07 — P2: переключение истории оставляет бесконечный persistent streaming marker

- **Файлы/строки:** `apps/web/src/components/assistant/assistant-app.tsx:129-150,302-318`; `lib/assistant/storage.ts:26-35`; `components/assistant/message-bubble.tsx:76,170-180`.
- **Условия:** response уже streaming → выбрать другую history или New chat → вернуться.
- **Воспроизведение:** `probe-ui-functional.js`: wasStreamingBeforeHistorySwitch=true; после switch/reopen caretCount=1, stopButtonCount=0, streamingRecords=1 в localStorage. Screenshot `assistant-history-interrupted-1440.png`. Handler cancels timers/flags, но не finalizes old message; stripVolatile удаляет object URL, status не удаляет.
- **Expected/actual:** interrupted response имеет finished/cancelled state с recovery; actual вечный caret, message actions не показаны из-за streaming=true, Stop недоступен. Состояние сохраняется через reload.
- **Влияние:** пользователь видит ложную ongoing generation; partial answer невозможно отменить через обычный control.
- **Минимальное исправление:** единый cancel response handler завершает исходный conv message перед switch/new/delete/unmount; не persist transient streaming status либо rehydrate как interrupted.
- **Проверка устранения:** stop thinking, stop streaming, switch history, new chat, delete active, reload; нет streaming status без active work, caret исчезает, partial response сохраняется с explicit cancelled indicator.

### FE-08 — P3: keyboard focus на chat options остаётся невидимым

- **Файл/строки:** `apps/web/src/components/assistant/assistant-sidebar.tsx:221-229`.
- **Условия:** inactive history row, Tab на Chat options без pointer hover.
- **Воспроизведение:** `probe-ui-final.js`: focused=true, computed opacity=0 на inactive button. Source показывает только group-hover opacity 100, focus variant отсутствует.
- **Expected/actual:** focused control видим; actual focus существует на полностью transparent button.
- **Влияние:** keyboard пользователь теряет место в navigation, не видит доступного menu.
- **Минимальное исправление:** focus-visible:opacity-100/group-focus-within и focus ring; при необходимости оставить menu always visible на touch.
- **Проверка устранения:** Tab через все history rows без mousemove; каждый focused options видим, menu open/close возвращает focus.

### FE-09 — P3: две независимые theme state делают переключатель несогласованным

- **Файлы/строки:** `apps/web/src/components/layout/theme-toggle.tsx:10,21-35`; `components/assistant/assistant-app.tsx:76-93`; `app/layout.tsx:10-19`.
- **Условия:** global campusforge-theme=light, Assistant settings.theme=dark (достигается через settings), assistant mount.
- **Воспроизведение:** `probe-ui-final.js`: rootDark=true, toggleLabel="Switch to dark mode". Assistant imperatively sets root class, но ThemeToggle local state остаётся light; первый toggle снова sets dark и не меняет appearance.
- **Expected/actual:** одна effective theme и sync control; actual theme/icon/label/первый клик могут противоречить друг другу, вне assistant theme возвращается global value.
- **Влияние:** theme настройки нестабильны, visible control не соответствует действию; accessibility name неправдив.
- **Минимальное исправление:** один shared theme provider/storage key; Assistant settings должен вызывать provider, а не менять document element независимо.
- **Проверка устранения:** theme через global toggle/settings/system, route away/back, reload; appearance, icon, label, colorScheme соответствуют effective value первым кликом.

## Связанные доказательства без повторных findings

**AppSec:** `storage.ts:11,38-50,66-73`, `AssistantApp:55-60`, original `SignOutButton:12-14` — один origin storage key для всех user/workspace, identity не передаётся в storage. Browser Alice→Bob fixture видит ту же history; fake auth endpoints signOut→/sign-in не очищает key. Это privacy finding, а не ещё один frontend finding.

**AppSec callback:** `sign-in-form.tsx:19,35` — query callbackUrl→router.push. Original component + fake auth success после submit исполняет `javascript:window.__auditCallback=42`. Это execution marker в браузере, не просто source hypothesis; подлинный login/credential security эта проба не проверяет.

**AI pipeline:** `document-detail-view.tsx:59-101,110,160-178` — реальные results props ignored, generation timers/templates. Передан fixture DB summary/extractedText TRUTH_MARKER_42; marker не виден, POST=0, generic document summary/static flashcards visible. Assistant engine — client-only mock + fake word stream; file input оставляет лишь name/ext/size/object URL, content provider не передаётся; selected model меняет tint/persona framing, не выбирает provider. Dashboard stats/tasks/notes/documents/activity/insights берёт constants из page.tsx. Главный pipeline отчёт описывает это едиными findings.

## Что подтверждено работающим и что не проверено

Работают public page rendering/light-dark, обычный active chat layout, локальная history persistence, mock answer/word stream, Stop during thinking, task dialog focus/loading/error/Escape, server action pending в actual Next canary runtime, flashcard pointer flip/navigation, frontend upload validation/error render. Это не доказывает backend auth/authorisation, успешное task creation, AI provider или S3 upload.

Не выполнялись real accounts/auth success, DB/S3/Redis/worker/provider end-to-end, genuine provider stream cancellation, cross-device history, screenreader/manual NVDA, comprehensive WCAG contrast audit, performance profiling/Lighthouse, production browser build. Notes editing visual flow и все edge-case flashcards не охвачены полной viewport matrix. Custom CSS keyframes имеют reduced motion override; flashcard 500ms transition отдельного override не имеет — это низкоприоритетная recommendation, не главный confirmed release blocker.

## Порядок frontend исправлений и release gates

1. AppSec callback/isolation и AI pipeline UI truthfulness закрыть перед публичным использованием.
2. FE-01/FE-02: доступный new chat composer и mobile workspace navigation.
3. FE-03/FE-04/FE-05/FE-06: responsive content, keyboard shortcut scope, drawer semantics, names.
4. FE-07: единый response cancellation/state finalization; затем FE-08/FE-09.
5. Повторить сохранённые probes на исправленном приложении, затем на production build с исправной isolated infrastructure доказать настоящие flows.

Frontend gate: zero P1; no horizontal overflow в матрице; new chat input/send available при 200% zoom; mobile достижимость всех sections; keyboard-only forms/history/flashcards; dialog focus/Escape/return; unique accessible labels; duplicate submit blocked при slow actions; stream cancel/switch/reload не оставляет stuck status; UI показывает настоящие backend results/error/loading states; user/workspace history согласована с auth/logout.

## Воспроизводимость и артефакты

`run-ui-stand.ps1` создаёт TEMP копию через `bootstrap-ui-stand.ps1`, запускает dev 3107 с fake env без dotenv. Не запускать его над production deploy или на порту уже работающего проекта. Fixture auth sign-in всегда возвращает success: **этот стенд не публиковать и не использовать с настоящими данными**. Все DB адреса в стенде — локальный закрытый port 1.

Из корня проекта, при работающем стенде: `npx --yes --package @playwright/cli playwright-cli -s=campus-audit open http://127.0.0.1:3107/audit --headed`, затем `run-code --filename docs/audit-2026-10-04-independent/probe-ui-visuals.js` и аналогично `probe-ui-interactions.js`, `probe-ui-functional.js`, `probe-ui-pages.js`, `probe-ui-final.js`. Text outputs сохранены как `ui-*-results.txt`; screenshots в `./screenshots`.

Финальный артефакт-контроль: 78 screenshots; 57 original UI/CSS/assistant/public/dashboard source files сравнивались SHA-256 с TEMP copy — 57/57 идентичны, evidence/ui-source-hashes.json. Собственная browser session campus-audit закрыта, TEMP dev server port 3107 остановлен (listener count 0). Два CLI-generated файла перенесены из .playwright-cli в evidence/playwright-cli; предыдущие audit/output файлы не удалялись.
