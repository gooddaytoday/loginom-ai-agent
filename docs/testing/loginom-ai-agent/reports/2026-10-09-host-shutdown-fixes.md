# Исправление запуска и отмены проверки подключения — Linux, 2026-10-09

## Checkpoint

- Ветка `docs-no-browser`, исходный HEAD `42cf2d27b`.
- Три замечания подтверждены до изменений; исправления выполнялись через отдельные RED → GREEN циклы.
- Host подтверждает очистку ответом `closed: true` и нормальным выходом; CLI сохраняет `.writer` при неподтверждённой очистке.
- Закрытие сначала отменяет проверки подключения, затем ждёт запросы; отмена достигает запуска и принадлежащего проверке Chromium context.
- Management-фикстура использует настоящий Help runtime, локальный MCP-сервер и подготовку automation scope.
- Source-проверки завершены; новые Linux CLI/Desktop из чистого `5aff2d88e570c7afb12a07e6cf8d9b8357db09c2`, версия `0.1.17`.
- CLI: ошибки старта, удержание `.writer`, настоящий bundled host и повторный запуск проверены.
- Desktop: отмена на навигации и ожидании формы PASS; выход 0, собственных процессов и debugger listeners нет.
- Артефакты и сырые журналы: `/home/kiselev/.local/share/loginom-ai-agent-acceptance/host-shutdown-20261009-NB4XcY`.
- Пользовательские установки, Loginom server/client и чужие worktree не изменяются.
- Windows/macOS, новые модельные прогоны и evals исключены из этой проверки.
- Изменения продукта завершены; выпуск, установленная системная DEB и остальные платформы этим отчётом не принимаются.

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
| CLI: расширенная матрица ошибок старта run/TUI/management и writer barrier | 4 PASS, 1 native SKIP, 0 FAIL, 104 assertions |
| `bun typecheck`: agent, loginom-host, desktop | PASS, включая повтор agent после расширения fixture |

В первом общем запуске Host был один отказ существующего утверждения о заголовках авторизации локального Help-сервера. Изолированные четыре проверки valid Help прошли; затем knowledge + connection-validation — 20 PASS; полный повтор — 79 PASS. Причина единичного отказа не установлена. Утверждение не ослаблено: теперь при отказе показывает сами заголовки вместо одного boolean. Первый отказ учтён отдельно от успешного повтора.

Дополнительная матрица CLI проверяет ответ без выхода, выход без подтверждения, разрыв IPC, принудительный выход и редактирование ошибок с секретным sentinel. Для native бинарника добавлена отдельная проверка отказа конструктора настоящего bundled host и повторного запуска профиля.

## Новые сборки

Обе сборки — из чистого `5aff2d88e570c7afb12a07e6cf8d9b8357db09c2`, `prod 0.1.17`, source tree SHA256 `c76799404e3f8d46eab2e6155f43af27bda409c42a81d942419dc3b6c69d8e29`. Последующие коммиты изменили только тесты и документацию; отсутствие изменений во всех четырёх продуктовых `src` проверено через git diff. Acceptance driver и окончательная CLI-фикстура — `b58023cbd`. Это отдельная приёмка новых сборок; прежние результаты `9695e61e3` к ним не перенесены.

Pins: Bun `1.3.14+0d9b296a`, Node `24.19.0`, Electron `42.3.3` / Electron Node `24.15.0`, Playwright `1.63.0-alpha-2026-08-31`, Playwright MCP `0.0.80`, Chromium `153.0.8010.12` revision `1243`.

| Артефакт / manifest | SHA256 |
| --- | --- |
| CLI TAR.GZ | `74d61785e411240edbb8c33f8db440f882a54dad82b907226f263707bcc76902` |
| CLI executable | `fa1c531b675484538e45481ac56d6a426b2c45d415f781cc53fccc6b4dd66048` |
| CLI manifest, 5651 entries | `a9bc38897245511c6814f866113262883af91f98b51bd7b27b78248050cd626f` |
| CLI resource manifest | `ccce0835e9eb0b68cbf050ac5cf9c17d2777d70597147fea25efb541b52e705d` |
| Desktop DEB | `a5abaf7b8b3a6f44f37ab0ac44c461c464784abcf748fd4906266f5d853af78c` |
| Desktop AppImage | `9f2c77427dd1638f8d5bdf0e48d716832b03f40e59e2ba7821a7db6ecf50cc62` |
| Desktop source archive | `42fbc900268759618b66218dea80270d34c670619816b4c917cbac4b9d65e4cf` |
| Desktop release manifest | `2dbbe5ce9b01dae334c2dcf9f7580ce33aa5daae93a514c8574d5b29cc57a3f9` |
| Desktop resource manifest | `c35d0f34ad4b99c8618d83e2cabdc0d861a1e4f14f2c48515fc6865606c7d70e` |
| Desktop ASAR | `a65ed3cc8f102541c17f6d9cfdac9508e45bc20041707fda62d6de34d3989c65` |

CLI builder проверил manifest, затем архив после распаковки. DEB и AppImage прошли release verifier: по 4654 runtime resources. Файлы `cli/cli-manifest.json`, `desktop/release-manifest.json`, `desktop/deb-verification.json`, `desktop/appimage-verification.json` находятся в evidence-каталоге.

Неуспешные сборочные попытки сохранены: установленный runtime Node не содержал npm; для повторной сборки взят полный закреплённый Node-дистрибутив из кеша. Отдельная попытка CLI зависла до создания artifact directory и была остановлена собственным SIGTERM. Независимый source snapshot прошёл; сборка с `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0` прошла полностью. Причина зависания не установлена; сборочные скрипты продукта не изменялись.

