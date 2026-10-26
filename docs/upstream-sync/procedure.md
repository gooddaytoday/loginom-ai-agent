# Процедура синхронизации со стабильным тегом OpenCode

Решение и обоснование — [ADR-0001](adr-0001-modular-integration.md). Какие изменения форка остаются в файлах upstream и кто ими владеет — [catalog.md](catalog.md). Какие тесты охраняют гарантии — [guarantees.md](guarantees.md).

Процедура **репетиционная**: она ничего не меняет в рабочей ветке `loginom`, не отправляет коммиты, не создаёт теги и не выпускает версию. Каждый запуск идёт в новом клоне форка в отдельном каталоге; адрес отправки (`push URL`) у `origin` клона отключён. Решение о слиянии принимает владелец после проверки отчёта.

## Что нужно

| Что | Значение |
|---|---|
| git | ≥ 2.43 (метрика проверена на 2.43.0) |
| bun | ровно версия из `packageManager` корневого `package.json` (сейчас 1.3.14): другая версия пересоберёт `bun.lock` иначе |
| Node | закреплённый в `packages/product/loginom-release.json` (24.19.0) для тестов `loginom-host` и шага `npm ci` во вложенном `packages/loginom-runtime/client` |
| Chromium | закреплённая ревизия Playwright (`node packages/loginom-runtime/client/node_modules/playwright/cli.js install chromium`) |
| python3 | ≥ 3.10, только стандартная библиотека |
| node-gyp и сборка нативных модулей | `bun install` собирает нативные зависимости (например, tree-sitter-powershell) через `node-gyp`. Нужны: `node-gyp` в `PATH`, `make` и компилятор C++, `python3` с `setuptools` (модуль `distutils` в новом python3 отсутствует) и заголовки закреплённого Node. В CI это делает действие `.github/actions/setup-bun/action.yml`: Node из `packages/loginom-runtime/client/.node-version` (строки 12–15), заголовки через `npm_package_config_node_gyp_nodedir` (17–28), `python3 -m pip install setuptools` (65–66). Отдельной установки `node-gyp` в CI нет: он идёт с `npm` из `setup-node` на раннере. В чистой копии (контейнер) без него установка падает с `spawn node-gyp ENOENT`: поставьте `npm install -g node-gyp` или добавьте в `PATH` `node-gyp` из поставки закреплённого `npm` (`$(npm root -g)/npm/node_modules/node-gyp/bin/node-gyp.js`), и задайте `npm_package_config_node_gyp_nodedir` каталогом установки Node (выше `bin/`), если в нём есть `include/node/node.h` |
| Куча V8 при сборке Desktop | `bun run build` в `packages/desktop` собирает весь backend в главный процесс (electron-vite) и с обычной кучей V8 (около 2 ГБ) падает с `JavaScript heap out of memory`. CI задаёт `NODE_OPTIONS=--max-old-space-size=6144` (`.github/workflows/release.yml:221–223`). Шаг `build-desktop` скрипта `check` выставляет то же значение, если `NODE_OPTIONS` не задан. На сборке LAB-280 хватило 3072 МБ (измерено); меньше 3072 не проверялось. Памяти хозяина должно хватать на заданный предел |
| Память | typecheck пакета `opencode` убивается по OOM на стенде с 3,8 ГБ при `--concurrency=2`; на малой памяти запускать `--concurrency=1` (скрипт `check` так и делает) |

## Шаги

### 0. Зафиксировать версии

```bash
scripts/upstream-sync/sync-upstream.sh pin --tag v1.19.4
# UPSTREAM_TAG=v1.19.4
# UPSTREAM_SHA=148842ef7cb1bc34192b3fff57d0f9721ab9c801
git ls-remote https://github.com/gooddaytoday/loginom-ai-agent.git refs/heads/loginom   # FORK_SHA
```

`pin` принимает только стабильные теги `vMAJOR.MINOR.PATCH`; кандидаты и предварительные версии отклоняются. Дальше работают только с полными SHA: имя ветки или тега можно сдвинуть.

### 1. Подготовить репетицию и измерить конфликты

