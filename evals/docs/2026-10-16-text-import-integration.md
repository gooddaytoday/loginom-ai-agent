# Текстовый импорт: действующий маршрут

## Действующий маршрут

Общая ветка — `text-import-evals`. Это единственный активный блок реквизитов серии; остальные разделы ниже — исторические доказательства интеграции, не текущие поручения. SHA назначения берётся из шапки карточки и совпадает со state.base_sha. Принятый результат предыдущей карточки возвращается в общую ветку до следующего назначения.

Общий порядок — [evaler-orchestration.md](evaler-orchestration.md), команды — [evaler/operations.md](evaler/operations.md), методика — [SKILL.md](../skills/loginom-node-eval-case/SKILL.md), специфика и модель построения сценариев — [references/text-import.md](../skills/loginom-node-eval-case/references/text-import.md). Документы/методика/handoff читаются из checkout на SHA назначения, операторские команды — из отдельного установленного helper. Текстовые правки не требуют доставки support.

### Закреплённая установленная поставка

`R=/home/user/.local/share/loginom-evals-runtime`. Исходные пины поставки взяты из [проверки интеграции](2026-10-16-text-import-integration-verification.json); helper и актуальная привязка повторно проверены при [квалификации C](node-eval-cleanup.md#доказательства-первого-испытания-c).

- Helper source: `b82707aa8091c73322371c6278e92a98886d21ca`.
- Helper: `R/support/text-import-b82707aa8091c73322371c6278e92a98886d21ca`; операторский entrypoint: его `evals/script/node-eval-ops.ts`; Bun: `R/bin/bun`.
- Manifest SHA256: `7d39c03bbb434ad81eeaeacdde7a1168fc9970974a5828c64e44101da5032948`. Перед первым использованием проверить source и manifest; изменение поставки требует новой независимой проверки.
- Config после квалификации C: `R/operations/stand-reset-C-zX0NgUf4.json`; SHA256 файла: `009eaa2511a14fcf45824bd4cbef41e2d619adee5c57385b502e385e653b7c59`; canonical binding SHA256: `213b84db3518238872d33a800a5161b1913f6af3bbb759fca9b4152cf176eeb5`. Старый config сохранён для истории, в новых командах его не использовать.
- Текущий выделенный container ID: `21f0532f3a130bfe260e1c47e934b2ebfbfc9f2aefe46527ef6ec69abb44360b`. Image и endpoint прежние; tmpfs `/run/loginom:rw,mode=1777`, фактический Cmd `["/app/loginomd", "--run", "-workdir=/workdir"]`. История замены и порядок следующего сброса — [процедура C](node-eval-cleanup.md).
- Отдельная установленная CLI: source `d6fc9c9b7b499d0a182c972815913b541e4cb81b`, version `0.1.17-lab57.startup.d6fc9c9b`. Точный binary/resources берутся из закреплённой config и проверяются по её pins; пересборка или активация общего CLI не назначены.
- Checkout каждой роли: `R/checkouts/text-import-<role>-b82707aa8091c73322371c6278e92a98886d21ca/loginom-ai-agent`, где role = rich, ben, evaler. Существующие checkout сохраняются; перед назначением получить опубликованный SHA общей ветки, проверить чистоту и доступность. Документальный SHA не подменяет source SHA установленной CLI/helper.
- Runtime серии: `a5fa993f-2903-4997-a832-955ffbb1203c` (eval-tests). Текущий container ID и точные роли/профили/корни — в действующей config. v3 проверяет Rich/Ben reference+eval и два eval-only профиля; это не разрешает вмешиваться в другую серию. Evaler CLI-профилей не имеет.

### Границы назначения

LAB-56/57 приняты, повторять их не нужно. Владелец 16.10 разрешил старт LAB-58 после защиты одного физического вызова и выполнения условий допуска; LAB-59–63 остаются backlog без разрешения старта. Прежние комментарии о запуске всей серии и снимки observation/continuation не дают нового старта. Обновление пакета A не разрешает reference/product/cold, модельные пробы, установку, сброс, merge или выпуск.

Deadlines и Rich 10/card отменены; прежние документы с ними — история. Неизменённая попытка без новой проверяемой гипотезы запрещена. Бюджеты измерения и одно восстановление на захват — по общему контракту. Технические тайм-ауты и проверки владения сохраняются.

Пакет B реализован в общей ветке и проверен offline: Evaler при будущем допуске назначает `state.rework_limit=3` в существующем state без обнуления счётчиков. Новое событие продолжения и его ограничения — в [общем контракте](evaler-orchestration.md) и [операторской инструкции](evaler/operations.md#продолжение-после-решения-evaler). Документы и handoff берутся из SHA назначения, включающего B; старый установленный helper не обновлялся и остаётся только для своих операторских команд. Карточки Multica этим пакетом не мигрируются и не запускаются.

C квалифицирован 16.10.2026 в 15:04 МСК: один сброс из прежнего образа, READY → COMPLETE → RELEASED → FREE, 622 PASS / 6 SKIP / 0 FAIL и typecheck PASS; модельных вызовов нет. [Процедура и доказательства](node-eval-cleanup.md) действуют для следующих сбросов в её границах. Перед будущими командами явно выбирать новый CFG из этого блока; чужие runtime env автоматически не переписывались. Защита одного физического вызова реализована: node runner принудительно отключает infra retry; исторические ERROR и бюджеты сохраняются. Перед стартом LAB-58 нужны независимая проверка точного clean SHA до установки, доставка этого SHA, сверка очередей/расхода/пинов и немодельный допуск первого этапа Rich. Установленный операторский helper и продуктовый CLI не заменяются.

Перед каждой разрешённой карточкой Rich проверяет status → acquire → preflight без модели на том же захвате, которым пользуется первый этап; release только после настоящего completion. Каждый очищает свои запуски, Ben отвечает за итоговую готовность. Неуспешная очистка — BLOCKED; утверждённый сброс не меняет исторический ERROR. За пределами рецепта неизвестное состояние и чужие ресурсы остаются защищены.

## Граница истории

Всё далее — отчёт о состоянии до A. Старые формулировки готовности, pins, единичные исключения и команды не являются разрешением продолжать. Исторические SHA, результаты и receipts сохраняются для проверки происхождения; читать их только при конкретном расследовании.

# Исторический отчёт об интеграции до пакета A

Интеграция LAB-56/LAB-57 выполняется от `text-import-evals=e796cc39daa2aa5a90641b664c27401c2ad4f2e1` в изолированном worktree. Завершение — готовность к LAB-58; новые задания, model/reference/product/cold прогоны, merge в dev/main, выпуск и automation не разрешены этим этапом.

## Порядок работы LAB-58–LAB-63

Одна общая ветка — `text-import-evals`. Evaler перед каждым будущим назначением читает replies и active/queued, фиксирует конкретный проверенный development SHA, actual CLI/helper/config pins и allowances. Принятый результат возвращается в общую ветку до назначения следующей карточки; временные ветки не становятся постоянными базами. Historical execution pins и frozen acceptance SHA сохраняются отдельно. Ben получает только inputs и считает собственное ожидание до открытия авторских oracle/reference. Пока разрешено только обновление инструкций с `--no-start`.

Обычный lifecycle: новый каталог попытки → свежий собственный stand lease и harness admission → учёт собственных процессов → сохранённые исходы/ошибки → штатная очистка → закрытый архив истории, включая DB/WAL/SHM → eligible completion → ordinary RELEASED → проверка FREE. Следующий dispatch запрещён при неподтверждённой очистке. Существующий writable profile можно использовать повторно лишь после этой проверки. PID, POSIX session, model chat UUID, document GUID и серверная Loginom session различны; ни один из первых четырёх не разрешает закрыть серверную сессию.

Для серии использовать отдельные неизменяемые helper и config из интеграционного receipt. Существующий CLI `d6fc9c9b7b499d0a182c972815913b541e4cb81b` сохраняется как отдельная сборка, а не переименовывается в сборку нового Git SHA. v1/v2/v3 читаются одним helper; действующая v3 проверяет шесть профилей (Rich/Ben reference+eval, EvalBaseline eval, EvalRunner eval). Evaler не имеет CLI profile. Eval-only orchestration остаётся в прежних установках; совместимость схемы не разрешает чужие действия.

`repeat=1` — один product repeat, но runner сохраняет **один внутренний retry после infra_error** (`src/run.ts`, `infra_retry.initial`) только после подтверждённой очистки. Это отдельный физический вызов; allowance проверяется и резервируется до запуска, исходная попытка архивируется. Если остаётся ровно один допустимый физический вызов, автоматический внутренний retry не считается разрешённым: такой сценарный запуск требует явного отдельного решения о способе соблюдения бюджета. Recovery — отдельная операция со своим первоначальным счётчиком; смена каталога/имени инцидента его не обнуляет. Эта интеграция не меняет retry policy и не расходует сценарные allowances.

При тяжёлой аварии сохранить результаты, историю и доступное состояние и остановить использование повреждённой среды. Не запускать автоматически цепочку восстановлений. Продолжение на новом чистом выделенном экземпляре рассматривать отдельно от разбора старого; новый профиль не равен новому серверу. Старые lease, ERROR и неизвестные эффекты не превращать в RELEASED/FREE. Новую среду допускать по её собственной идентичности и изоляции; автоматического создания, переключения или удаления контейнеров здесь нет.

## История и ограничения

LAB-56: server done, accepted preparation `59ab36329c13f1399dab4313e94f3e9c6954301b`. LAB-57: done/revision569, owner_completion=done, independent Ben ACCEPT `01a14189-3cb4-7c28-b092-c6b91308debc`, frozen `eb1c2b0da02210a9d95569849ae056fa4784440c`. Историческое внутреннее in_review не отменяет завершение. Genuine completion → ordinary RELEASED → FREE уже состоялись; recovery1/1 SETTLED, once/provenance и прежние попытки сохранены. Повторной приёмки карточки и повторной очистки LAB-57 нет.

Rich: **4 PASS / 2 quality FAIL / 0 ERROR**. Ben: шесть первоначальных product attempts израсходованы, original whole ERROR/code2; все шесть результатов исключены из quality-статистики. Приёмка eb1 не является live-проверкой интеграционного SHA. Подготовленные drafts LAB-58–LAB-63 не стали готовыми live-кейсами.

Первичные документы из локальной `input-name-fix=78b2fbe57ebb2b6fbd4b3ee5385d2dadb736ba91` сохранены побайтно отдельным docs-коммитом, включая [cleanup](2026-10-15-text-import-root-cleanup-completion-verification.json), [Ben ACCEPT](2026-10-15-text-import-lab57-final-accept-verification.json), [owner receipt](2026-10-15-text-import-lab57-owner-completion-receipt.json), [owner handoff](2026-10-15-text-import-lab57-owner-completion-handoff.json). Документы прежних Root continuations — только архивная история. Их устаревшие deadlines, automation, incident-only решения и команды не действуют в обычном маршруте следующей карточки; текущий scope задаётся этим runbook и поручением владельца.

Исходная локальная ветка/checkout a3df сохранена; не перенесённые monitor polling snapshots доступны через `git show 78b2fbe57e:evals/docs/2026-10-13-text-import-monitor-observations.json` и соседний файл за 14 октября. Первичные Multica attachments и приватные архивы указаны в канонических receipts (включая SHA/manifest и исходные ограничения). Фактические адресные [AppArmor](2026-10-13-text-import-apparmor-operator-receipt.json) и [сеть](2026-10-13-text-import-runtime-route-applied.json) сохранены документально; их нельзя перенести cherry-pick. Прежние пути CLI позволяют сохранить правила без переустановки. MAS/evalrun не затрагиваются.

## Перенос

| Исходный SHA | Результат | Причина |
|---|---|---|
| 59ab36329c | уже в e796cc39 | Preparation сохранена, drafts не повышены до live |
| b1ca2885f7 | 9bbed0ff9a | Независимый oracle |
| 159e33ca59 | 752c4a0cd6 | Шесть финализированных кейсов без пересоздания |
| 7c429117f5 | 755323c579 | Полный native/public result |
| 8e2bc4fc48 | 3cbc3ad326 | Неиспользуемые structural ports |
| 1cdbc18ad6 | f3c49c1417 | Headless cold reader |
| 49522d8331 | 41c09957b0 | Viewport и cleanup |
| b99d6f872e | d464e48807 | Exact CLI tuples |
| 4fad349e7d | 9e44b302bb | Startup CLI provenance |
| c26bc4fec5 | e3cfa8fcf3 | Launcher READY только после spawn |
| eb1c2b0da0 | 84bfeb6a19 | Execute/owner/lineage и безопасный refresh observation |
| 2c02eb9c5f | уже в e796cc39 | Production и admission test не дублируются; ошибочно добавленный duplicate удалён b82707aa80 |
| 7c463a35fe | адаптирован c3ad070750 | Только отсутствовавшие refresh indexes, source повторно не наложен |
| 815520a2de | 3e18d4df38 | Non-UTF8 CSV bytes и regression tests |
| d73a13fabf | d512c2ab64 | TSV/UTF-16 bytes и regression tests |
| d6fc9c9b7b | 2791d00e37 | Allowlisted startup diagnostics, сохранён отдельный installed CLI |
| 1f0f1a0b58 | адаптирован a2c598fb30 | v2/role CLI pins, target ownership guards сохранены |
| bc0e094436 | адаптирован f70b7ef090, 440473c35a | v3/шесть профилей, без baseline/EvalRunner orchestration |
| d633e57d3d | адаптирован d39b79b8f9 | Headless management, отдельные attempts, immutable admission/evidence |
| 99a285107e | уже имеется; tests c3ad070750 | Ordinary text-import release; новый checker сохранён |
| 0fd20f7c7e | уже в 84bfeb6a19 | Checker совпадает с eb1, второй экземпляр исключён |
| preflight-headless/79327cf562 | исключён | Только сравнение покрытия, второй механизм не наслаивается |
| local input-name-fix/78b2fbe57e | docs b1ebdb5af5 | Канонические завершение/owner/CLI/OS receipts побайтно |
| fec2874e24, 48e35302d0 и incident-only цепочки | executable исключён | dispatcher-transport/lab57-owned-route/status-repair/proc-identity/Root continuations остаются историей |

## Проверки и фактическое применение

Сверены bytes всех 72 файлов шести кейсов с eb1 и hashes исходных inputs/TASK по oracle-provenance. Checker и ordinary node-run support совпадают с pilot. Provenance actual cold-reader (reader/static-source-proof/navigation/declaration) актуализирована в 276391f147; исходные source_sha/original_sha256 сохранены.

Saved evidence: выборочно извлечены и сверены с исходным manifest 328 reference/product файлов; полная повторная проверка исторического архива не проводилась. В offline PID/mount namespace byte-verified original-native-journals привязаны к историческим абсолютным путям **только для replay**. Шесть reference и шесть сохранённых cold evidence прошли новый checker; Rich product сохранил4PASS/2qualityFAIL/code1/0ERROR. Это не новые reference/product/cold прогоны и не подтверждение исходных серверных путей на локальной машине. Прямой переносимый replay без этих путей даёт отказ, он сохранён в диагностике. Первая Bun-попытка namespace replay без отдельного /proc завершилась crash; исправлен только временный invocation sandbox, затем replay завершился. Raw receipts и исходные результаты не менялись.

Независимый guards delta ACCEPT: 109 targeted tests PASS/5 Docker skips; отдельно12 dirty/harness проверок всех шести профилей и4 schema отказа, explicit Rich/Ben pins и отказ при их смене. Reviewed ops SHA25646c952808371f82a069e7bfd68e117a176727330eabeab4298968c9ad1605afd совпадает с clean440473c35a. Пропущенные Docker tests не подтверждают installed bytes. Product regression47PASS (CSV/TSV) +3PASS (startup), agent/host typecheck PASS. Полный итоговый evals suite:628PASS/1SKIP/0FAIL,3274 assertions; final typecheck PASS. Исполняемые bytes в suite стабильны и совпадают между440473c35a и b82707aa80. Suite включала один идентичный duplicate admission test; финальная b82707aa80 удаляет только этот duplicate, адресные admission/refresh2PASS и typecheck выполнены на ней. Full suite без функционального изменения повторно не запускалась. Единственный SKIP — live cold regression без отдельного допуска/resources; portable5cd/d73 tuple tests не подтверждают отсутствующие локальные установки. Actual d6 bytes проверены отдельно на eval-tests.


На eval-tests установлен отдельный immutable helper `b82707aa8091c73322371c6278e92a98886d21ca`, manifest SHA256`7d39c03bbb434ad81eeaeacdde7a1168fc9970974a5828c64e44101da5032948` (1583 исходных файла сверены). Его точный путь и отдельный v3 config (raw SHA256`c6e75d06d894540e6aad1e250e72302bdc3168a394ffcf4a40abcb43d2ed9593`, canonical binding SHA256`1d15f46a9641ab1df75bf4d77b73008d9a633c26f053a01b6896eb39b082a15b`) — в [verification](2026-10-16-text-import-integration-verification.json). Старый global config SHA194bd036 и все старые установки сохранены. Для Rich/Ben/Evaler созданы отдельные clean detached checkout; исходные checkout не переключались.

Существующий CLI — `0.1.17-lab57.startup.d6fc9c9b`, source `d6fc9c9b7b499d0a182c972815913b541e4cb81b`, manifest71a23909/binary11ce613e. Пересборки CLI нет. Helper реально выполнил headless status/check с owner/config/container bindings,46 адресных tests и package typecheck (оба exit0), подлинный unit completion → ordinary RELEASED → FREE. [Первичный receipt](2026-10-16-text-import-installed-smoke-receipt.json) сохранён побайтно; полные process proofs/exit receipts — в собственном archive448bdca2. Новый integration lease не связан с завершённым Ben/LAB57 lease; тот остался архивированным. Все6 profiles чисты, controller завершён. Это targeted non-model smoke с continuous process proofs, не повторный full runNodeUnitChecks и не сценарный прогон. До effects guards и smoke script независимо проверены; отклонённые предварительные варианты script не запускались.

Файлы AppArmor и сети совпали с адресными receipts 13октября, target AppArmor profile загружен; native READY подтвердил применимость прежних CLI paths. Ничего не переустанавливалось/не расширялось. MAS/evalrun не подключались и не изменялись.

Единый административный handoff Evaler записан в описание LAB-58; LAB-59–LAB-63 ссылаются на него. Все6 descriptions обновлены с `--no-start`, metadata хранит development pin b82707aa80 отдельно от historical pins; exact read-back, backlog/revision12 и active/queued=[] подтверждены. Evaler/Rich/Ben не запускались. LAB-56 done72 и LAB-57 done569 не изменялись. Первый verified development pin LAB-58 — b82707aa80; финальный tip общей ветки дополнен только этим отчётом/receipts. Перед каждым следующим фактическим назначением SHA обновляется после возврата принятого результата в общую ветку.

**Готовность к LAB-58: да; интеграционных blockers нет.** Новых заданий на выполнение и model/reference/product/cold запусков нет. Исторические limitations сохранены. Общая ветка опубликована линейно без force-push; dev/main и продуктовый выпуск не затронуты. [Checkpoint](text-import-integration-checkpoint.md) содержит итог и порядок продолжения.
