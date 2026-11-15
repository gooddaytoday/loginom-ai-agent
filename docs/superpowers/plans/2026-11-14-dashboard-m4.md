# Dashboard M4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пользователь публикует проверенные локальные исходники через свою Studio, получает подтверждение сборки на стенде и может продолжать правку, сохраняя локальный черновик и предупреждение о чужой версии.

**Architecture:** Два закрытых сценария существующего Loginom Host читают и записывают публикации. Publisher читает UserStorage, один builder собирает закреплённым шаблоном, web читает атомарно записанное состояние и раздаёт проверенные сборки. Desktop/CLI используют подготовку папки, разрешения и сборку M3.

**Tech Stack:** Существующие TypeScript, Effect Schema, Bun, встроенные Node/Chromium, React/Vite, `node:test`, Compose; без новых сторонних зависимостей.

**Spec:** [Принятый дизайн M4](../specs/2026-11-14-dashboard-m4-design.md), [roadmap](../specs/2026-11-11-dashboard-architecture-roadmap.md), [изоляция](../../security/dashboard-isolation.md).

Статус: план прошёл самопроверку и независимое ревью — Approved, открытых замечаний нет. Дизайн принят владельцем; автономная реализация всех задач разрешена. Флажки отмечают только проверенные результаты.

## Global Constraints

- Путь А выбран для master и 7.4.2: права проверяет Loginom через авторизованную Studio. Минифицированный `/app/` обязателен для живой проверки.
- `.lgp` не меняется; модель пишет только в `work/src/`; `control/`, привязка, основа, секреты и браузерные операции ей недоступны. Модельные инструменты сохраняют пустые аргументы.
- Формат публикации `format: 1`, `template: 1`; весь UTF-8 JSON не больше 1 048 576 байт, до 200 файлов, обязательный `src/main.tsx`. Перечень путей, кодировок и расширений — в дизайне/roadmap. Порог поиска значений образца — 6 Unicode code points.
- Публикуются те же исходники, которые прошли локальную проверку. Desktop спрашивает каждый раз, без «Разрешать всегда» и автоответа. CLI: без `--auto` отказ, с `--auto` согласие разработчика.
- Интервал обхода 10 секунд; ожидание своего результата каждые 3 секунды до 2 минут. Сборка: 90 секунд, 1 ГБ памяти, 256 процессов, до 8 КиБ диагностики; начальный предел результата 20 МиБ. Лимиты подтверждаются реальными примерами; необходимые корректировки принимаются по замерам и независимому ревью без изменения контракта.
- Один образ и три контейнера; web/builder non-root, rootfs RO, `cap_drop: [ALL]`, `no-new-privileges`, рабочий tmpfs. Publisher и builder без сети. Только publisher читает UserStorage, строго RO; UID/GID сверяются с Loginom. Вход builder RO, выход RW; publisher очищает выход перед выдачей задачи.
- Переход с M3 — разовая перепубликация из сохранённых локальных черновиков со свежим снимком; до неё старый dashboard на M4 недоступен. Автоматического восстановления исходников из бандла нет.
- Публичный Protocol/Server HttpApi не меняется. Не добавлять общий файловый API, второй браузер Studio, отдельную БД/брокер/пул, автоматический merge, фонового наблюдателя публикации или повтор записи после неизвестного результата.
- Пины инструментов берутся из Product и lockfile. Повторно не закреплять их в этом плане. Проверки и `bun typecheck` выполняются из пакетов, не из корня; секреты и локальные настройки остаются вне Git.

## Основа M3 и размер работы

M3 завершена: Tasks 1–18, установленная Linux-приёмка и финальные независимые ревью PASS. Канонические результаты и ограничения — [runbook M3](../../testing/loginom-ai-agent/dashboard-m3.md) и [checkpoint M3](../../testing/loginom-ai-agent/dashboard-m3-checkpoint.md). Они не заменяют отдельный прогон M4.

Реализация ведётся в отдельном checkout от окончательной M3; SHA основы хранится только в [checkpoint M4](../../testing/loginom-ai-agent/dashboard-m4-checkpoint.md). Перенесены документы M4 и относящиеся к M4 разделы roadmap с сохранением фактов M3. Основной checkout, ROI и backup M3 сохраняются. Владелец разрешил локальные коммиты, сборки, собственные профили и стенды, публикации, сохранную миграцию освобождённого M3 dev-стенда и замену локальной установки с backup/rollback. Пользовательское работающее приложение не закрывается принудительно; используется собственный профиль. Слияние и выпуск остаются отдельными действиями.

Повторно используются: одноразовый снимок, `withSnapshot`, сохранение существующего `src/`, `preparePublish/finishPublish`, разрешения builtin, встроенный template kit, проверки импортов, локальная сборка и хост приложений. Разделение сборки оправдано двумя реальными вызывающими сторонами: локальным черновиком и builder на стенде. Локальный алгоритм очистки, оставляющий две сборки, нельзя перенести в publisher.

