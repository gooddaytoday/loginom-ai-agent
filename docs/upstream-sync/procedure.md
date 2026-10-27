# Процедура синхронизации со стабильным тегом OpenCode

Решение и обоснование — [ADR-0001](adr-0001-modular-integration.md). Какие изменения форка остаются в файлах upstream и кто ими владеет — [catalog.md](catalog.md). Какие тесты охраняют гарантии — [guarantees.md](guarantees.md).

Процедура **репетиционная**: она ничего не меняет в рабочей ветке `loginom`, не отправляет коммиты, не создаёт теги и не выпускает версию. Каждый запуск идёт в новом клоне форка в отдельном каталоге; адрес отправки (`push URL`) у `origin` клона отключён. Решение о слиянии принимает владелец после проверки отчёта.

## Что нужно

| Что | Значение |
|---|---|
| git | ≥ 2.43 (метрика проверена на 2.43.0) |
| bun | ровно версия из `packageManager` корневого `package.json` **форка** (сейчас 1.3.14), а не версия, которой пользуется upstream: после слияния `packageManager` остаётся форка. Форк держит Bun на версии своего комплекта сторонних материалов, подъём Bun upstream — отдельное решение (CAT-02 в [catalog.md](catalog.md)). Другая версия пересоберёт `bun.lock` иначе |
| Node | закреплённый в `packages/product/loginom-release.json` (24.19.0) для тестов `loginom-host` и шага `npm ci` во вложенном `packages/loginom-runtime/client` |
| gitleaks | коммит в `rehearsal/` запускает хук `.husky/pre-commit` (`bun run secrets staged`), а он — сканер секретов. Бинарник версии из `.gitleaks-version` ставит `bun run secrets:install` из корня `rehearsal/`; без него коммит блока `commit` падает. Хуки появляются после `bun install` (скрипт `prepare` запускает husky) |
| Chromium | закреплённая ревизия Playwright (`node packages/loginom-runtime/client/node_modules/playwright/cli.js install chromium`) |
| python3 | ≥ 3.10, только стандартная библиотека |
| node-gyp и сборка нативных модулей | `bun install` собирает нативные зависимости (например, tree-sitter-powershell) через `node-gyp`. Нужны: `node-gyp` в `PATH`, `make` и компилятор C++, `python3` с `setuptools` (модуль `distutils` в новом python3 отсутствует) и заголовки закреплённого Node. В CI это делает действие `.github/actions/setup-bun/action.yml`: Node из `packages/loginom-runtime/client/.node-version` (строки 12–15), заголовки через `npm_package_config_node_gyp_nodedir` (17–28), `python3 -m pip install setuptools` (65–66). Отдельной установки `node-gyp` в CI нет: он идёт с `npm` из `setup-node` на раннере. В чистой копии (контейнер) без него установка падает с `spawn node-gyp ENOENT`: поставьте `npm install -g node-gyp` или добавьте в `PATH` `node-gyp` из поставки закреплённого `npm` (`$(npm root -g)/npm/node_modules/node-gyp/bin/node-gyp.js`), и задайте `npm_package_config_node_gyp_nodedir` каталогом установки Node (выше `bin/`), если в нём есть `include/node/node.h` |
| Куча V8 при сборке Desktop | `bun run build` в `packages/desktop` собирает весь backend в главный процесс (electron-vite) и с обычной кучей V8 (около 2 ГБ) падает с `JavaScript heap out of memory`. CI задаёт `NODE_OPTIONS=--max-old-space-size=6144` (`.github/workflows/release.yml:221–223`), и шаг `build-desktop` скрипта `check` берёт это значение, если `NODE_OPTIONS` не задан. Значение берут по памяти хозяина: **3072 МБ достаточно** (сборка прошла на LAB-280 и на LAB-338, оба раза на хозяине с 11 ГБ; ниже 3072 не проверялось), 6144 нужны только там, где памяти хватает с запасом. Хозяину с 11 ГБ и меньше задают `export NODE_OPTIONS=--max-old-space-size=3072` до запуска `check`; проверка: `free -m` показывает свободной не меньше заданного предела плюс 2 ГБ под остальные процессы сборки |
| Память | typecheck пакета `opencode` убивается по OOM на стенде с 3,8 ГБ при `--concurrency=2`; на малой памяти запускать `--concurrency=1` (скрипт `check` так и делает) |
| Хук pre-push | `git push` из клона с установленными хуками запускает `.husky/pre-push`: проверку версии Bun и затем `bun typecheck` (`bun turbo typecheck`) с параллельностью turbo по умолчанию, и на стенде с 3 ГБ она падает по OOM (LAB-303). Процедура сама ничего не отправляет (`push URL` клона отключён); ветку, которую решит опубликовать человек, отправляют с машины, где этот typecheck проходит. Обход `git push --no-verify` пропускает и сканер секретов (`bun run secrets push`, первая строка хука): перед обходом выполните вручную `bun run secrets range <BASE> <HEAD>` и `bun turbo typecheck --continue --concurrency=1`. Хук не заменяет CI: CI запускает typecheck заново |
| Пользователь | Тесты форка проверяют отказ по правам файлов (`loginom-host`: режимы архива; `opencode`: `tool.write`, удаление журналов), и под root они падают по причине, не связанной со слиянием (LAB-338, запуск 1). `check` запускают от обычного пользователя. Проверка: `id -u` печатает не `0`. Без неё шаг `tests` отказывается стартовать |
| Каталог репетиции | Тест встроенных скиллов `opencode` находит скиллы каждого предка каталога (`.claude/skills`, `.agents/skills`) и считает их лишними (LAB-338: под `workdir/.claude/skills` нашлось 41 лишний). `$OUT` лежит вне такого дерева. Проверка: `d=$OUT; while [ "$d" != / ]; do d=$(dirname "$d"); ls -d "$d/.claude/skills" "$d/.agents/skills" 2>/dev/null; done` ничего не печатает. Без неё шаг `tests` отказывается стартовать |
| Среда шагов | `check` сам выставляет (`stand.sh`): `TMPDIR`, `TMP`, `TEMP` = `$OUT/tmp` (унаследованный каталог чужого пользователя даёт `EACCES` в сотнях тестов `core` и `loginom-host`); `umask 022` (тест режимов архива при umask 002 падает); `bunx` рядом с `bun` или ссылку на `bun` в `$OUT/bin` (сборка `http-recorder` вызывает `bunx tsc`, а в архиве `bun-linux-x64.zip` его нет); `TURBO_FORCE=true` (иначе turbo восстанавливает результат тестов из кэша, а не запускает их). Эти пункты исполнитель не повторяет; тесты, которые он запускает вручную (например на `FORK_SHA`, см. шаг 3), идут в той же среде: `. scripts/upstream-sync/stand.sh; stand_prepare_env "$OUT" "$(command -v bun)"` |
| Запуск `check` | Тесты Desktop и `loginom-host` требуют дисплей и сессию dbus, как в CI (`.github/workflows/test.yml:106`, `:224`, `xvfb-run -a`). Запуск, на котором LAB-338 получил действительный результат: `dbus-run-session -- xvfb-run -a -s "-screen 0 1280x1024x24" scripts/upstream-sync/sync-upstream.sh check --out "$OUT"`, с Chromium и Node закреплённых версий, заданными явно: `PLAYWRIGHT_BROWSERS_PATH`, `LOGINOM_AI_AGENT_TEST_BROWSERS`, `LOGINOM_AI_AGENT_BROWSER_SOURCE` = каталог Chromium; `LOGINOM_AI_AGENT_TEST_NODE`, `LOGINOM_AI_AGENT_NODE_SOURCE` = `node` 24.19.0; `XDG_CACHE_HOME`, `XDG_DATA_HOME`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, `XDG_RUNTIME_DIR` = каталоги стенда, а не домашний каталог пользователя. Нужность каждой переменной по отдельности не проверялась (предположение): без них результат не считается действительным, пока не доказано обратное. Проверка: `command -v xvfb-run dbus-run-session` печатает оба пути |
| Остатки сборки | Упавшая сборка `packages/sdk/js` оставляет пустой `packages/sdk/js/openapi.json`, и следующий `check` отказывает: рабочее дерево не чистое. `check` сам удаляет такой пустой файл; любой другой неотслеживаемый файл он не трогает, его причину ищет исполнитель (`git -C "$OUT/rehearsal" status --porcelain`) |

