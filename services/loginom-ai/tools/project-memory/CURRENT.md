# Общая память Loginom AI Agent

Этот инструмент подключает будущие постоянные worktrees нового репозитория к
Peer основного checkout. Он не копирует серверную память: перенос знаний выполняется
отдельно с проверкой источников и индекса. Регламент работы —
[разработка узлов](../../../../docs/node-development/README.md).

## Область и состояние

Поколение исходников: `20260924.1`. Точная идентичность записывается в приватный
`deployment.json` собранной версии: Git root, namespace `loginom-ai-agent`,
generation, каталоги регистраций и состояния. Peer вычисляет существующий
`project-routing.mjs` из корня репозитория. Аргументы модели его не выбирают.
Живая установка и полный цикл чтения/записи проверены 2026-09-24 на двух
независимых регистрациях. Результаты и границы —
[подтверждение готовности](../../../../docs/node-development/workflow/shared-memory.md).
Каждая следующая задача всё равно требует собственного допуска.

Основной checkout сохраняет штатный плагин и MCP. Проектные hooks пропускают его.
Другие существующие worktrees, включая внешние, не регистрируются автоматически.
Новые узлы создаются в `<repo>/.worktrees/<короткая-ветка>`, по одной задаче на cwd.
Существующие задачи и capture cursors не переносить этим fresh-enrollment helper.

Официальные scripts OpenViking 0.8.1 и исходный adapter не меняются: сборщик
проверяет прежний upstream manifest и применяет адаптацию только к отдельной
локальной копии. Старые runtime, registry и настройки Loginom Dock не меняются.

## Однократная подготовка проекта

Команды выполнять из корня нового репозитория. `NODE` ниже — настоящий абсолютный
путь к исполняемому файлу Node (с разрешёнными symlink), `PLUGIN` — путь к проверенному
установленному OpenViking 0.8.1. Скрипты не читают и не печатают значения ключей.

```sh
python3 -B services/loginom-ai/tools/project-memory/assemble_runtime.py
python3 -B services/loginom-ai/tools/project-memory/prepare_project_memory.py --node <NODE> --plugin <PLUGIN>
```

Сборка: `.local/project-memory/runtime/20260924.1/`. Preview:
`.local/project-memory/rollouts/20260924.1/manifest.json` и `hooks.json.pending`.
Эти приватные материалы не включать в Git. Сборщик отказывается перезаписывать
отличающуюся версию; для новой работающей версии требуется новая generation.
Preview пишет только материалы подготовки в `.local/project-memory`, не настройки.

После проверки материалов координатор явно устанавливает ровно пять
`--enrollments-only` hooks и каталоги `0700`; основной plugin config не изменяется:

```sh
python3 -B services/loginom-ai/tools/project-memory/prepare_project_memory.py --node <NODE> --plugin <PLUGIN> --install
node services/loginom-ai/tools/project-memory/review_hooks.mjs --manifest .local/project-memory/rollouts/20260924.1/manifest.json
node services/loginom-ai/tools/project-memory/review_hooks.mjs --manifest .local/project-memory/rollouts/20260924.1/manifest.json --trust --output <private-receipt.json>
```

Доверие оформляется штатным `hooks/list` и `config/batchWrite` по фактически
возвращённым `currentHash`. Новые project hooks в основном checkout являются
пропускающей группой; штатные hooks там остаются. Существующие чужие project hooks
не перезаписываются: helper останавливается до их отдельного согласования.

## Перед каждым новым узлом

1. Подготовить отдельный linked worktree непосредственно под `<repo>/.worktrees`,
   короткую ветку и точный принятый base SHA. Задачу ещё не создавать.
2. Выполнить preview, затем установку её локальной конфигурации:

```sh
python3 -B services/loginom-ai/tools/project-memory/prepare_task_memory.py --cwd <exact-worktree> --branch <branch> --base <SHA>
python3 -B services/loginom-ai/tools/project-memory/prepare_task_memory.py --cwd <exact-worktree> --branch <branch> --base <SHA> --install
```

Helper сохраняет исходную конфигурацию, добавляет отдельный MCP и отключает
официальный memory plugin только в этом worktree. Независимая запись:
`~/.openviking/project-memory-enrollments/loginom-ai-agent/<sha256(cwd)>.json`,
файл `0600`. Новая регистрация не меняет hash соседней. В состоянии `pending`
MCP отказывает; hooks сохраняют только фактические metadata SessionStart.

3. Создать настоящую задачу Astra medium для одного подготовительного хода:
   подтвердить cwd/branch/base, не разрабатывать узел и не обращаться к памяти.
   Дождаться завершения хода. Проверить в приложении реальный task/turn ID,
   `completed`/`idle`, затем сохранить свежие metadata в файл `0600`:

```json
{
  "threadId": "<actual-task-ID>",
  "cwd": "<exact-worktree>",
  "registrationId": "<ID-from-preparation>",
  "turnStatus": "completed",
  "threadStatus": "idle",
  "developmentStarted": false,
  "turnId": "<actual-completed-turn-ID>",
  "checkedAt": "<actual-UTC-check-time>"
}
```

Это свидетельство координатора, не способ подменить metadata хоста.
`enroll_task` дополнительно сверяет реальный bootstrap observation. Срок обоих
receipts — десять минут; устаревшие сведения проверить заново, не менять дату вслепую.

4. Проверить пять trusted project hooks и отсутствие original memory hooks в
   worktree, затем активировать зарегистрированную задачу:

```sh
node services/loginom-ai/tools/project-memory/review_hooks.mjs --manifest .local/project-memory/rollouts/20260924.1/manifest.json --workspace <exact-worktree> --trust --output <private-hooks-receipt.json>
node services/loginom-ai/tools/project-memory/enroll_task.mjs --runtime .local/project-memory/runtime/20260924.1 --cwd <exact-worktree> --thread <actual-task-ID> --evidence <private-bootstrap-evidence.json> --hooks-receipt <private-hooks-receipt.json>
```

5. В следующем ходе той же задачи проверить зарегистрированные actor
   `health/find/read` новой общей памяти. После первого содержательного этапа
   проверить capture/extraction, точный read-back знания и его адресный поиск из
   основного checkout. Только это подтверждает фактическую общую память.

## Повтор и восстановление

Повторная подготовка неизменного worktree и повторный enrollment той же задачи
идемпотентны. Cursor никогда не сбрасывается. Чужой task ID, изменённые файлы,
активный writer/lock, незавершённая операция или оставшийся legacy state требуют
адресной диагностики; слепой повтор, кража lock и fallback в собственный Peer
запрещены. Capture state соседних задач не переносить и не удалять.

Этот helper предназначен для свежих worktrees. Для уже работающей задачи нужны
законченная граница этапа, завершение прежнего capture и отдельный проверенный
переход с сохранением cursor; исторические скрипты узлов11–14 не запускаются.

## Локальные проверки

```sh
cd .local/project-memory/runtime/20260924.1
node --test test/*.test.mjs
```

Из корня репозитория:

```sh
python3 -B -m unittest discover -s services/loginom-ai/tools/project-memory/test -p '*_test.py' -v
```

Python-проверки создают временные настоящие Git worktrees и отдельный HOME fixture.
Для другой тестовой сборки задать `PROJECT_MEMORY_TEST_RUNTIME=<absolute-runtime>`.
Локальные проверки не заменяют настоящую задачу и проверку записи на сервере.
