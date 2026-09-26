# JavaScript: checkpoint исполнения

Дата: 2026-09-26. Фаза **0A: блокировка памяти снята, полный цикл проверен**.
Пользователь назначил исполнение [плана](plan.md), Ubuntu и только headed-браузеры.
Начаты операторские наблюдения 0B. JS-handler, полное discovery, ревью реализации
и CLI-приёмка ещё не выполнены.

## Актуальное состояние после реализации адаптера

- В Git добавлены собственные исходники project-memory, generation `20260926.2`,
  source commit `1419ec3906b80a30be91cdd5bab9af35ad88e548`.
  Внешний macOS adapter больше не требуется. Старые hashes/runtime сохраняют
  историческое значение; [отчёт реализации и проверки](../../../../services/loginom-ai/tools/project-memory/ubuntu-adapter.md).
- В прежнем worktree `.worktrees/node-javascript` создана настоящая задача
  `01a0de3e-6a07-7661-aa88-ed4807aef6ec` — «JavaScript: общая память и допуск Ubuntu»,
  Astra medium. Product base `a8ad59766dbdb4f2da0b54367a755ce00891dd71` сохранён.
  После передачи документации исходный чистый HEAD разработчика —
  `b21a63f01ad326870c70c2479508508bc59825c1`; plan source —
  `14a4fa47b676f087eac06de21a2654737788f8ef`. Все 30 отличающихся от base файлов
  документации совпали с источником побайтно; product code не переносился.
- Registration `22ccfcf0-7919-4954-9342-82450a28a6f3` активна. Пять project hooks
  trusted, original memory hooks в worktree отсутствуют; основной плагин сохранён.
- Реальные host metadata Codex совпали с thread/cwd. Успешны actor health/find/read,
  официальный Stop/capture, native PreCompact/commit, exact read-back и semantic
  find результата из основного проекта. Cursor `0 → 13 → 22`, сервер: 22 сообщения,
  один commit. При смене поколения capture state сохранён побайтно; сброса не было.
- Извлечённая запись:
  `viking://user/kiselev/peers/-home-george-git-loginom-ai-agent/memories/events/2026/09/26/memory_verification_success.md`.
  Ручных remember/write не было. Локально: 59 runtime Node + 13 Python + 23 helper
  Node checks PASS. Документационный validator и diff whitespace checks PASS.
- Runtime и квитанции приватны: `.local/project-memory/{runtime,rollouts}/20260926.2/`.
  Неуспешный первый runtime/rollout `20260926.1` сохранён. Основной checkout и корень
  worktree получили `0755` вместо `0775`; cache плагина не менялся, hooks используют
  отдельную защищённую копию с теми же bytes. Validators ownership не ослаблены.
- На границе проверки памяти compaction turn completed подтверждён приложением;
  тогда задача была notLoaded, model/hook
  writer не оставлен работающим. Capture cursor 22, ovSessionId null, own lock отсутствует.
  Browser/CLI в этой проверке не запускались; выделенный headed profile закрыт ранее.

Продолжение назначено **этой же** задаче после переноса явно выбранных docs-only
commits: фазы 0A/0B и разработка до первого ревью. Browser/account/profile lease
теперь принадлежит координатору: разработчик готовит исходники оператора,
координатор выполняет headed-проверки и возвращает evidence. Параллельных
Loginom-сессий нет. Повторная регистрация не нужна. Использовать Ubuntu
Node/Bun, `jsteach`, заданный стенд, только headed; установить server OS и storage,
подготовить независимый CLI profile/candidate, выполнить JS discovery. Полный план
обучения пока не завершён; снята его блокирующая зависимость от внешнего adapter.

## Текущее выполнение на Ubuntu

Desktop при продолжении задачи разработчика выбрал managed sandbox без доступа
к сети стенда и внешнему browser profile. Возобновление этой же задачи отдельным
App Server остановлено штатным active-writer guard. Guard, capture state и
права sandbox не менялись. Поэтому координатор выполняет живую часть в своей
разрешённой среде; разработчик сохраняет владение исходниками handler/оператора.

