# План реализации Loginom AI Agent для Windows

## Цель и правила ведения

Получить отлаженные нативные сборки Desktop и самостоятельного CLI для Windows 11 x64: EXE-установщик и ZIP-архив.

Агент отмечает `[x]` только после выполнения и проверки пункта. Рядом с завершённым этапом добавляет дату, commit и краткий результат проверок. Заблокированные пункты остаются `[ ]` с описанием причины. Секреты в план, репозиторий и отчёты не записываются.

Принятые решения:

- Desktop и CLI используют независимые backend v1, процессы и профили.
- Сквозные проверки используют существующее подключение Dock и стенд `logi-test-plan.bg.local`. Проверка модели под Windows выполняется через **Xiaomi Token Plan**, endpoint `https://token-plan-sgp.xiaomimimo.com/v1`, модель `mimo-v2.5`; токен передаётся только через временную переменную окружения и не сохраняется в репозитории, плане или отчётах.
- Для тестирования создаются отдельные профили и тестовые пакеты.
- Результат этапа — локальные неподписанные сборки.
- Публикация, цифровая подпись, автообновление, перенос сервера, Windows ARM64 и WSL исключены.

## Этап 0. Изучение и согласование

- [x] Изучить ветку `loginom`, commit `697cc2e5addff232f2faeb9be8c4790100995f18`.
- [x] Прочитать инструкции основных модулей и отчёты Linux.
- [x] Определить существующие Windows-реализации и пробелы.
- [x] Проверить ОС, доступные инструменты и сетевую доступность стенда.
- [x] Согласовать Desktop + CLI, локальные сборки и проверку через Xiaomi Token Plan.
- [x] Сохранить этот план в `WINDOWS_IMPLEMENTATION_PLAN.md`.

Выявлено: отсутствует вызываемый сборкой `copy-icons.ts`; Desktop-манифесты ограничены Linux/ELF; часть тестовых драйверов зависит от `/proc` и X11; CLI отклоняет используемые на компьютере исключения системного прокси.

**Результат этапа — 2026-09-18:** изучены удалённые исходники commit `697cc2e5addff232f2faeb9be8c4790100995f18`, подтверждены Windows 11 x64 и доступность страницы Loginom (HTTP 200). Endpoint Dock отвечает HTTP 401 без авторизации; действительность сохранённых доступов пока не проверена. План сохранён локально. Сборка и нативная приёмка ещё не выполнялись.

## Этап 1. Подготовка рабочего окружения

- [x] Получить репозиторий в текущую папку, сохранив файл плана. Для непустой папки использовать `git init`, добавление remote и получение нужной ветки.
- [x] Создать ветку `windows-native` от изученного commit.
- [x] Подготовить Node 24.19.0 и Bun 1.3.14 отдельно от существующих установок.
- [x] Настроить окружение сборки без постоянного изменения пользовательского PATH.
- [x] Установить workspace-зависимости по закреплённому lockfile.
- [x] Подготовить Windows Chromium и проверить закреплённые контрольные суммы.
- [x] Создать отдельные каталоги сборок, тестовых профилей и диагностических материалов.
- [x] Подтвердить действительность существующих доступов Dock без вывода секретов.

Промежуточный результат 2026-09-18, commit `697cc2e5addff232f2faeb9be8c4790100995f18`: портативные Node/Bun и Chromium проверены по SHA256, relevant workspace-фильтр установлен без изменения lockfile. Первоначальный полный install останавливался на временном integrity mismatch удалённого `@solidjs/start`; повторный `bun 1.3.14 install --frozen-lockfile` 2026-09-19 завершился успешно без изменения lockfile.

**Готовность:** инструменты запускаются, зависимости установлены, исходные ресурсы проверены.

## Этап 2. Нативная сборка Desktop и CLI

- [x] Добавить PowerShell-сценарий сборки с выбором Desktop, CLI или обоих продуктов и явным выходным каталогом.
- [x] Восстановить копирование существующих фирменных иконок.
- [x] Исправить неработающие команды подготовки Desktop.
- [x] Исправить Windows-пути, расширения `.exe` и запуск вспомогательных процессов.
- [x] Проверить включение необходимых нативных зависимостей.
- [x] Собрать Desktop с комплектными Node, Playwright и Chromium.
- [x] Собрать самостоятельный CLI с комплектным runtime.
- [x] Получить пользовательский NSIS-установщик Desktop.
- [x] Получить ZIP CLI с `install.cmd` и `uninstall.cmd`.
- [x] Повторить сборку из чистого checkout без неучтённых локальных файлов.

**Готовность:** оба продукта собираются одной документированной процедурой; запуск не требует загрузки runtime.

## Этап 3. Windows-интеграция и сеть

### Профили и секреты

