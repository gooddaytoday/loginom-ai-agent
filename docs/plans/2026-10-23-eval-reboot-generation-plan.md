# Восстановление eval после reboot через новую native generation

> Независимое ревью дизайна — PASS. Выполнять по TDD через executing-plans; после первого native E2E проверить реализацию до подключения controller.

**Цель:** после смены epoch на прежних owned container IDs учесть сохранённое качество один раз и продолжить только недостающие ключи в новой штатно подготовленной среде.
**Архитектура:** закрытая старая generation остаётся историческим доказательством; новые usernames и приватный preparation state проходят обычные native prepare/verify. Существующая parked repair operation атомарно переключает серверные пути; service перечитывает их при restart перед resume.
**Стек:** Bun/TypeScript, существующие native leases и CLI management, Docker, systemd; новых зависимостей нет.
**Основание:** `docs/plans/2026-10-23-autonomous-evals-plan.md`, `evals/AGENTS.md`, `evals/docs/parallel-users-contract.md`; node/judge recovery сохраняют принятые контракты.

## Допуск и границы

- Поддерживаемый первый сценарий: batch завершён, Result/качество сохранены, все старые native final slot/server proofs подтверждены; leases уже released либо допускают только release по этим же доказательствам после завершения owner.
- До generation reservation канонического `judgeHome` обязана быть `released` с читаемым native releaseEvidence и совпадающим hash по существующему контракту acquireJudgeLease. Retained, отсутствующая/неизвестная reservation или неподтверждённое evidence — blocker; нового judge-recovery здесь нет.
- Старый batch учитывается существующим controller по прежней конфигурации до её переключения; его результаты, включая FAIL, больше не генерируются и не судятся. Активный/неизвестный batch не переносится.
- Неполные proofs, неизвестное владение, живой прежний owner, чужой repairer или новый reboot во время незакрытой preparation остаются техническим блокером. Общий предел 24 часа и partial сохраняются; ремонт не обновляет lastProgressAt.
- Старые raw proofs, Result, summary, campaign manifests/pins и credentials не переписываются; единственная разрешённая мутация old lease state — штатный final release по прежним proofs. Новые наблюдения никогда не выдаются за доказательства под старой identity.
- Container IDs, topology, образы, URL, slot IDs, profile/workspace/history/judgeHome и auth.sharedDir сохраняются. Новых mounts/томов и новых контейнеров нет.
- LAB126 закрепляет `EVAL_AGENT_MODEL`, `EVAL_AGENT_VARIANT`, `EVAL_CLI_BIN`, `EVAL_CLI_MODE`, `EVAL_JUDGE_TIMEOUT_MS`, `EVAL_PASS_THRESHOLD`, `JUDGE_MODEL`, `JUDGE_REASONING`; username не pinned. Перед применением проверить фактический manifest/pins: при дополнительном закреплении username этот путь блокируется.
- Меняются только usernames, controller.stateDir, соответствующие служебные пути и привязки budget scopes к новому stateDir/фактическому StartedAt. Роли, политики, модели, CLI, corpus, judge и числовые resource/attempt/time limits неизменны.
- Принятая цена: старые очищенные base accounts, пустые storage roots и inventory сохраняются; на epoch добавляются N accounts и N inventory rows. Автоматического удаления нет.

## Почему штатных команд пока недостаточно

- `reconcileEnvironment`/`reopenEnvironmentLeases` требуют прежнюю точную identity; `readUserOwnership` и storage receipts также связаны с epoch. Их проверки и lease CAS не изменяются.
- Fresh stateDir с побайтной копией `pair.json` проходит существующий `verifyParallelPair`: путь файла не закреплён; ownership контейнеров/маркер/topology проверяются штатно.
- Новое имя пользователя идёт через обычные `stageUserPreparation` → created=true → storage inventory CAS → activation; существующий inventory допускает прежние строки. Это устраняет ownership bridge и новый формат доказательств.
- `ensureProfile` справедливо запрещает смену настроенного username. Нужен один адресный вызов существующего setup под held profile lease, после подтверждения новой native ownership и до обычного ensureProfile.
- `runCampaign` читает server config один раз; простая замена SlotFile не переключает процесс и budget. Нужна одна repair operation с атомарной публикацией согласованных путей и последующим restart.
- `createPair` проверяет прежние ID/labels под native guards, но при сохранённом `phase=ready` сейчас пропускает start. Использовать его существующий start-блок и для остановленной ready pair, не создавать отдельную процедуру запуска/ownership.

