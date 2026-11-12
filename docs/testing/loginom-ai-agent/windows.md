# Windows 11+ x64: установленный Desktop и нативная приёмка

Прочитать [общий протокол и сценарии](README.md) и создать [отчёт](report-template.md). Это инструкция будущего прогона, не подтверждение совместимости. Начальное состояние при отсутствии Loginom EXE/release manifest: **BLOCKED**.

## Автоматический smoke установленного NSIS с Linux

На выделенном Windows 11 x64 стенде с SSH запускается полный цикл
`/S /currentuser` → установленный EXE → штатное закрытие через Electron `app.quit()` →
`Uninstall … /S /currentuser`. На Linux нужны Python 3 и OpenSSH (`ssh`, `scp`),
на Windows — штатный Windows PowerShell 5.1. Node/Bun/отдельный Chrome не нужны.
Команда из корня checkout на mas:

```sh
python3 packages/desktop/test/loginom/windows-installed-smoke.py \
  'C:\lab\loginom-ai-agent-0.3.9-win-x64.exe' \
  --host winstand --channel prod --version 0.3.9 --output ./windows-v039
```

Первый аргумент — абсолютный путь на Windows, локальный Linux EXE (будет
скопирован на стенд) или HTTPS URL (скачивается на стенде). `--version` —
ожидаемая версия **внутри пакета**, а не имя ветки: кандидат `v040` может ещё
содержать `0.3.9`. Для кандидата workflow используйте `--channel dev` и
`--sha256 <desktop.sha256 из ci-summary.json>`; каждый запуск требует нового
`--output`. SSH alias должен быть настроен заранее, пароль не запрашивается.

Кандидат без публикации:

```sh
gh run list --workflow loginom-windows.yml --branch v040 --status success
gh run list --workflow loginom-windows.yml --branch local-help --status success
# Если успешного кандидата нет:
gh workflow run loginom-windows.yml --ref v040
gh run list --workflow loginom-windows.yml --branch v040
gh run watch <run-id> --exit-status
gh run download <run-id> --name loginom-windows-unsigned-<run-id> --dir ./windows-candidate
```

Выберите EXE, версию и канал того же artifact, проверьте `commit` и
`desktop.sha256` в `ci-summary.json`. `release.yml` собирает релизные кандидаты
и draft releases; `loginom-windows.yml` — отдельный Windows development
кандидат. Эти сборки не запускают установленный Desktop на Windows 11.

Скрипт печатает таблицу PASS/FAIL/WARN и возвращает 0 при отсутствии FAIL
(1 — отказ проверки, 2 — ошибка транспорта/получения отчёта). `report.json`
содержит hash, подпись, ОС, регистрацию Installed Apps, путь EXE, ярлыки,
PID/пути процессов и результаты. `logs.zip` содержит журналы изолированного
профиля. Оба файла скачиваются в `--output`; оригиналы и профиль остаются в
уникальном `C:\lab\loginom-smoke\<id>` для диагностики, путь печатается в конце.
Отчёты и журналы не коммитить.

Проверяются версия и `packaged/onboardingTest` в `app starting`, `server ready`,
живой главный процесс и дочерние процессы, отсутствие записей о сбоях в `crash.log`, minidump и
ошибок в журналах, отсутствие процессов из каталога установки после закрытия,
удаление файлов/регистрации/ярлыков. Для закрытия используется публичный
Electron `app.quit()` через Node inspector на случайном loopback-порту;
соединение разрывается до ожидания выхода. Это работает в SSH-сессии 0,
где видимых окон может не быть. Штатный `before-quit` и остановка sidecar
выполняются кодом установленного приложения. Зависший процесс принудительно убирается
только по принадлежащему установке PID и делает результат FAIL. Удаление
проверяет `preservesUserData=true` по маркеру в обычном `%APPDATA%\<appId>` и
сохранению журналов в `LOGINOM_AI_AGENT_TEST_ROOT`; собственный маркер затем
удаляется. Существующие пользовательские данные не удаляются. Тестовый режим
использует in-memory DB, поэтому история чатов/upgrade этим smoke не доказаны.

