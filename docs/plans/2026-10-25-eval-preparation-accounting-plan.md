# Учёт batch, остановившегося до первого admission

> Выполнять по `executing-plans` и TDD: один RED → минимальная правка → GREEN. До реализации — независимое ревью. Проверенный source принимается и устанавливается по предварительным полномочиям раздела 2 основного плана; отдельное подтверждение каждого SHA не требуется.

**Цель:** штатно различать остановку preparation до первого admission и неизвестный учёт запусков; после проверенной очистки продолжать missing без изменения исходных receipts и готовых измерений.

**Основание:** основной план автономных eval, контракт `evals/docs/parallel-users-contract.md` и фактический producer `runPreparedSlots`. Новых scheduler, команды восстановления, состояния или proof-файла не требуется.

## Факты и границы

- Прежнее ancestry-восстановление завершено и независимо подтверждено. Следующий batch LAB-170 остановился в `verifyProfile` до request-preflight; точное подусловие Help readiness по сохранённым данным не установлено. Это технический отказ, не quality FAIL.
- `prepared-run.ts` сначала атомарно сохраняет начальный command без `attempts`; первый request-preflight/measurement до исполнения дожидается атомарной записи массива. После первого admission producer больше не пишет начальное представление. `writeLeaseReceipt` выполняет fsync и atomic rename. Отсутствующее поле и `null` — разные входы.
- `campaignTick` отвергает собственную начальную запись, но затем ставит `accounted=true`. Публичная локальная проба подтвердила: после снятия blocker повторный tick выбирает следующий batch без повторной проверки admissions. Это дефект guard, не доказательство исторического нуля запусков.
- Текущее native поручение EvalRunner само паркует и диагностирует кампанию. До его фактического вывода не назначать параллельное восстановление и не повторять неизвестные операции. Его receipts определят, достаточен ли существующий cleanup/reconciliation для текущего preparation.
- Сохраняются manifest, pins, лимиты, срок, шесть готовых Results/артефакты и все исходные failed receipts. Никаких reboot, reset-profile, prepare-generation, ручного release/journal/CAS, переписывания command или повторного измерения готового. LAB-134 и runner2 не менять.

## Минимальное изменение и стоимость

Production: `evals/src/prepared-run.ts` и `evals/script/run-campaign.ts`. Проверки: существующие `campaign.test.ts`, при необходимости `campaign-control.test.ts`. Документы: этот план, краткое уточнение owning contract и текущие checkpoints. Ориентир **5–7 файлов / 180–260 добавленных и удалённых строк**, включая тесты/документы; при удвоении оценки пересмотреть путь.

Начальный producer сразу пишет `attempts:[]`; это устраняет будущую неоднозначность без нового формата состояния. Для уже сохранённой собственной начальной записи нужен узкий read-only переход: отсутствие `attempts` допускает ноль только при version2/kind, phase=cli_admitted, точном runDir, нормальном command ID/slot IDs и binding именно наблюдаемого завершившегося unit invocation. `null`, неверный/отсутствующий binding, иной phase/runDir или уже известное ненулевое число попыток не превращаются в ноль. Приём этой записи не доказывает cleanup/Help readiness: перед продолжением остаются прежние native reconciliation и fresh verify.

При неподтверждённых admissions batch остаётся unaccounted. Явный resume повторно сверяет admissions последнего batch, даже если старый controller успел записать ошибочное accounted=true; готовое качество и бюджеты берутся из прежних receipts. Никакого автоматического снятия технического blocker или повторного запуска в обход fresh verify.

## Ревью

Обязательные вопросы: доказывает ли сохранённая начальная запись именно отсутствие admissions по write-ahead контракту; проверен ли matching terminal binding; сохраняется ли отказ для неизвестных/испорченных данных; нельзя ли обойти guard через accounted=true; не выдаётся ли поздняя проверка за историческую готовность. Если этих средств недостаточно, сохранить STOP с конкретным недостающим proof, без расширения полномочий и новых recovery механизмов.

## Шаги