## Файлы и интерфейсы

- `evals/src/profile.ts`: выделить `setupProfile(config: EvalConfig, command: AgentCommand)` из блока setup в ensureProfile; сохранить management supervision/cleanup, stdin JSON, проверку утечки секретов, exit и status read-back. Default mismatch guard ensureProfile не меняется.
- `evals/src/environment-preparation.ts`: добавить к input `prepareEnvironment` только `previousSlotsFile?: string`; обычный verify и обычный prepare сохраняют поведение. Контекст разрешён лишь для совпадающих прежних ресурсов/URL и fresh generation на тех же owned IDs. До admissions сверить сохранённую native preparation выбранных прежних слотов: её epoch должна быть валидной и отличаться от текущей; неизвестность или та же epoch запрещают переключение.
- Под held server/profile leases, после native activation/checkIsolatedLoginom, прочитать публичный CLI status: допускается точная прежняя пара URL/username либо уже новая пара при повторе. Для прежней пары вызвать setupProfile с новыми native credentials, затем штатный ensureProfile/assertAuth/verify/cleanup/release; чужая/неизвестная конфигурация блокирует путь.
- `evals/src/startup-reconciliation.ts`: узкий `releaseClosedEnvironment(file: SlotFile, identity: ServerIdentity, lockRoot = globalLockRoot)` использует прежние manifests и уже сохранённые final cleanup paths. Он завершает только прерванный server release существующими методами под исходной identity; все profile reservations выбранной команды уже должны быть released с неизменными native evidence. Не вызывает admin, cleanup или новые наблюдения старой среды.
- Для уже released ресурсов принять только существующее native release evidence; retained release требует полного набора старых proofs и завершившегося owner до изменения. У всех действующих writers итоговый server proof записывается после успешного slot.release всех выбранных слотов; поэтому общего протокола retained-profile не нужно. Retained profile и recovery-only остаются блокером; завершение server release использует те же файлы/CAS, без нового журнала. Транзитивную цепочку slotReceipt/cleanupReceipt перед новыми reservations проверяет прежний native admission под всеми guards; helper её не дублирует.
- `evals/src/parallel-pair.ts`: для прежней ready pair разрешить существующему start-блоку запустить только остановленные сохранённые ID после имеющихся reconcilePairResource/verifyTopology под прежними native guards. Journal обязан содержать оба container ID и network ID; отсутствие/подмена ресурса не разрешают создание замены. Не менять labels, nonce, config или storage marker.
- `evals/script/run-campaign.ts`: добавить `controlCampaign(..., "prepare-generation", repairer)` и одноимённый CLI operation. Вызывать существующие native функции напрямую; отдельный orchestrator, hook API или новая служба не нужны.
- Тесты: существующие `test/profile.test.ts`, `test/startup-reconciliation.test.ts`, `test/campaign-control.test.ts`, `test/user-environment-integration.test.ts`; окончательный план — десятый файл.

## Последовательность repair operation

1. Под существующим controller flock проверить owner/manifest, parked repairing и того же repairer; прочитать свежий внешний финал и deadline, убедиться в inactive batch. Учесть завершённый старый batch прежним checker, сохранить journal; готовое качество не зависит от успеха ремонта.
2. По исходным old native manifests проверить полностью закрытую старую generation, включая released judgeHome с native evidence; при необходимости завершить только server release через releaseClosedEnvironment. Сверить pair.json с существующими Docker daemon ID, обоими container ID, network ID и ownership labels до `docker start <serverID> <studioID>` через guarded createPair; имена без ID недостаточны. Прочитать действительную текущую identity и подтвердить те же IDs/configuration/topology; при несовпадении остановиться.
3. Детерминированный каталог: `<stateRoot>/environment-generations/<serverEpoch>/`, внутри `state/`, соседние `slots.json` и `budget.json`. SlotFile не лежит внутри своего controller.stateDir: это запрещено validatePaths.
4. Создать приватные файлы обычной атомарной записью; `state/pair.json` — побайтная копия исходного. Имена новых пользователей — валидный ограниченный hash от полной epoch+slotId, например `eval-` + 48 hex; случайных повторных имён при конфликте нет.
5. Сохранить все остальные SlotFile значения, включая judgeHome. Budget скопировать с заменой только old stateDir scope и StartedAt соответствующих прежних container IDs; набор метрик, числовые bounds и остальное содержимое сохраняются.
6. Запустить обычный prepareEnvironment с previousSlotsFile, затем обычный verifyEnvironment новой generation. Только их успешные native cleanup/release подтверждают готовность; ошибка оставляет прежние опубликованные пути и parked repair.
7. Повторно проверить owner/repairer, inactive unit, свежий внешний финал/deadline и неизменность исходного server config. Одной атомарной заменой server.json опубликовать slotsFile+resourceBudgetFile; если verifyCommand содержит точный старый SlotFile аргумент, заменить только этот аргумент в той же записи. Не менять manifest/pins или EnvironmentFile с условиями эксперимента.
8. Штатный restart службы при ещё parked repair перечитывает новый config; существующий resume выполняет fresh native verify/preflight и продолжает missing. До resume новые admissions запрещены; restart не снимает repair и не начинает новую кампанию.

