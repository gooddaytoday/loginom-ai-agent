# Node14: пятая автономная приёмка — 13 сентября 2026

**FAIL.** Разрешённый единственный запуск `20260913-172045-ceabf472` завершился
на `mv-boundary-40`: внешний результат AMBIGUOUS, effect_possible=true,
cleanup_complete=false, pending_phase=target. Цель не достроена, пакет не
сохранён. Полный неизменённый аудитор вернул exit 1; независимое открытие
не запускалось, поскольку его предварительные условия не прошли.

Назначение `node14:autonomous-acceptance:5:611a9f0c`, слот
`node14-hermes-20260913-run5-611a9f0c`. Выполнен ровно один фактический model run.
Слот освобождён после подтверждения отсутствия собственных процессов.

## Свежий допуск и закреплённые версии

Перед запуском проверены actual HEAD `c929fd81b3c62af7014cce0a8d97a6a8bd98bd63`,
тождество runtime-кода коммиту `611a9f0c`, 412 файлов снимка и рабочего дерева,
fixtures и полный текст задания. Runtime:
`68e8e7a7cac00b8afa45ac8f5b60bdcfa8832efc86ed34445f2bd4f1baf10e62`;
harness 256 inputs, digest
`d1892694f20a8859efd5baa4f30ad1e1ea7849c256a7934323359c49c97fa0a7`.
Kit `2026.09.13-node14-acceptance5.1`, launch-plan SHA256
`33f27fa4e4d9895a69bb0a02afe1291e7bcac59baa4b774ae42993ce621a9a50`.
Исходный план с launch_authorized=false не переписан; разрешение и эксклюзивный
маркер созданы отдельными новыми файлами.

Четыре файла test4.2 candidate прочитаны заново по сети и приняты настоящим
parser. Manifest SHA256
`cadd80dfd8490f40c851475008a1ccd68d7a617dbcf6a77de25034ff8da7b2ad`.
Preflight подтвердил подписку более чем на 4200 секунд без refresh/import/
fallback, отсутствие активных запусков и 102 453 616 640 свободных байт
(порог 12 ГиБ). Запись 41 360 байт, fsync, чтение и разбор JSON прошли.

Фактические идентификаторы: provider `openai-codex`, model `gpt-5.6-sol`,
reasoning `low`; timeout 3600 секунд, max_turns 200. Auth guard
`existing-hermes-no-refresh-or-import-v1` установлен, blocked_attempts=0.
Авторизация изолированной копии и существующей подписки после запуска совпала.
Runtime, harness и native skill сохранили закреплённые bytes.

Новая сессия `d5cd7db9-104e-4e5f-bbfc-1754b955b1c2`, документ
`1789309264773-4x0c8rqetyf`, собственные новые profile/paths и input names.
Фактическое окно проверено на той же странице сразу после prepare:
viewport=null, inner 1508×862, outer 1508×949. Назначенный новый путь пакета
`/test-4/packages/Dock-acceptance-20260913-172045-ceabf472.lgp` не был сохранён.

## Наблюдаемый результат

| Проверка | Результат |
|---|---|
| Фактические model runs | 1 |
| API calls | 56 |
| Tool calls / replies | 63 / 63, pairing errors 0 |
| Экспортированные events | 10 016 |
| Подготовленные операции узлов | 19 |
| SUCCEEDED / NOT_APPLIED / AMBIGUOUS | 17 / 1 / 1 |
| Успешные импорты / операции Missing Values | 9 / 8 |
| Native package saves / independent reopen | 0 / не запускался |
| Launcher / child returncode | 0 / 0, оба наблюдены |
| Child timed_out | false, наблюдено |
| Export complete / recovery | true / не требовалось |
| Full outer audit | FAIL, exit 1 |

Исходный импорт `import-120` завершился NOT_APPLIED; ограниченная независимая
проверка подтвердила его no-effect placement proof (3 внутренних попытки).
Следующий `import-120-retry` успешен. Это scoped component proof, не допуск
незавершённого сценария. Аудитор полного задания сохранил отказы
`terminal_refusal_accounting` (`terminal_refusal_proof_mismatch`) и
`incomplete_evidence` (`Unproved prepared operation or refusal`). Требования
27 успешных операций, 9 импортов, 12 конечных результатов, save/reopen
не ослаблялись. Код завершения модели и usage.completed не приняты за успех.

В `mv-boundary-40:n14` журнал содержит click по ранее наблюдённому
`MF;TF-1;Graph;Граница`. Внутренний шаг вернул NOT_APPLIED,
effect_possible=false, cleanup_complete=true и `UI_REFERENCE_STALE`:
наблюдённый элемент отсоединён, скрыт, отключён или заменён. Внешняя операция
при этом сохранила AMBIGUOUS/cleanup=false, target pending, node=null;
выполнение результата не запрашивалось. Source и workflow phases verified.
Журнал этой операции не содержит node_target events; это не подтверждённый
повтор отказа REMOVE_LINK из run4. Причина устаревшей ссылки вживую не
диагностировалась, автоматический повтор или исправление не выполнялись.

## Сохранность и остановка

Все исходные DB/WAL/journals, полный экспорт, attempt, usage, auth guard и
неуспешный аудит сохранены. Экспорт выполнен штатным Python exporter без
ENOSPC или RangeError; прежняя ошибка монолитного диагностического экспорта
не переопределялась. Старые receipt sets прошли сверку без изменений:
подготовка5 62/62, диагностика REMOVE_LINK 144/144, run4 38/38,
run3 14/14, run2 13/13. Неизвестные child exit/timed_out старого run4
остались неизвестными, его FAIL и partial pending сохранены.

На освобождении слота 14:48:04 UTC собственных процессов 0, свободно
99 042 947 072 байт. Второй запуск, ручная достройка, новое review, новый узел,
main/push/VPS, общий плагин и маршрутизация не выполнялись. Дальнейшая
диагностика требует отдельного назначения координатора.

[Полные pins и контрольные суммы](missing-values-autonomous-acceptance-5-pins-2026-09-13.json).
Private root: `.dock/node14-autonomous-acceptance-5/`.