- [x] Проверить разделение профилей Desktop/CLI и каналов приложения.
- [x] Проверить Electron safeStorage для Desktop.
- [x] Проверить DPAPI CurrentUser для CLI.
- [x] Проверить сохранение и чтение секретов после перезапуска.
- [x] Проверить отказ при повреждённых данных или недоступной защите без перехода к plaintext.
- [x] Проверить ACL профиля CLI и блокировку одновременного доступа.

### Системный прокси

- [x] Подключить чтение пользовательских настроек прокси Windows к обоим продуктам до запуска backend/runtime.
- [x] Реализовать общий выбор прямого соединения или прокси для URL.
- [x] Поддержать отдельные HTTP/HTTPS-прокси, доменные и IP-шаблоны, `<local>` и loopback.
- [x] Подключить маршрутизацию к используемым HTTP, fetch и WebSocket-вызовам Node/Bun.
- [ ] Проверить внутренний Loginom, внешний Dock, Xiaomi Token Plan и OAuth callback одним installed-прогоном.
- [x] Для неподдерживаемых режимов выдавать явную ошибку; системные настройки компьютера не изменять.

### Жизненный цикл

- [x] Проверить штатное закрытие через IPC и подтверждение очистки.
- [x] Проверить Ctrl+C и повторное прерывание CLI.
- [x] Проверить потерю родительского процесса и аварии runtime/Chromium: три Windows taskkill-сценария завершились без живых потомков.
- [x] Ограничить принудительную очистку процессами конкретного запуска.
- [x] Сохранять блокировку и состояние восстановления при неподтверждённой очистке.

**Готовность:** соединения работают в текущем окружении, секреты защищены, неопределённые операции не повторяются автоматически.

## Этап 4. Манифесты и установка

- [x] Расширить Desktop-манифест целью `win32-x64`, пользовательской установкой, NSIS-артефактом и Windows-путями.
- [x] Добавить проверку PE/AMD64 и комплектных ресурсов.
- [x] Сохранить совместимость проверки с существующими Linux-манифестами.
- [x] Проверить CLI-манифест после упаковки, распаковки и установки.
- [x] Проверить отклонение повреждённых и неполных артефактов.
- [x] Проверить установку CLI в `%LOCALAPPDATA%\Programs\loginom-ai-agent-cli`.
- [x] Сохранить явное добавление CLI в PATH пользователем.
- [x] Проверить отказ удаления занятого CLI и сохранение профилей при удалении.
- [x] Зафиксировать исходный commit, версии зависимостей и SHA256 артефактов.
- [x] Приложить соответствующие исходники, лицензии и уведомления.

**Готовность:** установленные файлы соответствуют манифестам; удаление не затрагивает пользовательские данные.

## Этап 5. Автоматические и сквозные проверки

- [x] Запустить относящиеся к изменениям тесты и `bun typecheck` из каталогов пакетов.
- [x] Добавить проверки Windows-путей, прокси, манифестов и завершения процессов.
- [x] Перенести наблюдение за процессами и окнами на Windows API: `Win32_Process` + `MainWindowHandle`, headed Chromium smoke — PASS.
- [x] Проверить интерактивный CLI через ConPTY.
- [x] Проверить пути с пробелами и кириллицей.
- [x] Проверить запуск установленных продуктов без Node/Bun/Python в PATH.
- [x] Проверить автономное открытие мастера настройки.
- [x] Пройти настройку Loginom и повторный запуск Desktop/CLI: оба установленных продукта прошли настройку, перезапуск и повторное чтение профиля.
- [x] Проверить Xiaomi Token Plan без сохранения токена: обнаружение `mimo-v2.5` и реальные вызовы Loginom-инструментов подтверждены в CLI.
- [x] Выполнить CSV-сценарий через Desktop: результаты 55 и 101, сохранение и независимое повторное открытие.
- [x] Повторить CSV-сценарий через CLI `run`.
- [x] Повторить CSV-сценарий через TUI.
- [ ] Подтвердить реальные вызовы Loginom-инструментов через Xiaomi Token Plan в Desktop и CLI: CLI подтверждён; Desktop CSV и Loginom tools подтверждены с scripted provider, отдельный Xiaomi-driven Desktop-прогон ещё не выполнен.
- [x] Проверить одновременную работу продуктов и оба порядка их закрытия.
- [x] Проверить отмену, обрыв сети, аварийное завершение и последующее восстановление: Ctrl+C через ConPTY, network relay fault, `recoverable-error` и повторная настройка до `ready`, а также parent/runtime/Chromium crash cleanup — PASS.
- [x] Проверить удаление и переустановку с сохранением профилей.

**Готовность:** все обязательные сценарии пройдены на установленных артефактах с зафиксированными хешами.

