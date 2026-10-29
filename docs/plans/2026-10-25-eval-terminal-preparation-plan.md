# Перенос исправления ранней preparation в каноническую ветку

> Исполнение по `executing-plans`. До переноса — независимое ревью этого плана. Новое поведение не разрабатывать: перенести точный patch, уже реализованный EvalOps и принятый независимым code review.

**Цель:** получить проверенный Git-кандидат для восстановления LAB-170, сохранив канонические исправления runner2 и исходного срока кампаний.

**Подход:** повторно использовать существующие unit binding, native leases, startup cleanup и архив профиля. Ранний batch без preparation слота получает отдельное доказательство завершения его исходного unit; оно не подменяет lifetime proof измерения. Уже сохранённый partial archive проверяется и используется повторно, исходные receipts и качество не переписываются. Производственная поставка остаётся за EvalOps после завершения согласованной native qualification.

**Технологии:** TypeScript, Bun1.3.14, Linux/systemd; новых зависимостей и служб нет.

**Основание:** основной план автономных eval, §7 и checkpoint плана runner3, native план ремонта и принятый code review v6. Точные patch/hash/base/resulting hashes находятся в `/home/george/.codex/tmp/preparation-accounting/r3-v6-integration-readonly.json` и указанном там validation-файле. RED→GREEN автора и83 проверенные теста переиспользуются; новый тестовый механизм не добавляется.

## Границы и стоимость

- Меняются только10 файлов точного patch: process-supervisor, terminal-preparation, startup-archive, startup-reconciliation, slot-storage, profile-archive и четыре связанных теста. Consumers node-native/node-evals/text-import сохраняют исходный архив измерения через общий reader.
- Код runner2 terminal cancellation, resource ownership/CAS и initial clock остаётся неизменным. Перенос всего bundle от старого base запрещён: он потерял бы последующие канонические исправления.
- Готовые Results/manifest/pins/история/failed receipts/лимиты/сроки не меняются. Ни SSH, ни live CLI, ни установка/verify/resume в этот локальный перенос не входят. Неполную qualification не объявлять приёмкой поставки.
- Оценка по точному patch:10 файлов,647 добавленных/14 удалённых строк. С планом и одним checkpoint — около12 файлов/720 изменённых строк. Новых механизмов сверх уже принятого patch нет; при конфликте или новом изменении кода перенос остановить и пересмотреть причину.

## Проверки и шаги

- [x] **1. Принять точный способ переноса.** Независимо проверить необходимость и достаточность patch-only интеграции, отсутствие пересечения с R2 и исходным clock. Результат — план принят, нет нерешённых обязательных замечаний; существующий read-only integration PASS переиспользовать.
- [x] **2. Перенести и проверить исходники.** Применить только точный patch; сверить10 resulting hashes и неизменность защищённых файлов из integration report. Из `evals/` на Bun1.3.14 с настоящим Node выполнить связанные terminal-preparation/startup-archive/startup-settled/startup-reconciliation/slot-storage/slots/profile-archive/node-evals/campaign-control тесты и `bun typecheck`. Результат — каноническая композиция проходит проверки, hashes соответствуют принятому коду. Opt-in skips не считать исполненными native сценариями.
- [x] **3. Зафиксировать кандидата.** После независимого ревью фактической интеграции обновить checkpoint runner3 и сделать commit с проверенным кодом. Результат — конкретный чистый SHA для EvalOps. Поставка, legacy migration, cleanup/prepare-generation/restart/resume и продолжение только missing требуют оставшихся native доказательств и отдельного чтения фактического состояния; этот commit их не доказывает.

Первый проверяемый результат от входа до выхода — принятый patch в текущей канонической композиции → публичные cleanup/archive/result-reader тесты → проверенный commit. Настоящий public path на собственной native pair уже пройден и независимо принят; повторять этот fixture-цикл для переноса не требуется.

Checkpoint:

- Независимое ревью плана — PASS. Точный patch перенесён локально:10 resulting hashes совпали, защищённые R2/CAS/clock файлы неизменны. Связанные проверки канонической композиции:110 PASS/41 opt-in SKIP/0 FAIL,505 assertions; typecheck PASS (Bun1.3.14, настоящий Node20.19.2). Пропущенные systemd/native случаи не объявляются исполненными; прежние native proofs сохраняют свой scope. Фактическая интеграция прошла отдельное независимое ревью без обязательных замечаний; кандидат зафиксирован этим коммитом. Согласованная native qualification впоследствии принята отдельно; EvalOps выполнил поставку и migration, их независимое подтверждение и текущий этап продолжения указаны в checkpoint плана runner3. Сам локальный перенос production не переключал.