```bash
scripts/upstream-sync/sync-upstream.sh prepare \
  --fork-sha <FORK_SHA> --tag v1.19.4 --upstream-sha <UPSTREAM_SHA> --out /abs/path/new-empty-dir
```

Результат в `--out` (каталог должен быть пустым и новым):

| Файл или каталог | Содержимое |
|---|---|
| `pins.env` | форк, upstream, тег, общая база |
| `clone/` | чистый клон форка; тег upstream в `refs/upstream-sync/<tag>`; `push URL` = `DISABLED` |
| `rehearsal/` | рабочая копия на ветке `sync-rehearsal/<tag>-<fork8>` с **неразрешённым** пробным слиянием |
| `measure/` | `unmerged-paths.txt`, `conflicts.tsv`, `meta.env`, `summary.md`: вывод `measure-conflicts.sh` |
| `report.md` | число конфликтов, таблица классов «до/после», список оставшихся путей |

Метрика та же, что в LAB-198: число путей в `git diff --name-only --diff-filter=U` после `git merge --no-commit --no-ff -s ort <UPSTREAM_SHA>`. Зафиксированы: SHA вместо имён, изолированная конфигурация git, `rerere` выключен, `merge.directoryRenames=conflict`, `merge.renameLimit=30000`. Измерение считается недействительным (а не «0 конфликтов»), если код возврата `merge` не 0/1, нет `MERGE_HEAD`, git предупредил о лимите поиска переименований или в `.gitattributes` есть атрибут `merge=`. Метрику нельзя улучшать настройками слияния или атрибутами; улучшается только содержимое дерева.

Классы в `report.md`: «до» — 69 конфликтов исходной точки (форк `2e6f66a9` + OpenCode v1.19.4) по причинам; «после» — классификация текущих путей теми же правилами. Путь, для которого правила нет, попадает в класс `unclassified` и завершает `conflict-classes.py` кодом 4: это новое расхождение, ему нужны правило и запись в каталоге.

### 2. Разрешить конфликты в `rehearsal/`

Правила, в порядке применения:

1. **Владелец записи определяет политику.** Для каждого конфликтующего файла найдите его запись в [catalog.md](catalog.md) (`scripts/upstream-sync/catalog-check.py --summary` показывает состав записей). Политики: `merge` (объединить обе стороны), `upstream-first` (взять upstream и повторить описанную правку форка), `fork-owned` (оставить участок форка, перенести изменения upstream вручную), `regenerate` (сгенерировать заново).
2. **Не выбирать файл целиком.** Выбор `--ours` или `--theirs` для файла, который менялся обеими сторонами, допускается только как записанное решение владельца (шаг 5).
3. **Внешние имена нового кода.** Новые флаги, каталоги и файлы конфигурации в коде upstream приходят в написании OpenCode (`OPENCODE_*`, `.opencode`, `opencode.json`). Приведите их к именам продукта: `python3 scripts/upstream-sync/apply-identity.py --repo rehearsal --since <FORK_SHA>`. Команда сравнивает рабочее дерево с `<FORK_SHA>` (индекс, незакоммиченные и неотслеживаемые файлы, переименованные и изменённые файлы), поэтому работает и до коммита слияния, когда `HEAD` ещё равен `<FORK_SHA>`; после коммита результат тот же. `--check` ничего не меняет и завершается кодом 1, если есть что менять. Ключи сторонних провайдеров `OPENCODE_API_KEY` и `OPENCODE_GO_API_KEY` остаются. Видимые строки бренда в интерфейсе и документах (запись CAT-03) инструмент не трогает: это решение по каждой строке.
4. **Манифесты и `bun.lock`.** Объедините `package.json`; затем `bun install` (версия bun строго по `packageManager`) и `bun install --frozen-lockfile` для проверки. Сравните набор разрешённых `name@version` с блокировкой upstream для зависимостей, которые форк не менял: расхождение без причины в манифестах — повод остановиться.
5. **Исправить устаревшие пути.** После слияния upstream мог переименовать каталог или пакет: `bun test` в `packages/product` (охранные тесты `repo-paths`, `names`) укажет, куда ещё ведут turbo, `--filter`, фильтры путей workflows и скрипты сборки.
6. **Каталог.** Переведите `against` в `docs/upstream-sync/catalog.json` на SHA принятого тега и запустите `python3 scripts/upstream-sync/catalog-check.py --against <UPSTREAM_SHA>` (он сравнивает рабочее дерево, поэтому работает и до коммита слияния): он перечисляет файлы, где форк отличается от нового upstream и которые не описаны ни одной записью, и записи без расхождений. Опишите новое расхождение в `catalog.md` или устраните его.
7. Закоммитить слияние в `rehearsal/` (хук проекта запускает сканер секретов). Рабочая ветка форка не затрагивается.

