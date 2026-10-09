# Исправления двух P2 из review evals

Основание: согласованные владельцем findings на `e4292c32cbe8fe2038acea9cec26a84fa7c997f3`.
Публичные действия CLI, product prompt/oracle, статусы результатов и бюджеты не меняются.

## Решение

- Reference-wrapper вызывает существующий `collectNodeNativeEvidence` для min/max и всех `coverageCaseIds` только после completed + confirmed cleanup. Архив остаётся источником фактических observations; валидатор не меняется.
- Classified timeout receipt получает обязательный `attempt_sha256`: SHA256 исходного неизменного `result.json`, проверенный оператором вместе с нулевыми tokens и headers timeout 300 секунд. SHA256 классификации сохраняется отдельно.
- Один общий постоянный private ledger назначается через `EVAL_PROVIDER_PROBE_LEDGER_DIR`. Это canonical directory с текущим UID и без group/other доступа, вне каталогов доставки receipt. Ключ расходования допуска — `attempt_sha256`, без пути receipt и URL. Атомарная запись `wx` до HEAD сохраняется при NO_HEADERS и отказе записи результата.
- Старые classified receipt без attempt identity не дают новый допуск. Уже выполненные исторические probes не перезапускать; их расходование учитывается оператором в общем ledger до назначения новых диагностик. Исторические результаты и staged комплекты остаются неизменными.
- Общий live stand, LAB-55 и ресурсы соседнего Codex не используются. Проверки выполняются на локальных немодельных fixtures.

## План исполнения

1. RED → GREEN integration через настоящий reference-wrapper с fake CLI: четыре coverage кейса получают фактический native proof; failed/unknown cleanup его не создаёт. Сохранить min/max и policy/provider регрессии.
2. RED → GREEN probe: копия одного receipt в другом каталоге при общем ledger даёт ровно один HEAD; новый результат не обходит допуск.
3. Добавить проверки переформатирования receipt/смены маршрута, конкурентного вызова, NO_HEADERS, другого исходного attempt SHA и неполного/неприватного допуска. HEAD сохраняет 5 секунд, redirect manual, отсутствие generation/secrets/retry.
4. Обновить script/operational contract/skill; проверить целевые тесты, полный `bun test` в отдельном PID namespace при необходимости, `bun typecheck`, diff и независимый review. Коммиты разделить по дефектам.

## Checkpoint

- Исходный SHA: e4292c32cbe8fe2038acea9cec26a84fa7c997f3.
- Результат: план зафиксирован; следующий шаг — RED regression tests.
- Ограничения: source-only исправления, без activation/release и нового live прогона.
