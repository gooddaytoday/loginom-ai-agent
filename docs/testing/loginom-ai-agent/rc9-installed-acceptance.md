# Приёмка RC9: живой Loginom и установленные артефакты

Документ описывает проверки, которые остались после синхронизации исходников Dock
с upstream `83c52ebb653e6bd7df294d4e24fc5545cb955b14` (RC9) на ветке `sync-dock-rc9`.
Он не заменяет [общий runbook](README.md) и [Linux-инструкцию](linux.md), а задаёт
порядок именно для RC9: собрать, установить, увидеть выполнение в браузере,
зафиксировать доказательства.

Браузер во всех сценариях этого документа запускается видимым. Headless-режим
допускается только там, где это явно указано.

## Что уже доказано и что нет

После синхронизации проверено только дерево исходников: клиентские тесты на
закреплённом Node 24.19.0, runtime `src`, typecheck и узкие тесты `packages/loginom-host`,
`packages/agent`, `packages/desktop`, карта происхождения (`verify_sources` — 5045 файлов).
Это не доказывает работу продукта в живом Loginom.

Установленные сейчас артефакты собраны до RC9:

| Артефакт | Версия | Клиент Dock внутри |
| --- | --- | --- |
| Desktop `/opt/loginom-ai-agent` | `0.1.4-local.20260918.697cc2e5a` | `0.1.0-rc.8` |
| CLI `~/.local/share/loginom-ai-agent-cli` | `0.1.4-local.20260918.697cc2e5a-prod` | `0.1.0-rc.8` |

Версия клиента читается из `resources/loginom/runtime/client/package.json` установленного
приложения. После RC9 там должно быть `0.1.0-rc.9`.

## Шаг 0. Видимый браузер

Разные пути запуска задают `headless` в разных местах. Перед прогоном нужно понимать,
какой из них используется.

| Путь запуска | Где задаётся | Как получить видимое окно |
| --- | --- | --- |
| Установленный Desktop | `packages/loginom-host/src/host.ts:39` | Уже видимый: headless остаётся только для `validation` и чата `readiness` |
| Установленный CLI | `packages/loginom-host/script/cli-oracle-transport.ts:66,76` | `LOGINOM_AI_AGENT_TEST_CLI_HEADED=1`, транспорт передаёт `--no-headless` |
| Прямой runtime в acceptance | `packages/desktop/test/loginom/runtime-acceptance.ts:79` | Сейчас жёстко `true`, требуется правка ниже |
| Независимое переоткрытие | `packages/desktop/test/loginom/cold-readback.mjs:54` | Сейчас жёстко `true`, требуется правка ниже |
| Managed smoke | `packages/desktop/test/loginom/runtime-smoke.ts:28,208` | Уже поддерживает `LOGINOM_AI_AGENT_TEST_HEADLESS=0` |
| Падение родителя | `packages/desktop/test/loginom/parent-crash.ts:20` | Оставить headless: сценарий про дерево процессов, окно не нужно |

### Обязательная правка перед прогоном

В `packages/desktop/test/loginom/runtime-acceptance.ts` заменить жёсткий флаг на
переменную окружения, как это уже сделано в `runtime-smoke.ts`:

```ts
// было
headless: true,
// стало
headless: process.env.LOGINOM_AI_AGENT_TEST_HEADLESS !== "0",
```

То же в `packages/desktop/test/loginom/cold-readback.mjs`:

```js
// было
headless: true,
// стало
headless: process.env.LOGINOM_AI_AGENT_TEST_HEADLESS !== "0",
```

`cold-readback.mjs` запускается как отдельный процесс из `reopen()`, поэтому переменную
нужно пробросить: `Bun.spawn` наследует окружение, отдельных действий не требуется.

Правка меняет только значение по умолчанию для acceptance-скриптов. Поведение продукта
не затрагивается: `managed-entry.mjs` берёт `headless` из входа `start`, а Desktop и так
показывает окно в обычных чатах.

### Условия графической сессии

`createSession` в `packages/loginom-runtime/client/lib/session.mjs:18` отказывает с
`A visible Dock browser requires a graphical session`, если на Linux нет ни `DISPLAY`,
ни `WAYLAND_DISPLAY`. Поэтому видимые прогоны выполняются в настоящем сеансе рабочего
стола, а не под `xvfb-run` и не по SSH без проброса.