Разработчик подготовил каталог 14 engine probes и оператор `javascript-live.mjs`
в своём worktree. Это пока исходники проб, не доказательство native execution.
Первый headed запуск `g1-operator-01/report.json` подтвердил account `jsteach`,
Loginom Enterprise 7.4.2, ноль исходных пакетов, собственный черновик `Package1`
и native model `MF;TF-1`. На скрытом элементе палитры выполнение остановилось;
JS-узел не создан. Закрытие черновика подтверждено Count=0, logout первой попытки
не подтверждён. Отдельная адресная recovery `g1-recovery-01.json` затем подтвердила
тот же аккаунт, ноль пакетов, UI logout и закрытие browser context. Обе попытки
сохранены вне Git. Server OS/storage остаются не установленными; G1 не закрыт.

Дополнительные наблюдения: `g1-palette-02` завершился с полным cleanup, но снял
пустое дерево до загрузки строк. В `g1-operator-03` ожидание строк подтвердило
палитру и элемент JavaScript; отказ произошёл при hit-test после прокрутки,
до drag. Сообщение — `Palette item covered after scroll`, а не timeout.
Cleanup остановился на неизвестном подтверждении, его последний native snapshot
показал Count=0. Отдельный `g1-recovery-03.json` подтвердил `jsteach`, ноль пакетов,
UI logout и context close. Следующий шаг — ограниченная диагностика координат,
фактического элемента в точке захвата и сообщения cleanup; не повторять drag
без устранения причины. Все 14 engine probes по-прежнему not_run.

Последующее уточнение `g1-hit-test-04`: элемент перекрывала `bg-mask-message`
формы сценария. При раннем закрытии наблюдён диалог Loginom
`Cannot read properties of null (reading 'GetNodes')`. Ожидание снятия маски
в 05 устранило это препятствие. В 05 также обнаружена ошибка атрибуции оператора:
системный узел переменных был принят за новый; JS creation этим не доказан.
В 06 после нового drag появился отдельный GUID/label JavaScript, но проверка
ошибочно отвергла промежуточные null icon/DOM. Сохранён фактический prompt
отбрасывания своего пакета и кнопка «Не сохранять». Recovery06 прошла.
В 07 создание пакета подтвердилось, но workflow не загрузился за 30 секунд;
это ошибка подготовки графа, не JS-кода. Screenshot показывает загрузочную
маску без сообщения об ошибке. Для 08 owner пакета связывается до ожидания
графа; отдельный диагностический предел графа — 90 секунд, без повторного create.

Независимая readonly-проверка `storage-platform-01.json` подтвердила отсутствие
пакетов до/после навигации (reconciliation07), собственный каталог `/jsteach`,
native `DefaultStorageDirectoryTreeNode`, доступные Upload/CreateDirectory,
UI logout и context close. Файлы/каталоги не создавались: write/readback ещё
not_checked. Assignment обновлён этим наблюдённым storage; server OS не установлен.

В worktree разработчика зафиксирован отдельный Host commit `9d75933fac`:
валидированный явный URL сохраняет внутренний `urlSource: explicit`, поэтому
не мигрирует на product default при restart. Старые записи без provenance
сохраняют legacy migration. Проверки разработчика: 44 tests PASS, включая
6 отдельных процессов для Desktop/CLI codec; Host typecheck PASS. Координатор
прочитал diff и выполнил commit, поскольку sandbox разработчика запрещает
запись worktree git index. Это source-проверка J27, не actual candidate CLI gate
и не формальное ревью фазы 5. Product base регистрации не изменялся.

CLI dependency preparation завершена закреплённым Bun по lockfile. После
адресной reconciliation собственного неуспешного старта команда source CLI
`providers list` завершилась с exit 0 и показала 0 credentials в отдельном
профиле кампании. Начата штатная device-code OAuth авторизация ChatGPT, ожидается
пользовательский вход. Название метода `headless` относится к device-code flow,
браузер в этом процессе не запускается. Это source preflight, не compiled
candidate и не CLI-приёмка. До приёмки нужны собственный candidate и проверка
OpenAI OAuth/доступности Sol по регламенту.

