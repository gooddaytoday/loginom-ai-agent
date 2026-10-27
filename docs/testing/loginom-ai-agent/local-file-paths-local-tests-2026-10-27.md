# Локальные проверки local-file-paths, 2026-10-27

Проверяется `299049c48101e479ea758da48cc34e592accef96` после rebase на `loginom` `db13009886534c3d115096a9ad8e3575275381ec` и перечисленные ниже исправления рабочего дерева. Исходное дерево было чистым. Это source-проверки; установленный продукт, выпуск и приёмка на настоящей модели ими не подтверждаются.

## Результат

- Все 34 пакетные проверки типов — PASS; generated-client — PASS без изменения generated-файлов.
- Активные workspace-наборы — 6898 PASS, 56 исходных SKIP, 1 TODO, 0 FAIL. В это число уже входят Agent 3857 PASS / 25 SKIP / 1 TODO, Core 1098 PASS и App 737 + 60 PASS; повторно их не суммировать.
- HttpApi: coverage, auth и effect — по 208 PASS; всего 624 исполнения сценариев, без missing/extra/skip.
- Runtime/client/tools: 25843 PASS, 74 явных SKIP, без FAIL/error/cancelled. В том числе client 5784 PASS / 2 Windows SKIP; runtime 92 PASS; JS tools 18887 PASS; настоящий direct browser 16 PASS; Python tools 1055 PASS / 43 SKIP; вложенные native Python gates 9 PASS / 29 SKIP.
- Host — 396 PASS / 6 Windows SKIP; Desktop — 163 PASS / 5 платформенных SKIP; Product — 5 PASS. Desktop draft-store отдельно прошёл под pinned Node и Electron run-as-node.
- Source Desktop build и startup-failure, GUI onboarding, crash-logging, proxy contracts/smoke — PASS. Установленное приложение и пользовательские профили не изменялись.
- App normal E2E — 105/105 PASS. Полный production benchmark после исправлений — 65/65 browser и 47/47 unit PASS, 22,0 мин, retries 0; все четыре тяжёлых streaming-сценария с исходными нагрузками прошли. Исходный результат 62 PASS / 3 FAIL сохранён, три исправленных сценария отдельно прошли по три раза. Suspense reproduction — 3/3 PASS.
- Финальный доступный Evals с proc-denial — 1235 PASS / 20 SKIP / 0 FAIL, 1255 тестов в 93 файлах, 22,5 мин. Файлы не исключались; явно отфильтрованы ровно два кейса: создание Docker-сети и host-bind, невидимый Docker daemon из private tmpfs. Host-bind затем прошёл на обычном HDD; повтор создания сети подтвердил BLOCKED_ENV — исчерпан default address pool.
- Исходный полный Evals без этих двух фильтров дал 1214 PASS / 30 SKIP / 13 FAIL / 1 error, 1257 тестов в 93 файлах. Исходные ошибки и промежуточные повторы сохранены отдельно. Финальный результат с двумя явными исключениями не выдаётся за зелёный запуск без фильтров.
- Свежий compiled source CLI payload: startup recovery 1/1 PASS, полный preflight 11/11 PASS; два opt-in native browser ownership/cleanup сценария Evals 2/2 PASS. Использованы локальные synthetic provider/auth/server fixtures; внешней модели и настоящего Loginom в этих проверках нет.
- Kernel PID reuse opt-in — 1/1 PASS в настоящих отдельных user/PID namespaces: один PID с разным starttime, отказ сигналить новую birth через старую запись и подтверждённый cleanup. Host PID namespace/counter не использовался для принудительного reuse.
- Дополнительно: Python SDK 129 PASS; TypeScript SDK 50 PASS, build и consumer types PASS; service pure Node 37 PASS. Архивный Hermes 11 PASS отдельно, вне активного продукта.
- Migration Python 6 PASS; node-acceptance JS 182 PASS и Python 32 PASS; translate script 15 PASS.

