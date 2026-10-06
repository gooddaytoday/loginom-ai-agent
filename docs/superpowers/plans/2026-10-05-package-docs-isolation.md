# План исправления интеграции package-docs в Loginom AI Agent

**Цель:** установленные Linux Desktop и standalone CLI самостоятельно выбирают построение сценария
или документирование пакета по запросу пользователя. Документация использует
локальный `.lgp` и справку, не запускает Chromium и не загружает файлы в Loginom.

**Архитектура:** встроенные skills поставляются с приложением. Модель выбирает
skill по описанию, а backend ограничивает возможности текущей задачи. Справка
имеет отдельный MCP-клиент без браузера. Обработка документов выполняется
поставляемым Node с фиксированными командами запуска скриптов.

**Стек:** TypeScript, Bun для сборки и тестов, поставляемый Node, MCP,
Electron, существующие ZIP/XML-форматы Loginom и шаблоны отчёта.

**Основание:** решения пользователя,
[аудит ветки docs-no-browser](../../testing/loginom-ai-agent/skills-routing-audit-2026-10-05.md)
и [исправления по результатам ревью](2026-10-06-package-docs-isolation-corrections.md).
База плана: `docs-no-browser`, `fc3d97dbf` после rebase на `loginom`/`origin/loginom`
`f6f9b0106`. Прежняя база `8e1e1917c` — только история исследования.
Обновлено 2026-10-06. По активной цели пользователя начато полное выполнение
плана через TDD, с отдельными коммитами и отметками фактически выполненных задач.
Доказательства и точки продолжения: [журнал реализации](../../testing/loginom-ai-agent/package-docs-implementation.md).

## 1. Что должно получиться

- «Построй сценарий…» — агент выбирает skill `loginom-automation`, получает браузерные
  инструменты и выполняет работу в Loginom.
- «Напиши документацию по этому `.lgp`…» — агент выбирает `package-docs`,
  читает локальный пакет, получает справку и создаёт PDF, DOCX или Markdown
  в рабочем каталоге сессии. Файл рядом с исходным `.lgp` не создаётся.
- Справочные вопросы о Loginom остаются в `default`, используют Help и
  безбраузерную диагностику, не активируют `loginom-automation`.
- Дополнительный PNG или другой файл в запросе документации не запускает
  браузер и не отправляется в Loginom автоматически.
- После построения сценария можно попросить документацию в том же чате.
  Уже открытое окно сохраняется, но задача документации не управляет им.
  Агент сообщает серверный путь пакета и просит приложить локальный `.lgp`:
  автоматического скачивания сохранённого пакета в этой итерации нет.
- Если локального пакета нет, агент просит путь или вложение. Он не ищет
  пакет в браузере и не выдумывает его содержимое.
- Недоступность сервера Loginom не мешает отчёту, если доступен сервис справки.
  Если справка недоступна, действует существующее правило skill: понятная ошибка
  и отсутствие неподтверждённого отчёта.
- После чистой установки Linux Desktop и standalone CLI оба skill доступны вне исходного репозитория,
  без установки Python, Node или skills пользователем.
- Все продуктовые skills имеют единый исходный каталог `packages/product/skills/`.
  `loginom-automation` переносится с сохранением имени; runtime и harness
  получают его из приложения. Новые публикации серверного skill отключаются,
  существующая запись сохраняется для старых клиентов до отдельного этапа 9;
  дополнительный skill `loginom-scenario` не создаётся.

## 2. Решения и границы работ

### Исполнение скриптов: использовать поставляемый Node

Перенести три Python-скрипта в TypeScript и собрать один Node-совместимый
`package-docs.mjs` с подкомандами `extract`, `skeleton`, `emit`. Сохранить формат
структуры `package_docs.structure.v1`, правила выбора выходного формата,
шаблоны и шрифты Golos. Выход перемещается в каталог сессии; коллизии имён
разрешаются без перезаписи существующих документов (этап 2).

Этот вариант выбран потому, что приложение уже доставляет и проверяет Node
на поддерживаемых платформах. Bundled Python сохранил бы скрипты без переноса,
но добавил бы ещё один runtime, его обновление и платформенную приёмку.
Системный Python не подходит для самодостаточной установки Desktop или CLI.

### 2.1. Один доверенный корень ресурсов

В `packages/agent/src/effect/runtime-flags.ts` добавить `loginomResources`,
читаемый из `LOGINOM_AI_AGENT_RESOURCES`. Это абсолютный существующий каталог
`resources/loginom`; неверный путь даёт диагностику и не регистрирует bundled
источник. Использовать только `RuntimeFlags`, по образцу `disableExternalSkills`,
не `Flag` и не прямое чтение `process.env` из discovery.

Из одного корня выводятся `skills/`, `bin/node` и `resource-manifest.json`.
Desktop передаёт корень через `createSidecarEnv` в `src/main/server.ts`:
для установленного приложения это `process.resourcesPath/loginom`, для dev —
`packages/desktop/resources/loginom` после staging; правила уже заданы в
`src/main/loginom/desktop-service.ts`. `standaloneRun` берёт корень из
`standaloneBundle().resources` до backend `run`; worker TUI наследует окружение
родителя. Standalone запрещает `--attach`, поэтому этот путь локален backend.

`LOGINOM_AI_AGENT_CLI_BUNDLE` остаётся dev override, но не обходит проверку
bundled skills из 2.3. В тестах задавать
`RuntimeFlags.layer({ loginomResources })`, не менять `process.env`.

### 2.2. Bundled-источник и зарезервированные имена

В `packages/product` добавить Node-only export `./skills` по образцу
`./cli-profile`: путь к продуктовому каталогу, зарезервированные имена
`loginom-automation` и `package-docs`, устаревшее имя `package_docs`.
Browser entrypoint `src/index.ts` его не импортирует. Export используют staging
в `loginom-host` и discovery в `agent`, без зависимости Product от Core.

Discovery V1 регистрирует bundled первым и только по записям
`skills/<name>/SKILL.md` из проверенного manifest, не по glob ресурсного каталога.
Зарезервированное или устаревшее имя из другого источника игнорируется с
предупреждением и пользовательской диагностикой, включая `~/.claude/skills`,
`~/.agents/skills`, проектные `.claude`/`.agents`, config-каталоги,
`skills.paths` и `skills.urls`. Локальная подмена не вытесняет встроенный skill.

Загрузку источников сделать последовательной в объявленном порядке вместо
`Effect.forEach(..., { concurrency: "unbounded" })`. Для незарезервированных
имён сохранить правило «более поздний источник побеждает». Один realpath
регистрируется один раз. В `Skill.Info` добавить `source` (`builtin`, `bundled`,
`external`, `project`, `config`, `url`) и `digest` для bundled.

Slash-команды следуют тому же правилу: зарезервированное имя принадлежит
bundled skill; одноимённые config-команда или MCP prompt игнорируются с
диагностикой. Повреждение bundled skill не разрешает fallback к одноимённому
пользовательскому источнику. Alias `/package_docs` не создаётся.

### 2.3. Целостность bundled skills

В `packages/loginom-host`, владельце staging/manifest, реализовать одну функцию,
например `verifyBundledSkills(resources)`. Она сверяет sha256 каждого файла
`skills/<name>/**`, отклоняет отсутствующие, изменённые и неучтённые файлы.
Обязательные ресурсы выводятся из относительных ссылок `SKILL.md` и связанных
`references/*.md`, а генерируемые файлы — из frontmatter `metadata`, например
`loginom-generated: scripts/package-docs.mjs`. В skill явно сослаться на Golos
TTF/OFL; отдельного списка этих файлов в сборочных скриптах не создавать.

Для каждого skill `digest` — sha256 отсортированных пар «путь, хеш» его файлов
(64 hex). Функция возвращает проверенные записи по именам; изменение docs
не меняет revision automation. Один алгоритм использовать в backend и runtime,
через общий Node-совместимый helper либо проверяемые staging-данные, не создавать
две независимые реализации. Это значение используют `Skill.Info.digest` и
runtime `skillRevision`. Проверку вызывают
backend при регистрации и `package_docs_run` перед запуском скрипта.
Существующий runtime `verifyResources` здесь не подходит: он требует, чтобы
текущий процесс был bundled Node. Сам managed runtime уже проверяет все файлы
manifest через `verifyResources`, повторять в нём эту реализацию не требуется.

При ошибке skill не регистрируется; диагностика: «встроенный skill повреждён,
переустановите приложение». Сетевого fallback и поиска запасной копии нет.
Проверка защищает от повреждённой/неполной установки и случайной подмены;
она не защищает от обладателя прав записи в каталог установки, где лежит
и сам manifest. Не заявлять криптографическую доверенность этого каталога.

### 2.4. Профиль задачи и его восстановление

Модель выбирает skill по `name`/`description`, без маршрутизатора по ключевым
словам. Backend независимо ограничивает действия. `default` — обычный профиль,
не отдельный skill; имя `general` уже занято субагентом.

```ts
type TaskProfile = "default" | "package-docs" | "loginom-automation"

type TaskScope = {
  sessionID: string
  taskMessageID: string
  profile: TaskProfile
}
```

Использовать существующие брендированные ID. Это внутренний контракт без новых
таблиц и изменений публичной схемы сообщений. Чистая функция выводит профиль
из всей доступной истории сессии в БД, а не только окна после compaction.
Начало задачи — последнее user message с хотя бы одной несинтетической частью,
которое не является overflow-replay или служебным compaction-only сообщением.
Автопродолжение compaction, итог subtask
и shell уже имеют `synthetic: true`; копиям overflow-replay добавить в metadata
частей `compaction_replay_of: <исходный message id>`, чтобы они не меняли задачу.

Для bundled зарезервированного skill backend сохраняет применённую активацию
в завершённую tool part `state.metadata.activation = { name, profile, digest }`.
Slash и `run --command` сохраняют тот же применённый результат в
`metadata.skill_activation` текстовой части с телом skill. По записям после
начала задачи восстанавливается последний разрешённый профиль. Эти отметки
создаёт backend, не текст пользователя/модели; activation записывается только
после успешного применения перехода. До границы хода запрос хранится отдельно
как pending, не как применённая activation; чистая функция восстанавливает
действующий профиль только по применённым записям.
Публичные prompt/command inputs не должны
мочь подделать activation/replay metadata: удалять или отклонять эти зарезервированные
поля, включая pending, на входе, затем создавать доверенные записи только
внутри backend.
Проверить compaction, restart/resume, revert
и fork: учитывать границу revert, при fork переназначать ссылки
`compaction_replay_of` вместе с message IDs. Старые сессии без отметок начинают
с `default`.

| Событие | Правило |
| --- | --- |
| Новая настоящая пользовательская задача | Начинается с `default` |
| `default` → продуктовый профиль | После успешной активации bundled skill |
| `loginom-automation` → `package-docs` в той же задаче | Только если Host подтверждает отсутствие `activeWork` и иной незавершённой/recovery-работы; иначе skill просит завершить/отменить текущую операцию |
| `package-docs` → `loginom-automation` в той же задаче | Запрещено: «построение начинается новым запросом» |
| Повтор того же skill | Идемпотентен |
| Обычный пользовательский skill | Не меняет профиль |