Видимое окно открывается с `--start-maximized` и `viewport: null`; при `XDG_SESSION_TYPE=wayland`
добавляется `--ozone-platform=wayland` (`packages/loginom-runtime/src/connection-check.mjs:68`).
Сценарий идёт последовательно: набор A, переоткрытие A, набор B, переоткрытие B — окна
появляются по одному.

## Шаг 1. Входные материалы

| Материал | Значение на этой машине | Примечание |
| --- | --- | --- |
| Приватный конфиг | путь в `LOGINOM_AI_AGENT_TEST_CONFIG` | Требуется `workflow_profile.passwordless_login: true`, иначе `TEST_PASSWORD_UNAVAILABLE` |
| Стенд Loginom | Loginom 7.4.2, отдельный тестовый аккаунт | Пакеты создаются с уникальным `run-id`, чужие не изменяются |
| Закреплённый Bun | требуется `1.3.14` | В PATH сейчас `1.3.11`; `build-cli.ts` откажет с `LOGINOM_BUN_NOTICE_REVISION_MISMATCH` |
| Node 24.19.0 | `~/.cache/loginom-ai-agent/toolchain/node-v24.19.0-linux-x64/bin/node` | Значение `LOGINOM_AI_AGENT_NODE_SOURCE` |
| Chromium 1243 | `~/.cache/loginom-ai-agent/browsers` | Значение `LOGINOM_AI_AGENT_BROWSER_SOURCE` |
| Node для тестов | `~/.loginom-dock/current/runtime/node` | Значение `LOGINOM_AI_AGENT_TEST_NODE` |

Секреты не попадают в отчёт, в имена процессов и в логи. Значение `api_key` проверяется
транспортами: при появлении ключа в stdout/stderr прогон падает с `SECRET_IN_*`.

## Шаг 2. Сборка Desktop из коммита RC9

Из корня репозитория установить workspace-зависимости закреплённым Bun. Затем из
`packages/desktop`:

```sh
export LOGINOM_AI_AGENT_CHANNEL=prod
export LOGINOM_AI_AGENT_NODE_SOURCE="$HOME/.cache/loginom-ai-agent/toolchain/node-v24.19.0-linux-x64/bin/node"
export LOGINOM_AI_AGENT_BROWSER_SOURCE="$HOME/.cache/loginom-ai-agent/browsers"
bun run build
bun run package:linux --x64 --publish never
bun typecheck
bun test src/main/loginom electron-builder.config.test.ts scripts/release/artifact.test.ts
```

Сборка выполняется из чистого дерева. Для dirty tree manifest намеренно не выпускается:
незакоммиченные build inputs сначала получают воспроизводимый commit.

Канал выбирается осознанно. `prod` обновит текущую установку `/opt/loginom-ai-agent`;
`dev` или `beta` ставятся рядом и сохраняют текущий Desktop нетронутым. Для первой
проверки RC9 удобнее отдельный канал, для финальной приёмки — `prod`.

Release manifest и статическая проверка артефактов:

```sh
bun scripts/release/write-manifest.ts --target linux-x64 --version <версия> --channel <канал> --dist dist --resources resources/loginom --output dist/release-manifest.json
bun scripts/release/verify-artifact.ts --manifest dist/release-manifest.json --artifact dist/loginom-ai-agent-linux-amd64.deb --report dist/static-deb.json
bun scripts/release/verify-artifact.ts --manifest dist/release-manifest.json --artifact dist/loginom-ai-agent-linux-x86_64.AppImage --report dist/static-appimage.json
```

## Шаг 3. Сборка CLI из того же коммита

Из `packages/loginom-host`, с закреплённым Bun 1.3.14 в PATH и теми же `NODE_SOURCE` /
`BROWSER_SOURCE`:

```sh
bun script/build-cli.ts /absolute/new/artifact-dir
```

Каталог назначения должен отсутствовать: существующий артефакт не перезаписывается.
Рядом с payload создаются `loginom-ai-agent-cli-<version>-linux-x64.tar.gz` и `.sha256`.
Установка и удаление выполняются скриптами `install.sh` и `uninstall.sh` из payload;
uninstall сохраняет профили CLI и Desktop.