## История подготовки до нового адаптера

Ниже сохранены прежние проверки и причины остановки. Статусы «не создана»,
«adapter отсутствует» и прежний next trigger относятся к прошлым шагам;
актуальный допуск и следующий шаг указаны выше.

## Изоляция и владельцы

- campaign: `javascript-20260926-ubuntu`, mode `single`, единственный узел
  `component.programming.JavaScript`; attempt реализации/CLI ещё не создан.
- Координатор: task `01a0ddc9-3e19-75d3-a5c9-724783ed6c35`, основной checkout
  `/home/george/git/loginom-ai-agent`, ветка `javascript`.
- Создан постоянный worktree
  `/home/george/git/loginom-ai-agent/.worktrees/node-javascript`, ветка
  `node-javascript`, чистый HEAD/base
  `a8ad59766dbdb4f2da0b54367a755ce00891dd71` (`loginom`).
- Задача разработчика/её bootstrap **не созданы**; регистрация памяти не активна.
  Это намеренно сохраняет HEAD==base для fresh-enrollment helper.
- Исходный согласованный docs source:
  `086cad12c3` (перед исполнением); дополнения Ubuntu находятся в этом checkpoint
  и соседнем плане. Перед переносом закрепить полный SHA docs-коммита этих файлов.
  Координаторские изменения memory kit — отдельный
  `01cc4dc86392cf3e8820780fc8cc68b6e9a22985`; они не меняют product base.
  Переносить только явно выбранные docs-only commits после допуска памяти.
- Приватный общий журнал:
  `~/.local/state/loginom-ai-agent/node-development/host-resources.json`, owner —
  текущая задача; создан под атомарным `registry.lock` после проверки списка задач
  приложения и процессов. Других активных Loginom-задач в полученном списке нет;
  существующие Chrome-процессы не присваивались и не изменялись.
- Кампания: `~/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/campaign.json`.
  Lease `javascript-20260926-ubuntu-preparation`; CLI slot не занят,
  `acceptance.lock` не создавался. Общий lock записи освобождён.

## Проверено на Ubuntu

1. Сеть: назначенный `http://logi-test-plan.bg.local/app/` разрешается в
   `10.200.11.224`, прямой HTTP GET вернул 200.
2. Пользователь назначил выделенный аккаунт `jsteach`; он закреплён в lease.
   Секреты в документацию/Git не сохраняются.
3. Штатный `src/connection-check.mjs::loginBrowser`, отдельный профиль
   `connection-preflight-profile` внутри приватной кампании, `headless:false`,
   Chromium1243, действующий DISPLAY, sandbox и `--no-proxy-server`.
   Прочитаны фактические account=`jsteach`, Connected=true, `bg.app.Version=7.4.2`,
   PackageNodes.Count=0. Logout через UI и закрытие собственного context подтверждены;
   пакеты/узлы/файлы Loginom не создавались. Native receipt:
   `connection-preflight.json`; операторский скрипт и screenshot — рядом, вне Git.
   Screenshot был сделан до полной отрисовки рабочего интерфейса и не доказывает
   готовность палитры/мастера. Редакция и ОС сервера пока **не установлены**.
4. Отдельный toolchain в
   `~/.local/state/loginom-ai-agent/node-development/toolchains/`:
   Bun `1.3.14+0d9b296af`, полный Node `24.19.0`, npm `11.17.0`.
   PATH пользователя и системный Bun `1.3.13+bf2e2cecf` не менялись.
   Bun получен из [официального release](https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14);
   archive SHA256 `951ee2aee855f08595aeec6225226a298d3fea83a3dcd6465c09cbccdf7e848f`
   сверён с GitHub release asset digest. Node archive SHA256
   `14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647`
   сверён с официальным SHASUMS256; executable SHA256
   `bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12`
   совпал с product pin. Точные пути — приватный `javascript-toolchain.json`.
5. Использованный Chromium executable SHA256
   `8c599d43aec53f2460a31ae2f4af6bd863f8258b34ff519564bc5d4726bfaa1e`
   совпал с Linux product pin. Это ещё не проверка целого candidate/resource manifest.

