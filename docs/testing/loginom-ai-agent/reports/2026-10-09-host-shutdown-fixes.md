# Исправление запуска и отмены проверки подключения — Linux, 2026-10-09

## Checkpoint

- Ветка `docs-no-browser`, исходный HEAD `42cf2d27b`.
- Три замечания подтверждены до изменений; исправления выполнялись через отдельные RED → GREEN циклы.
- Host подтверждает очистку ответом `closed: true` и нормальным выходом; CLI сохраняет `.writer` при неподтверждённой очистке.
- Закрытие сначала отменяет проверки подключения, затем ждёт запросы; отмена достигает запуска и принадлежащего проверке Chromium context.
- Management-фикстура использует настоящий Help runtime, локальный MCP-сервер и подготовку automation scope.
- Source-проверки завершены; новые Linux-сборки и native acceptance выполняются отдельно.
- Артефакты и сырые журналы: `/home/kiselev/.local/share/loginom-ai-agent-acceptance/host-shutdown-20261009-NB4XcY`.
- Пользовательские установки, Loginom server/client и чужие worktree не изменяются.
- Windows/macOS, новые модельные прогоны и evals исключены из этой проверки.
- Следующий шаг: зафиксировать build inputs, собрать новые CLI/Desktop, проверить native shutdown и обновить этот отчёт.

## Изменения и TDD

1. Сначала падали проверки отказа запуска и неверного handshake: процесс ещё работал после возврата ошибки. `node-client` теперь использует один идемпотентный путь закрытия и внутренний `NodeHostStartupError.cleanupConfirmed`. Отсутствие созданного процесса подтверждается отдельно. Закрытие сохраняет бюджеты 30 секунд на ответ и 5 секунд на выход; принудительный выход не считается успехом.
2. Проверка реального `node-entry` с неверным handshake показала невозможность закрытия до готового Host. `close` принимается до готовности, ошибка `starting` не пропускает очистку. CLI одинаково обрабатывает подтверждённый и неподтверждённый исход в run/TUI и management. Управляемый файловый барьер проверяет занятый профиль во время очистки и повторный запуск после неё.
3. Сначала падало закрытие общего Host во время браузерного handshake, затем тот же случай через настоящий Node host. Отдельный локальный `AbortSignal` передаётся supervisor без IPC-полей. Внутренний `beginClose` отменяет активные проверки до ожидания операций. Неуспешная очистка сохраняется и запрещает успешное подтверждение закрытия, даже если запрос проверки уже получил отмену.
4. На закреплённом Chromium сначала падали проверки отмены до запуска, во время навигации и ожидания формы. `loginBrowser` закрывает принадлежащий проверке context идемпотентно; managed runtime отменяет отдельный контроллер старта до ожидания обработчиков. Отмена не выдаёт validation token и не становится предупреждением о входе.
5. Management-тест последовательно выявил отсутствующий Help runtime, законное асинхронное состояние `starting` и неполную фикстуру ресурсов. Добавлены настоящий `knowledge-entry.mjs`, аутентифицируемый локальный MCP Help-сервер и verified bundled skills. Probe вызывается после явного `loginom-automation` и `loginom_dock_prepare`; проверки ask/deny адресованы probe после разрешённой подготовки. Сохранены проверки результатов, вложений, recovery, отмены и отсутствия секретов.

Публичные HTTP/SDK/MCP-контракты, сохранённые настройки, формат профиля и правила восстановления `.writer` не изменены. План package-docs и evals harness не редактируются.

## Source-проверки

Запуски из каталогов пакетов, Bun `1.3.14` (`0d9b296a`), закреплённый Node из предыдущего private CLI payload. Browser — Chromium revision `1243` из того же проверенного payload.

| Набор | Результат |
| --- | --- |
| Host: node-host, connection-validation, process, managed-work-entry, connection-readiness/migration, knowledge, host/host-port, parallel-calls, local-run, recovery, transport | 79 PASS, 0 FAIL, 550 assertions |
| Agent: standalone-startup/status/preflight, standalone, profile | 32 PASS, 0 FAIL, 327 assertions (до расширения матрицы ошибок старта) |
| Desktop: общий connection service и связанные lifecycle/readiness/recovery проверки | 38 PASS, 0 FAIL, 119 assertions |
| Runtime: connection-cancellation, connection-check, knowledge-entry, knowledge-client | 30 PASS, 0 FAIL; отмена выполнялась на настоящем Chromium |
| Desktop: electron-builder.config, release/artifact | 12 PASS, 2 platform SKIP, 0 FAIL, 102 assertions |
| CLI: расширенная матрица ошибок старта и writer barrier | 3 PASS, 1 native SKIP, 0 FAIL, 72 assertions |
| `bun typecheck`: agent, loginom-host, desktop | PASS, включая повтор agent после расширения fixture |

В первом общем запуске Host был один отказ существующего утверждения о заголовках авторизации локального Help-сервера. Изолированные четыре проверки valid Help прошли; затем knowledge + connection-validation — 20 PASS; полный повтор — 79 PASS. Причина единичного отказа не установлена. Утверждение не ослаблено: теперь при отказе показывает сами заголовки вместо одного boolean. Этот исход сохранён отдельно от успешного повтора.

Дополнительная матрица CLI проверяет ответ без выхода, выход без подтверждения, разрыв IPC, принудительный выход и редактирование ошибок с секретным sentinel. Для native бинарника добавлена отдельная проверка отказа конструктора настоящего bundled host и повторного запуска профиля.

## Новые сборки и native acceptance

Пока не завершены. Предыдущая приёмка сборки `9695e61e3` не подтверждает новые изменения. Здесь будут записаны точный source SHA, manifest/hash новых артефактов, результаты CLI/Desktop и проверка отсутствия собственных процессов и реальных случайных debugger-портов.

Desktop driver `packages/desktop/test/loginom/shutdown-validation.mjs` использует настоящий preload API нового Electron-приложения, private TEST_ROOT, локальный Help и управляемый HTTP-сервер. Для навигации и ожидания формы фиксирует PID-дерево, Node inspector и Electron CDP из собственного `DevToolsActivePort`, затем закрывает приложение и проверяет исчезновение процессов и listeners. Сервис Loginom для этой проверки не требуется.