## Идемпотентность без нового состояния

Каталог/username выводятся из actual epoch; существующие файлы переиспользуются только при точном соответствии ожидаемой конфигурации. Preparation/verification/release определяются существующими native journals/receipts; несовпадение блокирует, а не перезаписывается. До публикации server.json всё ещё указывает на прежний SlotFile, поэтому повтор использует тот же previousSlotsFile и обычный native путь той же generation. После публикации совпадение настроенного пути с каталогом actual epoch и существующие native receipts определяют уже выбранную generation: повтор выполняет её verify без создания пользователей; затем штатные restart/resume. Нового previous-generation поля или поиска исторических конфигураций нет.

## Шаг 1 — первый локальный public RED → GREEN: профиль

**Файлы:** только `evals/src/profile.ts`, `evals/test/profile.test.ts`.

- [x] В существующем fakeProfile добавить один тест `setupProfile rebinds username before ensureProfile`: профиль настроен на прежнее имя; прямой ensureProfile с новым именем по-прежнему отказывает; public setupProfile → public `management(..., ["loginom", "status", "--format", "json"])` → ensureProfile подтверждают новую пару URL/username без reset/history deletion. Использовать существующий fake CLI, не переписывать его контракт в тесте.
- [x] Из `evals/` выполнить `bun run test test/profile.test.ts -t 'setupProfile rebinds username before ensureProfile'`; получить RED на отсутствующем setupProfile, затем выделить существующий setup-блок без изменения проверок и получить GREEN.
- [x] Выполнить `bun run test test/profile.test.ts` и `bun typecheck`; сохранить прежние secrecy/cleanup и mismatch-проверки, сделать небольшой коммит `refactor(evals): expose supervised profile setup`.

**Результат:** проверена только управляемая смена credentials через публичный CLI process boundary; Docker/admin/native preparation этим не доказаны. `parallelFixture` содержит только локальные файлы/leases и не используется как fake Docker/admin/CLI.

## Шаг 2 — немедленный native E2E, до controller wiring и hardening

- [x] Первым отдельным RED→GREEN проверить `fresh generation: ready pair restarts the same owned containers` в том же integration-файле: собственная временная pair, штатные guards, остановка и возврат прежних ID; marker и pair journal сохраняются. Это проверка Docker bootstrap без admin/модели; она не подменяет последующий native prepare.
- [x] В `test/user-environment-integration.test.ts` добавить один opt-in `fresh generation reuses profile after owned pair restart` с настоящей выделенной owned pair, установленным CLI/admin и сохранённым quality. Для первого пути взять уже released old server/profile/judge leases с полными native proofs: proof-only release ещё не требуется.
- [x] Команда из `evals/`: `EVAL_PAIR_INTEGRATION=1 EVAL_CAMPAIGN_LIVE_SERVER=<server.json> bun run test test/user-environment-integration.test.ts -t 'fresh generation reuses profile after owned pair restart'`. Окружение берётся из штатных EnvironmentFiles batch-unit и прежнего manifest; путь и hash CLI сверяются с experiment pins. Тест удерживает существующий controller flock, требует отсутствие owner, inactive batch и подтверждённые release proofs. Он использует прежнюю выделенную pair с сохранённым quality: штатные ID/labels/topology проверяются до stop/start, повтор после RED принимает уже сменившуюся epoch. До и после изменяющей части, включая ошибку, проверяются прежние результаты, артефакты, proofs, auth и история; значения секретов не выводятся. Не создавать fake Docker, admin override или обход guards.
- [x] Минимально переиспользовать ready start-блок createPair; после start сверить прежние IDs и новую actual epoch/StartedAt. Создать детерминированные private state/SlotFile и byte-copy pair.json; через public prepareEnvironment(previousSlotsFile) → verifyEnvironment пройти новую native ownership, адресный setup и обычный cleanup/release на тех же profile/workspace/history/judgeHome.
- [x] GREEN требует created=true, новые usernames/storage inventory nonce/credentials, неизменённые старые quality/proofs/pins и отсутствие generation/judge для сохранённого результата. Повтор prepare/verify той же generation не добавляет accounts/inventory. Здесь нет server.json switch или обещания полного campaign wiring.
- [x] На первом native E2E остановить расширение: при FAIL назвать точный blocker и условие продолжения; при GREEN сохранить доказательство и запросить предусмотренное независимое ревью перед следующим шагом. До GREEN не писать controller wiring, recovery-ветви и hardening.