- [x] **1. Изолировать дефект чтением и одной публичной пробой.** Producer/atomic writer/consumer проверены; first tick blocked+accounted=true, повтор после clear даёт start. Проба не меняла исходники/VM, временный каталог удалён. Private proof: `/home/george/.codex/tmp/ancestry-recovery/preparation-admission-probe.json`.
- [x] **2. Исправить учёт по одному RED→GREEN.** Сначала публичный terminal tick с собственным matching initial command без attempts: подтверждается ноль admissions, качество/lastProgressAt не возникают. Минимальная совместимость и начальный пустой массив producer. Затем один отрицательный вход за раз: null/чужой или отсутствующий binding/иной phase/известные ненулевые admissions остаются blocked и unaccounted. Отдельный RED→GREEN подтвердил повторную native reconciliation при resume после старого accounted=true. Явный пустой массив проходит resume только через fresh verify; исходный command сохраняется. Отрицательные входы и сохранение ненулевого бюджета проверены. Проверок неиспользуемых состояний не добавлено.
- [x] **3. Проверить затронутые callers и получить кандидат.** Связанные campaign/control/admission/limits/startup тесты из evals, typecheck на Bun1.3.14 с настоящим Node, независимое code review. Повторять только проверки, затронутые правкой; источники и receipts не менять ради проверки. Связанные восемь файлов: 123 PASS / один opt-in pair SKIP / 594 assertions, typecheck PASS. Ревью выявило смену blocker после неудачной verify: исходный RED→GREEN привёл к более простой безусловной перепроверке последнего batch при resume. Повторно весь control-файл — 24 PASS / один pair SKIP / 133 assertions, typecheck и независимое review PASS. Остальные неизменённые проверки переиспользованы. Результат — clean кандидат и прежний согласованный способ поставки; live source до принятия сохраняется.
- [ ] **4. После принятия — штатное продолжение текущей кампании.** EvalOps лично сверяет текущие задачи/owner/units/deadline и согласованно устанавливает принятый source. Один исполнитель под native repair выполняет доступный reconciliation/cleanup/fresh verify и resume. Независимо проверить сохранность шести результатов и исходного command, доказанный учёт preparation, native release и реальные новые admissions только missing. Если Help readiness остаётся недоказанной/проверка не проходит, сохранить точный блокер; готовое не повторять, срок не продлевать. Полный итог234/независимость слотов/матрица runner2 остаются критериями основного плана.

Checkpoint:

- Локальные шаги1–3 завершены, plan/code review и связанные проверки/typecheck PASS. Принятый source установлен EvalOps; независимый installation read-back подтвердил согласованные config/units и сохранность исходных данных. Evidence — `/home/george/.codex/tmp/preparation-accounting/`.
- Прежний EvalRunner завершил одно native поручение: старый preparation получил ready/released, batch3 штатно переучтён как accounted=true/startedAttempts=0 без изменения command и его binding. Один resume остановился на fresh verify b0d5: Help readiness slot-b не подтверждена, CLEANUP_UNCONFIRMED; server и оба profiles retained новым verification. Его process cleanup подтверждён; точное подусловие Help не сохранено (OUTPUT_LOST), причина готовности пока неизвестна.
- Все шесть Results и прежние admissions сохранены: 1 PASS/5 FAIL, missing228, общий startedAttempts6; новых measurement admissions и reboot нет. LastProgressAt/предел сохраняются как в плане runner3. Шаг4 и этапы5–7 основного плана открыты. EvalOps сам добавил и установил [безопасную диагностику Help](2026-10-25-eval-readiness-outcome-plan.md), одно штатное продолжение поручено прежнему EvalRunner; нового параллельного dispatch Codex нет.
- Предварительные полномочия применены к instructions всех трёх агентов и подтверждены API read-back; runtime/model/env/permissions/squad сохранены. Проверки — `accepted-installation-readback.json`, `current-native-comments.json`, `current-verify-failure-readback.json`, `standing-instructions-applied.json` в evidence-каталоге выше.