## Память и переносимость подготовки

Основной checkout использует рабочий штатный OpenViking. Doctor подтвердил
авторизацию, `system/status`, чтение, MCP и `/ready`: 0 failures, 1 warning о
прошлых прерванных recall. Точное чтение памяти текущего проекта прошло.
Effective Peer выводится из Ubuntu cwd; macOS URI не копировался.

Подтверждены и исправлены в координаторском kit:

- Исходный adapter передаётся явно `--source`; больше нет исполняемого default
  `/Users/kartamyshev/...`. Старый upstream manifest/hashes сохранены.
- `review_hooks.mjs --codex <absolute executable>` вместо пути macOS app.
  Настоящий Ubuntu `/home/george/.local/bin/codex` (Desktop 0.153.4) успешно
  выполнил initialize и hooks/list; системное доверие этим чтением не менялось.
- Фактический установленный ID — `openviking-memory@loginom-dock`, версия 0.8.1.
  Он передаётся `--plugin-id`, сохраняется в manifest и отключается только в
  новом worktree. Для прежних manifest сохраняется прежний marketplace.
- До bootstrap inventory должен доказать отсутствие original memory hooks
  **любого marketplace** в worktree; helper отказывает раньше захвата данных.
- Ubuntu umask `0002` создаёт `0775`/`0664`, которые текущий ownership validator
  отвергает. В тестовых fixtures установлен приватный umask; в CURRENT описаны
  проверка прав и защищённая копия неизменённого plugin pin. Права основного
  checkout и установленного плагина ещё не менялись, validators не ослаблялись.

Локальные проверки: **11 Python preparation tests + 4 Node hook-review tests PASS**.
Первый Python запуск дал 11 setup errors из-за umask `0002`; после исправления
fixtures — 11/11. Python suite выполнялась с временным preparation fixture:
настоящий overlay и `workspace-peer.mjs`, совпавший с upstream hash;
`server.mjs` специально неработоспособен и выбрасывает ошибку при запуске.
Это проверяет Git/TOML/manifest preparation, **не собранный MCP adapter**.
Node suite использует процесс RPC fixture и не пишет реальное доверие Codex.
Проверки синтаксиса Python/Node и `git diff --check` прошли.

Отдельный исходный `integrations/codex-mcp-adapter` с 11 файлами из manifest
пока не найден в проверенных checkout, cache и подходящих локальных архивах.
Установленный официальный plugin — другой компонент и не содержит этот adapter.
Путь/репозиторий его копии запрошен у пользователя. Поэтому project runtime,
hooks manifest/install, registration ID, bootstrap, activation и actor access
новой задачи пока отсутствуют. Тестовый fixture не установлен как runtime.
Capture/extraction/read-back новой задачи ожидают её допуска и первого этапа.

## Следующий шаг

Владелец — координатор текущей задачи. Восстановить точный исходный adapter,
проверить все hashes и собрать настоящий runtime. Затем закрыть права/identity
установки по CURRENT, проверить новый worktree до bootstrap, создать настоящую
задачу, оформить свежие receipts, activation и actor health/find/read.
После допуска перенести docs-only commits и выполнить discovery 0B в headed
Loginom под выделенным аккаунтом. Отдельно установить edition/ОС сервера,
палитру JavaScript, доступный storage, action manifest и будущий CLI/OAuth profile.

Подготовительный Loginom logout/context close подтверждены; неизвестных мутаций
или pending browser operations нет. Приватный profile/evidence сохранён.
При возобновлении сверить worktree, процессы, account lease и receipts;
не создавать вторую кампанию и не сбрасывать состояние существующих задач.

## Продолжение 0A: интерфейс и целостность bundle

Повторная проверка 2026-09-26, после docs source
`ed45485ac032ff6bc4921a2ca4a55a5650356719`. Worktree остаётся чистым на product
base; разработчик/bootstrap ещё не созданы, исходный adapter по-прежнему отсутствует.
Запрос его доступной копии остаётся без ответа. Предыдущий этап дал реальный
прогресс (Ubuntu helpers/toolchain/login), этот — следующие наблюдения.