**Результат:** рискованный same profile/new username+inventory путь после restart подтверждён на настоящем Loginom; будущий controller ещё не реализован.

## Шаг 3 — proof-only release и controller wiring, пока outline

- [x] Разово вернуть runner2 в рабочее состояние после квалификации шага 2: при отсутствии owner, inactive batch и подтверждённо остановленных controller instances этого server.json, под существующим controller flock проверить released native proofs и выполнить fresh verify новой среды именно принятым harness и CLI с путём/hash из experiment pins. В отдельном производном budget заменить только scope прежнего stateDir и StartedAt тех же container IDs; числовые bounds, метрики и остальные параметры сохранить. Одной атомарной записью server.json переключить slotsFile, resourceBudgetFile и точный прежний аргумент SlotFile в verifyCommand; выполнить read-back; перед допуском кампаний повторно подтвердить отсутствие controller, кеширующего прежний config. Это поставка уже подготовленной среды без кампании; campaign repair по-прежнему требует matching owner/repairer. Нужна потому, что reserve делает preflight и не может принять кампанию на старых epoch-scopes. Разовый скрипт проходит независимое ревью и удаляется после применения; новый maintenance API не вводится. Проверяемый результат — штатные verify/preflight читают согласованные указатели, прежние manifest/pins/файлы и версия harness сохранены. Коммит затрагивает только этот план и checkpoint; временный скрипт вне поставки.
- [x] После шага 2 отдельным public TDD в `test/startup-reconciliation.test.ts` проверить releaseClosedEnvironment на настоящих temp native leases от завершившегося дочернего owner: profile leases уже released, server retained, final slot/server proofs сохранены. Server release завершается, raw proof bytes не меняются; retained profile не принимается. Команда: `bun run test test/startup-reconciliation.test.ts -t 'releaseClosedEnvironment uses saved final proofs'`; отсутствие/подмена proof блокирует release. Docker/admin/CLI тесту не нужны, fixture.lockRoot — существующий аргумент native API.
- [ ] Добавить указанную repair operation и `readResourceReservation({ key: "judge:" + canonicalJudgeHome })` с существующей native проверкой releaseEvidence/hash; retained/unknown остаются blocker. Проверить owner/repairer/inactive batch/финал/deadline и сохранение FAIL в campaign-control; не менять глобальный lockRoot ради positive-теста.
- [ ] Реальный публичный путь: `bun script/run-campaign.ts --manifest <manifest> --server <server.json> --operation repair --repairer <id>`, затем та же команда с `--operation prepare-generation`; повтор до resume не создаёт ресурсов. После атомарной публикации выполнить штатный restart установленного system-level instance через разрешённый sudo/askpass, затем operation resume с тем же repairer.
- [ ] Проверить сохранённый результат учтён ровно один раз, готовы только missing, native fresh verify читает новую generation, budget scopes перенесены без изменения чисел/метрик. Из `evals/`: `bun run test test/profile.test.ts test/startup-reconciliation.test.ts test/campaign-control.test.ts`, `bun typecheck`; независимое ревью.

**Результат:** controller использует уже доказанные primitives, сохранённый quality не повторяется, released и fully-closed retained варианты имеют общий допустимый путь.

## Шаг 4 — host reboot и поставка, пока outline