## Что исправлено

1. HTTP Recorder возвращал архив со старым `agent-ai-` именем после миграции пакета. `pack.ts` вычисляет имя из текущего `package.json`. Существующий consumer gate воспроизвёл ошибку три раза; настоящий pack → npm install → public import → TypeScript 5.8.2 теперь PASS. Unit 33/33 и types PASS. Новых зависимостей и общего механизма упаковки нет.
2. Agent write-тест ожидал 0644 независимо от umask. Теперь проверяется реальный контракт `0666 & ~process.umask()`; production-права не менялись. Standalone fixture получила настоящий Git project boundary; только тест каталога skills получает PATH с одним Git, сохраняя отсутствие rg/tar/gzip. Это исключает загрузку пользовательских skills из родительского домашнего каталога.
3. Core npm-config fixtures теперь содержат собственный минимальный `package.json`: настоящий npm loader находит проектную `.npmrc`, а не границу родительского проекта. Все пять assertions сохранены; RED3 → GREEN3, полный Core 1098/1098 PASS.
4. Schema event-manifest тест учитывает три намеренно добавленных upstream Revert event. Идентичность старых V1 и новых событий проверяется явно, без хрупкого slice по индексам. Полный Schema 17/17 и types PASS; Protocol 2/2 PASS.
5. Desktop draft-store тест переведён с `bun:test` на стандартный `node:test`: используемый production `node:sqlite` отсутствует в текущем Bun. Проверки blob/flush сохранены, выполнены под Node и Electron. Только fixture отказавшего proxy reader очищает родительские HTTP proxy variables: раньше они законно переключали production-результат на environment proxy. Штатный system-proxy smoke 5/5 PASS.
6. Python acceptance: пути к историческим docs указывают на сервисный архив; архивный Hermes имеет явный SKIP в активной коллекции; synthetic preflight получает собственный SKILL fixture; JavaScript CLI admission fixture использует актуальный lazy connection/task scope и допустимый исходный message ID. Реальные проверки HostPort/inputStore и cleanup не заменялись. Соответствующие три импортированных файла обновлены в source-transforms; immutable source-map сохранён, affected hashes проверены независимо. Post-migration admission-тест в source-map не входит.
7. Evals timeline-тест приведён к намеренно сокращённому в `b698570087` resource evidence API. Удалены ожидания отсутствующего `processTimeline`; сохраняются настоящая команда, секундная cadence, ownership/cleanup, hash/coverage/budget и negative unbracketed timeline assertions. RED3 → GREEN3 и полный файл 10/10 PASS.
8. App: Bun fixture-тест перенесён в существующий `performance/unit/`, чтобы Playwright не импортировал `bun:test`; explicit include в `e2e/tsconfig.json` переведён на новый путь. Независимое ревью нашло оставшийся старый include; RED/GREEN проверка реального TypeScript file list и последующий `bun run typecheck:e2e` подтвердили восстановление negative `@ts-expect-error` coverage. Hydration использует настоящий `Part.id`. Shell virtualization fixture теперь хронологически предшествует history, сохраняя реальные unmount/remount и expanded-state assertions.
9. Cold-review benchmark использует существующий сборщик двух DOM milestones, текущий V2 body и явно открытую панель. Оба элемента должны стать видимыми, данные трёх стабильных кадров и исходные timestamps сохраняются. Устаревший legacy порядок удалён после проверки истории V2, независимого разбора и записи появления обоих элементов в одном кадре. Это соответствует `e2e/performance/AGENTS.md`: проверять завершение и сбор метрик. Пробная гипотеза изменения readiness не подтвердилась и полностью удалена; production App не изменён.
10. Дополнительный proc-denial нашёл настоящий дефект eval-harness: writer-release settlement подтверждал отсутствие native-процессов, пропуская недоступный relevant native как чужой. Ordinary cleanup должен пропускать доказанно чужие процессы; settlement по существующему контракту требует строгого отказа. В двух внутренних функциях введён default-false strictNative, включённый только settlement; bounded retry и UID/signaling policy сохранены. Parent-held контроль подтвердил живой native PID/birth/currentUID и exe EACCES до и после ошибочного confirmed за137мс. Усиленная fixture дала RED3, исправление GREEN3 и proc-denial8/8 PASS. На busy host readable-native тест принимает ровно два предусмотренных отказа без обещания порядка census и проверяет child alive до/после; RED3→GREEN3, typecheck PASS. Исходный полный блок трёх файлов:82 PASS/2 nativeBusy SKIP/1 затем исправленный oracle FAIL; все три файла прошли в финальном доступном Evals.