- Штатный `verifyResources` выполнен bundled Node: **4668 файлов PASS**,
  manifest SHA256 `ff80b90e2c543a0f3afcdddae843af28372fad43c27c51cce0d58a7f9c66a9b4`.
  Приватный receipt — `source-bundle-verification.json` в каталоге кампании.
  При отдельном сравнении с product release pin найдено одно различие:
  `endpoint=https://loginom.duckdns.org/mcp` у этого bundle вместо актуального
  `https://mcp.loginom.ai/mcp`. Поэтому целостность подтверждена, но **допуск
  candidate не выдан**. Новый candidate должен собираться из исходников и pins
  по фазе 6; существующий source bundle не подменять именем нового candidate.
  Action manifest URI/hash и остальные release fields совпали с product pin.
- В собственном headed context под `jsteach` ранний переход «О программе»
  после успешного login показал `Cannot read properties of undefined (reading
  'NodeIndex')`. Доказательство сохранено: `platform-preflight.json` и screenshot.
  About metadata не прочитаны, logout первой пробы **не подтверждён**, context
  закрыт. Попытка сохранена как неуспешная, не переписана последующей проверкой.
- Отдельная recovery-проба подтвердила тот же account, 0 пакетов, отсутствие
  открытых сообщений, затем успешные UI logout и context close:
  `platform-recovery.json`. Серверных объектов/пакетов не создавалось.
- Проба с ожиданием видимой страницы «Начало» установила `homeVisible=true`,
  `bg.app.PlatformEdition=Enterprise`, успешные logout/context close:
  `platform-readiness.json`. Это отделяет login admission от загрузки интерфейса.
- Повтор чтения «О программе» после ожидания HomePage и подтверждения native
  active tab == `FAboutNode` прошёл. Фактически прочитаны
  `MF;TF-1;About;lblPlatformEditionValue=Enterprise` и
  `MF;TF-1;About;lblVersionValue=7.4.2`. Успешные UI logout/context close —
  `platform-ready.json`; screenshot — `platform-ready.png`. Полные локальные
  observations остаются приватными. Страница не содержит ОС сервера;
  эта характеристика запрошена у пользователя и не выведена из ОС агента.

Последний Loginom context закрыт, logout подтверждён. Browser lease хранит
профиль и evidence, но не объявляет работающий процесс; CLI slot свободен.
Содержимое установленного bundle не менялось. Блокирующее условие регистрации
памяти прежнее: нужна точная копия исходного adapter либо отдельно реализованное
и проверенное новое поколение; ослабление manifest/routing guards не допускается.
Условие сохраняется третий последовательный ход Goal: создание worktree,
Ubuntu-адаптация и дополнительные live-проверки дали прогресс, но не восстановили
зависимость. Автоматическое продолжение приостановлено на этом предусловии;
Goal не завершён. Next trigger — доступная копия adapter с проверяемыми hashes
или новое явное решение о замене механизма регистрации. ОС сервера также ожидает
подтверждения; работающий штатный OpenViking основного checkout не отключён.

## Передача разработчику — 2026-09-26

Задача подтверждена active/inProgress через App API. Разработчику назначен Goal
до ready-for-review, без запуска нового ревью/CLI-приёмки; scope обоих output
режимов и всей матрицы сохранён. Одно same-task review и acceptance будут
назначены отдельно на соответствующих границах. Product base и memory
registration не менялись. В docs-only transfer конфликт CURRENT.md разрешён
точной закреплённой версией документа, code-коммиты kit исключены.

Координатор отдельно готовит CLI provider/OAuth prerequisites. Source CLI
`providers list` в собственном приватном `cli-profile` завершился до model/Host
dispatch с CLI_START_FAILED. Диагностика import обнаружила отсутствующую
зависимость https-proxy-agent; это ещё не дефект продукта. Запущена установка
по lockfile закреплённым Bun с `--frozen-lockfile --ignore-scripts`. Guard
этого профиля сохранён до адресной проверки cleanup; browser не запускался.
