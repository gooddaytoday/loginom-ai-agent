# macOS 14+ Apple Silicon: сборка и нативная приёмка

## Тестовый канал dev — 2026-09-19

Текущая реализация и проверки: [отчёт](reports/2026-09-19-macos/report.md),
[план выполнения](../../../plan.md). Результаты macOS27 и macOS14 учитываются
раздельно. Ниже приведена процедура для ad-hoc кандидата: Developer ID,
notarization, Gatekeeper trust и auto-update не входят в этот этап.

Требуются arm64, macOS14+, Command Line Tools, Bun1.3.14, полный Node24.19.0
с npm и LICENSE. Инструменты можно распаковать в отдельный каталог и добавить
в PATH только для команд сборки. Не менять системные установки ради сборки.

Из корня чистого зафиксированного checkout:

```sh
bun install --frozen-lockfile --filter loginom-ai-agent --filter '@loginom-ai-agent/desktop' --filter '@loginom-ai-agent/agent' --filter '@loginom-ai-agent/loginom-host' --filter '@loginom-ai-agent/product'
node packages/desktop/node_modules/electron/install.js
export LOGINOM_AI_AGENT_NODE_SOURCE="$(command -v node)"
export LOGINOM_AI_AGENT_TEST_NODE="$LOGINOM_AI_AGENT_NODE_SOURCE"
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.codex/macos-browsers"
export LOGINOM_AI_AGENT_BROWSER_SOURCE="$PLAYWRIGHT_BROWSERS_PATH"
```

В `packages/loginom-runtime/client` установить runtime по отдельному lock:

```sh
npm ci --ignore-scripts --omit=dev --no-audit --fund=false --workspaces=false
node node_modules/playwright/cli.js install chromium
```

Из корня проекта выполнить проверки и общую локальную/CI-сборку:

```sh
bun packages/desktop/scripts/check-macos.ts "$PWD/.codex/source-checks.json"
bun packages/desktop/scripts/build-macos.ts --output "$PWD/.codex/candidate-01" --version 0.1.4-macos.1
```

Каталог кандидата должен отсутствовать. Скрипт использует dev по умолчанию,
передаёт единую версию backend/Desktop/CLI, вызывает `--publish never`,
сохраняет исходники того же commit, манифесты, SHA256 и отчёты проверки.
Node/Chromium сохраняют upstream подписи; собственные бинарники подписываются
ad-hoc до манифестов. CLI payload находится в `cli/`, TAR.GZ — рядом с DMG/ZIP.
Не запускайте `scripts/prepare.ts`: legacy script изменяет package.json.

Статические проверки: DMG подключается readonly, ZIP распаковывается,
проверяются хеши, framework symlinks, arm64, подписи и минимальная ОС.
Автономный smoke использует встроенные Node/Chromium, отдельные HOME/profiles
и системный PATH. Desktop probe передаёт `--use-mock-keychain`, чтобы
пустой временный HOME не вызывал интерактивный Keychain UI на CI. Эта настройка
относится только к smoke без credentials; реальный safeStorage/Keychain проверяется
отдельно на установленном продукте. Smoke не подключается к Loginom и не заменяет
полную приёмку.
CI `.github/workflows/loginom-macos.yml` повторяет этот процесс на `macos-14`
и сохраняет результаты в Actions artifacts; секреты сервисов не нужны.

Устанавливайте `.app` из DMG в отдельный тестовый каталог Applications,
сохраняя bundle целиком; CLI — через `install.sh` из полного распакованного
архива. Для тестов задайте отдельные Desktop `LOGINOM_AI_AGENT_TEST_ROOT`
и CLI `LOGINOM_AI_AGENT_CLI_PROFILE`. Не заменяйте работающий пользовательский
продукт. Пользовательские данные сохраняются при удалении bundle/payload.
Доступ Keychain после изменённой ad-hoc подписи требует отдельной проверки;
успешная замена идентичными signed bytes этого не доказывает.

Дальнейший протокол сохраняет release-требования как справочные. Требования
Developer ID/notarization/update feed оцениваются только при отдельном релизе.

Прочитать [общий протокол и сценарии](README.md), вести [отчёт](report-template.md). При отсутствии Loginom DMG и manifest нативная приёмка конкретного кандидата имеет статус **BLOCKED**. Выполненные проверки и ограничения приведены в датированном отчёте выше; процедура сама по себе не подтверждает их выполнение.

## 1. Машина и входные материалы

