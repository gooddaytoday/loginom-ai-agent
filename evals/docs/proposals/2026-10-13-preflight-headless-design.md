# Headless preflight и ограниченная management diagnostics

База: immutable operational supplement `89b416c257a43a187edef4c40b68f3c9b1fa4d53`. LAB-57 report `01a13531-4696-77e1-b450-e5bcc94a3f56`, archive `c982cb66ee30ed34ce018833fd10c5440196de9568b8e69fbf577460e72dbb2c`:106 файлов подтверждают исходный ABANDONED/FREE, новый unit RELEASED и tested CLI candidate `d73a13fabf358d281942f7885ba7afe7b007423b`. Нижняя причина PROFILE_NOT_READY остаётся UNKNOWN: management stdout/exit/view не сохранялись.

## Решение

Две preflight-команды строятся одной экспортированной чистой функцией `nodePreflightCommand(operation: "status" | "check")`. Сначала механическое выделение прежних argv на зелёной базе; затем реальная fake-CLI regression требует headless: status ready и check LOGINOM_CONNECTION_VALID возможны лишь с поддержанным --headless. Обе существующие точки вызова используют эту функцию. Native check сохраняет sandbox и настоящий supervisor; status сохраняет management cleanup.

Management с уже настроенным private cleanupDir сохраняет отдельный `result.json` mode0600 до проверки process cleanup. Диагностика содержит только command-family/operation, terminal exit, timeout/interruption/capture/cleanup, наличие и размеры streams, распознанные state/failure/code и recovery count. Полный stdout/stderr/view, URL/username, credentials/env/stdin/recovery IDs не сохраняются. States: unconfigured/ready/pending/starting/recoverable-error из Loginom schema. Failure codes: LOGINOM_STORE_READ_FAILED, LOGINOM_STORE_WRITE_FAILED, LOGINOM_RUNTIME_START_FAILED, LOGINOM_KNOWLEDGE_AUTH_FAILED, LOGINOM_BROWSER_START_FAILED, LOGINOM_CONNECTION_CHECK_FAILED. Неизвестные значения дают unrecognized indicators без исходных строк.

Новые данные не являются READY/completion/recovery/release и не заменяют process proof. Любой старый gate — owner/config/SHA/container/profiles/auth/ready/recoveries/native licence-WebSocket/cleanup — остаётся обязательным. Нет новых release/abandon API, изменения критериев, CLI/runtime/defaults, моделей, бюджетов или live/reference/product вызовов.

## Проверка и границы

Public APIs: `nodePreflightCommand` + `management` с EVAL_CLI_MODE=fake, реальные supervised дочерние процессы. Никаких mocks/globalThis/тестовых bypass в live preflight. Первый RED воспроизводит прежние headed argv; GREEN добавляет флаг. Следующий RED/GREEN проверяет сохранение диагностического отказа и исключение чувствительных/неизвестных полей. Негативные management cleanup/lease/recovery gates покрываются прежними адресными тестами. Full evals suite и bun typecheck выполняются на законченной поставке; Docker/browser-dependent skips явно фиксируются.

Применение нового supplement pin на сервере требует отдельного решения владельца. Разрешения TSV CLI и одноразового original-unit archival не распространяются на эту поставку. Текущий eval lease task01a134fd/acquired11:53:15.320Z остаётся у Rich; patch не разрешает его удалять, повторять старый preflight без изменения или расширять wrapper/recovery. Реальный Native READY и устранение нижней причины пока не доказаны.