## Шаг 4. Установка и проверка идентичности

```sh
sudo apt install ./dist/loginom-ai-agent-linux-amd64.deb
```

После установки подтвердить, что внутри лежит именно RC9:

```sh
# версия клиента Dock должна быть 0.1.0-rc.9
grep '"version"' /opt/loginom-ai-agent/resources/loginom/runtime/client/package.json

# lock должен совпасть с пином продукта
sha256sum /opt/loginom-ai-agent/resources/loginom/runtime/client/package-lock.json
# ожидается e05c8ba33f055e321f04760d55eb9e23b00bfe011fe5a68a1118461cc2ae095a

# состав и хеши ресурсов
head -c 400 /opt/loginom-ai-agent/resources/loginom/resource-manifest.json
```

Значение `runtimeLockSha256` в [loginom-release.json](../../../packages/product/loginom-release.json)
должно совпасть с посчитанной суммой. Расхождение означает, что установлен не тот runtime,
и дальнейшие сценарии не имеют смысла.

Для CLI: `loginom-ai-agent-cli --version`, затем `loginom-ai-agent-cli loginom status`
в отдельном профиле.

Опционально, до живых сценариев: контейнерная матрица чистой установки

```sh
bun test/loginom/docker/run-matrix.ts --artifact dist/loginom-ai-agent-linux-amd64.deb --output dist/linux-matrix
```

Матрица headless по своей природе и подтверждает только установку и ресурсы, а не работу
в Loginom.

## Шаг 5. Живой сценарий на прямом runtime установленных ресурсов

Это первый прогон, в котором видно окно браузера. Он использует ресурсы установленного
приложения, а не сборочный каталог репозитория.

Из `packages/desktop`:

```sh
LOGINOM_AI_AGENT_TEST_CONFIG=/absolute/private/config.json \
LOGINOM_AI_AGENT_TEST_RESOURCES=/opt/loginom-ai-agent/resources/loginom \
LOGINOM_AI_AGENT_TEST_HEADLESS=0 \
bun test/loginom/runtime-acceptance.ts
```

Переменная `LOGINOM_AI_AGENT_TEST_RESOURCES` обязательна: без неё берётся
`packages/desktop/resources/loginom` из репозитория, и проверка перестаёт относиться к
установленному артефакту.

Что смотреть глазами, пока идёт прогон:

1. Вход в Loginom без ввода пароля, открытие рабочей области.
2. Доставка `sales.csv` через `dock_artifact_deliver`: переход по каталогу файлов,
   загрузка, подтверждение. В RC9 здесь новая логика повторного поиска папки после
   `UI_EPOCH_CHANGED` и pre-upload checkpoint — повторной загрузки одного файла быть не должно.
3. Создание узла импорта и узла группировки, связь между ними.
4. Выполнение и чтение выхода.
5. Сохранение через `package.save_checkpoint` в путь
   `/<аккаунт>/loginom-ai-agent-acceptance-<chat>.lgp`.
6. Закрытие пакета при остановке runtime: окно закрывается само, без ручного клика по меню.
   В RC9 инструмент `dock_ui_action` в профиле `user-v1` не публикуется, поэтому закрытие
   идёт только этим путём.
7. Независимое переоткрытие сохранённого пакета в новом процессе (`cold-readback`).

Эталон данных: набор A даёт `Alpha 35`, `Beta 20`, сумму `55`; набор B — `Alpha 100`,
`Beta 1`, сумму `101`. Оба файла называются `sales.csv`, но лежат в разных папках; при
совпадении фактического пути загрузки прогон падает с `SAME_NAME_INPUT_COLLISION`.

Квитанция закрытия пакета читается из
`<stateDir>/generations/1/chats/<chat>/attempts/<uuid>/package-cleanup.json`. Требуется
`status: SUCCEEDED`, `package_closed`, `logged_out`, `unsaved_changes_discarded: false`,
совпадение пути пакета и идентификатора последней операции сохранения. Отсутствие файла
даёт `PACKAGE_CLEANUP_RECEIPT_MISSING`.

