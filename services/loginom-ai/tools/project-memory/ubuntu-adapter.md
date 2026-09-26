# Адаптер общей памяти: Ubuntu, поколение 20260926.2

Решение от 2026-09-26: пользователь поручил реализовать новое поколение в
репозитории вместо отсутствующего внешнего macOS `codex-mcp-adapter`.
Это новая реализация, а не восстановление файлов с историческими hashes.
Исходники и локальные проверки закреплены commit `1419ec3906b80a30be91cdd5bab9af35ad88e548`.
SHA256 `source-manifest.json`: `82060b0dd68cf757d5a7eedda9f625b5b3ff7a76a9dde19dcc2c3b5dcfe53b7e`.

## Устройство

`source/adapter.mjs` принимает stdio MCP через `source/server.mjs` и объявляет
`experimental.codex/sandbox-state-meta`. Идентичность определяется только по
host `_meta.threadId` и `_meta["codex/sandbox-state-meta"].sandboxCwd` (file URI).
Поддержка расширения подтверждена в исходниках
[Codex MCP client](https://github.com/openai/codex/blob/main/codex-rs/codex-mcp/src/rmcp_client.rs);
для установленного клиента нужна отдельная живая проверка, приведённая ниже.

Production entrypoint требует enrollment и не включает legacy routing.
Существующие overlay проверяют точный worktree, задачу, activation, receipt,
plugin pin, generation, ownership/modes и отсутствие прежнего capture state.
Модель не выбирает Peer, cwd или чужой session_id. Проектный Peer вычисляется
из корня основного checkout. MCP-соединения разделены по credentials, задаче и
route; изменяемых глобальных env/Peer нет. Каталог tools читается отдельным
соединением без доступа к содержимому памяти. При изменении credentials новые
вызовы получают новое соединение; старое не меняет идентичность в полёте.

Транспорт, credential resolver, workspace peer и HTTP retry helper взяты
неизменёнными из установленного плагина OpenViking 0.8.1. Их точные hashes и
лицензия лежат в `source/vendor`; в сборке нет npm/network downloads.
Поле `source_commit` в vendor provenance обозначает наблюдавшийся HEAD соседнего
checkout, **не commit этих bytes**: установленный transport включает прежнюю
локальную правку, ещё не вошедшую в тот commit. Точный источник — установленный
plugin snapshot и SHA256 каждого файла, проверенные отдельно. Ошибки
транспорта не возвращают credentials или произвольное upstream error body.
Неоднозначные сетевые ошибки записи не повторяются. Штатный транспорт сохраняет
его восстановление MCP-сессии при HTTP 400/404; это не гарантия exactly-once
при произвольном поведении удалённого сервера.

`search` получает `peer_scope=actor` и текущую session_id. Остальные read tools
используют actor header без несуществующего в их schema аргумента peer_scope.
Чужие явные Peer URI и session URI отклоняются; cross-project search с `all`
должен быть отдельно запрошен пользователем по правилам проекта. Роутер не
заменяет авторизацию OpenViking и доверие к локальному владельцу файлов.

Capture остаётся у официальных пяти lifecycle hooks. Адаптер сам не записывает
разговоры. Защита от двух writers: original plugin выключен только в worktree,
проверенный hooks inventory, отдельный state каталога проекта, официальный
session lock/cursor и повторный enrollment без сброса cursor.

## Проверки

- 59 Node checks собранного runtime: metadata, registration, routes/receipts,
  changed plugin, concurrent read/write через четыре раздельные MCP-сессии,
  запрет чужих задач, lifecycle enrollment, cursor, transport retry, provenance.
- 13 Python checks: настоящие временные Git worktrees, конфигурация, сборка из
  исходников, повторяемость и отказ перезаписывать изменённую версию.
- 23 Node checks координаторских helpers: hooks review и историческая миграция.
- Реальный каталог OpenViking: 15 tools; schemas проверены до допуска.

При первой живой попытке поколения `20260926.1` Codex передал корректные metadata,
но произошли транспортные таймауты, затронувшие и штатный root MCP. Doctor затем
подтвердил /ready, авторизацию и 15 tools; root read снова прошёл. Первый Stop
показал несовместимость исторического validator: актуальный plugin присваивает
`workspacePeerId = activePeerId`, то есть канонический Peer проекта. Поколение
`20260926.2` принимает пустое начальное значение **или точно этот Peer**, отвергая
Peer worktree и чужие значения. Regression test проверяет cursor 13.

Переключение выполнено на idle-границе единственной своей регистрации: старые
runtime/manifest, регистрация, config/hooks/activation/receipt и capture state
сохранены. Новые route hashes и пять trusted hooks перепроверены. Сам state
побайтно не изменялся, cursor 13 и deterministic session сохранены. Это отдельная
операторская процедура, не повторный fresh-enrollment и не инструкция для
автоматической миграции произвольных действующих задач.

## Живой полный цикл — PASS

Задача `01a0de3e-6a07-7661-aa88-ed4807aef6ec` создана через настоящий App Server
Codex 0.153.4, Astra medium, в заранее подготовленном `.worktrees/node-javascript`.
Bootstrap shell подтвердил base `a8ad59766dbdb4f2da0b54367a755ce00891dd71` и чистый
worktree. Host SessionStart observation использован при enrollment; MCP audit
получил реальные threadId/file-URI sandboxCwd с calls health/find/read.

Пять проектных hooks trusted; исходных memory hooks в worktree нет. Root сохраняет
все пять штатных hooks и свой MCP. Регистрация
`22ccfcf0-7919-4954-9342-82450a28a6f3` привязана только к новой задаче.
Реальные health/find/read через новый runtime завершились с `isError=false`.
Actor — `-home-george-git-loginom-ai-agent`, session —
`cx-01a0de3e-6a07-7661-aa88-ed4807aef6ec`.

Stop продвинул cursor `0 → 13 → 22`; на сервере ровно 22 сообщения.
Native `thread/compact/start` вызвал официальный PreCompact, который выполнил
один commit. Сервер подтвердил `commit_count=1`, `total_message_count=22`,
`message_count=0`. Cursor остался 22, ovSessionId стал null. App read_thread
подтвердил completed compaction turn; задача больше не загружена (notLoaded).
Никакие remember/write/edit или ручной вызов capture не использовались.

Основная задача успешно выполнила точный read и semantic find извлечённой записи:
`viking://user/kiselev/peers/-home-george-git-loginom-ai-agent/memories/events/2026/09/26/memory_verification_success.md`.
Запись содержит результат успешного чтения из новой задачи, generation/registration
и контрольную метку `JS-MEMORY-UBUNTU-20260926-22ccfcf0`.

Приватный `rollouts/20260926.2/full-cycle-receipt.json` связывает source manifest,
задачу, metadata, счётчики и URI read-back. Там же access-result, metadata-only
adapter audit, hooks-trust receipt, session summary и upgrade receipt. Сырые
transcripts, credentials, private config и эти локальные материалы в Git не входят.

Границы: живая проверка выполнена на одной зарегистрированной задаче Ubuntu;
четыре параллельные сессии проверены локально. Штатный SessionEnd отдельно в этом
цикле не вызывался: commit проверен через native PreCompact. Это не завершение
обучения JavaScript и не автоматическая миграция старых действующих задач.
