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
- Native fix: cd7b42502; RED воспроизвёл отсутствие proof, GREEN node-skill suite 12 PASS/0 FAIL (все четыре coverage IDs + min/max, failed/unknown cleanup, policy/provider).
- Probe fix: 4041dceca; RED воспроизвёл второй HEAD после копирования, GREEN 9 PASS/0 FAIL (45 expects), включая конкурентность и отказ записи receipt до dispatch.
- Полный `bun test`: 522 PASS/0 FAIL, 2605 expects, 47 файлов, 605.68 секунд; `bun typecheck` и `git diff --check` PASS. Runtime/test bytes соответствуют 4041dceca; оставшиеся чужие изменения — документы и untracked файлы, сохранены.
- Изоляция полного suite: `bwrap --unshare-pid --die-with-parent --ro-bind / / --bind /tmp /tmp --bind /home/kiselev/git/loginom-ai-agent /home/kiselev/git/loginom-ai-agent --proc /proc --dev-bind /dev /dev --chdir /home/kiselev/git/loginom-ai-agent/evals -- /home/kiselev/.bun/bin/bun test`. Без явного `/dev` JSC падал до тестов; минимальный probe подтвердил исправление окружения.
- Независимый read-only review probe: no findings; отдельно подтверждён сохранённый расход допуска при EEXIST output receipt до dispatch.
- Ограничения: проверены локальные fixtures; shared stand/LAB-55/реальный provider не использованы. Source skill 1.0.6 обновлён, staged 1.0.5 и действующие pins не переключены.
- Следующий шаг для будущей поставки: отдельный новый immutable комплект с manifest/pins и назначение одного постоянного private probe ledger с учётом исторического расходования. Старые результаты/probes не повторять.