## Этап 6. Документация и передача результата

- [x] Добавить Windows-сборку и пакетные тесты в CI без публикации.
- [x] Обновить устаревшие инструкции Windows и сведения о готовности платформы.
- [x] Описать подготовку окружения, сборку, установку, запуск и отладку.
- [x] Подготовить отчёт: ОС, commit, команды, результаты, SHA256 и оставшиеся ограничения.
- [x] Отдельно отметить проверки, которые не проводились на чистой Windows или под другим Windows-пользователем.
- [x] Передать EXE Desktop, ZIP CLI, исходники и контрольные суммы.
- [x] Проверить отсутствие секретов в передаваемых материалах.
- [x] Обновить итоговый статус плана.

## Журнал выполнения

### 2026-09-18 — Этап 0

- Commit изученных исходников: `697cc2e5addff232f2faeb9be8c4790100995f18`.
- Выполнено: изучение архитектуры и платформенных ограничений, согласование объёма, подготовка и сохранение плана.
- Проверки: чтение исходников через GitHub API; проверка ОС и инструментов; DNS и HTTP-проверки стенда; чтение настроек системного прокси без их изменения.
- Результаты: Windows 11 Pro x64, установленный Node 22.23.2; Bun не найден; страница Loginom доступна; Dock требует авторизацию; обнаружены несовместимые с текущим CLI правила обхода прокси.
- Артефакт: `WINDOWS_IMPLEMENTATION_PLAN.md`. Исполняемые сборки пока отсутствуют.
- Блокеры для начала разработки: не выявлены. Доступы Dock и авторизация ChatGPT требуют последующей проверки.
- Следующий шаг: этап 1 — получение репозитория и подготовка закреплённого окружения сборки.

### 2026-09-18 — первый Windows build candidate

- Commit исходной базы: `697cc2e5addff232f2faeb9be8c4790100995f18`; ветка `windows-native`; рабочее дерево содержит ещё не закоммиченные Windows-изменения.
- Окружение: portable Node `24.19.0`, Bun `1.3.14`, Chromium `1243`; постоянный пользовательский `PATH` не изменялся. Архивы Node, Bun и Chromium сверены с ожидаемыми SHA256.
- Desktop: `bun typecheck`, 7 целевых тестов и production build — PASS. Упакованный GUI smoke из изолированного профиля — PASS: 4 поля мастера, пустые секреты, URL/username по умолчанию, без оставшихся процессов.
- Desktop artifact: `C:\Users\vskar\AppData\Local\loginom-ai-agent-build\outputs\script-smoke\desktop\loginom-ai-agent-win-x64.exe`, 313274217 bytes, SHA256 `ee17c118db7aef38fee2ad65f32be2b941e0b0a44eb1cbfc1ab18f9e0cb26028`. Установщик и payload не подписаны; приложение внутри — PE32+/AMD64. Resource manifest: `win32-x64`, 4371 files, Node/Chromium bundled.
- CLI: payload → ZIP → распаковка → проверка manifest — PASS. Native `--version`, install/launcher/uninstall из пути с пробелами и кириллицей без Node/Bun в `PATH`, сохранение профиля, busy-process refusal, reparse rejection и DPAPI — PASS.
- CLI artifact: `C:\Users\vskar\AppData\Local\loginom-ai-agent-build\outputs\cli-dev\loginom-ai-agent-cli-0.0.0-dev-202609181843-win32-x64.zip`, 316244374 bytes, SHA256 `07e2ef1b0787d7006ab45cca4be82e15a43b2b598d0092781563810260b2e64f`.
- Проверки кода: `packages/loginom-host` — 11 PASS/10 platform skip, typecheck PASS; `packages/agent` typecheck PASS и native Unicode ACL PASS; `packages/desktop` typecheck PASS и 7/7 целевых тестов PASS; `git diff --check` PASS.
- Исправлено: Windows checkout без symlink privilege, CRLF-safe pinned hashes, CLI PE/resource validation, installer reparse/busy protection, Unicode profile paths, Desktop icon/prebuild paths, NSIS per-user x64 config, native application lookup и Windows-safe GUI evidence path.
- Блокеры: полный workspace install останавливается на integrity удалённого `@solidjs/start`; текущая системная proxy bypass policy пока отклоняется CLI как `SYSTEM_PROXY_BYPASS_UNSUPPORTED`; Dock/ChatGPT/TUI/ConPTY/сквозной CSV ещё не проверены. `script/build-windows.ps1 -Product Desktop` прошёл, но clean-checkout rebuild и единый `-Product Both` ещё обязательны.
- Следующий шаг: реализовать поддерживаемый разбор Windows proxy bypass, затем повторить Desktop/CLI сборку из чистого checkout и перейти к installed end-to-end проверкам.