При неопределённом исходе тест останавливается и сохраняет отдельные receipts. Повторять
такую операцию автоматически нельзя: сначала осмотр фактического состояния в Loginom.

## Шаг 6. Установленный Desktop

```sh
LOGINOM_AI_AGENT_TEST_CONFIG=/absolute/private/config.json \
LOGINOM_AI_AGENT_TEST_DESKTOP_EXECUTABLE=/opt/loginom-ai-agent/loginom-ai-agent \
bun test/loginom/runtime-acceptance.ts
```

Браузер здесь видим по умолчанию: `host.ts` оставляет headless только для проверки
подключения и чата `readiness`. Отдельная переменная не нужна.

Ограничение: для Desktop-транспорта закрытие пакета фиксируется как
`package_close: "UNVERIFIED"`. Продукт не принимает acceptance-параметр очистки, а
`dock_ui_action` модели больше не виден. Арбитром выступает независимое переоткрытие:
удержанная блокировка пакета проявится как `COLD_PACKAGE_NOT_WRITABLE`.

## Шаг 7. Установленный CLI

```sh
LOGINOM_AI_AGENT_TEST_CONFIG=/absolute/private/config.json \
LOGINOM_AI_AGENT_TEST_CLI_EXECUTABLE="$HOME/.local/bin/loginom-ai-agent-cli" \
LOGINOM_AI_AGENT_TEST_CLI_HEADED=1 \
bun test/loginom/runtime-acceptance.ts
```

Для интерфейса TUI дополнительно `LOGINOM_AI_AGENT_TEST_CLI_INTERFACE=tui`. Транспорт
передаёт `--no-headless` и дополнительно наблюдает окна браузера: при `headed` без единого
видимого окна прогон считается неуспешным.

Ограничение по закрытию пакета то же, что у Desktop.

## Шаг 8. Дополнительные проверки установленного приложения

| Проверка | Команда | Режим браузера |
| --- | --- | --- |
| Мастер подключения в GUI | `test/loginom/gui-smoke.mjs` с `LOGINOM_AI_AGENT_TEST_EXECUTABLE` | По умолчанию окно приложения видно |
| Аварийное завершение родителя | `bun test/loginom/parent-crash.ts` | Headless осознанно: проверяется дерево процессов |
| Системный прокси | `test/loginom/system-proxy.ts` с `LOGINOM_AI_AGENT_TEST_NODE` | Без браузера |
| Обновление N→N+1 | [runbook апдейтера](../../../packages/desktop/test/loginom/updater/README.md) | Изолированные тестовые сборки |

Эти пункты не относятся напрямую к RC9, но входят в приёмку установленного артефакта,
если пересобирается пользовательская установка.

## Шаг 9. Отчёт

Результат оформляется по [шаблону](report-template.md) в
`reports/<дата>-rc9-installed/report.md`. Обязательно фиксируются:

- commit ветки `sync-dock-rc9`, чистота дерева, версия и канал сборки;
- SHA256 DEB/AppImage и CLI-архива, имя и SHA256 release manifest;
- версия клиента Dock внутри установленного приложения и посчитанный `runtimeLockSha256`;
- для каждого из трёх транспортов: run-id, chat ID, operation/receipt ID, фактические
  суммы 55 и 101, путь сохранённого пакета, результат переоткрытия, статус закрытия пакета;
- подтверждение, что браузер запускался видимым, и каким способом это задано;
- созданные тестовые пакеты и файлы: что оставлено, что удалено.

Одного ответа модели «готово» недостаточно. `PASS` ставится только по квитанциям и
фактически прочитанным таблицам.

## Что останется недоказанным после этих шагов

Прогон на Linux не сертифицирует Windows и macOS: их приёмка описана отдельно в
[README](README.md). Подпись артефактов, публичный feed обновлений и полный
attribution/source/relinking audit в этот объём не входят.

Отдельно остаются два пункта, не связанных с живым сценарием: новый архивный снимок
исходников для commit `83c52ebb` (существующий `20260916-source-01` содержит только
`f0ecbb35`) и экологические падения Python-аудиторов на Python 3.10
(`datetime.fromisoformat` с суффиксом `Z`, `csv` с NUL, ссылки на архивный `plugins/`
и на путь документов, переехавший в `services/loginom-ai/docs`).