### 3. Собрать и проверить

```bash
scripts/upstream-sync/sync-upstream.sh check --out /abs/path/new-empty-dir [--skip build,compat]
```

Шаги и результат каждого — `PASS`, `FAIL` или `NOT_RUN` (только по явному `--skip`) в `check/summary.md`, журналы в `check/*.log`. Падение не скрывается и не считается базовым без доказательства:

| Шаг | Команда (как в CI) |
|---|---|
| `install` | `bun install --frozen-lockfile`, затем `npm ci` во `packages/loginom-runtime/client` |
| `typecheck` | `bun turbo typecheck --continue --concurrency=1` |
| `tests-turbo` | `bun turbo test --continue` (включает `product#test`: охранные тесты) |
| `tests-desktop` | `bun test --path-ignore-patterns=src/main/draft-store.test.ts` в `packages/desktop` |
| `catalog` | `catalog-check.py --against <UPSTREAM_SHA>`: каждое расхождение с принятым тегом описано в каталоге |
| `check-generated` | `bun run check:generated` в `packages/client` |
| `httpapi` | `bun run test:httpapi` в `packages/opencode` |
| `build-desktop` | `bun run build` в `packages/desktop` (electron-vite, без упаковки) |
| `compat` | снимок внешней совместимости до и после слияния и их сравнение |

Чтобы отделить падения стенда от падений слияния, тот же набор нужно прогнать на `FORK_SHA`: шаг `compat` создаёт для этого рабочую копию `before/` (если он не пропущен), в ней остальные шаги запускаются вручную теми же командами; различие между `before/` и `rehearsal/` и есть вклад слияния. Живые сценарии Desktop и CLI (запуск, подключение, вложения, отмена, восстановление) и сборки macOS/Windows на нативных машинах скриптом не покрываются: перечень — в разделе 4–5 матрицы `S1-compat-matrix` и в [guarantees.md](guarantees.md).

#### Внешняя совместимость

`compat-snapshot.ts` снимает с дерева: идентичность продукта (`Product`), вычисленную конфигурацию electron-builder для трёх ОС и трёх каналов, множество `LOGINOM_AI_AGENT_*`, чтения `OPENCODE_*`, строки для сторонних сервисов (в том числе `opencode/1.18.31`), разрешение `@opencode-ai/plugin`, триггеры и задачи CI, граф задач turbo с `passThroughEnv`, манифесты рабочих пакетов и хеши каталогов ресурсов. `compat-compare.ts` сравнивает два снимка после документированных внутренних переименований; любое иное различие — `DIFFERENT` и код выхода 1. Допустимые различия задаются явно (`--allow`) вместе с причиной в отчёте.

### 4. Убедиться, что обновления приняты, а не отброшены

```bash
scripts/upstream-sync/sync-upstream.sh accepted --out /abs/path/new-empty-dir \
  [--allow-ours decisions-ours.txt] [--allow-theirs decisions-theirs.txt]
```

Для каждого файла, который upstream изменил с общей базы, сравниваются четыре версии: база, форк до слияния, upstream, результат. Версия — это режим файла и содержимое: потерянный бит исполнения или файл, ставший ссылкой, считаются различием. Провалом считается:

| Категория | Условие | Решение владельца |
|---|---|---|
| `kept-fork` | результат равен файлу форка при изменении файла в upstream (и при добавлении одного пути обеими сторонами) | `--allow-ours` |
| `took-theirs` | результат равен файлу upstream при изменении файла в форке (и при добавлении одного пути обеими сторонами) | `--allow-theirs` |
| `merged-deleted` | обе стороны изменили файл, результат его удаляет | `--allow-theirs` |
| `merged-emptied` | обе стороны изменили файл, результат — пустой файл | `--allow-theirs` |
| `not-upstream` | форк не менял файл, но результат отличается от upstream (содержимым, режимом или типом) | нет |
| `added-missing` | файл, добавленный upstream, отсутствует | любой из двух файлов |
| `added-truncated` | путь добавленного upstream файла есть, но в нём нет строк upstream (пустой или урезанный файл) или другой режим; строки сравниваются через имена продукта | любой из двух файлов |
| `renamed-truncated` | upstream переименовал файл, форк его не менял, а в результате файл урезан или имеет другой режим | любой из двух файлов |

Файл, удалённый в upstream и изменённый в форке, требует решения владельца (`DECISION`). Для объединённых файлов выводятся строки, добавленные upstream и отсутствующие в результате (предупреждение; `--strict-lines` делает его ошибкой). Предупреждение, а не провал, — осознанно: при политике `fork-owned` строки upstream могут быть перенесены вручную. Строки upstream сопоставляются через имена продукта (те же правила, что в `apply-identity.py`), поэтому `OPENCODE_X` и `LOGINOM_AI_AGENT_X` считаются одной строкой.

Файлы `--allow-ours` / `--allow-theirs`: строка `путь  # причина`. Причина — записанное решение владельца (например, судьба функции `share`: ADR-0001, «Открытые решения»). Без записи провал остаётся.

### 5. Отчёт и передача

Приложите к отчёту: `pins.env`, `report.md`, `check/summary.md`, `compat.log`, вывод `accepted`, список решений владельца с причинами, список `NOT_RUN` с причиной. Ветку `rehearsal` при необходимости публикует человек по отдельному решению; процедура её не публикует. Поле `against` каталога переводится на коммит принятого тега в шаге 2; отчёт содержит вывод `catalog-check.py`.

## Самопроверка процедуры

```bash
scripts/upstream-sync/selftest.sh
```

Без сети и без bun строит синтетические upstream и форк и проверяет: `pin` отклоняет предварительный тег; `prepare` находит оба заданных конфликта, не принимает непустой каталог и отключает `push URL`; `accepted` отклоняет «разрешение» с файлом форка целиком и принимает настоящее слияние с записанным решением; `catalog-check` видит расхождения незакоммиченного слияния; `apply-identity` приводит имена нового кода к именам продукта, не трогая ключи сторонних провайдеров, и идемпотентен. При удалении проверки `kept-fork` самотест краснеет (проверено). Тот же запуск гонит `test_tools.py` (`python3 -I scripts/upstream-sync/test_tools.py`): тесты на синтетических слияниях с проверкой, что `apply-identity --since` видит файлы до коммита слияния, а `accepted` отклоняет пустой, урезанный, удалённый, с потерянным режимом и подменённый результат и не отклоняет настоящее слияние. Самотест в CI не запускается: его запускает исполнитель процедуры.

## Воспроизведение метрики LAB-198 в чистой копии

```bash
git clone https://github.com/gooddaytoday/loginom-ai-agent.git src && cd src
git checkout <итоговый SHA>
set -a; . scripts/upstream-sync/reference/lab-198-baseline.env; set +a      # UPSTREAM_TAG, UPSTREAM_SHA, FORK_SHA исходной точки
scripts/upstream-sync/measure-conflicts.sh --out ../baseline --compare scripts/upstream-sync/reference/baseline-unmerged-paths.txt   # 69
FORK_SHA=<итоговый SHA> scripts/upstream-sync/measure-conflicts.sh --out ../final                                                    # итог
python3 scripts/upstream-sync/conflict-classes.py --before scripts/upstream-sync/reference/baseline-conflicts.tsv \
  --after ../final/conflicts.tsv --residual scripts/upstream-sync/reference/forecast-tier1-conflicts.tsv
```