Уточнённая оценка: 50–65 затронутых файлов, 2 000–3 500 добавленных/удалённых строк вместе с тестами и документацией (`git diff --stat --find-renames` от начала реализации). Число файлов уточнено по существующим private IPC, Desktop/platform и UI-контрактам; расширения функций относительно дизайна нет. Если фактический объём превысит оценку вдвое, основной путь не продвигается или новая инфраструктура требует третьего исправления — остановить расширение и пересмотреть решение.

## Review Focus

| Условие и ожидаемый результат | Проверка |
|---|---|
| Чужая публикация появляется во время подтверждения или занимает конечное имя: чужие байты сохраняются | 1: collision; 2/4: повторная проверка и новое подтверждение |
| Меняются локальные файлы или приходит новый снимок: передаются проверенные байты, новый образец и его привязка сохраняются | 2: изменение после prepare; 4/5: гонка основы и snapshot ID |
| Соединение меняется/обрывается при открытии или записи: поколение удерживается, неизвестная запись не повторяется, браузер закрывается | 1: lifecycle; 5: обрыв после rename и отказ read-back |
| Некорректный JSON не содержит workflow GUID: понятный `failed` виден по месту файла, работающая версия остаётся | 3/5: статус по пути, активная сборка по полному binding key |
| Старый результат приходит после удаления/новой версии, либо builder оставил файлы: текущая версия не подменяется | 3: пустой выход и проверенная копия; 6: удаления, перезапуск и порядок |

## Карта файлов и порядок

Сокращения ниже: `P = packages/dashboard`, `H = packages/loginom-host`, `R = packages/loginom-runtime`, `D = packages/desktop`, `O = packages/opencode`, `A = packages/app`. Путь после сокращения — точный путь относительно соответствующего пакета. Новые файлы явно помечены `Create` в задачах. Импорты по существующим workspace exports; новый список экспортов ради M4 не нужен.

| Группа | Ответственность | Задачи |
|---|---|---|
| H: adapter, host-port, host, supervisor, node-entry, errors, dashboard; R: managed-entry, dashboard-storage | Две операции, поколение, отмена и закрытие, штатная Studio | 1, 5 |
| P: contract/publication, agent/build, builder/build, agent/publish | Формат и сохранённые проверенные байты, общая сборка | 2, 3 |
| P: publisher/index, builder/index, entry, web/server, contract/snapshot, shell/response | Одна задача, проверенный результат, состояние и lookup | 3, 5, 6 |
| P: agent/folder, contract/prompt; D/O/A: существующие dashboard callers | Основа, скачанные исходники, сообщения, подтверждение | 2, 4, 5 |
| P: deploy, script/build, package.json, tsconfig.web; существующий test.yml | Один образ, отдельный стенд, включение тестов | 3, 7 |
| Product skill, профильные AGENTS, runbook M4, рецепт стенда | Соответствие поставки и инструкции перехода | По владельцам изменений, итог — 7 |

Задачи выполняются последовательно. Внутри задачи пишется один тест поведения, фиксируется его ожидаемый FAIL, затем минимальная реализация и PASS; следующий тест добавляется после этого. Таблицы ниже перечисляют сценарии, а не требуют заранее написать весь набор. Перед каждым коммитом — `git diff --check`, подготовить только свои файлы, `bun run secrets staged`; сообщение conventional commit. Непроверенные временные пробы не включаются в продукт.

### Task 0: Подготовить согласованную основу и отдельные ресурсы

**Files:** Read M3 checkpoint, соответствующие AGENTS, файлы из карты. Создаваемый runbook — `docs/testing/loginom-ai-agent/dashboard-m4.md`.

- [x] Сверить M3 checkpoint/чат и состояние Git; взять актуальное исходное состояние M3 с закрытыми обязательными замечаниями ревью. Создать отдельный checkout для будущей реализации и перенести документы M4 с сохранением изменений M3 в roadmap. Сохранить SHA основы только в checkpoint M4 (до 20 строк), дальше ссылаться на него. Проверить hooks/Gitleaks по `docs/security/secret-protection.md`. Последующие исправления установленной приёмки M3 учитывать до финальной приёмки M4.
- [x] Описать в runbook выбор двух собственных пар Server/Studio, профилей Desktop/CLI, портов и временного каталога вне Git. Новую пару сразу создавать с отдельным томом UserStorage. Использовать рецепт `dashboard/stand/README.md` и уже полученные S1/S2; не запускать текущий `dev-master.sh install` на паре M3.
- [x] Проверить доступность исходных команд пакетов и артефактов M3 без полного повторения уже зелёного CI. Итог: записаны база, ограничения установленной приёмки и команды запуска на выделенных ресурсах; основной checkout и стенд M3 не изменены.

### Task 1: Доказать закрытый путь хоста на обеих Studio

