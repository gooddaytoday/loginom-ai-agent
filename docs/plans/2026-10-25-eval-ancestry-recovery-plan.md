# Смена родителя процесса и учёт node после поздней очистки

> Выполнять по `executing-plans` и TDD: один RED → минимальная правка → GREEN. Перед реализацией — независимое ревью. Локальная разработка входит в порученный ремонт; live-поставка нового SHA — после принятия владельцем по [плану runner3](2026-10-24-local-eval-runner-plan.md).

**Цель:** устранить воспроизведённый ложный отказ сканера при reparenting и дать существующему controller учесть сохранённый node после проверенной native очистки, без повторения измерения и изменения исторических результатов.

**Основание:** [основной план](2026-10-23-autonomous-evals-plan.md), сохранённые proofs LAB-170 и существующие `reconcileEnvironment`, `observeUnitExit`, native slot release, `confirmedProfileArchive`. Нового scheduler, recovery API или ledger не требуется.

**Устройство:** сканер повторно читает текущую цепочку при её исчезновении в ограниченном окне; исчезновение прежнего ancestor само по себе не даёт права владения. Существующий post-exit механизм принимает также точный ENOENT исход, сохраняя все проверки unit/boot/producer/cgroup/marker. Проверка архива читает существующую supplemental chain, а node-оценка использует её вместо требования успешного исторического cleanup.

## Установленные факты и границы

- Batch2 LAB-170 завершился; все шесть measurement admissions имеют сохранённые результаты. Учтены пять ключей, missing=229. У `crosstable-multi-facts` сохранены LGP/CSV/XML и completed/exit0, но process cleanup failed на `ENOENT: no such file or directory, open '/proc/150618/stat'`; следующий batch не допускается.
- `assessNodeAttempt` останавливается на failed environment cleanup до чтения native quality. Историческое качество не менять; итоговый FAIL допустим и не требует нового измерения.
- Локальный публичный `hasOwnedAncestry` воспроизвёл raw ENOENT при `G(subreaper) → P → C`: после штатного reap P живой C с прежним starttime перешёл к G. До/после ownership=true, во время перехода 206/256 чтений отказали. Все процессы пробы завершены. Private evidence: `/home/george/.codex/tmp/ancestry-recovery/red-probe.json`. Тождественность этой гонки историческому PID не доказана.
- `observeUnitExit` сейчас допускает только UID/EACCES/EPERM; raw ENOENT получает `UNIT_EXIT_SOURCE_INELIGIBLE`. `confirmedProfileArchive` и node-оценка не используют поздние startup/release proofs.
- Сохраняются manifest, CLI/corpus/model/judge pins, budgets/timeouts, все готовые Results/артефакты, прежние failed receipts и история. Только native учёт нового результата меняет lastProgressAt; ремонт не сбрасывает срок.
- Никаких новых VM reboot, повторов retire/tail, прямого release/удаления marker, force-close, ручной правки journal/CAS и измеряемого CLI. Runner1/2 и LAB-134 этим исправлением не меняются.

## Область и стоимость

Ориентир: **8–10 файлов / 350–500 добавленных и удалённых строк**, включая этот план, тесты и при необходимости краткое уточнение контракта. Production: `evals/src/process-supervisor.ts`, `profile-archive.ts`, `node-evals.ts`; переносить общий lease-код или менять публичные signatures не требуется. Тесты — существующие `process-supervisor.test.ts`, `unit-exit.test.ts`, `profile-archive.test.ts`, `node-evals.test.ts` и одна собственная process-family fixture. Проверять фактический `git diff --stat`; при удвоении оценки пересмотреть путь.

Два bounded reread нужны для реально воспроизведённой смены родителя; постоянный retry/таймер не добавляется. Read-only ветка проверки supplemental chain нужна, потому что native cleanup уже умеет сохранять отдельные proofs, а существующий node reader их игнорирует. Новый постоянный файл состояния не создаётся.

## На что направлено ревью

1. Чужой либо повторно использованный PID не получает владение; после исчерпания reread неопределённость остаётся отказом.
2. Post-exit ENOENT допускается только с прежней непрерывной capture, unknown0, настоящим matching unit binding и двумя пустыми current passes; новый boot, активная unit, иной marker и изменённый source запрещены.
3. Поздний archive принадлежит этому command, slot, token, epoch и attempt; чужой release или похожий путь не принимается.
4. Старый Result и cleanup остаются failed там, где это исторический факт. Supplemental proof подтверждает нынешнее завершение использования, а quality вычисляется по прежнему контракту и артефактам.
5. Рабочие continuous/без-summary node-пути и обычные callers `confirmedProfileArchive` сохраняют поведение; fake `unit_after_exit` по-прежнему не подтверждает node.