- Настоящий Mac Apple Silicon, macOS 14 или новее. Проверка на более новой ОС не закрывает минимальную macOS 14; указать отдельные строки матрицы.
- Нативная arm64-сессия. Intel Mac или запуск под Rosetta не заменяют целевую конфигурацию.
- Отдельный чистый пользователь/снимок без Node, Bun, Python, npm и Chrome/Chromium, без старых Dock/browser caches. Safari — часть ОС, удалять его не нужно.
- DMG и manifest; для обновления — версии N/N+1 и собственный feed. Для release-проверки — ожидаемый Developer ID/Team ID и нотариализация.
- Доступный разрешённый Loginom и сервер знаний, credentials отдельно; провайдер LLM подключается в существующих настройках. Недоступный DNS тестового значения по умолчанию не менять незаметно: сначала проверить default в форме, затем ввести переданный адрес.

Build environment и clean-install environment должны быть разными. На машине, где уже установлены Node/Chrome, PKG-01 считается непроверенным, пока не выполнен независимый чистый прогон.

## 2. Окружение и подлинность артефакта

В Terminal:

```sh
sw_vers
uname -m
arch
command -v node bun python python3 npm chromium google-chrome
```

В ожидаемом целевом прогоне архитектура `arm64`. Найденные системные инструменты фиксируются, а отсутствие вывода `command -v` дополняется проверкой установленных приложений и browser cache в тестовом профиле. Не удалять компоненты рабочей машины ради теста.

Подставить настоящий путь к DMG из manifest; пример ниже предназначен для стандартного zsh Terminal:

```sh
read -r 'agent_dmg?Путь к DMG из release manifest: '
shasum -a 256 "$agent_dmg"
hdiutil verify "$agent_dmg"
```

Сравнить SHA256 с manifest. Только для будущего нотариализованного release-пакета выполнить `xcrun stapler validate "$agent_dmg"`; для текущего ad-hoc кандидата отсутствие stapling ожидаемо. `stapler` требует developer tools: при их отсутствии проверку stapling выполнить на отдельной build-машине, а нативную clean-install проверку Gatekeeper — на чистом Mac. Не устанавливать developer tools в середине теста отсутствия runtime.

Неправильный hash блокирует использование артефакта. Для release-пакета отсутствие ожидаемой подписи/нотариализации — дефект packaging; для dev-пакета это ограничение exploratory run, не подтверждение release gate.

## 3. Установка, Gatekeeper и архитектура

1. Получить пакет обычным способом распространения, сохраняющим quarantine. Зафиксировать источник. Локально собранный файл без quarantine не проверяет обычный первый запуск скачанного приложения.
2. Открыть DMG Finder, перенести приложение в Applications способом, указанным в инструкции релиза. Проверить product name/иконку и корректную установку без отдельно устанавливаемых runtime.
3. Отключить сеть и открыть приложение обычным способом. Записать поведение Gatekeeper. Не выполнять `xattr -dr com.apple.quarantine` и не отключать Gatekeeper для получения `PASS`.
4. Мастер должен открыться без скачивания Chromium и без шага выбора LLM. Проверить PKG-01/UI-01.
5. Подключить сеть, настроить Loginom и запустить браузер. В Activity Monitor проверить путь, PID и поле Kind для desktop, исполнителя и Chromium. Все целевые бинарные файлы — arm64; требование установить Rosetta — `FAIL packaging/native`.
6. Проверить запуск из Finder/Dock после закрытия Terminal: приложение не зависит от shell PATH, Homebrew, nvm или интерактивных startup files.
7. Повторить загрузку файла из каталога с пробелами/кириллицей. Доступ к файлам проходит через штатные диалоги; фиксировать реальные разрешения macOS без выдачи Full Disk Access на всякий случай.

Дополнительные проверки установленного bundle выполняются на машине с доступными системными утилитами; настоящий путь берётся из manifest:

```sh
read -r 'agent_app?Путь к установленному .app из release manifest: '
codesign --verify --deep --strict --verbose=2 "$agent_app"
codesign -dv --verbose=4 "$agent_app"
```

Для будущего Developer ID release дополнительно выполнить `spctl --assess --type execute --verbose=4 "$agent_app"`. Ad-hoc подпись текущего кандидата не подтверждает Gatekeeper trust. Проверить `Identifier`, ожидаемый тип подписи и подписи вложенных helper/runtime/Chromium; `TeamIdentifier` собственного ad-hoc кода отсутствует. Для бинарных файлов из manifest выполнить `file <точный путь>`; при необходимости `lipo -archs <точный путь>` на build-машине. Не сканировать все пользовательские каталоги и не включать секретные paths в общедоступный отчёт.