**Files:** Create `H/src/dashboard.ts`, `H/test/dashboard.test.ts`, `R/src/dashboard-storage.mjs`, `R/test/dashboard-storage.test.mjs`. Modify `H/src/adapter.ts`, `H/src/host-port.ts`, `H/src/host.ts`, `H/src/supervisor.ts`, `H/src/node-entry.ts`, `H/src/errors.ts`, `R/src/managed-entry.mjs`; расширить существующие `H/test/host-port.test.ts`, `H/test/node-host.test.ts` и runtime lifecycle tests. Уточнить H/R AGENTS рядом с изменением контракта.

**Interfaces:** В `H/src/dashboard.ts` — узкие типы private transport (схема границы, без импорта сборщика dashboard):

```ts
type DashboardBinding = { packagePath: string; workflowGuid: string; nodeGuid: string }
type PublicationRef = { name: string; sourceHash: string }
type PublicationSource = { version: PublicationRef; content: string }
type PublicationWrite =
  | { status: "written"; version: PublicationRef }
  | { status: "changed"; latest: PublicationRef | null }
// createLoginomHost: короткое чтение до создания чата
readDashboard(input: { origin: string; generation: number; binding: DashboardBinding }, signal?: AbortSignal): Promise<PublicationSource | null>
// LoginomHost.acquire(session): закрытые методы acquired run
dashboardRead(input: { origin: string; binding: DashboardBinding }, signal?: AbortSignal): Promise<PublicationSource | null>
dashboardPublish(input: { origin: string; binding: DashboardBinding; content: string; expected: PublicationRef | null }, signal?: AbortSignal): Promise<PublicationWrite>
```

Для Node pre-chat вход `dashboard.read` обрабатывается в private `node-entry` до общего forwarding; Desktop вызывает `readDashboard` на объекте main host, не через renderer-facing `Loginom.API`. Acquired run использует wire-методы `dashboardRead/dashboardPublish`. Unknown outcome — код `DASHBOARD_WRITE_UNKNOWN` с безопасным текстом, без автоматического повтора. Занятое имя — `DASHBOARD_VERSION_EXISTS`; отказ прав и неверное поколение сохраняют понятную отдельную причину.

- [x] Закрыть риск занятого имени до остальных слоёв. Проверенный `RenameFile` перезаписывает цель; после независимого review выбран `MoveFile(part, final, false)` в той же папке. На обеих версиях проверены целость обоих файлов при collision, полная видимость свободного final и порядок UTC; временные пробы удалены. Схема имён сохранена, FileExists precheck не используется как гарантия.
- [x] В `dashboard.test.ts` по одному закрепить: origin/generation mismatch → ни одного вызова runtime; dashboard scoped run допускает только две private операции; они отсутствуют в `tools()`, `call/admit` по-прежнему запрещены. `turn-lifecycle` dashboard остаётся без model-turn lease.
- [x] Реализовать короткое владение pre-chat через существующие connection lease/children. В `finally` дождаться закрытия временного runtime, затем освободить поколение; один `release` сейчас браузер не закрывает. Отмена и shutdown проходят до `launch` и действующего runtime. Для builtin использовать acquire/release лишь на время чтения или записи; разрешить начальное private dashboard binding без перехода в automation.
- [x] Добавить read/publish в managed dispatcher и узкий `dashboard-storage.mjs` на `authenticated.context`. Не вызывать `dock_prepare`, не снимать пин общего storage driver и не объявлять browser code модельным аргументом. Проверить путь из binding, кодировку/размер входа, окончательные UTC-имена и ограниченное чтение; создать папки при записи.
- [x] Реализовать повторную сверку `expected`, загрузку уникального `.part`, ожидание штатного завершения, безопасный `MoveFile(part, final, false)`. При расхождении вернуть `changed` до записи. Время имени берётся по правилу roadmap; известный collision оставляет `.part`. После неизвестного результата возможен только read-back точного имени/хеша, без повторной записи.
- [x] Проверить короткую операцию: повторное открытие не оставляет runtime/browser; отмена при login и upload; settings остаются pending при held generation; shutdown дожидается подтверждённого закрытия. Не заменять отмену IPC одним `Promise.race`.
- [x] Команды: из H `bun test test/dashboard.test.ts test/host-port.test.ts test/node-host.test.ts test/prepare-startup.test.ts` и `bun typecheck`; из R `"$LOGINOM_AI_AGENT_TEST_NODE" --test test/dashboard-storage.test.mjs test/managed-entry-close.test.mjs test/managed-resources-close.test.mjs`. Затем **живой private вызов** из собранного хоста на master и 7.4.2: чтение → передача искусственного JSON → чтение тех же байтов; отказ прав (master read-only, 7.4.2 no-access), `.lgp` прежний. Fixture/native helper tests не заменяют этот проход.
- [x] Коммит `feat(dashboard): add private Studio publication operations`. Итог: подтверждён доступ через общий хост обеих платформ; publisher ещё не нужен. Если главный путь не проходит, работать только над ним.

