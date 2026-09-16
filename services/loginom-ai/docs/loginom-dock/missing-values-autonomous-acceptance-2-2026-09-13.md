# Node14 autonomous acceptance 2 — FAIL

Команда `node14:autonomous-acceptance:2:direct-user-confirmation-20260913`.
Слот `node14-hermes-20260913-921f5d51`. Единственный модельный run:
`20260913-113814-1bc86af9`.

Полный goal не выполнен. Hermes завершился с exit0, но pre-audit вернул FAIL;
независимое12-result reopen не запускалось, поскольку обязательные предыдущие
gates не прошли. Второй запуск модели, ручное вмешательство и исправления runtime
во время/после прогона не выполнялись.

## Авторизация, pins и исполнение

После прежнего отказа auto-review непосредственно проверены видимые сообщения
задачи координатора `01a096e6-a321-7df2-99db-2cae02a305ee`: точный вопрос про один
Sol/low run под test-4 с сохранением и12-result audit в08:33:05.539UTC и отдельный
ответ пользователя «подтверждаю» в08:34:37.395UTC. Новый запрос require_escalated
был разрешён. Старый отказ и receipts попытки1 сохранены.

Свежий preflight подтвердил source/runtime/248 harness inputs/goal/native skill,
существующую подписку и отсутствие другого acceptance процесса. Согласованные:

- Production code `c32a5d5e163fe174afba59abce973ac405742cdc`.
- Harness commit `3c999b30a483790d5367f9e78e7bc865e3a38cd3`, pins commit
  `7d8a868a030c00efba0c66dae8f0ae62c237b22f`.
- Runtime `a9db4113ac69d38d7227e971ece3652acf3e1bf836723e6e577917eda916406f`.
- Manifest `921f5d51e78cd190f1352900ee755fee9c2b614759b46b04595e3dc34537a483`.
- Goal `35a23e9aeb6a37c408e249aec54e12ca1f230cbc219392e5cabe9b6d4675a836`.
- Harness map `84d1e8c6ace5c0ddcc29c4d7cb3c94b67acf0e461e1dc1d2dd55e654be621417`.

Фактический usage: `openai-codex / gpt-5.6-sol`, reasoning low. Auth guard
`existing-hermes-no-refresh-or-import-v1` установлен, blocked_attempts0,
auth_connection_unchanged=true. Runtime, harness и native skill остались неизменными.
Применён весь набор8 artifacts; goal не упрощался. Production/current/plugin,
маршруты памяти и другие ветки не менялись.

Рабочая source MCP session `081eac9f-6cae-4367-ae60-db7c4ec4f922`, document
`1789288713897-t8orc8nvxyl`, user-v1. Отдельный precheck
`bef304d5-5d65-469b-82ca-d7ba411c58ec` остался workspaceReady=false,
archiveActive=false, targetIdentity=null. Read-only wrapper измерил именно новое
окно: viewport=null, inner1508×862, outer1508×949, available1512×949.

## Что успел выполнить Hermes

Журнал содержит15 успешных node_checkpoint для10 различных node GUID:
9 импортов и одного Missing Values. Помимо девяти первоначальных импортов,
базовый импорт выполнен ещё раз. «Основной» прошёл пять операций: первоначальный
Execute, изменение NEW_NODE+Execute, Done, Close DISCARD_ME и Execute после Close.
Это успешные квитанции отдельных операций, не полный независимый PASS данных.

Остальные11 финальных Missing Values результатов не завершены, смена источника
не выполнена. Запрошенный итоговый путь:
`/test-4/packages/Dock-acceptance-20260913-113814-1bc86af9.lgp`.
Сохранение не подтверждено: нет prepared/completed native-save trace.

## Конкретная цепочка остановки

Операция `missing-note-only-20260913` запросила новый узел «Только строка» в точке
`{x:1200,y:260}`. Фаза target вернула:
`NODE_APPLY_STOPPED: Graph gesture refused before effect: Requested drop surface is not reachable`.
Публичный outcome при этом AMBIGUOUS, effect_possible=true, node=null,
execution=not_requested; сначала cleanup_complete=false, после повторного resume
cleanup_complete=true, но операция осталась pending/partial_or_unverified.