Если старт неудачен: зафиксировать stage, время и сведения из Console/Crash Reports, затем сопоставить с desktop logs. Отделить signature/quarantine/entitlements от отсутствующего runtime, неверной архитектуры и network/auth failure. Успех после отключения защит ОС не закрывает дефект штатного запуска.

## 4. Keychain, настройки и активные задачи

Пройти UI-02 и CON-01…CON-08 из общего протокола. На macOS секреты должны храниться с защитой ОС согласно реализации; в обычных config остаются metadata/flags. Проверить сохранность при перезапуске под тем же пользователем, отсутствие открытых секретов в UI API, логах, диагностике и чатах. Экспорт Keychain или значения секретов в отчёт не включать.

Проверить доступ при заблокированном/недоступном хранилище на одноразовом тестовом профиле. Разблокировка/системный запрос допускаются согласно реализации; тихое сохранение в plaintext — дефект. Не сбрасывать рабочий login keychain ради воспроизведения.

Во время двух активных задач сохранить новый набор параметров: обе задачи остаются на прежней generation до завершения drains. При неразрешённом исходе операции generation тоже не переключается. Переоткрытие приложения не должно автоматически повторять изменение без receipt-проверки.

Проверка подключения не обращается к папке `/<username>`; для CON-02 требуется доказательство запросов/тестового окружения. Фактическая загрузка и сохранение далее используют этот корень, сохраняя проверки корректности самой операции.

## 5. Работа, обновление, удаление

Выполнить MODEL-01, FLOW-01 и ISO-01: значения эталона 55/101, отдельные browser profiles и вложения, сохранение/переоткрытие Loginom-пакета. Затем REC-01/REC-02, LIFE-01 и LOG-01. Завершать при проверке сбоя только конкретный дочерний PID приложения; `killall` для всех Chromium/Chrome недопустим.

UPDATE-01 требует версии N/N+1 и собственного feed. Для Electron macOS одного DMG может быть недостаточно: передать ZIP и update metadata, если их использует конфигурация релиза. Сверить manifest с фактически доступными файлами; отсутствие требуемого ZIP — packaging defect, отсутствие тестового feed вообще — `BLOCKED`. После обновления проверить подпись, generation/settings, чаты и FLOW-01. Не допускать перехода к сборке OpenCode.

Для REMOVE-01 закрыть приложение, удалить только его bundle и компоненты согласно release-инструкции. Сохранение/удаление пользовательских config, данных и Keychain записей сверить с политикой manifest. Не удалять целиком `~/Library/Application Support`, Keychain или данные чужого OpenCode. Проверить отсутствие дочерних процессов и результат повторной установки.

## 6. Нативная сборка исправления

Использовать общий `packages/desktop/scripts/build-macos.ts` и закреплённые
в начале документа инструменты. Скрипт собирает Loginom AI Agent Desktop
и независимый CLI из чистого зафиксированного checkout. Результаты помещаются
в новый явно указанный каталог; предыдущие кандидаты сохраняются.

Перед сборкой выполнить `packages/desktop/scripts/check-macos.ts`. Он запускает
package-local проверки Desktop, Host, Product и Agent. После изменений
renderer дополнительно выполнить `bun typecheck` из `packages/app`.
Тесты запускаются из package directories, никогда из корня; прямой `tsc`
не используется.

На машине с ограниченной памятью Node может выбрать недостаточный для
Electron/backend bundling предел heap. CI задаёт только шагу сборки
`NODE_OPTIONS=--max-old-space-size=4096`; тот же параметр можно передать
локальной команде при аналогичном ограничении. Это настройка процесса сборки,
а не установленного приложения.

Текущий packaging использует Loginom product identity, arm64 DMG/ZIP,
минимальную macOS 14.0 и ad-hoc подпись без notarization и публикации.
Неиспользуемые ссылки на отсутствующий `packages/desktop/native` удалены.
Исторические указания о сборке OpenCode, backend в `packages/opencode`,
старом update feed и необходимости создать каталог `native` к этому
pipeline не применяются. Developer ID, notarization, N/N+1 и update feed
остаются отдельными требованиями будущей release-приёмки из разделов выше.

Передать исправление с commit/patch, новыми hash и протоколом повторных проверок.
Прогон прежнего DMG не подтверждает новый DMG даже при одинаковой видимой версии.