### Task 2: Передавать проверенный JSON после подтверждения

**Files:** Create `P/src/contract/publication.ts`, `P/test/contract/publication.test.mjs`. Modify `P/src/agent/build.ts`, `P/src/agent/publish.ts`, `P/test/agent/publish.test.mjs`, `P/package.json`, `O/src/tool/dashboard.ts`, `O/test/tool/dashboard.test.ts`.

**Interfaces:** `Publication` — строгая Effect schema формата v1; `PublicationVersion` — `{name, sourceHash}`. В P типы выводятся из схем, DTO хоста проверяются при получении. `preparePublish` сохраняет существующий input и возвращает `{ok:true, control, publication:{content, sourceHash}, build}`; `publication.content` получен из сохранённой проверенной копии. `finishPublish` принимает этот результат, `work`, `signal` и callback `publish(input) -> PublicationWrite`; позднее задача 3 добавляет проверку lookup. Callback имеет двух реальных владельцев на границе пакетов; P не импортирует H.

- [ ] В тесте формата проверить `format/template=1`, точный round-trip текста/бинарного файла и отказ на весь JSON размером 1 048 577 байт, 201 файл, повтор пути, `../`, скрытую часть, обратный слеш, неверный base64, лишние поля, неизвестный template и отсутствие `src/main.tsx`. Размер считать UTF-8 байтами, включая метаданные и base64. Канонический parser работает до записи файлов; лимит не меняет существующий лимит локального src.
- [ ] Сохранить проверенную копию `src/` рядом с `operation/dist`, пока операция ждёт подтверждения. Собрать JSON из неё: binding/control, title/nodeName, parameters/name+label из снимка, без sample. Тест `approved sources survive edits and draft pruning`: после prepare изменить рабочий `src/`, выполнить две пересборки, затем `assert.equal(transferredContent, prepared.publication.content)`; публикация не читает рабочий src повторно.
- [ ] В builtin сначала prepare и private read, затем существующий `ctx.ask` с узлом/пакетом и `always: []`, после ответа private publish с `expected`. Для M3-папки неизвестная основа считается расхождением, если на стенде есть версия. Передать в metadata основания расхождения; окончательное отображение и повторное открытие покрывает задача 4. Не переписывать `Tool.Context` или обычный turn-lifecycle.
- [ ] Заменить локальное копирование в каталог сборок M3 на callback хоста. Удалить связанные проверки localhost, `homedir`, локальную publish.sqlite и obsolete tests; не затрагивать `snapshot.sqlite`. До подтверждения стенда возвращать только `pending`, сохранить sample. `changed` возвращает `needs-confirmation` и ничего не загружает. Отмена до подтверждения не вызывает publish.
- [ ] По одному адаптировать тесты `O/test/tool/dashboard.test.ts`: пустые аргументы; без явного разрешения записи нет; sourceHash/байты не меняются; отказ/отмена/`changed` сохраняют черновик. Сохранить проверку M3, что потеря локального каталога после подтверждённой серверной операции не превращает успех в неуспех.
- [ ] Команды: из P `"$LOGINOM_AI_AGENT_TEST_NODE" --test test/contract/publication.test.mjs test/agent/publish.test.mjs`, `bun typecheck`; из O `bun test test/tool/dashboard.test.ts test/product/turn-lifecycle.test.ts` и `bun typecheck`. Промежуточные ответы должны честно отражать отсутствие серверного подтверждения.
- [ ] Коммит `feat(dashboard): publish captured sources through Loginom`. Итог: подтверждение отправляет один проверенный JSON через живой путь задачи 1.

### Task 3: Первый dashboard из UserStorage до кнопки Studio

**Files:** Create `P/src/builder/build.ts`, `P/src/builder/index.ts`, `P/src/publisher/index.ts`, `P/src/entry.ts`, `P/deploy/Dockerfile`, `P/deploy/compose.yaml`, `P/test/builder/build.test.mjs`, `P/test/publisher/publisher.test.mjs`. Modify `P/src/agent/build.ts`, `P/src/agent/publish.ts`, `P/src/contract/publication.ts`, `P/src/contract/snapshot.ts`, `P/src/web/server.ts`, `P/src/shell/response.ts`, `P/src/shell/index.ts`, `P/script/build.ts`, `P/tsconfig.web.json`, `P/package.json`, `P/deploy/dev-master.sh`, `P/test/web/server.test.mjs`, `P/test/web/shell-contract.test.mjs`, `P/test/web/dist-smoke.test.mjs`, `dashboard/stand/README.md`.

**Interfaces и состояние:**

