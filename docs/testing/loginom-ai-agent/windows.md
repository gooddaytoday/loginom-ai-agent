# Windows 11+ x64: передача агенту нативной приёмки

Прочитать [общий протокол и сценарии](README.md) и создать [отчёт](report-template.md). Это инструкция будущего прогона, не подтверждение совместимости. Начальное состояние при отсутствии Loginom EXE/release manifest: **BLOCKED**.

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
`chromium-1243\chrome-win64\chrome.exe`. Для повторного локального запуска с
уже установленными зависимостями допустим `-SkipInstall`; release-проверка из
чистого checkout должна выполнять установку по lockfile.

### CI-кандидат без публикации

Workflow [loginom-windows.yml](../../../.github/workflows/loginom-windows.yml)
запускается вручную и для затрагивающих Windows-сборку pull request. Он работает
на `windows-2022`, использует portable Node 24.19.0 и Bun 1.3.14 из закреплённых
setup actions, отдельно готовит Chromium revision 1243 и передаёт абсолютные
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

Выход текущей сборки — `packages/desktop/dist/`. `prebuild` запускается как lifecycle script и строит Node backend; в dev возможна загрузка существующего upstream CLI. `package:win` определён как electron-builder; `--publish never` запрещает публикацию. Не запускать существующий `.github/workflows/publish.yml` как готовый релиз Loginom: в нём пока upstream owner/channel/signing.

После изменения renderer дополнительно выполнить `bun typecheck` из `packages/app`; после backend — из текущего `packages/opencode`, а **после согласованного переименования — из `packages/agent`**. Нужные тесты запускать только из своего package directory; конкретные новые Loginom test paths должны быть указаны в manifest/плане реализации, их здесь ещё нет. Тесты из корня запрещены, `tsc` напрямую не запускать.

В текущем checkout отсутствует `packages/desktop/native`, хотя packaging config его упоминает. Это наблюдение исходников, не результат сборки: при соответствующем отказе нужно восстановить объявленную dependency/build stage либо исправить состав пакета. Не создавать пустую папку ради зелёной сборки.

После каждого исправления пересобрать артефакт, записать новый commit/patch и SHA256, затем повторить изменённые и зависимые сценарии на чистом тестовом снимке. Результаты старого hash нельзя приписывать новому EXE.
