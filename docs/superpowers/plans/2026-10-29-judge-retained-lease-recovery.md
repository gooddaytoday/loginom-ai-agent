# B judge retained lease recovery Implementation Plan

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

> **For agentic workers:** применять executing-plans; до execution root независимо проверяет этот план, конкретный одноразовый caller и исходные свидетельства. Текущее назначение ограничено read-only исследованием и этим файлом.

**Goal:** Освободить только собственную retained judge lease инцидента `20261029-calibrate-PRIVATE_ID` существующим CAS после свежего доказательства покоя ресурса, сохранив исходный failed.
**Architecture:** Повторно использовать рассмотренный одноразовый caller предыдущего incident и существующие lease/process primitives; новая recovery-система не нужна.
**Tech Stack:** Bun, Linux `/proc`, `evals/src/lease.ts`; без новых зависимостей.
**Spec:** [analytics implementation](2026-10-28-analytics-expansion-implementation.md), `evals/AGENTS.md`; граница — отдельное назначение root для этого recovery.

## Global Constraints

- Recovery подтверждает нынешний покой exact judge ресурса; не успех старой попытки, калибровки или нового ordinary-exec fix.
- Исторические cleanup/journal/verdict и результаты, включая failed/gateblocked, неизменны; source fix не является ретроактивным основанием PASS.
- Только existing guard/CAS: без сигналов, удаления guard, blind ACK, новых API/runner/retries, изменения pins или profiles.
- Исходники ordinary-exec сейчас проходят отдельные full-suite/final review у root; deployment и live-проверка этим планом не подразумеваются.

## Исходные свидетельства и граница

- Current run: `PRIVATE_ARCHIVE`; cleanup: `tariff-functional-conflicts-business/positive/judge-processes-1/process-cleanup.json` внутри него.
- Cleanup: `failed`, `Process identity changed PID[private]`, capture_complete=true, lifetime завершён; две исторические verification с owned_remaining=0. Сохранены 34 уникальных PID/birth, включая 6 unknown; это не свежий resource proof.
- Exact key: `judge:PRIVATE_ARCHIVE`; lockRoot — `/var/lib/loginom-evals/locks`. Read-only reservation: retained revision 13; commandId `PRIVATE_ID`; owner PID[private]/birth[private]/UID[private]. Token остаётся только в private exact binding.
- Journal: `PRIVATE_ARCHIVE`; quarantined, тот же commandId и current runDir. Перед execution все значения перечитываются; несовпадение означает STOP.
- Предыдущий, ДРУГОЙ incident `20261029-calibrate-PRIVATE_ID`/revision11 уже recovered. Его [план](2026-10-29-judge-cleanup-recovery.md), `.superpowers/sdd/2026-10-28-analytics-expansion-implementation/judge-cleanup-plan-review.md`, `judge-cleanup-result.md` и `judge-cleanup-operator-review-package.diff` остаются историческими и неизменными; его proof здесь неприменим.
- Рабочие API: `readResourceReservation`, `reopenResourceLease`, `writeLeaseReceipt`, `lease.assertHeld/release/close` в `evals/src/lease.ts`; former caller сохранён указанным diff (временный файл удалён после предыдущего execution).
- Символ `recoverJudgeLease` в текущем и реально использованном private harness не найден. Это расхождение имени, не нехватка механизма: прежний caller использует reopen exact reservation; `recoverResourceLease` создаёт новую revision и здесь не требуется.

## Review Focus

- Полный scope включает ordinary children; выборки только tracked PID или только codex-family недостаточно.
- Saved PID/birth и PGID/SID проверяются до same-UID filter; совпадение при другом UID тоже блокирует release.
- Birth/UID и существующая ProcessIdentity (exe path/dev/inode), kernel stat и повторное чтение связывают сэмплы с конкретным процессом; PID reuse не считается старым процессом.
- Любой связанный live/unknown, неполный relevant read или изменившийся exact binding даёт STOP; чужие процессы не становятся глобальным gate по одному времени рождения.

## Шаги и проверяемые результаты