```ts
// builder/build.ts: реальная общая часть существующего buildDashboard
buildSources(input: { work: string; template: string; node: string; out: string; signal?: AbortSignal; timeoutMs?: number }): Promise<Build>
// Build остаётся union ok/hash/dir/output из существующей сборки.
// publisher/index.ts: один ограниченный проход для теста и служебного цикла
scanPublications(input: { storage: string; builds: string; jobsIn: string; jobsOut: string; signal?: AbortSignal }): Promise<void>
// builder/index.ts: одна задача, затем завершение контейнерного процесса
buildNext(input: { jobsIn: string; jobsOut: string; template: string; node: string; signal?: AbortSignal }): Promise<void>
```

Общий `buildSources` не меняет `current` и не чистит чужие версии. Локальное сохранение/очистка двух сборок остаётся в agent/build; publisher управляет опубликованными. Временная проверенная копия передаётся builder через `jobs-in/<id>/publication.json`; publisher создаёт пустой `jobs-out/<id>/`, выдаёт лишь одну задачу. Result manifest содержит ID задачи, исходный хеш, outcome и ограниченную диагностику. ID/manifest недоверен и сверяется publisher с собственным входом.

Один `builds/state.json` содержит записи файлов по каноническому относительному пути Studio: `{sourceHash, key, status, buildHash?, error?}`; `key/sourceHash` могут отсутствовать при отказе до разбора. Publisher пишет его через temp+rename. **Запись создаётся по фактическому месту файла до разбора JSON**: так malformed JSON получает `failed`, даже если workflowGuid неизвестен. Работающая версия выводится из ready-записей по полному binding key; последняя попытка/свой статус — по пути package/node. Второй индекс, БД и дублирующий `current` не нужны. При активации web наблюдает только полностью записанное состояние.

`LookupRequest` сохраняет три поля Binding и добавляет optional `publication: <имя файла>`. `LookupResponse` сохраняет поля M3 и добавляет `currentVersion: PublicationVersion | null`, `latest: PublicationStatus | null`, `publication: PublicationStatus | null`. `PublicationStatus` содержит имя, исходный хеш (или null до чтения), `pending|building|ready|failed`, хеш сборки только при ready и ограниченную ошибку только при failed. Без найденного запрошенного файла ответ — pending; удалённый файл не сохраняет ready. Обычный shell запрос остаётся прежним, ручной decoder проверяет только используемые поля вместе с conformance-тестом.

- [ ] Тест общей сборки: локальный draft и серверный builder собирают один пример прежним резолвером, `assert.equal(draft.hash, server.hash)`; при этом серверная сборка не удаляет прошлые результаты. Выделить только общую сборку и разрешённые source checks; прямые scan/tsc/Vite, фильтрацию окружения и Node permissions сохранить. Встроенный kit не менять.
- [ ] Добавить publisher и один builder: поиск окончательных имён без следования ссылкам; bounded copy исходника; строгая проверка формата и физического packagePath/nodeGuid; одна задача. `.part` игнорируется. Готовый вход копируется до сборки, изменение во время чтения откладывается. Не создавать отдельную подсистему очередей; существующие файловые тома и один цикл достаточны.
- [ ] Принять только собственную ограниченную копию output: `index.html`, разрешённые assets, без ссылок/спецфайлов, не больше 20 МиБ. Посчитать хеш из этой же копии и переместить в `builds/<key>/<hash>/`; builder не получает write-доступ туда. Добавить минимальные тесты, необходимые для безопасного первого запуска: неверная привязка, symlink input/output, примесь прежнего output, превышение размера не активируются.
- [ ] Добавить чтение состояния в lookup и ожидание **своего** файла в `finishPublish`. Тест HTTP: своя запись ready A и последняя B → `result.version === A`, текущая может быть B; несовпадение sourceHash не успех. Таймаут → pending без повторной отправки; ready → published и `removePublishedSample` с прежней защитой snapshot ID. При failed/error прежняя ready остаётся доступна.
- [ ] Собрать `server.mjs` из `src/entry.ts` с подкомандами `web|publisher|builder`; сохранить используемые dist smoke exports `appHeaders/bindingKey`. Web не запускается при импорте. Один Docker image использует закреплённый Node и готовый kit; зависимости устанавливаются при сборке образа, не при запуске задачи. Включить новые каталоги в typecheck и явные списки тестов; общий build не вносит builder/publisher в payload Desktop/CLI.
- [ ] Добавить минимальные параметры выбора dev-пары в `dev-master.sh`: имена Server/Studio/network, URL/порты, каталог состояния, том UserStorage и ожидаемая метка берутся из одного локального конфигурационного файла, пути которого задаёт `--config`. Значения проверяются до mutation; существующие проверки принадлежности контейнеров сохраняются. Это конфигурация конкретного dev-стенда, без discovery/менеджера стендов. Пример искусственный, реальная конфигурация вне Git. `check` использует lookup/state вместо чтения старого `current`.
- [ ] Команды: из P `bun run build`, `bun typecheck`, `"$LOGINOM_AI_AGENT_TEST_NODE" --test test/builder/build.test.mjs test/publisher/publisher.test.mjs test/web/server.test.mjs test/web/shell-contract.test.mjs test/web/dist-smoke.test.mjs test/agent/publish.test.mjs`; из корня `bash -n packages/dashboard/deploy/dev-master.sh`, `shellcheck packages/dashboard/deploy/dev-master.sh`. Compose config и inspect подтверждают согласованные ограничения до загрузки исходников.
- [ ] Первый сквозной проход на собственной dev-паре: свежий снимок → существующий локальный пример → подтверждение → JSON → builder → ready своего файла → Dashboard в Studio. Сверить байты `.lgp`, отсутствие sample в UserStorage/выходе и запрет записи publisher в UserStorage. Зафиксировать результат в runbook. До успеха этого прохода не начинать задачи восстановления и расширенную матрицу.
- [ ] Коммит `feat(dashboard): build stored publications on the stand`. Итог: один настоящий dashboard полностью проходит новый путь.