## Native acceptance

CLI проверяется новым `cli/bin/loginom-ai-agent-cli`. Матрица run/TUI/management покрывает подтверждённую очистку, неверный ответ, выход без ответа, разрыв IPC, ответ без выхода с принудительным завершением и безопасный вывод произвольной ошибки с секретным sentinel. Отдельный барьер доказывает `.writer` до закрытия и занятый профиль для второго CLI. Отказ конструктора настоящего bundled host проверяется на собственном корректно инициализированном профиле: ошибка старта, отсутствие `.writer` после очистки, исправление собственной fixture и успешный `loginom status`. Финальный общий запуск — **5 PASS, 0 FAIL, 117 assertions**, `native-cli-final-green.log`.

Первые native CLI попытки выявили два дефекта фикстуры: заполнение ещё не инициализированного профиля и слишком строгое требование пустого stderr у `providers list`, который выводит ANSI reset. Исправлена только фикстура; проверки безопасной ошибки, блокировки и восстановления сохранены. Целевой настоящий host случай прошёл: 1 PASS / 13 assertions.

Desktop driver `packages/desktop/test/loginom/shutdown-validation.mjs` использует настоящий preload API нового Electron-приложения, private TEST_ROOT, локальный Help и управляемый HTTP-сервер. Выполнялся `desktop/linux-unpacked/loginom-ai-agent`; DEB в системную установку не устанавливался. SUID sandbox helpers только этого нового unpacked экземпляра подготовлены как root:root / 4755; содержимое runtime и ASAR не менялось. Сервис Loginom для проверки не используется.

| Фаза отмены | Native exit | Время закрытия | Node inspector | Electron CDP | Процессов осталось |
| --- | --- | --- | --- | --- | --- |
| Навигация | `0`, без сигнала | 3271 ms | 34513 | 45223 | 0 |
| Ожидание формы | `0`, без сигнала | 1991 ms | 43363 | 33619 | 0 |

Driver фиксирует фактическое дерево Electron/backend/Host/Chromium, включая crash handlers из собственного уникального artifact path. Первая попытка ошибочно включила shell теста из-за поиска пути внутри argv; исправлено распознавание пути исполняемого файла. Этот отказ сохранён в `desktop-shutdown-collector-failure.json`. После исправления обе фазы PASS. Повторная финальная проверка 43 PID и всех четырёх портов — PASS, remaining/listeners пусты (`desktop-shutdown.json`, `final-cleanup.json`). Ответ формы/навигации остаётся заблокирован до завершения приложения, поэтому штатное закрытие доказывает отмену, а не завершение входа.

## Воспроизведение

Запускать из каталогов пакетов. `NODE` — абсолютный путь закреплённого Node, `BROWSER` — закреплённый Chromium; `EVIDENCE` — новый собственный каталог сборок и результатов. Установка пользователя и старые артефакты не заменяются.

```bash
# packages/agent
LOGINOM_AI_AGENT_TEST_NODE="$NODE" bun test test/cli/standalone-startup.test.ts test/cli/standalone-status.test.ts test/cli/standalone-preflight.test.ts test/cli/standalone.test.ts test/cli/profile.test.ts
LOGINOM_AI_AGENT_TEST_NODE="$NODE" LOGINOM_AI_AGENT_TEST_CLI_BIN="$EVIDENCE/cli/bin/loginom-ai-agent-cli" bun test test/cli/standalone-startup.test.ts
bun typecheck

# packages/loginom-host
LOGINOM_AI_AGENT_TEST_NODE="$NODE" bun test test/node-host.test.ts test/connection-validation.test.ts test/process.test.ts test/managed-work-entry.test.ts test/connection-readiness.test.ts test/connection-migration.test.ts test/knowledge.test.ts test/host.test.ts test/host-port.test.ts test/parallel-calls.test.ts test/local-run.test.ts test/recovery.test.ts test/transport.test.ts
bun typecheck

# packages/loginom-runtime
LOGINOM_DOCK_TEST_BROWSER="$BROWSER" "$NODE" --test test/connection-cancellation.test.mjs test/connection-check.test.mjs test/knowledge-entry.test.mjs client/test/knowledge-client.test.mjs

# packages/desktop; собственный unpacked payload с рабочими SUID sandbox helpers
LOGINOM_AI_AGENT_TEST_NODE="$NODE" bun test src/main/loginom
bun typecheck
LOGINOM_AI_AGENT_TEST_EXECUTABLE="$EVIDENCE/desktop/linux-unpacked/loginom-ai-agent" LOGINOM_AI_AGENT_TEST_REPORT="$EVIDENCE/desktop-shutdown.json" LOGINOM_AI_AGENT_TEST_SOURCE_SHA=5aff2d88e570c7afb12a07e6cf8d9b8357db09c2 "$NODE" test/loginom/shutdown-validation.mjs
```

## Границы

Проверено Linux x64 на текущей системе, отдельные новые compiled/unpacked payloads и локальные синтетические HTTP/MCP-фикстуры. Это не проверка обновления системной Desktop-установки, полного GUI/TUI, всех Loginom-сценариев или модельного качества. Windows/macOS, новые live-модели и evals не запускались. Ни новый launcher, ни пользовательские данные, ни исходные Loginom server/client не менялись; чужие процессы не завершались. Публикация и выпуск не выполнялись.