Стенд должен быть выделен этому прогону. Уже установленный продукт выбранного
канала — отказ preflight: сначала удалите его явно. Существующие установки и
процессы не заменяются. Установка идёт в новый каталог внутри RunRoot, поэтому
обычный путь установки по умолчанию требует отдельной проверки. Во время теста
и после него `ProxyEnable=0`; профиль сети, firewall и задачи планировщика
скрипт не меняет. Скрипт всегда пытается удалить собственную установку, включая
неуспешный запуск. `cleanup=FAIL` требует ручной уборки именно этой установки.
Smoke не заменяет полную матрицу ниже: он не проверяет бизнес-сценарии,
DPAPI, обновление, отображение UI и подпись релизного gate.

`no-crash-events` разрешает в `crash.log` только информационные записи
`crash reporter started` с полем `path` и закрывающей скобкой; отсутствие файла
тоже допустимо. Любое другое содержимое даёт FAIL. Это отдельно от
`no-minidumps` и `no-error-lines` (ERROR/FATAL, uncaught/unhandled rejection).
`background dependency install failed` выводится отдельной строкой
`background-dependency-install` со статусом WARN и ссылкой на журнал/строку
в таблице и JSON; само предупреждение не меняет итог PASS и exit 0.
ERROR/FATAL и minidump по-прежнему дают FAIL, даже если рядом есть WARN.
Проверка парсера без установки приложения (Windows PowerShell 5.1):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File packages/desktop/test/loginom/windows-installed-smoke.test.ps1
```

## 1. Машина и входные материалы

- Нативная Windows 11 x64, обычный пользователь. Записать edition, build ОС и архитектуру. Windows Server, Windows ARM64 и WSL не заменяют эту конфигурацию.
- Для минимальной границы нужна отдельная проверка Windows 11; дополнительная более новая Windows записывается отдельной строкой матрицы.
- Чистая VM или одноразовый пользовательский профиль без Node, Bun, Python, npm и отдельного Chrome/Chromium. Штатный Edge удалять не нужно: проверяется запуск именно комплектного Chromium.
- EXE и manifest из одного build; соседняя версия для update-теста, собственный тестовый feed, ожидаемый издатель подписи.
- Разрешённый стенд и credentials отдельно от артефактов. DNS/маршрут к `logi-test-plan.bg.local` должен быть доступен; внешний агент при недоступности может использовать переданный доступный стенд после проверки значения по умолчанию.

Сборку с dev dependencies выполнять на другой машине/снимке. Установка Node ради сборки на VM чистой приёмки делает PKG-01 недоказанным.

## 2. Подтверждение окружения и артефакта

В PowerShell, не запуская установщик:

```powershell
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture
Get-Command node,bun,python,python3,npm,chrome,chromium -ErrorAction SilentlyContinue |
  Select-Object Name, Source
```

Пустой вывод `Get-Command` сам по себе не доказывает отсутствие браузера: также проверить установленные приложения и отсутствие перенесённых старых browser cache в тестовом профиле. Ничего не удалять на рабочей машине пользователя ради чистого теста.

Получить путь к переданному EXE без подстановки выдуманного имени:

```powershell
$AgentInstaller = (Resolve-Path (Read-Host 'Путь к EXE из release manifest')).Path
Get-Item -LiteralPath $AgentInstaller | Select-Object Name, Length
Get-FileHash -LiteralPath $AgentInstaller -Algorithm SHA256
Get-AuthenticodeSignature -LiteralPath $AgentInstaller |
  Select-Object Status, StatusMessage, @{Name='Publisher';Expression={$_.SignerCertificate.Subject}}