### Task 4: Продолжать локальные и опубликованные исходники без потери правок

**Files:** Modify `P/src/agent/folder.ts`, `P/src/contract/prompt.ts`, `P/src/agent/publish.ts`, `P/test/agent/folder.test.mjs`, `P/test/agent/publish.test.mjs`; `D/src/main/dashboard-target.ts`, `D/src/main/dashboard-target.test.ts`, `D/src/main/index.ts`, `D/src/main/ipc.ts`, `D/src/preload/types.ts`; `O/src/cli/standalone-run.ts`, `O/src/tool/dashboard.ts`, соответствующие `test/cli/standalone-dashboard.test.ts`, `test/tool/dashboard.test.ts`; `A/src/context/platform.tsx`, `A/src/pages/layout/dashboard-links.ts`, `A/src/pages/session/composer/session-permission-dock.tsx`, `A/src/i18n/en.ts`, `A/src/i18n/ru.ts`. Create `A/test-browser/dashboard-publication.test.ts` для сообщения и подтверждения; существующие submit/build-request tests обновлять только при затронутом контракте.

**Interfaces:** `prepareDashboard` получает callback `readPublication(binding) -> Promise<PublicationSource|null>` и возвращает прежний target плюс `notice?: {kind: "newer-publication" | "publication-check-unavailable" | "latest-build-failed"; latest?: string; current?: string; error?: string}`. Статус сборки получает через существующий fetch к lookup того же origin, сопоставляя имя и исходный хеш; latest/current здесь — только имена версий. Desktop замыкает origin/generation из status в `readDashboard`; CLI вызывает private `dashboard.read` до backend connect. Target не передаёт renderer исходники или binding. `ControlBinding.base?: PublicationVersion|null`: отсутствие поля допустимо только для старой папки M3 и значит неизвестную основу; null — подтверждённое отсутствие публикации. Запись выполняется под существующим коротким `withSnapshot`, без network/build под lock.

- [ ] Тесты folder по одному: локальный src+base A при latest B сохраняются и возвращают notice; новая папка скачивает последние валидные исходники+base; отсутствие публикации создаёт шаблон; invalid latest не заменяется шаблоном; недоступная Studio разрешает существующий локальный src с notice, но запрещает новое скачивание. Старая M3-папка без base читается, новый snapshot не присваивает ей latest. Origin conflict не перепривязывает существующую папку.
- [ ] В Desktop и CLI подключить pre-chat callback с реальным generation и отменой по lifecycle. Из CLI выводить notice в stderr; в Desktop — существующий toast при открытии чата, typed EN/RU i18n. Отказы новых операций не сворачивать в существующий общий текст о просроченном снимке: сохранить различимые причины прав/версии/подключения. Удалить устаревшую фразу `dashboardPrompt` о шаблоне при любой свежей edit-папке: теперь она содержит скачанные исходники. Обновить её точные потребители/тесты без смены интерфейса prompt, если это не нужно.
- [ ] В permission metadata передавать `dashboardConflict: {base, latest}`; существующий dock показывает явное предложение заменить новую версию локальным черновиком, сохраняя узел/пакет. В этой же форме одно согласие подтверждает конкретный payload и latest. При изменении latest после ответа builtin возвращает needs-confirmation; следующий вызов заново готовит и подтверждает публикацию. Никакого автоматического повтора согласия.
- [ ] Основу обновлять только после written/read-back точного хеша. Под коротким lock перечитать control той же привязки/origin: разрешить переход, если base равна captured base, отсутствует либо собственная written-версия новее текущей base по UTC-имени; более новую base не откатывать. Тест двух своих публикаций, начатых от A: для B<C оба порядка завершения обновлений дают base C. Содержимое под тем же именем с другим хешем не подменять без совпадения captured base. Новый snapshot сохраняет свои поля; ready удаляет sample только своего snapshot ID. Неизвестный исход основу не меняет.
- [ ] UI-тест: new-version toast показан при открытии; warning в permission читаем до выбора; отказ не пишет; `always` отсутствует; session auto-accept не отвечает. Тест builtin: A→B во время ожидания → ни одного upload для неподтверждённой B. Тест CLI сохраняет `--auto` и понятную причину отказа без него.
- [ ] Команды: из P `"$LOGINOM_AI_AGENT_TEST_NODE" --test test/agent/folder.test.mjs test/agent/publish.test.mjs`; из D `bun test src/main/dashboard-target.test.ts`; из O `bun test test/tool/dashboard.test.ts test/cli/standalone-dashboard.test.ts test/product/turn-lifecycle.test.ts`; из A `bun test --conditions=browser --preload ../ui/test/solid-jsx.ts --preload ./happydom.ts ./test-browser/dashboard-publication.test.ts` и `bun test --conditions=solid --preload ../ui/test/solid-jsx.ts --preload ./happydom.ts ./src/context/permission-auto-respond.test.ts`. `bun typecheck` из каждого изменённого TS-пакета.
- [ ] Коммит `feat(dashboard): preserve drafts across published revisions`. Итог: пользователь продолжает свои правки и осознанно заменяет чужую версию.