## Шаги

Все команды ниже выполняются **из корня чистого клона форка** (`git clone <адрес форка> src && cd src`, затем `git checkout` нужного коммита): пути к скриптам (`scripts/upstream-sync/...`) относительны к этому корню. Репетиция живёт в отдельном каталоге `$OUT`, и на неё всегда указывают абсолютным путём `"$OUT/rehearsal"`; относительный `--repo rehearsal` зависел бы от рабочего каталога и поэтому не используется. Блоки ниже исполняются дословно. До ручного шага 2 они идут одной оболочкой, поэтому переменные одного блока видны в следующих. Ручной шаг заканчивает эту оболочку (правки, `bun install` и охранные тесты делаются в других окнах): блоки после него идут в новой оболочке, где есть только `OUT` и то, что задаёт блок `env`. Остальные значения (`FORK_URL`, `FORK_SHA`, `UPSTREAM_URL`, `UPSTREAM_SHA`, `TAG`) блок `load` читает из `$OUT/pins.env`, который записал `prepare`. Тот же текст выполняет док-тест (`doctest_procedure.py`, [самопроверка](#самопроверка-процедуры)); блок с неподставленным `<...>` или необязательным `[--флаг]` не пройдёт.

```bash doc-test step=env
FORK_URL=${FORK_URL:-https://github.com/gooddaytoday/loginom-ai-agent.git}
UPSTREAM_URL=${UPSTREAM_URL:-https://github.com/anomalyco/opencode.git}
TAG=${TAG:-v1.19.4}
: "${OUT:?OUT: абсолютный путь к новому пустому каталогу репетиции}"
```

### 0. Зафиксировать версии

```bash doc-test step=pin
eval "$(scripts/upstream-sync/sync-upstream.sh pin --tag "$TAG" --upstream-url "$UPSTREAM_URL")"   # UPSTREAM_TAG, UPSTREAM_SHA
: "${FORK_SHA:?FORK_SHA: полный SHA коммита форка, с которым идёт репетиция}"
echo "$UPSTREAM_TAG $UPSTREAM_SHA $FORK_SHA"
```

`pin` принимает только стабильные теги `vMAJOR.MINOR.PATCH`; кандидаты и предварительные версии отклоняются. Дальше работают только с полными SHA: имя ветки или тега можно сдвинуть. Поэтому `FORK_SHA` задаёт исполнитель, до запуска, и процедура его не подменяет: ветки по умолчанию нет. Раньше `pin` брал вершину ветки `loginom`, и репетиция уходила от проверяемого коммита, если ветка сдвинулась или проверялась другая ветка (F4 LAB-303). SHA вершины нужной ветки узнают так: `export FORK_SHA=$(git ls-remote "$FORK_URL" refs/heads/ИМЯ_ВЕТКИ | cut -f1)`, затем записывают его в отчёт. Блок без `FORK_SHA` останавливается на `pin`.

### 1. Подготовить репетицию и измерить конфликты

```bash doc-test step=prepare
scripts/upstream-sync/sync-upstream.sh prepare --fork-sha "$FORK_SHA" --tag "$TAG" --upstream-sha "$UPSTREAM_SHA" \
  --fork-url "$FORK_URL" --upstream-url "$UPSTREAM_URL" --out "$OUT"
```

Результат в `$OUT` (каталог должен быть пустым и новым):

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
2. **Не выбирать файл целиком.** Выбор `--ours` или `--theirs` для файла, который менялся обеими сторонами, допускается только как запись решения (`merge-decisions.json`, шаг 4): каждый конфликтный путь требует записи в любом случае.
3. **Внешние имена нового кода.** Новые флаги, каталоги и файлы конфигурации в коде upstream приходят в написании OpenCode (`OPENCODE_*`, `.opencode`, `opencode.json`). Приведите их к именам продукта командой `apply-identity` (блок `identity` ниже). Команда сравнивает рабочее дерево с `<FORK_SHA>` (индекс, незакоммиченные и неотслеживаемые файлы, переименованные и изменённые файлы), поэтому работает и до коммита слияния, когда `HEAD` ещё равен `<FORK_SHA>`; после коммита результат тот же. `--check` ничего не меняет и завершается кодом 1, если есть что менять. Ключи сторонних провайдеров `OPENCODE_API_KEY` и `OPENCODE_GO_API_KEY` остаются. Документацию пользователя (`packages/web/src/content/docs/**`, например таблицу переменных в `cli.mdx`) команда без списка путей не обрабатывает: исходные деревья она берёт из охранного теста, а оракул шлюза использует тот же отбор, поэтому расширить его значит изменить шлюз. Таблицы перечисляют переменные, которые продукт читает, и устаревшее `OPENCODE_*` там искажает внешний интерфейс (F6 LAB-303), поэтому для документации есть отдельный блок `identity-docs` ниже: он передаёт команде явный список файлов, изменённых слиянием. Видимые строки бренда в интерфейсе и документах (запись CAT-03) инструмент не трогает: это решение по каждой строке.
4. **Манифесты и `bun.lock`.** Объедините `package.json`; затем `bun install` (версия bun строго по `packageManager`) и `bun install --frozen-lockfile` для проверки. Сравните набор разрешённых `name@version` с блокировкой upstream для зависимостей, которые форк не менял: расхождение без причины в манифестах — повод остановиться.
5. **Исправить устаревшие пути.** После слияния upstream мог переименовать каталог или пакет: `bun test` в `packages/product` (охранные тесты `repo-paths`, `names`) укажет, куда ещё ведут turbo, `--filter`, фильтры путей workflows и скрипты сборки.
6. **Каталог.** Переведите `against` в `docs/upstream-sync/catalog.json` на SHA принятого тега и запустите `catalog-check` (блок `catalog` ниже; он сравнивает рабочее дерево, включая смену типа файла и переименования, поэтому работает и до коммита слияния): он перечисляет файлы, где форк отличается от нового upstream и которые не описаны ни одной записью, и записи без расхождений. Опишите новое расхождение в `catalog.md` или устраните его.
7. Записать решение для каждого конфликтного пути и каждого отклонения от механического слияния в `docs/upstream-sync/merge-decisions.json` и закоммитить слияние вместе с ним в `rehearsal/` (блок `commit` ниже; хук проекта запускает сканер секретов). Правки после слияния (сборка, `bun install`) делайте отдельными коммитами. `bun test` в `packages/opencode` создаёт `packages/opencode/config.json`; файл перечислен в `.gitignore`, поэтому `git add -A` блока `commit` его не берёт (F10 LAB-303). Другие неотслеживаемые файлы после тестов перед `git add -A` посмотрите в `git status`. Рабочая ветка форка не затрагивается.

Пункты 1, 2, 4 и 5 делает человек. Затем по порядку выполняются блоки. В новой оболочке сначала задайте `OUT` (блок `env`), потом выполните `load`:

```bash doc-test:manual step=resolve
git -C "$OUT/rehearsal" diff --name-only --diff-filter=U      # что ещё не разрешено; правки, bun install и охранные тесты — вручную
```

```bash doc-test step=load
. "$OUT/pins.env"          # FORK_URL, FORK_SHA, UPSTREAM_URL, UPSTREAM_TAG, UPSTREAM_SHA, BRANCH, MERGE_BASE
TAG=$UPSTREAM_TAG
```

```bash doc-test step=identity
python3 scripts/upstream-sync/apply-identity.py --repo "$OUT/rehearsal" --since "$FORK_SHA"
```

```bash doc-test step=identity-docs
git -C "$OUT/rehearsal" diff --name-only "$FORK_SHA" -- packages/web/src/content/docs | xargs -r python3 scripts/upstream-sync/apply-identity.py --repo "$OUT/rehearsal"
```

Оракул шлюза документацию не приводит к именам продукта, поэтому каждый файл, который изменил блок `identity-docs`, шлюз покажет как `deviation`: для него нужна запись в `merge-decisions.json` (правило `CAT-03`, причина — «имена переменных приведены к именам продукта»). Документация форка уже целиком в его именах (измерено: в `cli.mdx` 0 строк `OPENCODE_` и 50 `LOGINOM_AI_AGENT_`), поэтому по этим файлам нет решения по каждой строке; `OPENCODE_API_KEY` как ключ стороннего сервиса остаётся.

```bash doc-test step=catalog
python3 scripts/upstream-sync/catalog-check.py --repo "$OUT/rehearsal" --against "$UPSTREAM_SHA"
```

```bash doc-test step=commit
git -C "$OUT/rehearsal" add -A
git -C "$OUT/rehearsal" commit -q -m "Merge OpenCode $TAG into the fork"
```

### 3. Собрать и проверить

```bash doc-test step=check
scripts/upstream-sync/sync-upstream.sh check --out "$OUT" ${CHECK_SKIP:+--skip "$CHECK_SKIP"}
```

`check` запускают **одной командой без `--skip`**: стенд описан в «Что нужно» и подготавливается самим скриптом, поэтому собирать результат из нескольких запусков с `--skip` не требуется. Единственный повтор, который остаётся, — `compat` с `--allow` (ниже): допустимые префиксы известны только после первого прогона. `CHECK_SKIP` — необязательный список шагов через запятую (`install`, `typecheck`, `tests`, `check`, `httpapi`, `catalog`, `guards`, `build`, `compat`); пропущенный шаг получает `NOT_RUN`.

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

`compat-snapshot.ts` снимает с дерева: идентичность продукта (`Product`), вычисленную конфигурацию electron-builder для трёх ОС и трёх каналов, множество `LOGINOM_AI_AGENT_*`, чтения `OPENCODE_*`, строки для сторонних сервисов (в том числе `opencode/1.18.31`), разрешение `@opencode-ai/plugin`, триггеры и задачи CI, граф задач turbo с `passThroughEnv`, манифесты рабочих пакетов и хеши каталогов ресурсов. `compat-compare.ts` сравнивает два снимка после документированных внутренних переименований; любое иное различие — `DIFFERENT` и код выхода 1. Допустимые различия задаются явно вместе с причиной в отчёте. Для шага `check` каждый допустимый префикс JSON-пути передаётся флагом `--allow` (повторяемым): он уходит в `compat-compare.ts`, различия под префиксом печатаются как `ALLOWED`, остальные остаются `DIFFERENT` и роняют шаг. Префикс берут из первой строки `compat.log` после чтения различия: например, версии пакетов, которые принёс тег (`.workspaces.packages/app/package.json.version` → `--allow workspaces.packages/app/package.json.version`), и ветки триггеров CI (`workflows..github/workflows/nix-eval.yml.on.push.branches`). Перечень префиксов с причиной каждого записывают в отчёт; префикс шире нужного скрывает лишнее. Повторить только `compat`: `sync-upstream.sh check --out "$OUT" --skip install,typecheck,tests,check,httpapi,catalog,guards,build --allow ПРЕФИКС ...`.

### 4. Шлюз принятия: слияние равно механическому слиянию плюс записанные решения

```bash doc-test step=accepted
scripts/upstream-sync/sync-upstream.sh accepted --out "$OUT"
```

Шлюз смотрит только коммит слияния (`HEAD` каталога `rehearsal`; если поверх него есть коммиты сборки или правок, укажите слияние: `--merge <SHA>`; такие коммиты шлюз не судит, а перечисляет). Родители коммита обязаны быть ровно `FORK_SHA` и `UPSTREAM_SHA`.

1. Оракул строит механическое слияние тех же двух родителей: `git merge-tree --write-tree` с настройками `prepare` (ort, без `rerere`, `merge.directoryRenames=conflict`, `merge.renameLimit=30000`), затем `apply-identity` на файлах, которые слияние изменило относительно форка.
2. Дерево коммита сравнивается с деревом оракула побайтно. Записи решения требуют: каждый путь, который оракул оставил конфликтным (`conflict`), и каждый путь, где коммит отличается от оракула (`deviation`): иное содержимое, режим, тип или отсутствие.
3. Записи лежат в `docs/upstream-sync/merge-decisions.json` и **коммитятся вместе со слиянием** (шаг `resolve` ниже создаёт файл до `commit`): `{"format": 1, "decisions": [{"path": "...", "rule": "...", "reason": "..."}]}`. `rule` — `CAT-<n>` (запись каталога того же коммита), `ADR-<n>`, `STANDING-<n>` или `PROCEDURE-<n>`; `reason` — что выбрано и почему.
4. `FAIL`: путь без записи, запись без пути (`stale-record`), запись с неизвестным правилом или пустой причиной (`bad-record`). Эвристик нет: шлюз не угадывает, принято ли изменение upstream.

**Предел.** Шлюз не утверждает, что конфликт разрешён правильно по смыслу. Смысл конфликтного пути и каждого отклонения судит проверяющий по записи: он читает `reason`, сравнивает результат с обеими сторонами и смотрит предупреждения строк (строки upstream, которых нет в результате, и удалённые upstream строки, которые остались). Предупреждения не меняют результат. Полный перечень пределов и клетки проверки — в [acceptance-contract.md](acceptance-contract.md).

Вывод шлюза: число путей `conflict` и `deviation` с долей записанных, число путей, равных оракулу, предупреждения, перечень коммитов после слияния, `RESULT: ACCEPTED` (код 0) или `RESULT: REJECTED` (код 1).

### 5. Отчёт и передача

Приложите к отчёту: `pins.env`, `report.md`, `check/summary.md`, `compat.log`, вывод `accepted`, файл `merge-decisions.json` (решения с причинами) и список коммитов после слияния, список `NOT_RUN` с причиной. Ветку `rehearsal` при необходимости публикует человек по отдельному решению; процедура её не публикует. Три действия исполнителя лежат вне скриптов и попадают в отчёт:

- **Коммиты без хуков.** До `bun install` в `rehearsal/` хуков husky нет (скрипт `prepare` ставит их при установке), поэтому блок `commit` и правки до установки сканер секретов не проверяет. Компенсация после установки: `bun run secrets range "$FORK_SHA" HEAD` (код 0 = чисто); в отчёте — число проверенных коммитов.
- **Публикация с `--no-verify`.** Хук pre-push (`bun typecheck` с параллельностью turbo по умолчанию) падает по OOM на малой памяти, поэтому публикация идёт с `git push --no-verify`. Перед ней: `bun run secrets range <BASE> <HEAD>` и `bun turbo typecheck --continue --concurrency=1` (код 0 обоих). В отчёте: что запущено и с каким кодом.
- **Правка каталога после `check`.** Если `check`, `compat` или разбор внешних имён показал расхождение, которого не описывает запись `catalog.md` (пример LAB-338: переводы `cli.mdx`, запись CAT-03), запись вносят отдельным коммитом поверх слияния, не в само слияние. После неё повторяют `accepted --merge <SHA слияния>`, `catalog` и `guards`; остальные шаги `check` повторять не нужно, если коммит меняет только `catalog.md` и `catalog.json` (укажите это в отчёте). Ветка репетиции публикуется **только вперёд**: новые коммиты поверх опубликованных, без `--force` и без пересоздания ветки с тем же именем. Проверка секретов в CI (`.github/workflows/secrets.yml`) берёт диапазон от `BEFORE` (прежняя вершина ветки); после перезаписи этого SHA в репозитории уже нет, и шаг падает (F9 LAB-303). Исправление идёт новым коммитом, а не заменой старого. Поле `against` каталога переводится на коммит принятого тега в шаге 2; отчёт содержит вывод `catalog-check.py`.

## Самопроверка процедуры

```bash
scripts/upstream-sync/selftest.sh
```

Без сети и без bun строит синтетические upstream и форк и проверяет: `pin` отклоняет предварительный тег; `prepare` находит оба заданных конфликта, не принимает непустой каталог и отключает `push URL`; `accepted` отклоняет «разрешение» с файлом форка целиком и принимает настоящее слияние с записанным решением; `catalog-check` видит расхождения незакоммиченного слияния; `apply-identity` приводит имена нового кода к именам продукта, не трогая ключи сторонних провайдеров, и идемпотентен. Затем гонит четыре набора:

- `test_tools.py` (`python3 -I scripts/upstream-sync/test_tools.py`): тесты `apply-identity`, оракула и шлюза `accepted` на синтетических слияниях (находки F1–F3 LAB-302 как слияния);
- `test_acceptance.py`: каждая клетка [контракта](acceptance-contract.md) как настоящее git-слияние (492 клетки для `verify-accepted.py` и `catalog-check.py`, у каждой проверены код выхода и вердикт) и мутации шлюза «всегда код 0» и «всегда ACCEPTED», плюс совпадение таблицы документа с генератором;
- `test_stand.sh`: требования стенда `check` (`stand.sh`): отказ под root, отказ при `.claude/skills` или `.agents/skills` у предка каталога, закрытая среда (`TMPDIR`, `TMP`, `TEMP`, `umask 022`, `bunx`, `TURBO_FORCE`), удаление пустого `openapi.json` и сохранение непустого; под root проверяется и проводка в `check`;
- док-тест (`doctest_procedure.py`): блоки `doc-test` этого документа выполняются дословно в чистом клоне, от `pin` до `accepted` включительно; ручной шаг 2 выполняет вспомогательный скрипт, и блоки после него идут в новой оболочке (проверяется, что переменные берутся из `pins.env`); `FORK_SHA` задан и остаётся выбранным, даже когда ветка форка сдвинулась после выбора, а без него документ останавливается на `pin`. Если команда документа зависит от рабочего каталога или содержит неподставленное значение, самотест краснеет.

Самотест в CI не запускается: его запускает исполнитель процедуры.

## Воспроизведение метрики LAB-198 в чистой копии

У метрики три базы. Исходная — `loginom`@`2e6f66a9` (v0.3.3), 69 путей. После выпуска v0.3.4 (`db130098`, 40 коммитов) метрика измерена заново тем же способом: B034 — тоже 69 путей. После выпуска v0.3.5 (`20222c2b`, ещё 59 коммитов) — B035, тоже 69 путей. Списки путей всех трёх баз совпадают побайтно (SHA-256 `79cf0bc5…fcda6f`). Итог сравнивается со всеми: он должен быть не больше 34 и не больше ⌊B / 2⌋ последней базы (B035 = 69, значит ≤ 34).

```bash
git clone https://github.com/gooddaytoday/loginom-ai-agent.git src && cd src
git checkout <итоговый SHA>
set -a; . scripts/upstream-sync/reference/lab-198-baseline.env; set +a      # UPSTREAM_TAG, UPSTREAM_SHA и FORK_SHA базы 1
# база 1: v0.3.3 (2e6f66a9), эталон 69
scripts/upstream-sync/measure-conflicts.sh --out ../baseline --compare scripts/upstream-sync/reference/baseline-unmerged-paths.txt                  # 69
# база 2: v0.3.4 (db130098), эталон B034 = 69; тот же upstream, другой FORK_SHA
FORK_SHA=$(sed -n 's/^FORK_SHA=//p' scripts/upstream-sync/reference/lab-198-baseline-v034.env) \
  scripts/upstream-sync/measure-conflicts.sh --out ../baseline-v034 --compare scripts/upstream-sync/reference/baseline-v034-unmerged-paths.txt      # 69
# база 3: v0.3.5 (20222c2b), эталон B035 = 69; тот же upstream, третий FORK_SHA
FORK_SHA=$(sed -n 's/^FORK_SHA=//p' scripts/upstream-sync/reference/lab-198-baseline-v035.env) \
  scripts/upstream-sync/measure-conflicts.sh --out ../baseline-v035 --compare scripts/upstream-sync/reference/baseline-v035-unmerged-paths.txt      # 69
# итог
FORK_SHA=<итоговый SHA> scripts/upstream-sync/measure-conflicts.sh --out ../final
python3 scripts/upstream-sync/conflict-classes.py --before scripts/upstream-sync/reference/baseline-conflicts.tsv \
  --after ../final/conflicts.tsv --residual scripts/upstream-sync/reference/forecast-tier1-conflicts.tsv                                       # классы против базы 1
python3 scripts/upstream-sync/conflict-classes.py --before scripts/upstream-sync/reference/baseline-v034-conflicts.tsv \
  --after ../final/conflicts.tsv --residual scripts/upstream-sync/reference/forecast-tier1-conflicts.tsv                                       # классы против базы 2
python3 scripts/upstream-sync/conflict-classes.py --before scripts/upstream-sync/reference/baseline-v035-conflicts.tsv \
  --after ../final/conflicts.tsv --residual scripts/upstream-sync/reference/forecast-tier1-conflicts.tsv                                       # классы против базы 3
```

Файлы `reference/baseline-*` — эталон 69, `reference/baseline-v034-*` — эталон B034, `reference/baseline-v035-*` — эталон B035; прежние эталоны не удаляются.