- [x] **1. Независимый pre-execution review.** Root проверяет план, исходный cleanup/journal/reservation и минимальную адаптацию former caller только к current incident и отдельным private evidence paths. Прочитать actual lease source, не переносить старые tokens/proof. Результат: закрыты mandatory findings; если existing caller неприменим, конкретный blocker без новой обвязки.
- [x] **2. Exact binding перед запуском.** Сверить real accepted judgeHome, key/retained revision/token/commandId/owner/journal/runDir; исходный cleanup остаётся failed. В private evidence сохранить before и hashes исходных cleanup/journal/verdict, если verdict существует; без raw env/credentials. Результат: один подтверждённый объект своей кампании.
- [x] **3. Одно исполнение existing caller.** `reopenResourceLease(request, expected)` удерживает existing guard непрерывно от начала двух свежих read-only inventory до CAS. В обоих проходах: тот же boot, отсутствие прежнего owner birth, всех 34 saved births и исходных PGID/SID; related identity проверяется при любом UID до фильтра.
- [x] **4. Полный actual scope в тех же проходах.** У всех доступных same-UID процессов проверить cwd, точные argv paths и потомков exact judgeHome/runDir, только boolean равенства CODEX_HOME, доступные fd/maps ссылки. Сохранить birth-bound ProcessIdentity/времена, стабильность повторного чтения и границу/read errors; raw argv/env не публиковать. Related/unknown/relevant read failure означает STOP без release. Результат: два полных пустых scope passes; blanket gate остальных same-UID процессов не добавлять.
- [x] **5. Отдельный resource proof и CAS.** Под тем же guard снова `assertHeld`, сверить неизменность historical evidence; записать новый private version2 confirmed proof с `reason=operator-readonly-quiescence`, exact key/token/revision/runDir, первичными passes и source bindings. Вызвать существующий `lease.release(proof)`; read-back сверяет released, прежние token/revision и releaseEvidence path/hash. `finally` закрывает guard; old failed не переписывается.
- [x] **6. Независимый actual-result review.** Сверить before/after, exact CAS/proof/hash, полноту двух scope passes и неизменность historical cleanup/journal/verdict. Удалить только временный caller после сохранения review diff; сохранить private evidence и короткий результат. Результат: отдельное подтверждённое освобождение current lease либо конкретный blocker с retained состоянием.

## Результат, риск, размер и исключения

Первый проверяемый end-to-end результат — exact revision13 released с новым доказательством quiescence и неизменным failed cleanup. Завершение требует успешного read-back и закрытых mandatory findings actual-result review; продолжение калибровки — отдельная работа root.
Риски: scope может быть неполным, процессы/lease могли измениться, чтение `/proc` может отказать. Это причины STOP с сохранением retained; старые нулевые verification или новый source fix их не заменяют.
Текущее изменение: один новый plan file, ориентир 40–60 строк по `git diff --stat`; source/tests/config/прочие документы не меняются. Будущее execution: одна минимальная адаптация прежнего temporary caller вне Git и отдельные private before/proof/after evidence; новых механизмов нет, поскольку existing guard, ProcessIdentity и bound CAS уже обеспечивают необходимые примитивы.
Исключены actual CLI/model/Loginom/admin/browser/network/OAuth/profile calls, повтор калибровки/измерений, принятие старого verdict вручную, deployment, смена systemd/pins, перенос private patches, backup, commit/push/merge/release. В подготовке плана свежий `/proc` census и lease mutations не выполняются; доказательство текущей quiescence пока отсутствует и получается только шагами 3–4.

## Проверенный результат

Одно исполнение Bun1.3.14 завершилось exit0: revision13 released, два полных fresh passes по283 процесса, related0; historical failed/quarantined/verdict bytes неизменны. Независимое actual-result review APPROVE: `.superpowers/sdd/2026-10-28-analytics-expansion-implementation/judge-b-cleanup-actual-review.md`. Private proof/read-back сохранены в `analytics-expansion/judge-b-cleanup-recovery`; exact temporary caller удалён после hash/review-copy проверки, review copy сохранена. Source fix/deployment/live calibration этим recovery не подтверждены.