### Task 5: Честные отказы и неопределённые результаты

**Files:** Уже созданные host/runtime, publish, publisher/builder и их тесты; `P/src/shell/index.ts`/`P/src/shell/response.ts`, `P/test/browser/shell.test.mjs` для статуса новой ошибки при работающей прошлой версии. Не создавать отдельный recovery/telemetry модуль.

- [ ] По одному проверить в реальном HTTP/файловом контуре: malformed JSON, неверное место binding, неизвестный template, type/import error → failed указанного файла; lookup по настоящей привязке продолжает возвращать предыдущую сборку. Плохой workflow GUID не может изменить ключ реального сценария. Вывод компилятора ограничен 8 КиБ.
- [ ] Проверить превышение 90 секунд, памяти/процессов и 20 МиБ: дочерняя сборка прекращена, результат не активирован, старая страница открывается. Для быстрых тестов использовать существующий timeout argument общей сборки; production defaults отдельно сверить с compose и граничными тестами. Проверить три примера M3 и представить владельцу замеры для окончательных лимитов.
- [ ] На выделенных стендах воспроизвести обрыв после завершённого rename: read-back того же имени/хеша подтверждает written; при недоступном read-back — `DASHBOARD_WRITE_UNKNOWN`, без повторной записи. Сохранить черновик/sample. Неизвестный результат и статус pending не называть failed сборкой или успехом.
- [ ] Проверить поздний ready после 2 минут, чужую более новую публикацию, удаление ожидаемого файла, потерю локальной папки и ошибку очистки sample после подтверждённого ready. Успех стенда сохраняется с предупреждением о локальной очистке; для позднего ready фоновой очистки нет.
- [ ] Прогнать затронутые тесты задач 1–4 и `test/browser/shell.test.mjs` под закреплённым Chromium. Коммит `fix(dashboard): preserve publication outcomes on failures`. Итог: реальные отказы не уничтожают работающую версию и не запускают скрытые повторы.

### Task 6: Откат, удаления и перезапуск одного worker

**Files:** `P/src/publisher/index.ts`, `P/src/builder/index.ts`, `P/test/publisher/publisher.test.mjs`, `P/test/builder/build.test.mjs`, `P/deploy/compose.yaml` лишь при необходимости исправить restart.

- [ ] Файловый тест: ready A, failed B → активна A; удалить B → A; ready C → C; удалить C → A без пересборки; удалить папку → exists false. Если два исходника ссылаются на один buildHash, удаление одного сохраняет сборку второго.
- [ ] Тест гонки: удалить исходник после выдачи задачи, затем принести результат → не активируется. Завершение старой задачи не откатывает более новую. Обновлённое содержимое под тем же именем определяется по хешу и инвалидирует старый статус; неизменный failed не собирается каждый обход.
- [ ] Тест рестарта: сохранить state/verified builds, прервать незавершённую задачу, запустить publisher/builder снова → готовое переиспользуется, незавершённое ставится заново один раз. Перед новой выдачей jobs-out пуст; не доверять старому result manifest. Не выполнять сетевую перепубликацию из процесса восстановления.
- [ ] Проверить на контейнерах: один job завершается выходом builder, следующий получает свежий процесс; данные сборок/state переживают restart. Удаляются только собственные jobs и сборки без оставшихся исходников. Команды из P: `"$LOGINOM_AI_AGENT_TEST_NODE" --test test/publisher/publisher.test.mjs test/builder/build.test.mjs`, `bun typecheck`.
- [ ] Коммит `feat(dashboard): reconcile publication files and rollback`. Итог: ручное удаление в Studio и рестарт дают поведение принятого дизайна.

### Task 7: Поставка, сохранный переход и итоговая приёмка