### Шаблон следующей записи

- Дата:
- Этап:
- Commit:
- Что выполнено:
- Команды и результаты проверок:
- Артефакты и SHA256:
- Блокеры:
- Следующий шаг:

### 2026-09-19 — итоговый Windows candidate

- Product commit: `17dc05a49ea3f1318c65f4e712116bd1a437b47f`; чистый checkout (`sourceDirty: false`); portable Node `24.19.0`, Bun `1.3.14`, Electron `42.3.3`, Chromium revision `1243`.
- `script/build-windows.ps1 -Product Both -SkipInstall` — PASS. Desktop NSIS и CLI ZIP собраны из одного snapshot; CLI manifest сообщает `sourceDirty: false`; статическая Desktop-проверка подтвердила `win32-x64`, PE/AMD64 Node и Chromium и 4371 ресурсный файл.
- Installed Desktop: onboarding, DPAPI/safeStorage, sidecar и полный CSV-сценарий — PASS. A = Alpha 35, Beta 20, total 55; B = Alpha 100, Beta 1, total 101; оба пакета сохранены, закрыты и независимо открыты новым процессом без повторного применения настроек. Evidence root: `C:\Git\laa-desktop-temp\loginom-linux-oracle-elvHdy`. Headless Loginom runtime разрешён только двумя тестовыми флагами; обычный Desktop остаётся headed.
- Installed CLI `run` и TUI через Windows ConPTY: те же 55/101, сохранение, завершение и независимое холодное чтение — PASS. Evidence roots: `%TEMP%\loginom-linux-oracle-qKEMGa` и `%TEMP%\loginom-linux-oracle-sGW7Wz`.
- Одновременная работа установленных Desktop/CLI и оба порядка закрытия — PASS. Evidence root: `C:\Git\laa-desktop-temp\loginom-desktop-cli-independence-aBlor3`.
- Windows process/window observer: headed Chromium smoke увидел 1 видимое окно и 10 процессов, после закрытия оставшихся окон нет — PASS. Принудительное завершение parent, managed runtime и корневого Chromium отследило соответственно 11/10/10 процессов; живых потомков после cleanup нет — PASS.
- Installed CLI network fault: локальный relay оборвал 16 активных сокетов; 20 отслеживаемых процессов завершились, writer-lock снят, новый процесс увидел `recoverable-error`. Повторная настройка из DPAPI-профиля восстановила исходный endpoint и состояние `ready`, generation 2 — PASS. Отмена CLI через реальный Ctrl+C/ConPTY и последующий холодный запуск ранее прошли.
- OAuth callback lifecycle на Windows: исправлено зависание teardown на keep-alive/probe connection через закрытие активных соединений; callback/provider tests 19/19 и `packages/agent` typecheck — PASS. Live installed OAuth с внешним authorization server остаётся отдельным незакрытым gate.
- Удаление старого CLI и установка проверенного candidate сохранили DPAPI-профиль; versioned executable и launcher вернули `0.0.0-dev-202609190537` — PASS. Финальный rebuild имеет версию `0.0.0-dev-202609190631`; его production delta — только Windows-safe OAuth callback teardown, Loginom runtime не менялся.
- Xiaomi Token Plan: endpoint `https://token-plan-sgp.xiaomimimo.com/v1`, модель `mimo-v2.5`; live discovery и реальные Loginom tool calls в CLI подтверждены. Полная Desktop-семантика проверена scripted provider через реальный Loginom runtime; отдельный Xiaomi-driven Desktop-прогон остаётся незакрытым. Токены использовались только транзитно и нигде не записаны.
- Исходный архив, release manifest, CLI manifest, Electron/Chromium notices, Bun licenses/source metadata и native third-party licenses включены и проверены.
- Финальные артефакты commit `17dc05a49`: Desktop EXE `5617c7794d5dbabfb0822aaebaecd1c25405d24cf497bf61247a1999467e7f99`; CLI ZIP `9e0da471d69c9c085fd743eac50905bcf82f746a3d90252b625609cf3834f6f9`; source archive `8ec49329af29103c0b06c9f05ec0fea7bfdb5543813538d9c7634acee662857e`; Desktop static verifier — PASS, 4371 ресурсов.
- Полный workspace install: `bun 1.3.14 install --frozen-lockfile` — PASS, lockfile не изменён; прежний внешний integrity mismatch `@solidjs/start` больше не воспроизводится.
- Итог: нативные Windows build/package и установленные Desktop/CLI acceptance-сценарии завершены. Общий release gate остаётся `PARTIAL` до OAuth callback, отдельного Xiaomi-driven Desktop-прогона, update feed/signing и прогона на чистой Windows 11 VM/другом пользователе.