```

Сравнить hash и издателя с manifest. При несовпадении hash тест этого пакета остановить (`BLOCKED`: получить правильный артефакт). Отсутствующая/недействительная подпись release-пакета — `FAIL packaging/native`; тест неподписанного dev-пакета маркировать отдельным exploratory run, без утверждения о пройденном release gate.

## 3. Установка и собственные процессы

1. Сделать снимок чистой VM. Сохранить исходный список установленных приложений и каталоги, указанные manifest; не включать содержимое секретов.
2. Отключить сеть и запустить EXE обычным способом из Explorer. Проверить имя, иконку, издателя и установку для обычного пользователя. Требование admin прав фиксируется фактически, не обходится запуском всего приложения от администратора.
3. Запустить из меню «Пуск»: мастер открывается автономно, отсутствуют предложения поставить Node/Chrome и загрузка runtime. Зафиксировать PKG-01 и UI-01.
4. Включить сеть, заполнить форму и выполнить PKG-02. Через Task Manager или Process Explorer установить дерево PID, путь каждого executable и архитектуру. Встроенный Electron runtime допускается для sidecar; отдельный Node нужен лишь там, где это объявлено manifest. Все требуемые бинарные файлы должны входить в установленный пакет.
5. Проверить файлы по manifest: пути с пробелами и кириллицей в имени локального пользователя/папки вложений. Не выводить полные command line дочерних процессов, если они могут содержать секреты.
6. Проверить открытие приложения повторно, закреплённый ярлык, About и URI scheme. Регистрации OpenCode не должны заменяться регистрациями Loginom AI Agent.

Если приложение не запускается, собрать время отказа, Event Viewer → Windows Logs → Application, сведения об отказавшем модуле и очищенные desktop logs по manifest. Установить, падает ли EXE, Electron sidecar, Node исполнителя или Chromium. Отсутствующая DLL, неверная архитектура и ошибка sandbox — разные дефекты. Не использовать постоянное отключение sandbox как критерий успешной приёмки.

## 4. Настройки и защищённое хранение

Пройти UI-02 и CON-01…CON-08 по общему протоколу. Важные признаки:

- Пароль изначально пустой, placeholder отсутствует. Нет поля storage root и запроса доступности `/<username>`.
- «Оставить», «заменить» и «без пароля» проверяются по отдельности с перезапуском.
- На Windows секреты защищены ОС согласно реализации из manifest; Linux-режим plaintext здесь недопустим. Обычные config/API показывают metadata, а не значения.
- Через стандартный UI убедиться, что вход после перезапуска работает под тем же Windows-пользователем. Если protected store недоступен, должна появляться явная диагностируемая ошибка; тихий переход к plaintext — `FAIL`.
- Негативные проверки сохраняют действующую конфигурацию. При активных задачах и неопределённом receipt параметры остаются pending, задачи не отменяются.

Проверять дисковые файлы локально. В отчёт писать «значение найдено/не найдено» и путь, не сам секрет. Нельзя публиковать экспорт Credential Manager, registry dump или содержимое browser profiles.

## 5. Сквозной сценарий и жизненный цикл

Выполнить MODEL-01, FLOW-01, ISO-01, REC-01, REC-02, LIFE-01 и LOG-01. Повторить загрузку вложения из пути с кириллицей/пробелами. Отключение Chromium выполнять только по PID, принадлежащему тестовому приложению; `taskkill` по имени всех Chrome-процессов неприемлем.

Для UPDATE-01 использовать переданную версию N и собственный test feed N+1. Проверить источник обновления, версию, сохранность конфигурации, чатов и повторный FLOW-01. Если feed не подготовлен — `BLOCKED`, а не «обновления не найдены = PASS». Проверить, что подпись обновления соответствует manifest.

Для REMOVE-01 использовать «Установленные приложения» Windows. Перед подтверждением удаления проверить ожидаемую политику данных из manifest; не удалять вручную глобальные `%APPDATA%`/`%LOCALAPPDATA%`. Записать оставшиеся файлы, shortcuts, URI registrations и процессы только этого приложения. Переустановить и сверить появление мастера с сохранёнными/удалёнными данными.

## 6. Если агенту потребуется собрать исправление

Текущая Windows-ветка предоставляет единый сценарий `script/build-windows.ps1`.
Он принимает `-Product Desktop`, `Cli` или `Both`, обязательный абсолютный
`-OutputDirectory`, закреплённые `-NodeSource` и `-BrowserSource`, а также
необязательные `-BunPath`, `-Channel` и `-SkipInstall`. Сценарий не изменяет
пользовательский `PATH` и запрещает перезапись существующего CLI payload.

Пример после подготовки portable runtime:

```powershell
& .\script\build-windows.ps1 `
  -Product Both `
  -OutputDirectory C:\build\loginom-ai-agent `
  -NodeSource C:\cache\node-v24.19.0-win-x64\node.exe `
  -BrowserSource C:\cache\browsers `
  -BunPath C:\cache\bun-windows-x64\bun.exe `
  -Channel prod