Каталог и execute одного provider-turn используют один снимок профиля начала
хода. Активация влияет на следующий ход, не открывает новые права второму
вызову из той же пачки. Приватный HostPort `scope` при активации проверяет
переход как pending, не заменяя текущий снимок. Следующий запрос активации той
же пачки проверяется относительно уже принятого pending-профиля. На границе
хода повторно проверить безопасность: более поздний вызов прежнего automation
снимка мог начать работу. Только после этой проверки применить переход,
зафиксировать activation и построить новый снимок из истории. При отказе
сохранить прежний профиль и явную ошибку pending-перехода; неприменённый запрос
не должен выглядеть в истории как выдача прав. Host хранит снимок на run и
проверяет `tools/call/admit` до runtime, журнала и upload. Отказ —
`LOGINOM_SCOPE_DENIED`. Согласовать применение одобренного перехода со следующим
ходом: Host и backend не должны использовать разные действующие снимки.
Новый `acquire` не выполнять: существующий run живёт весь цикл, повторный занят.

Не хранить профиль в `session.permission` и не реализовывать allowlist через
`Permission.disabled`/постоянный `prompt.tools`: это меняет права сессии и
наследуется детьми. В обоих продуктовых профилях `task` скрыт и отклоняется,
иначе дочерняя сессия приобретёт новый Host run и обойдёт ограничение.
В `default` дочерняя сессия использует собственный профиль.

### 2.5. Инструменты по профилям

| Профиль | Доступные инструменты |
| --- | --- |
| `default` | Обычные инструменты, семь Help-инструментов и безбраузерная `loginom_dock_diagnostics`; без prepare, остальных Dock и `package_docs_run` |
| `package-docs` | Явный allowlist: `read/glob/grep`, `edit/write/apply_patch`, `todowrite`, `question` при включённом флаге, `skill`, Help, `loginom_dock_diagnostics`, `package_docs_run`; `list/todoread` — только если эти builtins появятся, не создавать их ради списка |
| `loginom-automation` | Существующие возможности, кроме `task` и `package_docs_run`; до runtime — Help, безбраузерная диагностика и статический prepare, после — каталог runtime чата |

Help — только проверенные `find/search/read/grep/glob/list/tree` из knowledge
клиента. Любые остальные MCP/plugin-инструменты не входят в docs allowlist,
как и `bash`, `task`, `webfetch`, `websearch`, браузер и прочие Dock-вызовы.
Фильтрацию применять и к каталогу, и при execute, поверх обычных разрешений.
Allowlist проверяет происхождение реализации: одноимённый plugin/custom tool
не становится разрешённым builtin или проверенным Help route.
Это ограничение продуктового исполнения, не декларация полной OS sandbox.
Проверки реальной моделью подтверждают выбор skill, детерминированные —
ограничение действий; одного `allowed-tools` в frontmatter недостаточно.

### 2.6. Справка отдельно от браузера

На поколение подключения — knowledge-процесс (`knowledge-entry.mjs`) без
Playwright/Chromium, получающий только API key, и ленивые runtime чатов.
Browser readiness удалить. Runtime чата штатно запускает первый prepare
после активации `loginom-automation`; admission исходных вложений допускается
только как часть разрешённой сценарной подготовки, не при discovery/Help.

`phase: ready` означает «credentials применены, knowledge прочитал каталог
справки». Состояние браузерного входа хранится отдельно: `unknown`, `verified`,
`failed`; его обновляют явная проверка и запуск runtime чата. Сохранение
настроек требует успешной проверки Help key; неудача проверки веб-входа даёт
отдельное предупреждение, не отменяет сохранение. Это правило одинаково
для Desktop и CLI; текущую связку validationId с обязательным успехом обоих
checks разделить. Восстановление сохранённого URL не выполняет миграцию.

Help всегда направляется в knowledge, даже при открытом runtime чата.
Безбраузерный diagnostics показывает Help key status, локальную revision,
состояние подключения и браузера. `action_describe/workspace_observe/node_read/
operation_inspect` обслуживает только runtime чата. `tools` возвращает каталог
по scope, не создавая браузер. Ошибка Help не блокирует обычный локальный чат,
но запрещает выпуск отчёта, которому нужен подтверждённый справкой контекст.

Knowledge поддерживает `start/list/call/interrupt/close`, конкурентные запросы
и отмену по request/run. `interrupt` одного run не отменяет другие чаты,
ошибки Help не попадают в журнал неопределённых мутаций. При смене поколения
закрываются старый knowledge и его запросы, credentials не смешиваются.
В supervisor разделить payload knowledge/browser: пароль Loginom в knowledge
не передавать. Старт host и `host.settled()` не ждут сеть/браузер; readiness
и возможная ошибка обновляются отдельно. Это требует отдельной проверки
жизненного цикла, не только извлечения MCP-клиента из bridge.

### Общие ограничения

- Текущая приёмка охватывает Linux Desktop и standalone CLI с backend V1.
  Windows и macOS в эту итерацию не входят; их установленную работу не заявлять.
  Экспериментальный V2 не должен
  становиться обязательным условием исправления V1.
- Сохранить разделение Schema → Core/Protocol → Server; не добавлять зависимости
  Client на Core/Server. Node-код не импортировать в браузерный entrypoint Product.
- Секреты остаются в private Host IPC. Модель и renderer не получают API key,
  пароль или произвольный доступ к хранилищу credentials.
- Сохранить поколение подключения, сериализацию вызовов, отмену, журнал
  неопределённых операций и привязку загружаемых байтов к исходному вложению.
- Переключать профиль на безопасной границе выполнения. Не закрывать открытый
  сценарий и не повторять незавершённую операцию ради переключения skill.
- Использовать версии и хеши Node/Bun из проекта; не обновлять их попутно.
- Тесты и `bun typecheck` запускать из каталогов соответствующих пакетов.
- Если изменится публичный Protocol/HttpApi, выполнить `bun run generate`
  из `packages/client`; legacy SDK пересоздавать штатным build-скриптом.
- Загрузка `.lgp` из файлового хранилища Loginom, новая UI-система управления
  skills и полный перенос приложения на V2 в этот план не входят.
- Отдельные дефекты статистики/разбора из аудита не считать автоматически
  исправленными переносом Python → Node; они требуют собственных проверок.
- Открытые PR не рассматривать и не изменять. Из PR #29 использовать только
  решения, перечисленные в corrections: `createSidecarEnv`, временный dev-мост,
  усиленный статический тест, правило новой папки, Product AGENTS и первый
  тест discovery через RuntimeFlags. Это не перенос PR целиком.

### Владение и параллельная калибровка evals