## Шаги

- [x] **1. Изолировать отказ без изменения VM.** Сверены raw Result/cleanup и код; публичная real-kernel проба выше дала RED. Результат: воспроизводимая гонка и точные две границы отсутствующей recovery-поддержки; новые измерения не запускались.
- [x] **2. Исправить bounded ancestry read.** Добавить один публичный тест reparenting собственного семейства без моков/preload: живой C сохраняет birth и меняет PPID, ownership G подтверждается до/после, во время перехода нет raw ENOENT. Промежуточный false допустим при недоказанной цепочке и не выдаёт прав; непрерывный true не обещается. Сначала получить RED. В `hasOwnedAncestry(pid, owners)` при исчезнувшем ancestor и живом candidate перечитать цепочку от candidate в пределах двух повторов, сохранив его birth; владельца подтверждать только по свежим PID/starttime. Исчерпанное окно/чужое владение не превращать в true. GREEN: 12 × 256 реальных чтений без ошибок, все собственные процессы завершены; четыре ancestry-теста / 45 assertions и typecheck прошли. Tracer RED — 222 отказа; process-family встроен в существующий тест без отдельной fixture.
- [ ] **3. Принять точный исторический ENOENT в существующем post-exit пути.** По одному RED→GREEN тесту через `observeUnitExit` и настоящее scoped systemd завершение: допустимый raw ENOENT принимает новый supplement, активная unit/иная binding/source/marker/unknown не принимаются. Расширить только классификацию исхода; остальные проверки и формат `UnitExitProof` сохранить. Использовать существующий opt-in `EVAL_SYSTEMD_TESTS=1`, без модели/Loginom и proc-denial режима. Результат — native reconciliation может подтвердить нынешнюю остановку, не переписывая source.
- [ ] **4. Учесть готовый node через существующие proofs.** В `confirmedProfileArchive(attemptDir, profileDir, historyDir)` добавить узкую read-only ветку после failed original cleanup. Связать source hash `cleanup.json.unit-exit.json`, исходный command/unit binding, released composite slot и hash native release, startup cleanup с `attemptDirs` и `profileArchive`; проверить slot/token/epoch и canonical archive внутри прежнего historyDir. Ссылки брать из существующих run config/command и slot receipts; summary не делать новым обязательным условием. В `assessNodeAttempt` разрешить эту проверенную ветку вместо успешного original cleanup, сохранив технические/quality guards и неизменность Result. Реальные JSON/files/native leases в тестах: сначала один failed node + late cleanup → прежний PASS/FAIL без записи Result; затем отрицательные несовпадения source/attempt/slot/epoch/release и существующие continuous callers. Результат — campaignTick переучитывает тот же Result один раз; raw cleanup и supplemental verification различаются.
- [ ] **5. Проверить и предъявить конкретную поставку.** Целевые process/unit-exit/archive/node/campaign тесты, `bun typecheck` из `evals/`, реальные Bun 1.3.14 и Node в PATH; independent review кода и цепочки recovery. Устранить обязательные замечания, сохранить RED/GREEN и подготовить один clean candidate SHA с согласованными config/units. Исходный scanner fault исправляется, не скрывается общим catch ENOENT. Live на runner3 до принятия SHA не менять.
- [ ] **6. После принятия — штатная очистка и продолжение.** EvalOps сверяет живые задачи/процессы/owner/deadline, лично выполняет разрешённый ремонт на выделенной среде. Та же generation и прежний repairer: native verify/reconciliation → restart controller на принятом source → resume. Подтвердить preserved hashes всех шести Results, учёт multi-facts без нового admission, ready/released receipts и следующий service batch только missing. Если доказательство не проходит, сохранить точный blocker; не повторять измерение и не продлевать срок. Независимый read-back закрывает эту операцию; полный итог234/№7/матрица runner2 остаются исходными проверками общего плана.

Checkpoint:

- Новый blocker LAB-170 изолирован, исходные результаты сохранены; native EvalOps самостоятельно обнаружил его и поручил проверку штатного recovery прежнему EvalRunner.
- Независимое ревью плана — PASS; tracer/ancestry и typecheck локально прошли. Лишняя гарантия промежуточных true снята по отдельному независимому ревью; исходный RED-detector и отрицательные ownership-проверки сохранены.
- Следующий шаг — допуск ENOENT в существующий post-exit и чтение supplemental chain; live source остаётся принятой поставкой из server.json.