Hermes самостоятельно:

- Повторил resume исходного ID/запроса — тот же отказ.
- Попробовал abandon_operation и restore_control — `REQUEST_REJECTED: Use the enclosing node procedure to resume this internal phase`.
- Вызвал cancel — settled AMBIGUOUS сохранился.
- Попробовал resume того же ID с `{x:750,y:260}` — изменённый запрос был отклонён.
- Попробовал существующий workflow prepare — заблокирован неопределённым эффектом.
- Запросил финальный package.save_checkpoint — `OPERATION_STILL_PENDING`;
  результат указывает на незавершённую `missing-note-only-20260913`.

Таким образом, недоступное размещение привело к состоянию, из которого агент не
смог ни продолжить с корректной точкой, ни завершить/отменить операцию и сохранить
результат. Это воспроизведённая цепочка отказов на текущем pin, а не установленная
по новому live-debug корневая причина в коде. Следующая разрешённая фаза должна
начаться с прямой Codex UI-диагностики этой цепочки; ещё один неизменённый Hermes
run не является исправлением. Input_mapping recovery c32 и configure recovery13
не подменяют этот target-placement случай.

Ранее `import-allnull-20260913` получил NOT_APPLIED до эффекта по той же причине
размещения; новый запрос `import-allnull-20260913-v2` затем успешно выполнился.
Это отдельно сохранено, а не вычеркнуто из журнала.

## Аудит и ограничения

Штатный неизменённый `missing_values_acceptance.py` вернул:

| Gate | Результат |
|---|---|
| candidate_identity | PASS |
| staged_readback | PASS |
| candidate_bytes | PASS |
| save_roots | PASS |
| natural_goal | PASS |
| model / actual usage identity | PASS |
| frozen | PASS |
| artifacts | PASS |
| public_projection | FAIL: user_node_error |
| incomplete_evidence | FAIL: unique evidence required |
| Остальные gates полного goal | Не достигнуты аудитором |
| Независимый12-result reopen / финальный audit | Не запускались |

Причина остановки аудитора `unique evidence required` локализована по его
неизменённому коду и журналу: среди17 node_apply_prepared есть два без единственной
node_checkpoint — `import-allnull-20260913` и `missing-note-only-20260913`.
Наличие поздней успешной замены первого запроса не исправляет второй незавершённый
случай. Pre-audit не сформировал reopen_plan. Запуск reader через component gate
или подмена pre-audit успехом не выполнялись. Дополнительные UI actions и повторный
prepare сохранены в исходном evidence; их полный gate не был достигнут.

73 model API calls;82 public calls. Usage: input144782, output22052,
cache_read5560960, cache_write0, reasoning6481, reported total5727794.
Показатели приведены как сообщает Hermes, без добавления reasoning к total.
События рабочего журнала:08:38:39.097–09:01:35.301UTC. Process timed_out=false,
returncode0, usage.completed=true; эти признаки не подтверждают выполнение цели.

Собственные процессы run, source MCP и обоих session/browser profiles после
завершения не обнаружены. Слот самостоятельно не освобождался: решение остаётся
координатору. Новые test suites не запускались — код не менялся.

## Evidence и checkpoint

Run-root: `.dock/node14-autonomous-acceptance-2/runs/20260913-113814-1bc86af9/`.
Сохранены исходные request/scenario/tool-precheck/attempt/evidence/efficiency,
geometry, pre-audit, отдельная failure-public-chain, process-check и final-summary.
[13 receipts с SHA](missing-values-autonomous-acceptance-2-pins-2026-09-13.json).

Pre-audit SHA `05eb01985bcd8a542c431423119d47ce0d9b477146a52cc87c038cc0a5861529`.
Final-summary SHA `d4a47e6ea690b0b7ba579ca8a7e4253f00e0bc5eee20ccec89a30167b6c9e320`.
Старые документы preparation/component и отказ попытки1 остаются историческими;
их PASS не перенесён на эту полную приёмку.