**Files:** `P/package.json`, `P/deploy/dev-master.sh`, `P/deploy/check-studio.mjs`, `.github/workflows/test.yml`, `packages/product/skills/loginom-dashboard/SKILL.md`, `P/AGENTS.md`, `H/AGENTS.md`, `R/AGENTS.md`, `D/AGENTS.md`, `D/src/main/loginom/AGENTS.md`, `O/AGENTS.md`, `A/AGENTS.md`, `dashboard/stand/README.md`, `docs/testing/loginom-ai-agent/dashboard-m4.md`. `H/script/stage-resources.ts` и его тесты менять только при выявленной нехватке: runtime/src и client/lib уже включаются целиком, серверные роли в клиентский payload не добавлять.

- [ ] В существующие задачи CI включить новые Node tests и проверку deploy/compose. Покрытие web сохранить, publisher/builder включить в согласованное для серверных служб покрытие 90%; не создавать новый универсальный отчётчик или отдельную CI-систему. Шаблон на Linux/Windows/macOS и browser job использовать прежние.
- [ ] Обновить skill и профильные инструкции: закрытые операции разрешены builtin/open, обычный model-turn по-прежнему не получает Loginom; pending/unknown/conflict объясняются честно, откат вручную. Пакетный runtime module попадает в штатные manifest/staging. Не менять metadata-only проверку manifest, принятую в оптимизации M3.
- [ ] Выполнить одну итоговую проверку исходников после адресных PASS: из P `bun typecheck`, `bun run test`, `bun run check:size`, `bun run test:browser`; из H `bun test test/stage-resources.test.ts test/runtime-startup.test.ts` и `bun typecheck`; проверки D/O/A из задач 1–4 и их `bun typecheck`. Build/manifest Desktop и CLI — по действующим M3/standalone runbook; подтвердить запуск новых private операций из собранной поставки. Повтор S6 нужен при изменении общего старта, manifest или признаке регрессии, а не ради повторения зелёного M3.
- [ ] Проверить установленный пользовательский цикл на выделенных профилях: Desktop и CLI, master и 7.4.2, личная/общая папки, разрешение и отказ, продолжение локальных/скачанных исходников, ошибка новой сборки, manual rollback, пакет на стенде без dashboard. Для release 7.4.x установленная приёмка M4 следует условию roadmap: если полноценного release-стенда нет, явно переносится в M5; искусственная 7.4.2-пара не заменяет её.
- [ ] Для перехода освобождённого dev-стенда использовать уже данное разрешение владельца; приёмка M3 завершена. Сохранить Server/Studio/старый web и локальные src. Перед финальным копированием остановить запись Loginom, скопировать UserStorage с владельцами/правами в новый том, сверить байты и открыть пакет через Studio; старую копию не удалять. Publisher получает этот том RO; локальная установка заменяется в рамках данного разрешения с backup/rollback; пользовательские профили сохраняются, работающее приложение не закрывается принудительно.
- [ ] На каждом нужном узле получить новый снимок, сохранить прежний src, один раз подтвердить публикацию, дождаться ready собственного файла и открыть Dashboard. Сверить `.lgp`; при отсутствии локальных исходников явно отметить необходимость пересоздания. Очистка прежних данных, слияние и выпуск — отдельные действия владельца.
- [ ] Итоговое независимое ревью всей реализации: границы host/поколения, проверенные байты, data loss, изоляция builder, лишние механизмы и непройденные критерии. Mandatory замечания с конкретным дефектом закрыть; optional не превращать в условия завершения. Повторять ревью только по изменениям/новым данным/неразрешённым замечаниям; после трёх раундов unresolved mandatory — свежему сильному независимому reviewer; не ждать владельца для разрешения технических замечаний в пределах контракта.
- [ ] Коммит `docs(dashboard): document M4 acceptance and migration` вместе с оставшимися профильными изменениями после проверок. Итог: runbook разделяет исходниковые проверки, фактически установленную приёмку и оставшиеся ограничения; checkpoint не больше 20 строк. Завершить на принятом результате, без работы M5.

## Самопроверка и передача

Покрытие дизайна: private host и завершение загрузки — 1; формат/проверенные исходники — 2; три роли/lookup/главный путь — 3; основы/сохранение черновика/подтверждение — 4; отказы/лимиты — 5; откат/рестарт — 6; переход/поставка/приёмка — 7. Названия `PublicationRef` (host DTO) и `PublicationVersion` (Effect schema) намеренно разделены владельцами границ и имеют одинаковую структуру; новых пользовательских понятий они не вводят.

Ожидаемые условия завершения — критерии M4 принятого дизайна и roadmap; условная release-проверка обозначается отдельно. Внешний блокер допускает только работу к первому успешному проходу. Отсутствие среды нельзя компенсировать дополнительной очередью, реестром, телеметрией или моками и объявить результат проверенным.

План проверен и сохранён. Владелец разрешил автономное исполнение всех задач; объём и контракт принятого дизайна сохраняются.
