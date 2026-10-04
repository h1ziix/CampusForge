# R1 — зависимости и advisory triage

Дата проверки: 2026-10-04 (Asia/Qyzylorda). Это новый release evidence; предыдущий независимый аудит не изменялся. Оценка относится к зафиксированному `pnpm-lock.yaml`, а не к разрешению production.

## Выбранный baseline

| Компонент                     | R1                                   | Причина / первоисточник                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js                       | 24.21.0; `>=24.21.0 <25`             | Active LTS на дату R1, EOL 2028-04-30: [release schedule](https://github.com/nodejs/Release/blob/main/README.md), [официальная загрузка](https://nodejs.org/en/download)                                                                                                                                                                        |
| pnpm                          | 10.33.0                              | Сохранён точный package manager baseline; install выполнялся этой версией                                                                                                                                                                                                                                                                       |
| Next.js                       | 16.3.8                               | Active LTS: [support policy](https://nextjs.org/support-policy). Windows RCE исправлен в 16.3.3: [GHSA-p293-qw3h-jr36](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36); новый ImageResponse RCE исправлен в 16.3.6: [GHSA-vcvr-r3jv-pc5j](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j) |
| React / React DOM / обе types | 19.3.0                               | Согласованный стабильный набор: [React 19.3](https://react.dev/blog/2026/09/09/react-19-3). Применимость RSC рассматривается на уровне Next runtime, а не только direct React: [React security notice](https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components)                                            |
| NextAuth / Prisma adapter     | 5.0.0-beta.32 / 2.11.3               | Оба publisher manifest требуют один `@auth/core=0.41.3`; ненужная прямая старая копия core удалена. [Auth fail-open patch](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-8fpg-xm3f-6cx3), [malformed bearer patch](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-xmf8-cvqr-rfgj)                          |
| Prisma / Prisma Client        | 5.22.0 / 5.22.0                      | Exact versions; крупная schema/ORM миграция в R1 не выполнялась                                                                                                                                                                                                                                                                                 |
| TypeScript / Node types       | 5.9.3 / 24.19.1                      | Совместимые compiler/runtime types; type checking не отключён                                                                                                                                                                                                                                                                                   |
| Worker PDF parser             | pdf-parse 2.4.5 → pdfjs-dist 5.4.296 | Maintained publisher, встроенные types, обычные production assets: [repository / API](https://github.com/mehmet-kozan/pdf-parse), [load options](https://github.com/mehmet-kozan/pdf-parse/blob/main/docs/options.md)                                                                                                                           |

AWS S3 SDK обновлён до 3.1146.0; BullMQ до 5.81.5 и ioredis до 5.11.1 (также версия, требуемая BullMQ). Транзитивная UUID цепочка старого BullMQ исчезла. Zod сохранён в совместимой major 3 (3.25.76). Обновлены Turbo 2.11.7, tsx 4.23.15, PostCSS 8.5.28, Autoprefixer 10.6.1 и Tailwind 3.4.19. Удалены obsolete `@types/bcryptjs` и `@types/pdf-parse`; сами библиотеки поставляют types.

Удалён неиспользуемый `next/font/google` Inter loader: он выполнял изменяемый внешний font fetch во время build вне pnpm lock. Его CSS variable `--font-inter` не имела consumer; фактическая типографика приложения остаётся прежним Tailwind `font-sans` system stack. Новых font dependencies и CSS font-family изменений нет.

В `.npmrc` включены engine/package-manager/peer strict checks, отключена автоматическая установка неявных peers. Обязательные зависимости записаны явно. Никакие `audit --fix --force`, ручные изменения `node_modules`, `any`, `ts-ignore` или отключение проверок не использовались для dependency upgrade.

## Совместимые security overrides

Первый audit нового direct dependency graph выявил старые транзитивные версии, которые pnpm сохранил из прежнего lock. В root `pnpm.overrides` добавлены три ограниченных диапазоном исправления; major API не заменены:

- `postcss-selector-parser@>=6.1.0 <6.1.3` → 6.1.4, [исправляющий upstream commit](https://github.com/postcss/postcss-selector-parser/commit/5bc698cef66f8abd12610dc623e5d67cbc0f869d).
- `browserslist@<4.28.7` → 4.29.3, [cache OOM](https://github.com/browserslist/browserslist/security/advisories/GHSA-c83g-rgw3-j3cx), [untrusted stats crash](https://github.com/browserslist/browserslist/security/advisories/GHSA-73wf-gq98-2v4g).
- `baseline-browser-mapping@<2.11.0` → 2.11.27, [исправляющий upstream commit](https://github.com/web-platform-dx/baseline-browser-mapping/commit/de733e2d8959559f7bb255d5927f3afcb6f31589).

Next содержит PostCSS 8.5.23, остальные цепочки используют 8.5.28; обе версии покрывают прежние PostCSS advisories. Locked nanoid 3.3.19 покрывает прежние size-loop advisories. Обновлённый AWS graph больше не содержит старую fast-xml-parser цепочку; Auth graph содержит только core 0.41.3. Эти утверждения основаны на actual lock и повторном registry audit, без исполнения exploit.

## Реально исполненные dependency проверки

Все команды выполнены с portable Node 24.21.0 и pnpm 10.33.0; настоящий `.env` не загружался, DB соединения и миграции не выполнялись.

| Команда                          | Результат                                           | Evidence                                  |
| -------------------------------- | --------------------------------------------------- | ----------------------------------------- |
| `pnpm install --lockfile-only`   | PASS, exit 0; lock обновлён с strict peers          | `R1-evidence/lock-generation.log`         |
| `pnpm install --frozen-lockfile` | PASS, exit 0; final locked graph                    | `R1-evidence/install.log`                 |
| `pnpm audit --json`              | exit 1: 1 high, 0 critical / moderate / low         | `R1-evidence/dependency-audit-all.json`   |
| `pnpm audit --prod --json`       | PASS, exit 0: 0 advisories                          | `R1-evidence/dependency-audit-prod.json`  |
| `pnpm -r why braces`             | Единственная версия 3.0.3, только dev tooling paths | `R1-evidence/dependency-braces-paths.log` |

Во время install задан `PRISMA_SKIP_POSTINSTALL_GENERATE=true`, чтобы postinstall не выполнял неявную generation с неизвестным environment. Это не заменяет обязательный `pnpm db:generate`: explicit generation, все quality gates, clean source install, build и production-only smoke проверяются и фиксируются в основном [R1 отчёте](R1.md). Main-checkout install сам по себе не является clean-copy доказательством.

Для проверки используется скачанный официальный ZIP Node 24.21.0 win-x64. SHA256 сравнен с официальным `SHASUMS256.txt`: `158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541`. Файл и executable находятся вне исходников в локальном Codex runtime directory; обычный разработчик устанавливает baseline через свой Node manager.

Прежний audit: all 59 aggregate advisories (47 unique GHSA), prod 48 (39 unique GHSA). Финальный: all 1 unique GHSA, prod 0. Числа registry advisory не равны числу достижимых exploit и не охватывают дефекты бизнес-логики SEC/PF/FE.

## Оставшийся advisory и ограниченные исключения

**GHSA-vfj7-8cjw-p6xm, braces 3.0.3, high, dev-only — не закрыт.** [Upstream security issue](https://github.com/micromatch/braces/issues/70) не публикует исправленную npm версию; registry patched range `<0.0.0`. Actual paths: Next ESLint plugin → fast-glob → micromatch → braces; Tailwind → fast-glob/micromatch и chokidar → braces. Current Tailwind content pattern фиксирован в `apps/web/tailwind.config.ts`, lint работает с project source/config; endpoint, принимающий public glob patterns, не найден. Это ограничивает текущую HTTP достижимость, но не снимает риск недоверенного PR/source build. Production-only graph этой зависимости не содержит.

Owner: repository maintainers. Пересмотр до **2026-10-31** или сразу при upstream patch/изменении glob input boundary. CI запускается без production secrets и без privileged external deployment. Непроверенные user-selected patterns не должны передаваться этим build tools. Advisory не скрыт в audit ignore list; all audit по-прежнему возвращает exit 1.

**ESLint 9.39.5 — временный support exception.** По [официальной таблице поддержки](https://eslint.org/version-support/), ESLint 9 EOL с 2026-08-06; current — 10. Next 16.3.8 lint preset использует `eslint-plugin-react@7.37.5` (peer ESLint до `^9.7`) и `eslint-plugin-jsx-a11y@6.10.2` (до `^9`), поэтому strict peer install ESLint 10 противоречит published peers. Выбрана последняя совместимая 9.x, без peer override и без отключения lint. Owner: repository maintainers; пересмотр до **2026-10-31**, переход на 10 после поддержки плагинов либо проверенной замены lint preset.

**NextAuth остаётся prerelease.** Вызовы приложения используют существующий v5 API; стабильный dist-tag 4.x не является совместимой заменой. Выбрана security patched beta.32, не beta.25. Перед production требуется отдельная auth acceptance проверка R2; R1 не закрывает callback URL, JWT onboarding, throttling или другие SEC findings.

**Prisma 5.22 сохранён.** Registry audit не показал advisory для выбранного graph. Это не утверждение о долгосрочном vendor support старой major: обновление ORM/schema требует отдельного согласованного релиза, validation и migration acceptance.

**PDF ограничения остаются.** Старый vendored PDF.js 1.10.100 удалён; 5.4.296 выше [исправления CVE-2024-4367 в 4.2.67](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq). Новый [viewer scripting advisory](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j) имеет affected `>=5.6.83`, что не совпадает с выбранной версией; worker использует text extraction без viewer scripting, `isEvalSupported:false`. Это не закрывает отсутствие PDF CPU/page/time limits, изоляции hostile documents или idempotency из PF findings; эти работы вне R1.

Повторять all/prod audit при каждом dependency change и перед следующим релизом: registry advisory data изменяется. Нулевой prod audit подтверждает только известные registry записи этого lock, а не production безопасность.