```

`BrowserSource` должен содержать
`chromium-1246\chrome-win64\chrome.exe` (revision берётся из
`packages/product/loginom-release.json`). Для повторного локального запуска с
уже установленными зависимостями допустим `-SkipInstall`; release-проверка из
чистого checkout должна выполнять установку по lockfile.

### CI-кандидат без публикации

Workflow [loginom-windows.yml](../../../.github/workflows/loginom-windows.yml)
запускается вручную и для затрагивающих Windows-сборку pull request. Он работает
на `windows-2022`, использует portable Node 24.19.0 и Bun 1.3.14 из закреплённых
setup actions, отдельно готовит Chromium revision из `loginom-release.json`
(сейчас 1246) и передаёт абсолютные
пути `-NodeSource`, `-BrowserSource` и `-BunPath` в единый сценарий.

CI выполняет clean-checkout `-Product Both`, package-local typecheck/тесты,
повторную проверку ZIP checksum и проверяет, что NSIS development installer не
подписан. На семь дней сохраняются только EXE, CLI ZIP с checksum и
`ci-summary.json`; GitHub Release, feed, подпись и другие каналы публикации не
создаются. Имя workflow artifact содержит `github.run_id`, а commit и SHA256
находятся в summary.

GitHub-hosted `windows-2022` — Windows Server, а не чистая Windows 11. Зелёный CI
подтверждает сборку и статическую целостность пакетов, но не закрывает PKG-01/02,
GUI, DPAPI/safeStorage, ConPTY, lifecycle, proxy, Dock/ChatGPT или CSV-сценарии.
Для них нужно распаковать конкретный CI artifact, сверить его с
`ci-summary.json` и пройти разделы 1–5 на отдельной Windows 11 VM. Поскольку
кандидат намеренно неподписан, его можно обозначать только как development или
exploratory artifact; release gate подписи остаётся непройденным.

Ниже сохранены package-local команды для диагностики отдельных стадий. Для
кандидата результата предпочтителен единый сценарий выше; manifest и отчёт
должны относиться к тому же source snapshot.

На отдельной build-машине: Node 24 согласно CI; Bun версии из корневого `packageManager` (при подготовке документа — 1.3.14). Для нативных зависимостей использовать требования установщиков из lockfile/CI; Python и Visual Studio Build Tools понадобятся при компиляции соответствующих native модулей. Установка этих инструментов не является частью пользовательского установщика.

В корне checkout:

```powershell
bun install --linker hoisted
```

Из `packages/desktop` (перейти в каталог отдельной командой):

```powershell
bun typecheck
bun run build
bun run package:win --x64 --publish never
```

Выход package-local сборки — `packages/desktop/dist/`. `prebuild` запускается как lifecycle script и строит Node backend. `package:win` определён как electron-builder; `--publish never` запрещает публикацию. Актуальная общая сборка Desktop/CLI и draft release находится в [release.yml](../../../.github/workflows/release.yml); Windows development кандидат — в `loginom-windows.yml`. Старые названия `loginom-desktop.yml`/`publish.yml` не являются командами текущего выпуска.

После изменения renderer дополнительно выполнить `bun typecheck` из `packages/app`; после backend — из `packages/opencode`. Нужные тесты запускать только из своего package directory. Тесты из корня запрещены, `tsc` напрямую не запускать. Для packaging: `bun test electron-builder.config.test.ts scripts/release/artifact.test.ts` из `packages/desktop`; Windows workflow содержит дополнительные package-local проверки.

После каждого исправления пересобрать артефакт, записать новый commit/patch и SHA256, затем повторить изменённые и зависимые сценарии на чистом тестовом снимке. Результаты старого hash нельзя приписывать новому EXE.


## Приёмка исправления масштаба (2026-09-24)

Обязательная матрица и текущие исходные доказательства: [browser-scale](browser-scale.md).
Исторические результаты этого runbook не подтверждают исправленный payload.