- [ ] После успешного шага 3 и ревью поставить ту же принятую версию harness/CLI и конфигурацию службы; повторить saved-result сценарий с host reboot и восстановлением Docker daemon/systemd. Запуск прежней ready pair проходит ту же проверку ID/labels до start.
- [ ] Подтвердить автоматический учёт сохранённого regular/analytic/node по их существующим контрактам, repair через установленного исполнителя, возврат службы и продолжение missing без команды владельца; полная/частичная публикация и cleanup честны.
- [ ] Из `evals/` выполнить штатные suite/typecheck; записать в основной checkpoint только подтверждённый результат и ограничения, опубликовать принятый план. Не считать локальный/контейнерный тест доказательством host reboot.

**Результат:** проверяемый saved-result reboot из основного плана; незакрытые старые поколения по-прежнему явно не поддержаны этим путём.

## Риски и исключения

- Лицензия/сервер могут ограничить создание очередных пользователей: harness не содержит лимита общего числа accounts, но это проверяет первый настоящий created=true. Отказ — blocker; удаление старых accounts вне scope.
- Адресный setup должен действительно заменить credentials в установленном CLI и сохранить auth/history: продуктовый setup это допускает, фактическое wiring подтверждает шаг 2. resetProfile/удаление профиля запрещены.
- Перезапуск во время новой preparation под следующей epoch, исчезнувшие old proofs, changed container/configuration, недоступный host/API сохраняют существующий blocker/24h partial; универсального recovery здесь нет.
- Не менять lease.ts/slots.ts guards, storage ownership readers, Result/quality/pins, pending judge budget, Multica, scheduler, публичные критерии либо политику лицензии. Новых receipt/ledger/queue/retry/fallback нет.

## Оценка и критерий завершения

Уточнённый ориентир: **10 файлов, 500–850 изменённых строк** вместе с тестами и окончательным планом: один дополнительный source-файл нужен для переиспользования guarded start stopped ready pair. Отдельный runbook/модуль не нужен. Сверить через `git diff --stat`; если главный путь требует иных механизмов или более чем удвоенного объёма, пересмотреть дизайн до продолжения. Ревью плана проверило исходники; live-готовность и прохождение тестов устанавливаются при реализации шагов.
Завершение реализации: первый saved-result E2E на тех же контейнерах, затем host reboot/service, подтверждают однократный учёт готового качества и продолжение missing при неизменных экспериментальных условиях; обязательные замечания независимого ревью устранены. Живая готовность до этих проверок не заявляется.

Checkpoint:

- Шаг 1 выполнен: RED→GREEN публичного setup; profile suite 81 pass / 2 skip / 0 fail, 247 assertions; typecheck и независимое ревью — PASS.
- Bootstrap шага 2 проверен на отдельной временной pair runner2: два RED→GREEN, 1 live test / 13 assertions; локально 11 pair tests / 45 assertions и typecheck; независимое ревью — PASS. Рабочая pair не перезапускалась.
- Шаг 2 завершён на прежней выделенной pair runner2: native RED PROFILE_CONNECTION_MISMATCH → GREEN, четыре новых пользователя, две prepare/verify без дублей; после epoch-поправки повтор 1 pass / 24 assertions. Сохранность прежних результатов, всех найденных run artifacts, proofs, auth, истории и старых credentials подтверждена и при RED, и при GREEN; модели/судья не вызывались.
- Same-epoch отказ подтверждён отдельным native RED→GREEN (1 pass / 3 assertions); ошибка version в unused test proof исправлена, оставшийся probe lease штатно освобождён с новым proof. 26 regression-тестов / 115 assertions, typecheck и независимое ревью — PASS.
- Разовая поставка шага 3 выполнена под controller flock без owner/активных unit: принятый harness и CLI выполнили fresh native verify, slots/budget/точный verify-аргумент переключены атомарно и прочитаны обратно. Metadata preflight по фактическому manifest прошёл, все шесть native ресурсов released; версия harness, числовые bounds и прежние файлы сохранены. Скрипт прошёл независимое ревью и удалён локально/на сервере. Controller wiring и host reboot ещё не выполнены.

- Proof-only server release реализован: публичный native RED→GREEN, повторный вход, отсутствие/подмена непосредственного proof и retained profile проверены без Docker/admin. 54 startup/slots/lease теста / 198 assertions, typecheck и независимое ревью — PASS; native guards и raw proofs не изменялись. Следующий шаг — prepare-generation в controller и настоящая проверка его wiring.