## Среда и повторяемость

Использованы Bun 1.3.14, pinned Node 24.19.0, product Chromium 1246 и CPython 3.12.14 с настоящими Linux PID-fd API. Для App отдельно установлены task-local Playwright 1.59.1 / Chromium 1217. Xvfb/DBus и профили собственные; browser sandbox, ownership guards, продуктовые таймауты и нагрузки сохранены.

HDD в `storage/tmp` измеренно даёт median 0,757 с / max 1,742 с на запись 4 KiB с fsync файла и каталога. Полные наборы с частыми durable writes выполнялись в отдельном private tmpfs:

```sh
bwrap --bind / / --dev-bind /dev /dev --proc /proc \
  --tmpfs /home/kiselev/storage/tmp/l74t \
  env TMPDIR=/home/kiselev/storage/tmp/l74t \
      TMP=/home/kiselev/storage/tmp/l74t \
      TEMP=/home/kiselev/storage/tmp/l74t <команда пакета>
```

В обычных наборах PID namespace не скрывается; отдельный kernel PID reuse использует собственные user/PID namespaces. Чужие процессы и настройки не менялись. Логи и binaries находятся вне этого временного mount. Исходные HDD-падения и прерванные PARTIAL-прогоны сохранены, не переименованы в PASS. Для Docker host bind mount private tmpfs непригоден: Docker daemon работает вне namespace; соответствующий тест прошёл на обычном storage/tmp. После прогонов проверены закрытые собственные App-порты 4096, 4097, 43741, 43743, 43745.

Команды запускаются из каталогов пакетов: workspace `bun run test` либо явный `bun test` для пакетов без script; `bun typecheck`; Agent `bun run test:httpapi`; client `bun run check:generated`; HTTP Recorder `bun run verify:package`. Runtime/client и tools — pinned Node `--test --test-concurrency=2`, официальный direct-browser runner и Python `unittest discover`. App normal — `bun run test:e2e --retries=0`, performance — `bun run test:bench`, один worker, production build. Все точные аргументы, переменные среды и cwd сохранены в матрицах ниже.

Под дополнительной одновременной нагрузкой два managed-login diagnostics превысили исходные 30 с. Полный runtime прошёл; три последовательных тихих повтора дали 6 PASS без изменения deadline. Один App normal SSE setup timeout не воспроизвёлся в пяти узких повторах и полном 105/105. Один SDK-next timeout не воспроизвёлся в трёх узких и полном 5/5. Эти первоначальные наблюдения сохранены как load-sensitive/невоспроизведённые; абсолютная стабильность не заявляется.

## Ограничения

