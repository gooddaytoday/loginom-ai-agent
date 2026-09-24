> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-8f0e99f8e3ee` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Node14: восстановление исходной фазы input_mapping

Результат: development recovery реализовано и проверено в Loginom 7.4.2.
Потерянный ответ завершённого входного «Готово» восстановлен в той же сессии,
runtime и операции; повторного входного Done нет. Это не автономная приёмка узла.

Команда: `node14:development-recovery:1:e88cb6182cdc2b6c051d772c02ac53df5b331016`.
База: `e88cb6182cdc2b6c051d772c02ac53df5b331016`.
Code SHA: **`c32a5d5e163fe174afba59abce973ac405742cdc`**.
Ветка: `codex/node-14-missing-values`. Единственный review и fix round N14-R1/R2
не повторялись; выполнена отдельно назначенная разработка recovery.

## Наблюдения и решение

До изменения исходников выполнена живая инъекция в исходном runtime:
`unavailable:artifact-142444df366f23f5`. Ответ внутренней `n7` действительно потерян
после успешного input `finish_wizard`. Browser receipt подтвердил Done и возврат
на граф, но сам по себе не подтвердил сохранённую семантику mapping.
Явное диагностическое открытие порта, чтение пяти полей и Cancel показали:
Ext пересоздаёт record_id, native field_id/порядок/источники/параметры сохраняются.
Это сопоставлено с E2E `bg/helpers/workflow/ports.ts` и
[Help мастера связи](https://help.loginom.ru/userguide/workflow/ports/mapping-master.html),
[настройки табличного порта](https://help.loginom.ru/userguide/workflow/ports/table-interface.html).
E2E изучены как источник; сами E2E-тесты здесь не запускались.

Обработчик Node14 явно включает `inputMappingRecovery`; другие типы не включены.
Перед Done сохраняются полный mapping, определение, точные owner/port GUID,
узел источника и связь, build/origin и корень мастера. Потеря ответа сохраняет
исходную ссылку на подписанную браузерную квитанцию, независимо от lastReceipt
последующих наблюдений. Нормализованное представление URL проверено настоящим
redacted/fsync журналом; проверка подтверждения записи остаётся строгой.

Inspect читает исходную квитанцию и граф, не открывает мастер и не снимает pending.
При доказанном завершении он предлагает `dock_node_resume` с исходными параметрами.
Resume сначала требует completed/SUCCEEDED ui.act, исходную подпись/namespace,
ровно один input Done, тот же wizard root, узел и незаблокированный граф.
Затем открывает только свой входной порт, читает полный mapping и отменяет
контрольный мастер. Повторного Done и редактирования в recovery нет.

Сравнение исключает временные record_id и окно отрисовки, но сохраняет native
field_id, порядок, name/label/type/kind, usage/default_usage, origin/inherited,
источники, autosync и native port identity. После совпадения mapping и графа
записывается ровно одна квитанция исходной фазы. Только подтверждённая запись
разрешает продолжить оставшиеся фазы исходного node.apply. Старые budgets и
идентификаторы сохраняются. Максимум две контрольные пробы; неизвестная очистка
блокирует повторное открытие. Потерянная сессия не реконструируется.

## Живая проверка

Общий runtime pin обоих итоговых сеансов:
**`a9db4113ac69d38d7227e971ece3652acf3e1bf836723e6e577917eda916406f`**.
156 файлов сверены после прогонов: `recovery-pin-verified.json` второго сеанса.
Аккаунт test-4, пакет `/test-4/Node14-20260913-final.lgp`, узел
`de695a64-b435-4bbd-ad4e-7a94852498d3`, источник
`f6b59238-84e2-4e59-9a8f-c865e89d3893`, input GUID
`9dc72a3f-56bf-3bfc-84ec-f979daf4da6b`. Видимое окно 1508×949,
viewport null, фактическая область 1508×862.

### Положительный случай

Evidence `unavailable:artifact-aa5faacbf7726f27`, сессия
`804a8a6b-a876-40b8-8abc-f9115a3c1e3a`.
`node14-recovery-success:n7` — реально выполненный Done с потерянным ответом.
Исходный job: AMBIGUOUS/input_mapping, execution not_requested,
output not_refreshed/ports пусто. Inspect: available=true, действий **2→2**.
Исходный `node14-recovery-success` продолжен в том же runtime, attempt 2:
**SUCCEEDED**, execution `1789268676215-mlpakrklsy:197:1`.
Повторные start/resume вернули неизменный job без действий: **81→81**.
Строгая опубликованная SDK job schema: PASS.

В журнале ровно один input Done до принятия input_mapping, одна квитанция
этой фазы и один `execute_graph_node`. Независимо прочитана вся таблица **3×5**,
15 ячеек совпали с frozen `reordered` expected и заданной строкой `NEW_NODE`.
Проверены Null, порядок и точные числа; байты CSV заново не проверялись.
Файлы `recovery-success-{initial,inspect,final,checks,dropped}.json`,
`node14-recovery-success-independent-full.json`,
`node14-recovery-success-recovery-audit.json`, `execution-events.jsonl`.
Шесть отрицательных подмен evidence (ранний fresh output, чужой owner, старое
execution, потерянная строка, неверное значение, второй input Done) отклонены.

### Отказы

1. В том же первом сеансе отдельный случай на уже выполненном узле получил
   completed Done с `prepared_node_context.locked:true`. Inspect/resume отказали
   без Execute. `mismatch-native-receipt.json` сохраняет исходное доказательство.
   Это ожидаемая консервативная граница; случай не объявлен recovery success.
2. Отдельный случай на исходном невыполненном узле:
   `unavailable:artifact-362e4bb8f7425c9b`, сессия
   `d34e1944-d36d-466d-8aad-df6c0ea89fe9`. Внутри всего случая сохранены один
   runtime и ID `node14-recovery-mismatch`. После потери n7 диагностическое UI
   редактирование поменяло метку Note на RECOVERY_MISMATCH. Resume прочитал
   изменённый mapping, отменил контрольный мастер и оставил AMBIGUOUS/input_mapping,
   execution not_requested, output not_refreshed/ports пусто.
3. Возвращённая метка Same не восстановила native `origin_type`: Loginom оставил
   **1 вместо 0**. Вторая проба того же ID снова корректно отказала. Возврат текста
   не назван восстановлением mapping. Третья попытка отказала по бюджету без
   действий **18→18**. Исходный pending не сбрасывался; его успешного завершения нет.

Доказательства второго случая: `recovery-mismatch-{initial,inspect,refused,final,drift}.json`,
`recovery-mismatch-exhausted-{job,summary}.json`, `execution-events.jsonl`.
Новые сессии — отдельные диагностические случаи; они не использовались для
продолжения незавершённых операций предыдущей сессии.

## Регрессии и проверки

- Полный клиентский набор итогового кода: **1432 PASS / 1 SKIP / 0 FAIL**,
  `unavailable:artifact-b6172c5aa4f45f60`.
- После добавления отрицательной проверки origin_type: **51/51** целевых тестов,
  `focused-final.log`; production source pin не изменился.
- Python Missing Values contract: **3/3**.
- Шесть новых тестов recovery включают владельца/порт/источники, receipt и Done,
  locked/foreign graph, deadlines, неопределённую очистку, journal acknowledgement,
  сохранение исходной фазы при отказе и реальный durable redacted journal.
- N14-R1 подтверждён реальным успешным job по строгой SDK schema; его негативные
  проверки прошли полный набор. Код N14-R2 не менялся; terminal failure/cleanup,
  отказ при чужой/неполной истории и повтор failed job покрыты полным набором.
  Новая живая terminal failure здесь не вызывалась: её live evidence относится
  к `a63586fe096f4fd7f17f346c391834d3e34bdaa4` и предыдущему fix-отчёту.
- `git diff --check`: PASS. Нового review не было.

## Общие точки для отдельно согласованной интеграции узла13

Read-only изучен соседний `node-13-review-1.md`; код не заимствован и не слит.
Для N13-R1 пригодна точка `executor.mjs:readReceipt(operation, reference)`:
можно читать замороженную исходную подписанную квитанцию после последующих
наблюдений. Архитектурный образец — отдельные driver inspect/recover, проверка
исходного pending/signature/budget/cleanup и принятие фазы только после durable
`node_phase_completed`. Но `inputRecoveryBoundary`, `verifyInputMappingFinish`
и `reconcileInputMappingPhase` имеют **жёсткий input_mapping контракт** и
не являются готовым configure recovery. Date/time нужен отдельный verifier
полной матрицы черновика, исходного действия/owner и безопасной очистки;
включение `inputMappingRecovery` само по себе N13-R1 не исправит.

Для N13-R2 уже существует общая реализация из **a63586fe**:
`node-process-context.mjs` → `verifyFailedExecution` в
`node-execution-evidence.mjs` → очистка в `node-execution-procedure.mjs` →
FAILED checkpoint в `node-apply.mjs` → идемпотентный terminal job в
`node-operation-runner.mjs`; сопровождающие schema/types в
`node-result-schema.mjs` и `node-contracts.d.ts`. Повторно реализовывать её здесь
не требовалось. Ветка13 не считается содержащей её до отдельной интеграции и
целевой проверки. Успех input_mapping Node14 не доказывает configure recovery13.

## Ограничения и передача

Поддержан доказанный completed input Done на незаблокированном исходном графе.
Missing/running/foreign receipt, locked graph, изменение native mapping,
исчерпание бюджета и неизвестная очистка оставляют неопределённость. Произвольная
потеря ответа configure/output mapping/Execute и потеря runtime не покрыты этим
изменением. Полная автономная приёмка всё ещё впереди.

Исходный пакет не перезаписан; собственные пакеты закрыты без сохранения,
диагностические браузеры закрыты. CSV в этом этапе не переименовывался и не менялся.
При закрытии двух последних пакетов диагностический helper увидел граф раньше
отложенного диалога сохранения и исчерпал ожидание; затем прочитан точный вопрос
собственного пакета, выбран «Не сохранять» и подтверждено закрытие. Это не recovery.

Native save /test-4, immutable candidate admission/pins и Hermes остаются
отдельными допусками координатора. Hermes не запускался; слот передан узлу12.
Stage/publish, push/merge/deploy, общий клиент/runtime и memory routing не менялись.
Чужие `.gitignore` и `AGENTS.md` оставлены вне коммитов.