Сессия [«Спланировать near-miss калибровки»](codex://threads/01a10fce-57bf-7093-bd1d-f2bae8c99772)
реализует near-miss калибровку в отдельном worktree/ветке `calibration-near-miss`.
За ней остаются harness, корпус near-miss, общий промпт судьи и документация
калибровки. В рамках этого плана их не редактировать; не переключать чужую
ветку, не менять рабочее дерево, незавершённые изменения, `.env`, профили,
результаты, установленный launcher и блокировки соседней работы.

Наше направление владеет skills, Desktop, standalone CLI, runtime и их
тестовой инфраструктурой. Эта разработка и локальные TDD-проверки могут идти
параллельно калибровке после сохранения исходной сборки. Недостающие проверки
структуры и повторного выполнения пакетов по возможности реализовать отдельными
адаптерами здесь, например в `packages/loginom-host` и `packages/desktop/test/loginom`,
используя выходные артефакты harness. Если без изменения самого harness нельзя
обойтись, описать отдельную согласуемую задачу и границы файлов/времени работы;
одновременное редактирование общих файлов исключить.

Завершение калибровки блокирует живую парную приёмку с судьёй, но не реализацию
продукта и локальные проверки. До изменений продукта сохранить полный baseline
CLI. После калибровки выбрать её принятый неизменный SHA и запускать обе
сохранённые сборки одним harness в отдельном worktree после принятия отдельно
согласованных адаптаций harness из этапа 7. Исторические SHA ниже
служат контекстом исследования, а не автоматически выбранной версией приёмки.

### Разработка через TDD

Применять [TDD skill](/home/kiselev/.agents/skills/tdd/SKILL.md) ко всем изменениям
поведения. Приведённые этапы — карта работ, а не разрешение сначала написать
все тесты, затем всю реализацию.

Для каждого поведения: один тест через публичный интерфейс → убедиться, что
он падает по ожидаемой причине (RED) → минимальное изменение (GREEN) →
рефакторинг при зелёных тестах. Затем следующий цикл. Первые циклы:

1. `Skill.all()` находит оба skill с `source: "bundled"` вне проекта.
   Фикстура resources строится тем же кодом инвентаризации, что staging,
   без Node/Chromium; корень через `RuntimeFlags.layer({ loginomResources })`,
   рабочий каталог пустой и вне git, домашний каталог тестового окружения чистый.
2. Одноимённый `.agents/skills` игнорируется с диагностикой.
3. Один realpath регистрируется один раз, включая dev-мост.
4. Изменённый bundled файл не регистрируется.
5. Scripted LLM активирует `package-docs` для `.lgp` + PNG: Host не получает
   admission и не создаёт runtime чата.

Этапы ниже группируют ответственность; минимальная связка RuntimeFlags,
inventory и discovery для первого цикла может предшествовать полному наполнению
этапов 1–3. Каждый цикл имеет собственный RED/GREEN, не писать все тесты вперёд.

Использовать реальные discovery, session/command API, HostPort, файловые fixtures
и собранный Node executor. Подменять только внешние границы: LLM, MCP-сервер,
браузерный процесс. Scripted LLM проверяет механику исполнения, живая модель —
выбор skill. Не подменять внутренние модули и не связывать тесты с порядком
вызовов приватных функций. Отсутствие запуска Chromium проверять на границе
запуска процесса, а установленную сборку — по фактическим дочерним процессам.

Приоритеты покрытия:

| Наблюдаемое поведение | Обязательные проверки |
| --- | --- |
| Доставка и выбор skill | Один источник `loginom-automation` и `package-docs`, целые resources, работа вне checkout, slash и естественная активация, зарезервированные имена не подменяются |
| Документация | PDF/DOCX/MD, русский текст, подмодели, пути с пробелами, вход не меняется, нет placeholders; повреждённый/отсутствующий вход не создаёт готовый отчёт |
| Изоляция | Нет Chromium/upload для docs с `.lgp` и дополнительными вложениями; старый tool/grant не действует; браузер доступен после корректной активации `loginom-automation` |
| Help и подключение | Help работает при недоступном Loginom; ошибка API key/timeout понятна; обычный чат без настройки Loginom; отмена, смена credentials и параллельные чаты изолированы |
| Жизненный цикл | default → loginom-automation → docs; обратно к построению только новым запросом; continuation/restart/resume/compaction/fork/revert, составной запрос с локальным файлом, отмена и незавершённая операция |
| Регрессия построения | Исходное вложение действительно загружено, пакет построен, сохранён, повторно открыт/выполнен; структура и результат сопоставлены с эталоном evals |

У каждого завершённого цикла фиксировать тест, наблюдавшийся RED и итоговый
GREEN. Покрытие поведения важнее процента строк; план проверок не заменяет
фактический журнал запусков.

## 3. Этапы реализации

### Этап 0. Подготовить воспроизводимое окружение — выполнен

**Зачем:** предыдущий аудит не смог запустить JS-проверки из-за отсутствующих
зависимостей. До изменения поведения нужны исходные детерминированные проверки
и сохранённый полный baseline CLI; живую оценку этого бинарника выполнить позже.

**Файлы:** `package.json`, `bun.lock`, package-level инструкции и существующие
тесты `agent`, `app`, `loginom-host`, `desktop`, полный baseline CLI и его manifest
в собственном каталоге артефактов вне рабочих деревьев.

- [x] Сверить HEAD и сохранить незавершённые изменения. Установить зависимости
  закреплённым Bun через `bun install --frozen-lockfile`; lockfile не обновлять.
- [x] Перечитать изменения upstream после rebase на `f6f9b0106`:
  `connection/connection-service.ts` (сохранённый URL восстанавливается как есть),
  `node-client.ts` (startup budget 180 с), `script/build-cli.ts` (`--no-archive`),
  `script/verify-cli-candidate.ts`, `script/cli-source-snapshot.ts` в
  `packages/loginom-host`; `packages/desktop/scripts/release/artifact.test.ts`,
  `packages/loginom-runtime/client/lib/user-results.mjs` (CrossTable),
  актуальные `packages/loginom-host/AGENTS.md` и owning инструкции.
- [x] Зафиксировать границы владения с параллельной калибровкой: в этой работе
  менять только продукт и свою тестовую инфраструктуру. Отдельно записать
  зависимость живой приёмки от принятой версии harness/судьи. Соседний worktree
  `calibration-near-miss` и исходный checkout `evals` не использовать для изменений
  или прогонов этого направления.
- [x] Запустить существующие проверки skill/вложений/HostPort и зафиксировать
  детерминированный baseline сразу, не ожидая калибровки. Если тест падает из-за
  среды, сначала устранить причину среды.
- [x] Сохранить результат семи Python-тестов и эталонные структуры/документы
  для сравнения с Node. Сравнивать содержание, а не время создания ZIP/PDF.
- [x] До переноса зафиксировать SHA и рабочее состояние источника Dock,
  содержимое `loginom-automation` и совместимость с закреплённым runtime.
- [x] До любых изменений продукта создать собственный чистый detached worktree
  на исходном продуктовом SHA `fc3d97dbf` (полный SHA записать в отчёт).
  Не переносить туда неотслеживаемые план/аудит/corrections: source snapshot
  учитывает untracked файлы и иначе даст `sourceDirty: true`. Собрать полный
  baseline CLI штатным `build-cli.ts`: бинарник, Node/Host/runtime и все ресурсы,
  `cli-manifest.json`, архив и checksum. Сохранить весь комплект в отдельном
  долговременном каталоге, записать исходный SHA, фактическое состояние исходников,
  build inputs и хэши; не использовать `--no-archive` для сохраняемого baseline.
  Проверить `verify-cli-candidate.ts` и запуск; один бинарник
  или будущая пересборка старого SHA не заменяют сохранённый комплект.
- [x] Не устанавливать baseline поверх пользовательского launcher и не
  использовать чужие профили. После сохранения комплекта переходить к этапам
  1–6 и локальным проверкам Linux Desktop/CLI. Оба живых прогона — baseline
  и candidate — отложить до завершения калибровки и выполнить в этапе 7.
- [x] Обновить сведения о входах evals: на ревью harness дошёл до `f4fe42248`,
  `agent-validation` — до закоммиченного `d5fb803`. Прежние `91984c36d`,
  dirty `0ad81c691` и их хэши не использовать как актуальные pins. Перед живой
  приёмкой перечитать реальное состояние и пересчитать `agent_inputs_hash`/
  `rubric_hash` окончательного snapshot. Существующую серверную публикацию
  `loginom-automation` сохранить для baseline CLI вплоть до этапа 9.

**Готово, когда:** проверки запускаются, известные исходные проблемы отделены
от новых регрессий, исходный полный CLI сохранён и проверен, команды и SHA
записаны в отчёте реализации. Готовность калибровки для завершения этапа 0
не требуется. Этап выполнен 2026-10-06; исходный CLI и результаты проверок
зафиксированы в журнале реализации. Наблюдавшийся SHA калибровки `bc24b7baa`
не является автоматически принятым pin для живой приёмки.

### Этап 1. Каталог skills, staging и локальный источник

**Создать/перенести:** `packages/product/skills/{loginom-automation,package-docs}/`,
Node-only export Product `./skills`, общую проверку/digest из 2.3,
`packages/agent/test/skill/bundled-skills.test.ts`.
**Обновить:** `packages/loginom-host/script/stage-resources.ts`, runtime
`client/lib/{skill,bridge,diagnostics,user-results,hermes-router,host-inputs}.mjs`,
bootstrap в `packages/agent/src/session/prompt.ts`, публикационные пути и docs.

Сверка локальных исходников до rebase: полный
`services/loginom-ai/skills/loginom-automation/` совпадал с Dock
`skills/loginom-automation/` на `83c52ebb` (SKILL.md и четыре references).
Однако основа продуктовых инструкций теперь — эффективный `userWorkflowInstructions`
из **этого runtime после rebase**, включая CrossTable в `user-results.mjs`.
Тексты Codex/Hermes-плагинов Dock не подставлять вместо этого контракта.

- [ ] Перенести существующий `loginom-automation` с сохранением имени и нужных
  references в Product; `.loginom-ai-agent/skills/package_docs/` перенести в
  `packages/product/skills/package-docs/`, изменив каталог/frontmatter.
  Контракт JSON `package_docs.structure.v1` не переименовывать.
- [ ] Description automation ограничить созданием, изменением и выполнением
  сценариев: справочные вопросы используют Help без этого skill, локальная
  документация — `package-docs`. Description docs включает пользовательские
  формулировки, «ИИ Отчет», локальный `.lgp` и PDF/DOCX/MD. Добавить compatibility.
  В system prompt входят метаданные, полный текст загружается по необходимости.
- [ ] Перенести действующие `userWorkflowInstructions` с node lifecycle,
  CrossTable, проверкой результатов, отменой, host deadlines и
  `package.save_checkpoint`. Удалить неподдерживаемые raw UI/clipboard/Playwright,
  `node.add/link.create` через action API, model `budget_ms`, устаревший обязательный
  Save As. Сохранить `sources.md`, Help/E2E URI и атрибуцию материалов.
- [ ] Реализовать Node-only Product export и базовую общую проверку/per-skill
  digest из 2.3 уже здесь: runtime ниже не должен ждать этапа 3. `stageResources`
  копирует весь `packages/product/skills/` в `resources/loginom/skills/` **до**
  inventory manifest. Electron-builder уже включает `resources/loginom`;
  добавлять второй путь поставки не нужно. Генерируемый docs bundle добавится
  отдельным TDD-циклом этапа 2 до финальной инвентаризации.
- [ ] Во всех режимах runtime — managed `user-v1`, classic и diagnostic,
  используемых приёмкой, — заменить `createSkillLoader(skillTransport(config))`
  на локальный `<resources>/skills/loginom-automation`. Файлы проходят
  `verifyResources`; `skillRevision` — единый per-skill digest (64 hex),
  `skillPath` — локальная директория. Сетевого чтения Skills API нет.
- [ ] Managed prepare больше не повторяет статические инструкции, перенесённые
  в SKILL.md. Сохранить `compactKnowledgeBundle`, `input_artifacts`, identities,
  readiness и динамические descriptions. Закреплённый action catalog загружается
  независимо: это данные runtime, не источник текста skill.
- [ ] В `diagnostics.mjs` заменить удалённый manifest локальной проверкой;
  недоступный Skills API не ухудшает `ok`. Переписать `prepareTool.description`,
  MCP-инструкции и выдачу SKILL.md в `bridge.mjs`, тексты `hermes-router.mjs`,
  `host-inputs.mjs`, bootstrap-фразу «then follow its verified instructions».
  Явно сообщать: браузерные Loginom-инструменты доступны после активации
  `loginom-automation`.
- [ ] Отключить новые публикации из этого repo: удалить старую копию и
  `services/loginom-ai/deploy/loginom-dock/publish-skill.py` либо оставить скрипт,
  который только отказывает с объяснением. Общий серверный Skills API сохранить.
  Обновить `tools/loginom-acceptance/audit.py`, `replacement_session_evidence.py`
  (старый путь `skill-<revision>/SKILL.md`), `docs/migration/source-map.json`
  и `services/loginom-ai/docs/loginom-dock/`. `verify-source-search.py`
  проверяет источник справки `ai-skills`, его не менять. Существующую запись
  на сервере пока не удалять: для этого отдельный этап 9.
- [ ] На промежуточном dev-этапе добавить в `.loginom-ai-agent/loginom-ai-agent.jsonc`
  `"skills": { "paths": ["packages/product/skills"] }`. Путь разрешается от
  каталога сессии, поэтому мост работает при открытом корне repo. Это временное
  обнаружение исходников, не доверенный bundled grant; удалить мост на этапе 3,
  когда включаются manifest-only discovery и запрет зарезервированных имён
  из других источников. Дедупликация — по realpath.
- [ ] Статический тест разместить в `packages/agent/test/skill/bundled-skills.test.ts`:
  он использует настоящий `ConfigMarkdown.parse` и не создаёт цикл Product → Core.
  Проверить допустимые поля frontmatter (`name`, `description`, `license`,
  `allowed-tools`, `metadata`, `compatibility`), имя до 64 символов: строчные
  буквы/цифры/дефисы, без крайних/двойных дефисов, совпадает с каталогом.
  Description непустой и до 1024, compatibility до 500 символов.
  Проверить ссылки в SKILL.md/references, исключив только объявленные generated
  файлы до сборки, и совпадение каталогов с зарезервированными именами Product.
  Ошибки объясняют исправление. `skills-ref validate` не делать зависимостью CI;
  допустима разовая сверка версии по SHA с записью результата.
- [ ] Runtime-тесты: локальный источник во всех режимах, отсутствие обращений
  к `/api/v1/skills`, missing/tampered skill → локальная ошибка prepare,
  diagnostics без удалённого manifest. Использовать настоящие bundle/внутренние
  модули и заглушки только внешних MCP/browser границ; перенести fixtures
  `client/test/support/{bridge-contract,package-cleanup-bridge}.mjs`.
  Покрыть `skill`, `bridge`, `diagnostics`, `workspace`, `user-results`,
  `managed-resources-links`, `resources` и staging.

**Готово, когда:** по одной записи `loginom-automation` и `package-docs`, команды
`/loginom-automation` и `/package-docs` обнаруживаются через временный dev-мост,
staging доставляет ресурсы, runtime не обращается к Skills API, статический
тест проходит. Нет `loginom-scenario`, `/loginom` или alias `/package_docs`.
Полная доверенная активация профилей появляется в этапах 3 и 5.

### Этап 2. Генератор на Node и ограниченный package_docs_run

**Создать:** `packages/loginom-host/src/package-docs/{extract,skeleton,emit,cli}.ts`,
`packages/loginom-host/script/build-package-docs.ts`,
`packages/loginom-host/test/package-docs.test.ts`,
`packages/agent/src/tool/package-docs.ts` и его поведенческие тесты.
Инструмент добавлять только в `SessionTools.resolve` для `package-docs`,
не регистрировать в общем `tool/registry.ts` и не проводить через `loginom.call`.

```ts
type PackageDocsRun =
  | { operation: "extract"; lgp: string }
  | { operation: "skeleton"; lgp: string }
  | { operation: "emit"; lgp: string; format?: "pdf" | "docx" | "md" }
```

Пути выбирает backend, не модель. Рабочий каталог:
`<каталог сессии>/.work/package-docs/<stem>-<8 hex от realpath>/`.
В нём находятся `structure.json` и `report.md` со скелетом. Модель заполняет
черновик обычными инструментами записи; `emit` проверяет обязательные разделы
и отсутствие любого `PLACEHOLDER_*`. По умолчанию формат PDF.
Итог: `<каталог сессии>/<stem>.lgp_report.<ext>`; при коллизии `-2`, `-3` и далее.
Временный файл создаётся в том же каталоге и публикуется эксклюзивно, без
перезаписи существующего. Ответ содержит фактический путь или явную ошибку.

- [ ] Авторизовать чтение: путь вложенного `.lgp` из настоящих user messages
  этой сессии уже разрешён пользователем; одного пути от модели недостаточно.
  Для пути из текста применить `read`/`external_directory`. Desktop/TUI показывают
  запрос, standalone `run` автоматически отклоняет его и советует `--file`.
  Запись проходит `ctx.ask({ permission: "edit", ... })`; запреты пользователя
  и агента `plan` сохраняются. Всё пишется внутри session directory (`--dir`),
  `--auto` не нужен.
- [ ] Запускать `<resources>/bin/node` с проверенным
  `skills/package-docs/scripts/package-docs.mjs`: фиксированный argv массивом,
  без shell, `cwd` — каталог сессии, минимальное окружение, timeout и AbortSignal.
  Проверить integrity перед исполнением по 2.3. Произвольные output/script/
  executable параметры модели не принимать. Не требуется Loginom lease/браузер.
- [ ] Собрать TS через `Bun.build({ target: "node" })` по образцу `build-node-host.ts`.
  `stageResources` кладёт bundle в skill до inventory. Шрифты искать от
  `import.meta.url` (`../assets/fonts`). Metafile передать в
  `collect-build-notices.ts`, Golos OFL включить в `THIRD_PARTY_NOTICES`.
- [ ] ZIP — прямая зависимость `loginom-host` на имеющуюся `@zip.js/zip.js` 2.7.62,
  XML — `@xmldom/xmldom` с закреплённой версией. Перенести собственные писатели
  PDF/DOCX на Node и `node:zlib`, включая subset TTF, Identity-H и ToUnicode;
  отдельные PDF/DOCX библиотеки, LibreOffice и Chromium не нужны.
  Сохранить ZIP-имена без учёта регистра и разделители `/` и `\`.
- [ ] Сначала отдельные TDD-циклы паритета: нормализованный `structure.v1`,
  skeleton без локального времени, текст PDF через ToUnicode, `word/document.xml`.
  Fixtures: простой пакет, подмодели, кириллица. Не сравнивать байты ZIP/PDF.
  Затем отдельные тесты нового поведения, не использующие ошибочный Python
  как oracle: placeholders обязательно запрещают выпуск; рекомендуются явная
  ошибка отсутствующего индексированного Unit.xml и полная статистика либо
  пометка усечения. Если последние два пункта отложены, записать ограничения.
- [ ] В SKILL.md заменить `python3` на `package_docs_run`, указать каталог
  сессии для вывода, сослаться на шрифты/OFL и объявить generated bundle в
  `metadata`. Скрипт остаётся обычной Node-программой для совместимых клиентов,
  но продуктовый агент использует ограниченный инструмент.
- [ ] Проверить отмену/timeout, read-only/plan, существующий итоговый файл,
  плохой вход/шрифт/скелет, неизменность SHA-256 `.lgp` и отсутствие ложного
  готового отчёта после ошибки. В CI проверять `%PDF`, русский текст/ToUnicode
  и `word/document.xml` без poppler; эталон визуально проверить вручную.

**Готово, когда:** все три формата создаются без системного Python/Node,
в session directory, исходный `.lgp` и старые отчёты не изменяются,
пользовательские запреты соблюдаются, ошибки не оставляют готовый на вид файл.

### Этап 3. Bundled-источник в Desktop и standalone CLI

**Файлы:** `packages/product` export `./skills`,
`packages/agent/src/{effect/runtime-flags,skill/index,command/index}.ts`,
`packages/agent/src/cli/{standalone-bundle,standalone-run}.ts`,
`packages/agent/src/cli/cmd/tui.ts`, `packages/desktop/src/main/server.ts`,
`packages/loginom-host/src/cli-manifest.ts`,
`packages/desktop/scripts/release/verify-artifact.ts` и целевые тесты.

- [ ] Довести 2.1–2.3: один проверенный resource root через `createSidecarEnv`
  и standalone launcher/worker, manifest-only discovery, `source/digest`,
  последовательный порядок, realpath-dedup. Базовые staging/integrity из этапа 1
  переиспользовать. `LOGINOM_AI_AGENT_CLI_BUNDLE` не отключает эту проверку.
- [ ] Запретить зарезервированные/устаревшие имена из всех прочих skill-источников
  и коллизии config/MCP-команд; предупреждение видно пользователю.
  Одинаковое правило действует для skill, slash и `run --command`.
  Одноимённая локальная копия не заменяет встроенную даже как `default`.
- [ ] Удалить временный `skills.paths` мост. Для dev использовать staged root.
  Новый skill — новая папка в Product и зелёный статический тест; список
  зарезервированных имён обновляется согласованно, staging/manifest и обязательные
  ресурсы выводятся из каталога и метаданных, не отдельного списка копирования.
- [ ] Проверить адресацию ресурсов в `run` и TUI. `serve/web/acp/attach/mcp`
  не входят в standalone и не требуют дополнительных путей этой итерации.
- [ ] Проверять обязательные ресурсы общей функцией 2.3 в Desktop DEB/AppImage
  и CLI payload. AppImage всегда собирается `package:linux` и статически
  проверяется release workflow; проверка DEB не заменяет его проверку.
  Чистый установленный запуск AppImage не покрыт Docker-матрицей и отмечается отдельно.
- [ ] Проверить отсутствие/изменение/неучтённый файл, неверный root, обход через
  CLI_BUNDLE, локальные reserved/obsolete skills/команды, порядок обычных sources,
  работу в пустом каталоге вне git с чистыми отдельными profiles/HOME.
  Чистый HOME нужен: поиск вверх вне git доходит до `/`.
- [ ] Зафиксировать каноническое правило в `packages/product/AGENTS.md`
  (каталог, общий staging Desktop/CLI, имена, integrity, добавление новой папки),
  добавить ссылку в модульную карту корневого AGENTS.md. Browser entrypoint
  Product не импортирует Node-only export.

**Готово, когда:** установленные Linux Desktop, `run` и TUI находят обе записи
с `source: bundled` вне repo; повреждённый или одноимённый внешний skill не
заменяет их. V2 (`LOGINOM_AI_AGENT_SIDECAR_V2=1`) не входит в критерий готовности:
CLI его не использует, отдельная V2-регистрация не требуется этому плану.

### Этап 4. Справка и подключение без Chromium

**Создать:** `packages/loginom-runtime/src/knowledge-entry.mjs`,
`client/lib/knowledge-client.mjs`, runtime `test/knowledge-entry.test.mjs`
и `packages/loginom-host/test/knowledge.test.ts`.
**Изменить:** Host `host/host-port/adapter/supervisor/node-entry/node-client`,
`connection/connection-service.ts`, runtime `managed-entry/connection-check`,
`packages/agent/src/cli/standalone-run.ts`, общие схемы Loginom View/Validation,
настройки Desktop/CLI, уведомления и i18n.

- [ ] Реализовать 2.6: knowledge только с API key, без Playwright/пароля,
  отдельный от браузера lifecycle. Переиспользовать `StreamableHTTPClientTransport`,
  Bearer c `redirect: error`, `connectRemote/readCatalog`; схемы Help брать
  из настоящего каталога, prepare descriptor — статический.
- [ ] Удалить browser readiness и маршрутизацию справки через runtime чата.
  Help всегда идёт в knowledge, диагностика остаётся безбраузерной; остальные
  Dock-инструменты требуют разрешённый runtime чата. `tools` браузер не создаёт.
- [ ] Отделить локальное создание run/scope от успешного connection lease:
  сейчас `acquire` требует `phase: ready`, и при отказе backend теряет даже
  Help/diagnostics. Без настройки должны оставаться каталог и диагностика,
  а ошибки доступа приходить на конкретной операции. Credentials/generation
  lease для внешней операции получать лениво, сохраняя recovery и изоляцию.
- [ ] Разделить локальный startup ack и фоновую knowledge readiness:
  `host.settled()`/handshake больше не ждут сеть и loginBrowser. При этом
  `phase: ready` наступает только после чтения Help catalog. Бюджет 180 с в
  `node-client.ts` оставить верхней границей; сохранить восстановление URL как есть.
- [ ] Разделить validation/save: успешный Help key позволяет сохранить настройки,
  неудачный веб-вход даёт отдельное предупреждение. Обновить View/Validation
  и `settings-loginom-state.ts`, мастера обоих продуктов, готовность и
  `loginom status`: Help-ready и browser `unknown/verified/failed` показываются
  отдельно через i18n. При изменении публичного Protocol/HttpApi выполнить
  штатную генерацию клиента/SDK, generated-файлы не править вручную.
- [ ] В standalone `run` до модели оставить обязательным только strict recovery
  (код 4). Убрать обязательный `hasApiKey/ready` для естественного запроса,
  пока профиль неизвестен. Для `--command loginom-automation` ранняя проверка
  ключа и готовности Help сохраняется. TUI preflight не менять: обязательные
  проверки сейчас применяются только к `run`.
- [ ] Сохранить exit-контракт ленивых отказов: если run не дал результата
  из-за продуктовой конфигурации/подключения — 2 `LOGINOM_CONFIG_REQUIRED`
  или 1 `LOGINOM_CONNECTION_NOT_READY`, как раньше. Обычный чат без Loginom
  работает. Обновить правило mandatory preflight в `packages/agent/AGENTS.md`
  и progress standalone CLI design.
- [ ] Проверить конкурентную справку двух чатов, отмену только своего request/run,
  смену поколения и cleanup. Help-ошибки не создают uncertain mutation records,
  credentials не пересекают поколения, knowledge IPC не содержит пароль.
- [ ] TDD-проверки старта и сохранения: нет Chromium при старте/каталоге/Help,
  впервые настроить Help можно при недоступном Loginom, browser login failure
  предупреждает, локальный startup завершается без сетевого ожидания; lazy
  CLI ошибки сохраняют коды и не превращают обычный ответ в ошибку.

**Готово, когда:** отчёт работает при доступном Help и недоступном веб-сервере,
включая первую настройку; каталог и диагностика доступны без готового браузера.
Смена поколения, отмена, секреты и результаты проверки подключения соблюдают
раздельные контракты knowledge/browser.

### Этап 5. Профиль задачи и вложения

**Файлы:** `packages/agent/src/session/{prompt,tools,compaction,message-v2,session}.ts`,
новый `task-scope.ts`, `tool/{skill,task,package-docs}.ts`, `command/index.ts`,
`cli/cmd/run.ts`, Host `adapter/host-port/inputs`, `packages/core/src/fs-util.ts`,
`packages/tui/src/component/prompt/local-attachment.ts`, путь TUI `@`-упоминаний,
Desktop renderer picker при оптимизации чтения пакета.
**Тесты:** `agent/test/session/task-scope.test.ts`, `prompt.test.ts`, CLI file input,
TUI local attachment, HostPort/admission и продуктовый executor.

- [ ] Реализовать чистый вывод профиля, доверенные activation/replay metadata
  и переходы 2.4. Полная история с учётом revert/fork, compaction-only,
  synthetic continuations, shell/subtask и overflow-replay. Slash-команда
  сохраняет activation для restart. Старые сессии начинают с `default`.
- [ ] Применить явные наборы 2.5 в resolve и execute, проверяя происхождение
  инструмента и обычные permissions. `task` скрыт и отклоняется в обоих
  продуктовых профилях; одноимённый plugin/MCP не обходит allowlist.
  `package_docs_run` существует только в docs-каталоге, не в общей registry.
- [ ] Приватный `scope` действует на имеющемся run. При активации проверить
  pending-переход, учитывая предыдущие pending-запросы той же пачки;
  повторно проверить безопасность на следующей границе, затем применить и
  записать окончательную activation. Отказ не оставляет ложный grant в истории.
  Все вызовы текущего хода проверяются по прежнему
  снимку. Добавить Host-контракт текущего `activeWork/hasUnsettledWork` и
  recovery-состояния: переход в docs не обходит незавершённую операцию.
  Ошибочный/stale инструмент отклоняется до runtime, журнала и upload.
- [ ] Удалить eager `admit` из `SessionTools.resolve`. Сканировать настоящие
  user messages сессии на ещё не загруженные `data:`-вложения с исходным
  message ID; replay сводить к этому ID, а не допускать повторную загрузку.
  Исключить `.lgp` по MIME/расширению, включая старые `data:`-части из истории.
  CSV, приложенный до просьбы построить сценарий, сохраняет право на admission.
- [ ] Зафиксировать порядок первого разрешённого prepare в
  `loginom-automation`: проверка scope → создание runtime → admission исходных
  байтов → workspace preparation/ответ prepare с `input_artifacts`.
  Это одна сценарная подготовка; отдельный admit не должен стартовать браузер
  раньше разрешённого prepare. Последующие сценарные вызовы доставляют новые
  вложения перед операцией. Help и `loginom_dock_diagnostics` никогда не
  вызывают admission. Неподготовленный chat-runtime требует prepare,
  остальные Dock-вызовы его молча не создают.
- [ ] `run --file x.lgp` создаёт `file:`-часть с абсолютным путём и MIME
  `application/x-loginom-package`, включая `LOGINOM_AI_AGENT_CLI_ROOT`.
  Убрать кодирование `.lgp` в `data:`; согласовать MIME в `fs-util.ts` и
  распознавание в prompt. Прикреплённый путь — разрешение на чтение, не upload.
- [ ] В TUI вставка пути и `@`-упоминание `.lgp` создают такую же `file:`-часть.
  TUI не имеет `--file`/`--command`; тестировать реальные способы прикрепления.
  Желательно перевести native picker Desktop для `.lgp` на передачу только
  пути без чтения байтов в renderer и зависимости от общего лимита 20 MiB;
  если отложено, явно указать этот предел Desktop.
- [ ] Сохранить V1-поведение нового сообщения во время работы: сообщение
  сохраняется, текущий вызов не прерывается, следующий цикл начинает новую
  задачу с `default`; проверить гонку с выходом из цикла. «Очередь V2» сюда
  не переносить. Открытый браузер и recovery state сохраняются.
  Каталог provider-turn живёт в backend; клиентам не требуется рассылка
  каталога инструментов, они кэшируют только список slash-команд.
- [ ] При «построй, затем задокументируй» сначала закончить построение и сообщить
  путь пакета в Loginom. Попросить пользователя приложить локальный `.lgp`,
  затем активировать docs. `dock_artifact_deliver` — загрузка в Loginom, не
  download. Если `.lgp` уже предоставлен локально, документировать только этот
  подтверждённый файл, не выдавать старый файл за новый серверный результат.
  Из docs строить можно лишь новым пользовательским запросом.
- [ ] Проверить все переходы, pending activation в одной пачке tool calls,
  начало новой операции после pending docs и отказ при повторной проверке,
  публичную подделку metadata, restart/slash/fork/revert, compaction/replay,
  запрещённый `task`, plugin impersonation и Host scope denial.
  `.lgp` + PNG не вызывают admit/runtime; ранний CSV загружается один раз
  при будущей сценарной работе; diagnostics ничего не загружает.
  `emit` в агенте `plan` отклоняется разрешением `edit` с понятной ошибкой.

**Готово, когда:** ограничения применяются в backend и Host до побочных действий,
`.lgp` проходит локальным путём во всех трёх интерфейсах, восстановление истории
не теряет и не расширяет профиль, а построение не начинается внутри docs-задачи.

### Этап 6. Проверить автоматический выбор и полный результат

**Создать:**
`packages/loginom-host/script/skills-acceptance.ts`,
`packages/loginom-host/test/fixtures/skills/prompts.json`,
безопасные `.lgp` fixtures и ожидаемые факты отчётов рядом с ними.
**Использовать:** настоящий backend transport Desktop, standalone CLI `run`,
worker TUI и изолированные профили.
Scripted `oracle-provider.ts` оставить для механики; не выдавать его результаты
за проверку выбора настоящей моделью.

- [ ] Добавить обычные автоматические тесты границы профиля, slash-команды, catalog,
  attachment admission, недоступного Help и полного extract → skeleton → emit.
  Эти проверки должны быть детерминированы и работать без внешней модели.
- [ ] Для естественной активации подготовить 20 русских запросов: 10 про docs,
  5 про создание/изменение сценария, 5 справочных/обычных отрицательных случаев
  для automation («что делает узел…», «как настроить…», обычный разговор).
  Последние должны оставаться в `default`. Это продуктовые routing fixtures,
  не изменение общего near-miss корпуса. Использовать разные формулировки.
- [ ] Обязательные случаи: локальный `.lgp`; вложенный `.lgp`; `.lgp` + PNG;
  путь с пробелами/кириллицей; отсутствующий файл; отсутствующий путь;
  «текущий сценарий» без локального артефакта; build → docs в одном чате;
  составной запрос с запросом локального файла после build; `/package-docs`;
  `/loginom-automation`; docs → build запрещён в той же задаче и разрешён
  новым пользовательским сообщением; обычный вопрос
  без настройки Loginom. Команды проверять через Desktop/TUI и CLI
  `run --command loginom-automation` / `run --command package-docs`; естественный запрос
  проверять отдельно, поскольку явная команда не доказывает выбор модели.
- [ ] В CLI проверить `--file`, в TUI — вставку пути/`@`, в Desktop — вложение
  и путь. Для внешнего текстового пути в `run` ожидать permission refusal с
  подсказкой `--file`, для Desktop/TUI — штатный запрос разрешения.
  Итог проверять в каталоге сессии/`--dir`, не рядом с исходным пакетом.
- [ ] Запустить каждый естественный запрос по три раза на закреплённой основной
  модели продукта отдельно через Desktop и standalone `run`. В TUI проверить
  discovery, slash-команды, вложения и смену задачи; длительную повторную
  модельную матрицу не дублировать без причины. Отдельно выполнить короткий smoke на второй поддерживаемой
  модели. Записать точные model ID/variant и исходные запросы в отчёт приёмки.
- [ ] Для каждого запуска собрать: фактическую активацию skill, tool calls,
  события запуска Chromium, upload/admission и результат. Одного финального
  текста «отчёт готов» недостаточно.
- [ ] Для успешного docs-кейса проверить существование и открытие документа,
  его факты относительно fixture, отсутствие placeholders и неизменность `.lgp`.
  Для случая без входа проверить правильный запрос данных и отсутствие отчёта.
- [ ] Критерий выпуска: все обязательные кейсы проходят каждый из трёх прогонов;
  ноль браузерных побочных действий в docs; ноль случаев ложного объявления
  отчёта готовым. Если выбор нестабилен — корректировать description/инструкции
  и повторять на новых формулировках, не снижать критерий после получения результатов.

**Готово, когда:** проверены и выбор реальной моделью, и технические ограничения,
и готовый документ. Успех ограниченного набора прогонов не объявляется
математической гарантией классификации любых будущих запросов.

### Этап 7. Проверить регрессию после калибровки на закреплённом harness

**Зачем:** перенос инструкций и отложенный старт браузера не должны ухудшить
создание пакетов. Проверка открытия документа и scripted LLM этого не доказывает.

**Зависимость:** завершённая near-miss калибровка и принятый общий промпт судьи
из соседней сессии. До неё продолжать независимую разработку продукта и локальные
тесты. Baseline CLI уже сохранён на этапе 0; candidate собрать и сохранить
после изменений продукта. Оба живых прогона выполнить только после этой зависимости.

Harness первоначально исследовался на `91984c36d`, к ревью дошёл до
`f4fe42248`; обе отметки исторические, не pin приёмки. Перед запуском уточнить
принятый SHA, включающий калибровку и согласованные доработки ниже,
создать собственный отдельный detached worktree ровно на нём.
Не запускать эту приёмку из `/home/kiselev/git/loginom-ai-agent` или рабочего
дерева `calibration-near-miss`, где продолжается другая работа. Подключать
сохранённые CLI через `EVAL_CLI_MODE=binary` и абсолютный `EVAL_CLI_BIN`;
`source` запустит исходники harness worktree вместо испытуемой сборки.

При ревью было три core-задачи в `evals/tasks` и 35 analytic-задач в
`/home/kiselev/git/agent-validation/sources/analytic-evals`. У analytic есть
`oracle.csv`, `reference.lgp` и `acceptance.json`, но нет разметки `axis`.
Core имеет разметку осей, но без CSV oracle. По документу ревью внешний
`agent-validation` уже закоммичен как `d5fb803`. Старое описание dirty дерева
`0ad81c691` и прежние loader hashes не использовать. В этапе 0/перед приёмкой
заново вычислить `agent_inputs_hash` (включая task prompts/agentPromptTail/входы)
и `rubric_hash` выбранного неизменного снимка; записать их в manifest.

Это историческое описание исходных данных, а не результат live evals. Перед
приёмкой заново проверить состав и хэши snapshot, его совместимость с принятой
калибровкой и доступные функции закреплённого harness. Если состав сохранится,
парная матрица 35 × 3 × 2 потребует 210 модельных попыток и отдельных вызовов judge.

- [ ] Проверить завершение калибровки по её отчёту: принятый SHA, общий промпт,
  модель/reasoning судьи, хэши корпуса/рубрик и отсутствие незавершённой правки,
  необходимой для приёмки. Не угадывать новый SHA по прежнему значению из плана.
  Создать собственный worktree harness на выбранном commit; закреплённые файлы
  в нём не редактировать и не обновлять до завершения пары.
- [ ] Оформить необходимые изменения harness отдельной согласуемой задачей
  с владельцем `calibration-near-miss`: отдельные коммиты направления `evals`
  в собственном worktree, без одновременной правки общих файлов. Принять их
  **до обоих live прогонов**, не до сохранения baseline CLI. Требуются:
  preflight без обязательного remote `dockSkillRevision` (проверка `/health`
  остаётся); source/revision из фактического prepare; имя активированного skill
  в `run.json` и раздельные причины «не выбран automation»/«пакет не построен»;
  классификация ленивых Host connection errors по правилу ниже.
  Новый harness обязан поддерживать сохранённый старый baseline CLI:
  его legacy prepare/remote source фиксируются как ожидаемый путь, не выдавать
  отсутствие нового skill-вызова за инфраструктурную ошибку.
- [ ] Закрепить окончательный harness SHA после этих изменений и принятой
  калибровки. Если они меняют judge prompt/schema/код формирования, получить
  подтверждение калибровки этой версии до пары. Продуктовые TDD-циклы
  продолжаются независимо, соседний checkout и ветку не редактировать.
- [ ] Проверить доступность Loginom/Dock/Help и судьи, общие лимиты и возможность
  одновременной работы со стендом. Собственные каталоги не гарантируют изоляцию
  серверных пакетов/учётной записи. При общем изменяемом состоянии или исчерпанных
  лимитах согласовать окно запуска, использовать отдельные пространства пакетов
  либо выполнять последовательно. Не обходить чужие блокировки и не завершать
  чужие процессы. Калибровка может быть закончена, а её инфраструктура ещё занята.
- [ ] Повторно проверить сохранённый baseline из этапа 0 и candidate по manifest
  и checksum, без пересборки и подмены установленного launcher. Записать SHA
  исходников и бинарников, полный CLI manifest и resource/skill revisions каждой
  сборки; различия продукта — предмет сравнения, остальные условия общие.
- [ ] Для обоих прогонов закрепить один harness SHA, lockfile/среду harness,
  один общий промпт судьи и код его формирования, модель/variant агента,
  модель/reasoning судьи, таймауты/пороги/repeat/параллелизм, версии Loginom,
  внешнего Dock/action catalog и один снимок задач. Сохранить хэши промпта,
  корпуса калибровки, рубрики, входных данных и всех значимых настроек в manifest
  приёмки рядом с результатами. Закрепить также judge schema. Фактические
  per-attempt PROMPT.md сохранять, но они содержат разные артефакты и не обязаны
  иметь одинаковый хэш. Секреты в manifest не включать.
- [ ] Выделить собственные `EVAL_RESULTS_DIR`, `EVAL_PROFILE_DIR`,
  `EVAL_WORKSPACE_ROOT` и каталоги артефактов вне обоих соседних worktree.
  Baseline/candidate получают отдельные profiles/workspaces и run directories
  внутри нашего results root. Не копировать и не менять чужие `.env`, результаты,
  профили, launcher или lock-файлы. Сначала запустить сохранённый baseline,
  затем candidate на тех же закреплённых условиях.
- [ ] Зафиксировать отдельный снимок suite и входных файлов с checksum manifest.
  Текущее содержимое внешнего каталога может включать незакоммиченные кейсы;
  не считать его неизменным только по Git SHA. Список кейсов должен совпадать
  между baseline и candidate. Не менять задачи, эталоны или judge после
  получения результатов кандидата ради прохождения проверки.
- [ ] Перед каждым прогоном и перед compare проверить неизменность manifest
  условий. Если изменились harness, промпт, модель, параметры, стенд или snapshot,
  пометить пару несопоставимой и не делать вывод о регрессии. Сохранить старые
  результаты отдельно; после повторной фиксации условий выполнить новую пару
  теми же сохранёнными CLI, а не только повторить одну сторону.
- [ ] Сначала прогнать небольшой представительный smoke (импорт, преобразование,
  соединение/агрегация, подмодель, сохранение), затем весь выбранный набор
  построения с одинаковым заранее записанным числом повторов, минимум три.
  Покрытие возможностей подтверждать содержимым задач, а не только их названиями.
- [ ] Проверять построенный `.lgp`, ожидаемые узлы/связи/параметры и фактические
  выходные данные. Если checklist suite не размечен `axis`, поле
  `structural_score` не использовать как доказательство структуры; добавить
  отдельную проверку графа/настроек по эталону через доступный verifier.
  Для analytic использовать `acceptance.json` и проверенный
  `/home/kiselev/.agents/skills/loginom-eval-case/scripts/check_reference.py`
  либо отдельный адаптер в нашей тестовой инфраструктуре; зафиксировать версию
  проверяющего кода. Не редактировать harness, near-miss корпус и judge prompt
  в рамках этой проверки.
  Если используется `check_reference.py`, закрепить копию его scripts с хэшами
  и отдельный `LOGINOM_EVAL_CASE_ENV`, где `AGENT_REPO` указывает на наш harness
  worktree: helper импортирует oracle из этого repo. Не использовать его
  глобальную настройку, ведущую в изменяемое соседнее дерево, и не менять её.
  Тестовый Python допустим в окружении приёмки, но не является зависимостью
  установленного продукта.
- [ ] Отдельно повторно открыть сохранённый пакет в новой сессии и выполнить
  его с исходными данными; сравнить результат с oracle. Существующий harness
  сам по себе не доказывает такое повторное выполнение. Разработку недостающей
  проверки вести отдельными TDD-циклами в наших адаптерах, читающих артефакты
  harness. Если необходима доработка самого harness, оформить отдельную
  согласуемую задачу с владельцем и исключить одновременную правку общих файлов.
- [ ] Сравнить baseline/candidate штатным compare: результат по каждому кейсу,
  проходы/провалы, доступные оси, время/вызовы и ошибки инфраструктуры.
  Seed живой модели в текущем harness не настраивается; записать это ограничение,
  не обещать побитовую воспроизводимость и использовать повторы.
- [ ] До прогонов записать допуск на дополнительный provider-turn активации
  skill перед prepare и рост количества вызовов. Изменённые продуктовые
  source/skill digest — предмет A/B; предупреждение compare о `skill_revisions`
  ожидаемо, явно объяснить в отчёте. Оно не разрешает менять внешний action
  catalog, стенд, judge или входы между сторонами.
- [ ] Все обязательные детерминированные проверки и контрольные построения
  должны проходить. Любое новое падение построения/сохранения/повторного
  выполнения относительно baseline разобрать до приёмки. Инфраструктурные
  ошибки означают неполный прогон, а не успешный кейс. Причину отличать от
  регрессии по структурированным ошибкам и наблюдаемым условиям; отсутствие
  первого успешного Loginom-вызова само по себе не доказывает infra.
  Статистический verdict трактовать с его доверительными интервалами
  и заранее закреплёнными параметрами, не как гарантию отсутствия регрессий.
- [ ] Ленивый отказ внешнего подключения Host до первого успешного Loginom
  может считаться infra даже после хода модели, если подтверждена внешняя
  причина по согласованному набору ошибок. Scope/integrity/config/runtime
  дефекты продукта не переводить автоматически в infra. С `f4fe42248`
  harness сам делает один infra retry и хранит `infra_retry.initial`, compare
  учитывает историю. Сохранить этот предел и не делать выборочные ручные
  повторы поверх него; оставшаяся infra оставляет приёмку неполной.
- [ ] Для analytic требовать артефакт, обязательные пункты checklist, принятый
  порог score и `oracle_pass=true`; одного `completed` недостаточно.
  Не использовать `--skip-judge` в финальной приёмке: он отключает также oracle.
  Стабильные baseline-кейсы (три прохода из трёх) выделить как блокирующий
  регрессионный набор; нестабильные и исходно падающие показать отдельно.
  Старые отчёты с другой моделью/рубрикой не подставлять вместо нового baseline.
  Регрессия стабильного кейса блокирует приёмку независимо от причины —
  выбор skill или построение. Разбивка нужна для анализа, не для исключения ошибок.
- [ ] До завершения принятой live A/B пары и необходимых повторов сохранять
  серверный `loginom-automation`: старый baseline продолжает читать его в
  prepare. Новый runtime/harness не требуют эту публикацию сами; они только
  фиксируют источник, фактически использованный соответствующим CLI.

**Готово, когда:** есть сопоставимые отчёты двух сборок, артефакты и результаты
повторного выполнения на одной принятой версии harness/судьи; условия пары
проверены и нет необъяснённых новых регрессий. Evals через CLI
проверяет общий сценарный runtime, но не заменяет Desktop-проверки интерфейса,
передачи вложений и установленной поставки из этапа 8.

### Этап 8. Проверить установленные Linux Desktop и CLI

**Файлы:** `.github/workflows/test.yml`, platform runbooks в
`docs/testing/loginom-ai-agent/`, новый отчёт реализации/приёмки.

- [ ] Включить формат skills, staging, Node pipeline и deterministic routing
  tests в обычный CI. Live-model проверки запускать отдельно с явной моделью
  и изолированным профилем; credentials не сохранять в отчёт.
- [ ] Собрать новые кандидаты в отдельные каталоги, без публикации. До release
  manifest зафиксировать build inputs по действующему регламенту проекта.
- [ ] Собрать Linux Desktop DEB/AppImage и полный standalone CLI tar.gz с общим staging,
  независимыми manifest и установленными launchers. Сборка одного backend
  `--standalone` без Node/runtime/skills не считается кандидатом CLI.
  Статически проверить оба Desktop-артефакта через общую integrity-функцию.
  AppImage всегда входит в `package:linux`; Docker-матрица не доказывает его
  установленный запуск, провести отдельный native smoke и отметить его результат.
- [ ] В изолированной Linux-среде установить оба кандидата, открыть пустой
  рабочий каталог без исходников и пользовательских skills. Для исполнения
  не требуются Python и глобальные Node/Dock. Проверить inventory и integrity.
- [ ] Выполнить матрицу ниже отдельно для Desktop, CLI `run` и TUI в применимых
  интерфейсах. Зафиксировать процессы Chromium до/после, tool calls, выходные
  файлы и их проверку; использовать настоящий транспорт каждого интерфейса.
  В Desktop отличать обязательный Chromium Electron от отдельного управляемого
  браузера Loginom. В CLI проверить docs с `--headless` и `--no-headless`:
  ни один режим не должен создавать браузер для документации.
- [ ] Добавить наблюдение процессов по `/proc` и `--user-data-dir` внутри
  профиля продукта, включая старт и Help, с учётом короткоживущих процессов.
  Готового счётчика launch нет; наблюдатель окон видит лишь X11 headed и не
  доказывает отсутствие headless Chromium. Electron учитывать отдельно.
- [ ] Через Desktop повторить контрольное построение с исходным CSV-вложением:
  подготовка, admission исходных байтов, выполнение, сохранение и повторное
  открытие пакета. Сравнить контракт с CLI штатным oracle-проходом; scripted
  oracle дополняет живые evals, но не заменяет их.
  Oracle сейчас добавляет `loginom_` ко всем именам и не может вызвать `skill`.
  Обновить вызывающие `runtime-acceptance.ts`, `desktop-cli-independence.ts`
  и transport: первым шагом идёт обычная активация `loginom-automation`, без
  подмены tool name и обхода новой границы прав.
- [ ] Проверить обновление каждого установленного продукта: profiles, настройки,
  история и пользовательские skills сохраняются. Одновременный запуск Desktop
  и CLI использует разные backend/профили; настройка и завершение одного
  продукта не меняют данные и процессы другого.
- [ ] Проверить root-владельца и режим 4755 у `chrome-sandbox`, `.writer` и
  `PROFILE_BUSY`, отказ второй записи в тот же profile. Обновление CLI —
  штатная остановка, удаление payload и новая установка с сохранением данных.
  Старые сессии без activation metadata начинают с `default` и повторно
  активируют automation для сценарной работы. `write-manifest.ts` должен
  отказывать на грязном source tree, а не маркировать его как чистый релиз.
- [ ] Проверить отмену, выход из TUI, SIGINT у `run`, потерю owner и cleanup
  браузера по действующему Linux runbook. Убитый Node без проверки дочерних
  процессов не доказывает освобождение Chromium.
- [ ] Записать SHA сборки, версии инструментов, выполненные команды, результаты
  матрицы и ограничения. Source-only результат не помечать installed acceptance;
  Linux-проверку не переносить на Windows/macOS.
- [ ] Обновить постоянные правила: `packages/product/AGENTS.md` — владелец
  каталога/зарезервированных имён/integrity и правила «новый skill — новая папка»,
  ссылка из корневой карты; `agent/AGENTS.md` — профиль, admission и lazy run;
  `loginom-host/AGENTS.md` — knowledge, ready и scope;
  `loginom-runtime/AGENTS.md` — локальный источник без сетевой загрузки;
  `desktop/AGENTS.md` — resource root в sidecar. По фактической приёмке обновить
  progress CLI design, Linux checkpoint и runbooks.

| Сценарий на установленной Linux-сборке | Desktop | CLI `run` | CLI TUI |
| --- | --- | --- | --- |
| Чистая установка, discovery обоих skills вне repo | Да | Да | Да |
| `default` без настройки Loginom и без Chromium | Да | Да | Да |
| Документация из локального `.lgp`, PDF/DOCX/MD | Все форматы | Все форматы | Один сквозной отчёт |
| Путь с пробелами/кириллицей, дополнительные вложения | Да | Да, через `--file` | Вставка пути и `@` |
| Help доступен, Loginom недоступен; ошибка Help | Да | Да | Smoke обеих ситуаций |
| Автовыбор docs/build; docs → build только новым запросом; локальный файл после build | Да | Да, включая продолжение session | Да |
| `/loginom-automation`, `/package-docs`, reserved names и источник skill | Да | Через `run --command` + естественный запрос | Да |
| Итог в session directory, коллизии без перезаписи, агент `plan` | Да | Да, внутри `--dir` | Да |
| Построение, сохранение и повторное открытие | Да | Да + evals | Smoke |
| Cancel/cleanup/resume, update и сохранение профиля | Да | Да | Да |

**Готово, когда:** Linux Desktop и standalone CLI прошли собственную установочную
приёмку, включая TUI. Неисполненные пункты остаются открытыми. Windows/macOS
явно отмечаются «не проверялись в этой итерации».

### Этап 9. Снятие серверной публикации после выпуска

Отключение publish-скрипта в этапе 1 не удаляет уже опубликованную запись
`viking://agent/skills/loginom-automation`. Старые клиенты и сохранённый baseline
продолжают её читать; до выполнения условий ниже запись остаётся доступной.

- [ ] Подтвердить выпуск приложения с локальным skill и отсутствие зависимости
  от серверной записи у всех поддерживаемых установленных версий. Завершить
  принятую live baseline/candidate пару и необходимые повторы; сохранённый
  старый CLI сам по себе эту зависимость не устраняет.
- [ ] До удаления предупредить владельца Loginom Dock: Codex/Hermes-плагины
  также читают этот URI в prepare. Учесть их совместимость, не менять
  репозиторий Dock в рамках этого плана. Сейчас никому сообщения не отправлять.
- [ ] Удаление серверной записи оформить отдельной командой **с явным
  подтверждением пользователя**, только после проверки зависимых клиентов.
  Не удалять общий Skills API, справку или источник `ai-skills`.

**Готово, когда:** совместимость подтверждена, отдельное удаление разрешено
и выполнено с проверкой результата. До этого этап остаётся открытым; выпуск
локального skill и тесты продукта не выдаются за снятие серверной публикации.

## 4. Команды основных проверок

Команды ниже запускаются из указанного каталога. Новые тестовые файлы появляются
на соответствующих этапах; это команды будущей реализации, не результаты аудита.

```bash
# packages/agent
bun test test/skill/bundled-skills.test.ts test/tool/skill.test.ts test/session/task-scope.test.ts
bun test test/skill
bun test test/session/prompt.test.ts --test-name-pattern 'package.docs|attached lgp'
bun test test/cli/profile.test.ts test/cli/standalone.test.ts test/cli/standalone-status.test.ts test/cli/standalone-proxy.test.ts test/cli/run-outcome.test.ts
bun typecheck

# packages/app
bun test --conditions=solid --preload ./happydom.ts ./src/components/prompt-input
bun test --conditions=solid --preload ./happydom.ts ./src/utils/server-compat.test.ts
bun typecheck

# packages/loginom-host
# LOGINOM_AI_AGENT_TEST_NODE задаётся абсолютным путём к закреплённому Node.
bun test test/package-docs.test.ts test/knowledge.test.ts test/stage-resources.test.ts
bun test test/host-port.test.ts test/host.test.ts test/parallel-calls.test.ts
bun test test/cli-manifest.test.ts test/cli-install.test.ts test/node-host.test.ts test/process.test.ts test/transport.test.ts test/inputs.test.ts test/recovery.test.ts
bun typecheck

# packages/desktop
bun test electron-builder.config.test.ts scripts/release/artifact.test.ts src/main/loginom
bun typecheck

# packages/product
bun test
bun typecheck

# packages/tui — новые проверки local attachment и @-упоминаний
bun test src/component/prompt/local-attachment.test.ts
bun typecheck
```

Добавить адресные тесты `run --file`, доверенных activation metadata,
compaction/fork/revert, настроек Help/browser и генератора в owning packages.
Точные имена новых файлов закрепить при реализации. V2-регистрацию не включать
в эту приёмку; при изменении общих Core MIME-правил выполнить их целевые проверки
и `bun typecheck` из `packages/core`.

Runtime `.mjs` проверять закреплённым Node, а не случайным `node` из `PATH`:

```bash
# packages/loginom-runtime/client
"$LOGINOM_AI_AGENT_TEST_NODE" --test test/skill.test.mjs test/diagnostics.test.mjs test/bridge.test.mjs test/workspace.test.mjs test/user-results.test.mjs test/managed-resources-links.test.mjs test/managed-shutdown.test.mjs

# packages/loginom-runtime
"$LOGINOM_AI_AGENT_TEST_NODE" --test test/resources.test.mjs test/connection-check.test.mjs test/start-input.test.mjs test/knowledge-entry.test.mjs
```

### Сборка и установленная приёмка Linux

Перед выполнением сверить [Linux runbook](../../testing/loginom-ai-agent/linux.md),
[standalone CLI runbook](../../testing/loginom-ai-agent/standalone-cli.md) и
[Linux checkpoint](../../migration/linux-implementation-checkpoint.md).
Абсолютные пути ниже — параметры будущего запуска; указать реально проверенные
Node/Chromium из release pins. Каждый output должен быть новым каталогом.
Полный baseline CLI собрать на этапе 0 из **собственного чистого detached
worktree** до изменений продукта в долговременный каталог, сохранить с manifest/ресурсами,
исходным SHA и checksum. Candidate собрать отдельно после реализации, не
перезаписывая baseline; оба комплекта должны оставаться доступными до конца
приёмки после калибровки. Сейчас команды приведены только как план.

```bash
# Отдельный исходный worktree; untracked документы в него не копировать.
skill_baseline_sha=fc3d97dbf695c2ed8dba942feb6fe83591a33944
skill_baseline_repo=/absolute/new-skills-baseline-worktree
git -C /home/kiselev/.codex/worktrees/2f7c/loginom-ai-agent \
  worktree add --detach "$skill_baseline_repo" "$skill_baseline_sha"
cd "$skill_baseline_repo"
bun install --frozen-lockfile
git status --porcelain
cd "$skill_baseline_repo/packages/loginom-host"
LOGINOM_AI_AGENT_CHANNEL=prod \
LOGINOM_AI_AGENT_NODE_SOURCE=/absolute/pinned/node/bin/node \
LOGINOM_AI_AGENT_BROWSER_SOURCE=/absolute/pinned/browsers \
bun script/build-cli.ts /absolute/baseline-payload
bun script/verify-cli-candidate.ts /absolute/baseline-payload "$skill_baseline_repo"
```

До build убедиться, что source tree чист: установка зависимостей не должна
менять lockfile или source snapshot. Baseline хранить с архивом, без `--no-archive`.
Проверку source metadata выполнять относительно его собственного исходного
worktree, не будущего HEAD кандидата. Кандидат также собирать из зафиксированного
чистого состояния; неполный dev bundle не является релизной приёмкой.

```bash
# packages/desktop
LOGINOM_AI_AGENT_CHANNEL=prod \
LOGINOM_AI_AGENT_NODE_SOURCE=/absolute/pinned/node/bin/node \
LOGINOM_AI_AGENT_BROWSER_SOURCE=/absolute/pinned/browsers \
bun run build

bun run package:linux --x64 --publish never \
  --config.directories.output=/absolute/new-desktop-dist

# packages/loginom-host — полный CLI, включая resources и host
LOGINOM_AI_AGENT_CHANNEL=prod \
LOGINOM_AI_AGENT_NODE_SOURCE=/absolute/pinned/node/bin/node \
LOGINOM_AI_AGENT_BROWSER_SOURCE=/absolute/pinned/browsers \
bun script/build-cli.ts /absolute/new-cli-payload
bun script/verify-cli-candidate.ts /absolute/new-cli-payload /absolute/candidate-source-worktree
```

Desktop manifest создать через `scripts/release/write-manifest.ts` после
фиксации build inputs/source archive на чистом дереве; отказ на dirty source
не обходить. Артефакты DEB **и** AppImage проверить
`scripts/release/verify-artifact.ts` по указанному runbook. CLI builder сам
выпускает tar.gz, checksum и проверяет распакованный manifest. Установку,
обновление и удаление CLI проводить в отдельной Linux-среде, не заменяя текущий
пользовательский launcher и не меняя `HOME`/`CODEX_HOME` рабочей сессии.

```bash
# Установленный launcher в изолированной Linux-среде
LOGINOM_AI_AGENT_CLI_PROFILE=/absolute/test/profile \
/absolute/test/launcher run --format json --dir /absolute/empty-workspace \
  --model '<provider/model>' --file /absolute/demo.lgp \
  -- 'Напиши документацию по приложенному сценарию в PDF'

# Аналогичный проход через явную команду
LOGINOM_AI_AGENT_CLI_PROFILE=/absolute/test/profile \
/absolute/test/launcher run --command package-docs --format json \
  --dir /absolute/empty-workspace --model '<provider/model>' \
  --file /absolute/demo.lgp -- 'Создай PDF по приложенному пакету'
```

Использовать `packages/desktop/test/loginom/runtime-acceptance.ts` с
`LOGINOM_AI_AGENT_TEST_DESKTOP_EXECUTABLE` или
`LOGINOM_AI_AGENT_TEST_CLI_EXECUTABLE`; TUI выбирать через
`LOGINOM_AI_AGENT_TEST_CLI_INTERFACE=tui`, headed —
`LOGINOM_AI_AGENT_TEST_CLI_HEADED=1`. Проверку независимости продуктов выполнять
через `packages/loginom-host/script/desktop-cli-independence.ts`.
Перед запуском адаптировать oracle к штатной активации `loginom-automation`.

### Парный прогон evals

Эти команды выполнять после завершения калибровки и проверки её отчёта, при
наличии обоих сохранённых CLI. Подставить полный принятый SHA harness, заново
уточнённый перед приёмкой. Не подставлять автоматически исторический `91984c36d`
или исходный SHA ветки калибровки. Сверить актуальные аргументы CLI и конфигурацию
именно на выбранном commit.

Создать собственный detached worktree и отдельный долговременный каталог
приёмки; не запускать команды из соседних изменяемых checkout. В пределах пары
исходники harness и общий prompt остаются неизменными. Перед обоими прогонами
сделать один снимок финальных задач и рубрик, проверить его соответствие принятой
калибровке и сохранить хэши данных/корпуса/prompt/конфигурации в manifest приёмки.
Пример не копирует чужой `.env`: настройки стенда, авторизацию отдельных профилей
и исполняемый файл судьи задать для нашего запуска штатным способом.

```bash
set -euo pipefail

# Заменить оба значения до запуска; каталог ещё не должен существовать.
skill_eval_harness_sha='<FULL_ACCEPTED_POST_CALIBRATION_SHA>'
skill_eval_root=/absolute/new-skills-acceptance
mkdir -m 700 "$skill_eval_root"
skill_eval_harness="$skill_eval_root/harness"

git -C /home/kiselev/.codex/worktrees/2f7c/loginom-ai-agent \
  worktree add --detach "$skill_eval_harness" "$skill_eval_harness_sha"
cd "$skill_eval_harness"
bun install --frozen-lockfile
git diff --exit-code
git rev-parse HEAD
cd "$skill_eval_harness/evals"

mkdir -p "$skill_eval_root/artifacts/base" "$skill_eval_root/artifacts/candidate"
cp -a "$skill_eval_harness/evals/tasks" "$skill_eval_root/core"
cp -a /home/kiselev/git/agent-validation/sources/analytic-evals "$skill_eval_root/analytic"

# Перед продолжением записать snapshot/conditions manifest и проверить стенд/лимиты.
# Results root общий только для нашей пары; каждый run имеет собственный каталог.
export EVAL_RESULTS_DIR="$skill_eval_root/results"
export EVAL_AGENT_MODEL=openai/gpt-6-sol
export EVAL_AGENT_VARIANT=default
export JUDGE_MODEL=gpt-6-astra
export JUDGE_REASONING=high
export EVAL_TASK_TIMEOUT_MS=900000
export EVAL_JUDGE_TIMEOUT_MS=300000
export EVAL_PASS_THRESHOLD=70

# Свой стенд и закреплённый judge executable; сверить с config выбранного SHA.
export LOGINOM_URL='<URL_СОГЛАСОВАННОГО_СТЕНДА>'
export LOGINOM_USERNAME='<СВОЯ_УЧЁТНАЯ_ЗАПИСЬ>'
export LOGINOM_CONTAINER='<СОГЛАСОВАННЫЙ_КОНТЕЙНЕР>'
export LOGINOM_STORAGE_DIR=/absolute/assigned-loginom-storage
export LOGINOM_DOCK_BASE_URL='<URL_DOCK>'
export EVAL_ARTIFACT_SOURCE=docker
export EVAL_JUDGE_COMMAND=/absolute/pinned/codex

# Для штатного provider login: исключить унаследованный override harness.
unset EVAL_AGENT_PROVIDER_BASE_URL EVAL_AGENT_PROVIDER_API_KEY EVAL_AGENT_PROVIDER_MODEL_ID
export EVAL_AGENT_PROVIDER_ID=''
# LOGINOM_DOCK_API_KEY и LOGINOM_PASSWORD поступают из собственного защищённого
# окружения; значения не вставлять в пример, manifest, transcript или Git.

EVAL_CLI_MODE=binary \
EVAL_CLI_BIN=/absolute/baseline-payload/bin/loginom-ai-agent-cli \
EVAL_PROFILE_DIR="$skill_eval_root/profiles/base" \
EVAL_WORKSPACE_ROOT="$skill_eval_root/work/base" \
bun run src/run.ts --tasks "$skill_eval_root/analytic" --repeat 3 --label skills-base

EVAL_CLI_MODE=binary \
EVAL_CLI_BIN=/absolute/candidate-payload/bin/loginom-ai-agent-cli \
EVAL_PROFILE_DIR="$skill_eval_root/profiles/candidate" \
EVAL_WORKSPACE_ROOT="$skill_eval_root/work/candidate" \
bun run src/run.ts --tasks "$skill_eval_root/analytic" --repeat 3 --label skills-candidate

bun run src/compare.ts BASE_RUN_ID CANDIDATE_RUN_ID --margin 0.5 --confidence 0.95 --k 3
```

В `artifacts/base` и `artifacts/candidate` хранить соответствующие manifests,
checksums, ссылки на сохранённые полные CLI и результаты дополнительных
адаптеров. Артефакты попыток harness остаются внутри собственных run directories
в `EVAL_RESULTS_DIR`. Эти каталоги не совпадают с output калибровки, её profiles
и workspace. Не устанавливать CLI для evals поверх текущего launcher; абсолютный
`EVAL_CLI_BIN` должен указывать на сохранённый payload каждой стороны.

Модель/судья выше соответствуют конфигурации при первоначальном исследовании;
перед запуском согласовать их с принятой калибровкой. При необходимости выбрать
другую поддерживаемую пару до обоих прогонов и зафиксировать её; judge prompt,
модель/reasoning и параметры должны соответствовать принятому результату
калибровки. Новая конфигурация судьи не наследует её подтверждение автоматически.
Не наследовать случайные `EVAL_*`/`JUDGE_*` настройки текущего shell: проверить
эффективную конфигурацию, задать только собственные параметры и хранить её
версионированное описание без секретов. Зафиксировать версию/hash judge executable;
в текущем harness `EVAL_JUDGE_COMMAND` требует путь без пробелов. Отдельной
настройки prompt в этой версии нет: его источники закреплены SHA harness.

Перед baseline, candidate и compare сверить неизменность manifest условий
(harness SHA, общий prompt/schema и код формирования, corpus/rubric/input hashes,
модели, параметры, стенд). При расхождении не выполнять содержательное сравнение:
сохранить результаты как несопоставимые и подготовить новую полную пару после
фиксации условий. Не исправлять judge prompt или рубрику между сторонами.
Исключение — явно зафиксированная смена испытуемого CLI и его встроенных skills;
предупреждение compare о продуктовых `skill_revisions` объяснить, а не
смешивать с дрейфом внешнего окружения. Harness retries ограничены одним
встроенным повтором с `infra_retry.initial`; выборочных ручных повторов нет.

Параметр compare `--margin 0.5` — широкий статистический порог текущего подхода,
он не заменяет блокирующие проверки по кейсам этапа 7. Exit 0 у compare означает
создание отчёта; необходимо прочитать verdict, сопоставимость и доверительные
интервалы. Verdict «неразличимо» сам по себе не означает отсутствие регрессий.

Перед полным запуском выполнить обе сборки с одинаковым smoke-фильтром
`--only sales-by-category,campaign-roi-by-channel,abc-pareto-groups` и отдельными
labels. Core прогнать отдельно через `--tasks "$skill_eval_root/core"`.
Новые profiles авторизовать штатно для нужного provider; секреты в команды,
отчёты и Git не помещать. Потребуются доступные Loginom-стенд, Dock/Help и judge.
При первоначальной сверке использовался `loginom-server-7.4.2-test`; это не
автоматический выбор свободного стенда. Перед живой приёмкой проверить
доступность, фактическую версию/image digest, изоляцию серверных пакетов и
допустимость совместной работы. Общие лимиты судьи проверять отдельно от
обычного preflight; при конкуренции согласовать окно и ограничить параллелизм.
Ожидание стенда или лимитов не останавливает независимые локальные тесты продукта.

Проверки структуры по `acceptance.json` и повторного исполнения в новой сессии
выполняются отдельными шагами этапа 7. Существующий `cold-readback.mjs` рассчитан
на специальные acceptance-пакеты и не является готовым generic replay для
произвольной задачи evals. Новые адаптеры принадлежат нашему направлению;
изменение harness — отдельная согласуемая задача. При использовании внешнего
`check_reference.py` его собственный `LOGINOM_EVAL_CASE_ENV` должен направлять
`AGENT_REPO` в `$skill_eval_harness`; сохранить hash scripts/config и не менять
глобальные настройки verifier или файлы соседней сессии.

## 5. Порядок и контрольные точки

1. **До кода продукта:** этап 0 выполняет исходные детерминированные проверки
   и сохраняет полный baseline CLI из чистого detached source worktree с
   manifest, ресурсами и исходным SHA; проверка `verify-cli-candidate.ts`.
   Для этого не требуется завершение калибровки.
2. **Параллельно калибровке:** этап 1 закрепляет два skill, staging и общий digest;
   этапы 2 и 4 можно выполнять параллельно. Этап 3 завершает trusted discovery,
   resource root и поставочную проверку; этап 5 связывает активацию,
   Help и исполнение. TDD и локальные проверки Desktop/CLI/runtime продолжаются;
   совместно изменяемые продуктовые файлы распределять между исполнителями.
   Harness, near-miss корпус и judge prompt остаются у соседней сессии.
3. **После изменений продукта:** сохранить полный candidate CLI отдельно от
   baseline. Этап 6 проверяет выбор skill/документы, локальные и установочные
   проверки этапа 8 идут независимо от калибровки. Для любых живых проверок на
   общем стенде предварительно проверять его занятость и лимиты сервисов.
4. **После калибровки и согласованных изменений harness:** проверить принятый
   отчёт, заново выбрать неизменный harness SHA, создать отдельный worktree,
   закрепить prompt/schema/модели/параметры и
   снимок задач. В этапе 7 последовательно прогнать сохранённые baseline и
   candidate на одних условиях, затем выполнить compare и наши адаптеры.
5. **Перед завершением:** проверить неизменность условий пары и все обязательные
   Linux Desktop/CLI результаты. При изменении условий старая пара несопоставима;
   повторить обе стороны после новой фиксации. Ожидание калибровки/стенда оставляет
   открытой живую приёмку, но не отменяет завершённую разработку и локальные тесты.
6. **После выпуска:** этап 9 остаётся отдельным действием. Серверную запись
   не удалять до принятой A/B пары, проверки поддерживаемых клиентов и явного
   подтверждения пользователя. Не путать готовность продукта с выполнением
   внешнего удаления.

После каждого этапа — целевые тесты, проверка типов затронутых пакетов,
review и отдельный conventional commit. В progress-разделе этого файла фиксировать
выполненные пункты, фактические SHA и ограничения, чтобы продолжение не зависело
от истории чата. Сборка кандидата не означает публикацию релиза.

## 6. Состояние плана

- 2026-10-05: создан план по результатам аудита `docs-no-browser`.
- 2026-10-06: по просьбе пользователя отменён новый `loginom-scenario`,
  запланирован перенос существующего automation skill в Product.
  Сверены исходники Dock, загрузка managed runtime, Linux Desktop/CLI и harness
  `evals`; добавлены TDD, полная Linux-матрица и парная регрессия пакетов.
- 2026-10-06: уточнено взаимодействие с `calibration-near-miss`: владение
  harness/корпусом/промптом сохранено за соседней сессией, baseline CLI сохраняется
  до кода, живые baseline/candidate запускаются после калибровки на одной
  закреплённой версии в отдельном worktree. Продукт и локальные TDD-проверки
  от этого ожидания не зависят. Изменена только документация нашего направления.
- 2026-10-06: после rebase на `f6f9b0106` база обновлена до `fc3d97dbf`.
  Применён документ corrections: прежнее предложение общего имени отменено,
  остаётся `loginom-automation`; `default`, manifest-only discovery, защита
  зарезервированных имён, единый resource root, доверенная история активации,
  allowlists, разделённые Help/browser состояния, `.lgp` путём в CLI/TUI,
  вывод отчёта в каталог сессии, чистый baseline и отдельный этап 9.
  Уточнены зависимости этапов и неоднозначности metadata/compaction/admission;
  отдельные изменения harness должны быть приняты до обоих live прогонов.
- Реализация, сборки, runtime-тесты и live evals в рамках обновления плана
  не выполнялись. Проверки плана и чтение/хеширование fixtures не являются
  приёмкой продукта. Windows/macOS в текущую итерацию не входят.