- Один Docker network-case остался BLOCKED_ENV: финальный повтор на HDD получил `all predefined address pools have been fully subnetted` до создания сети. Зелёный Evals без фильтров не заявляется. Ранее при одновременной нагрузке Docker не завершил контрольный create за 45 с; в финальном доступном полном прогоне все три resource-теста прошли. Ранее инвентаризирована 51 историческая сеть; исторические контейнеры/сети не удалялись, общая конфигурация Docker не менялась.
- Дополнительный финальный read-only `docker ps -a` превысил собственный лимит 15 с (`root/docker-final-readonly-timeout.json`). Это вспомогательный сбой инвентаризации, отдельный от сохранённых тестовых cleanup receipts; свежая полная инвентаризация и очистка неизвестных ресурсов не заявляются.
- Windows/macOS проверки, source-disabled тесты и TODO остаются явными пропусками. В Agent: 6 Windows, 13 source-disabled, 4 внешней модели, 1 отсутствующая cassette и 1 compiled case; последний выполнен отдельно на свежем source payload. В LLM 30 cassette отсутствуют; новые обращения к провайдеру ради их записи не выполнялись.
- Proc-denial требует отдельного окна без других тестовых агентов. После окончания всех собственных runners финальный preflight показал 0 чужих Bun tests; отдельный запуск восьми проверок после исправления прошёл. Пользовательские браузеры не останавливались: native-busy detector видит 28 процессов и сохраняет три SKIP. Installed/live/server gates не считаются PASS по обычным fixture-наборам.
- Shared OAuth opt-in требует candidate с `shared-oauth-v1`. Эта возможность намеренно удалена из текущего продукта в `95487c198c` (LAB-91): actual manifest её не объявляет, `providers` имеет только list/login/logout. Пробный task-local receipt неверно заявил эту возможность; попытка правильно получила `SHARED_AUTH_STATUS_INVALID` и отмечена INVALID_CANDIDATE. Это не PASS и не основание возвращать удалённую feature. Нужен другой действительно совместимый candidate; обычные shared-directory unit tests выполнены в полном Evals.
- Свежие immutable/private native captures не подделывались. Настоящий судья, модели, общий Loginom, R2/S3 и внешние credentials в этой локальной проверке не используются. Архивные service core/C++/Rust/Go/Studio наборы требуют отдельных toolchains/native сборок или deployment; их точные prerequisites перечислены в `runtime/final-matrix.json`. SDK и доступные pure service tests выполнены отдельно.
- `sdks/vscode` находится вне активных workspace; конфигурация ожидает `out/test/**/*.test.js`, но исходного `src/test` и его зависимостей в этом tree нет. Несуществующий набор не обозначается no-op PASS. Enterprise Storage требует внешнего R2/S3 adapter и bucket credentials.
- Affected provenance PASS относится к трём изменённым импортированным тестам. Исторические несвязанные расхождения полного source map после rebase этим не исправлялись и не объявляются проверенными.

## Evidence и ревью

Корень: `/home/kiselev/storage/tmp/local-paths-74-ptufs123/full-local-tests-20261027/`. Raw logs и секреты в Git не включены.

- `workspaces/final-matrix.json`: команды workspace, типы, HttpApi, RED/GREEN и consumer receipts.
- `runtime/final-matrix.json`: все runtime/tools/SDK counts, команды, явные skips, quiet repeats и prerequisites.
- `root/matrix*.json`: Host/Product/Desktop/Evals, source smoke/build и compiled CLI/browser checks.
- `root/matrix-evals-final-feasible.json`, `root/evals-final-feasible.log`: финальные 1235 PASS / 20 SKIP / 0 FAIL и два явных исключения; `root/matrix-evals-final-hdd.json`, `root/evals-final-hdd.log`: host-bind PASS и отдельный network BLOCKED_ENV с исходным exit1.
- `root/app-*.log` и отдельные JSON/trace receipts: normal E2E, исходный benchmark и повтор после исправлений.
- Независимо одобрены первоначальный план, Agent/Desktop/Python fixes, Schema, Core/pack, Evals timeline, strict settlement и все App fixes. Итоговый reviewer без истории нашёл один обязательный пропуск TypeScript include; исправление и его проверки подтверждены. Финальная сверка diff, отчёта, матриц и исходных логов завершена: APPROVED, открытых обязательных замечаний нет. Receipt: `root/review-local-tests-final.json`.
