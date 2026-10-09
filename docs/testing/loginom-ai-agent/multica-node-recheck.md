# Перепроверка восьми реализованных узлов на mas

Волна назначена владельцем 08.10.2026. Источники: [RUNBOOK](../../node-development/RUNBOOK.md), [реестр](../../node-development/registry.json), разделы 0 и 2–5 подпланов и [checkpoint mas](multica-mas.md). Все восемь имеют зарегистрированный обработчик, `accepted_scope_maintenance` в реестре и `reverification_required` в подплане. Историческая приёмка не заменяет новую.

Первоначальный SHA каждой ветки — `4e626d547258e9ae7c0b7937cd672781dde0667e` из `shared-oauth`; фактическая общая база с текущей `loginom` — `f9bf332cc491baa784e6e04fdfda7c0f09151cb7`. Текущая вершина `loginom` — `0ca9e75bc7bb6897f46ac1ddc880b9758e993dc9`; её два отдельных новых коммита не входят в исходный SHA этой волны. Приёмка их поведения не заявляется; дополнительное слияние веток не назначено. Между установленным source `597592f5d53f86beb69ffe318af2d4db52c5f416` и исходным SHA этой волны изменена только документация; кандидат каждого изменённого узла всё равно собирается и принимается на собственном опубликованном SHA. Draft PR узла направляется в `shared-oauth`, чтобы отделить его diff от общей подготовки PR40. Слияние и выпуск не разрешены.

| Карточка | Узел и подплан | Ветка | Граница этапа 0 |
|---|---|---|---|
| LAB-45 | [Калькулятор](../../node-development/nodes/calculator/plan.md) | `recheck-calculator` | Выражения Loginom, зависимости, replace, scalar-типы, input/output mapping, изменение существующего узла |
| LAB-46 | [Параметры полей](../../node-development/nodes/field-parameters/plan.md) | `recheck-fields` | Scalar-конверсии, идентичность полей, имена/метки, вид/назначение, исключение и порядок |
| LAB-47 | [Фильтр строк](../../node-development/nodes/row-filter/plan.md) | `recheck-filter` | AND/OR, scalar-условия, NULL/empty, оба выхода; после cold reopen отдельный независимый аудит порта 1 и полноты разделения |
| LAB-48 | [Группировка](../../node-development/nodes/grouping/plan.md) | `recheck-grouping` | Ключи, sum/count/avg/min/max, all-null/empty, редактирование мер и mapping |
| LAB-49 | [Сортировка](../../node-development/nodes/sorting/plan.md) | `recheck-sorting` | Составные ASC/DESC, строковые флаги/локаль, кратность; отдельный аудит порядка после cold reopen |
| LAB-50 | [Слияние](../../node-development/nodes/join/plan.md) | `recheck-join` | Два входа, inner/left, типизированные составные ключи, регистр, поля правого ключа, кратность, NULL/empty |
| LAB-51 | [Объединение](../../node-development/nodes/union/plan.md) | `recheck-union` | Append-all, полная карта полей, динамические входы/префиксы, дубли/NULL/empty; не переносить live8 на предел15 |
| LAB-52 | [Замена](../../node-development/nodes/replacement/plan.md) | `recheck-replacement` | Exact string/integer/real, add/replace, other-policy, фактический _Replaced, Int64, partial/persistence |

Таблица описывает объём, не сокращает матрицы подпланов. Этапы расширения не назначены. Разрешены приёмочный комплект из прежнего независимого oracle, адресные хелперы, инструкции и тесты узла. Общая оболочка, контракты чтения и `cold-check.mjs` требуют отдельной карточки и решения владельца. Для Фильтра используется уже предусмотренный подпланом отдельный аудит второго порта; W1 не назначен.

Существующий сквад «Обработчики узлов» (`8ff41bd5-f794-4b5b-a063-026f3874628e`), проект Loginom Ai, runtime Codex(mas) `24aa980b-b8c3-43e2-b087-bad8f79c9517`. По новой команде владельца caps ролей подняты до `8/8/8`, общий daemon cap остаётся 12; partial PUT/readback подтвердил сохранность runtime/native model/MCP. Все восемь Генераторов назначены одним API batch в прежних карточках. Планировщик выдаёт их постепенно; фактическое одновременное выполнение подтверждается отдельным наблюдением, не самим batch. Готовый Генератор передаёт собственную карточку Исполнителю и освобождает slot; общего барьера готовности восьми карточек нет. Разные карточки исполняются параллельно, внутри каждой передача Генератор → Исполнитель → Ревьюер последовательная. LAB29/LAB30 остаются Backlog; Eval не меняется.

Карточки сокращены до узла, ссылки на подплан, этапа, exact SHA и ветки/PR target. Критерии и разрешённые изменения берутся по ссылке из подплана и RUNBOOK; правила ролей и окружения — из инструкций сквада.

В действующих инструкциях сквада устранено смешение исследовательского Stage0 нового узла и перепроверки Stage0 реализованного узла. Partial PUT и обратное чтение подтвердили сохранность runtime/caps/native model/MCP. Конкретные настройки внутреннего CLI остаются только в центральных инструкциях сквада; фактические значения фиксируются в доказательствах каждой попытки. Ревьюер читает центральную настройку самостоятельно и проверяет настройки принятой попытки. Недоступность целевой модели не разрешает замену.

До использования Генератор проверяет установленный launcher, version/source/capability, manifest и файлы, актуальный daemon cap и ресурсы mas, затем подготавливает собственную пару worker/reviewer штатным accounts-only provisioning. Отдельные admin первоначально назначены, но необходимость не доказана: новые записи удержаны. Центральные инструкции разрешили существующий закрытый глобальный operator config с постоянным account flock и точным собственным logout/server/process cleanup; созданные и запланированные card configs сохраняются. После повторного запуска новые неизвестные admin-эффекты LAB45/LAB48 удерживают подготовку; исправление вынесено в согласованную отдельную общую задачу. Worker/reviewer остаются без Admin. Закрытый `cards/<UUID>/operator.json` не содержит OAuth/native Codex tokens; секреты не публикуются. Пара проходит ready/identity/permissions/cleanup. Каждый исполнитель и ревьюер использует отдельные checkout, кандидат, пустой профиль CLI, каталог пакетов вне Git, Loginom account, Host/browser и evidence. Общий OAuth остаётся отдельным; старый пул не используется.

Цель волны — улучшить надёжность самостоятельного построения реальных аналитических сценариев Loginom агентом. Итог — самостоятельное создание, настройка, выполнение и сохранение сценария через Loginom CLI, независимый модельный прогон на том же clean published SHA и предусмотренный подпланом cold reopen. Модель получает только задание и входы; oracle/expected/история дефектов остаются вне её контекста. Требуются полная матрица, адресные регрессии, проверенные значения/типы/схема/граф, порядок там, где он обещан, подтверждения `package_closed=true`/`logged_out=true` и cleanup. Снимки ресурсов и provider errors сохраняются в приватных доказательствах; API queue не доказывает отсутствие дочерних процессов.

Адресный дефект исправляется в той же карточке, затем выполняется новая итоговая попытка с новым UUID/профилем. Прежние попытки и неизвестные эффекты сохраняются. Общий дефект, новые критерии, нехватка доступа или три последовательные попытки без прогресса — конкретный вопрос владельцу. Checkpoint каждой карточки — не более 20 строк; итоговый статус требует независимой приёмки.

## Checkpoint наблюдения — новая параллельная волна, 09.10.2026

- Docs prechange541e17e34; node baseline4e626d547/basef9bf332c; loginom0ca исключён; назначения сохранены.
- Node SHA: LAB45 a00b0203/PR42,46 41e0b170/PR43,47 c92a3bfd;48–52 4e626d547; PASS не переносится.
- Runtime24aa…/caps8/8/8/daemon12/stock3m сохранены; восемь реальных приёмок и нагрузка12 NOT_PROVED.
- CLI597/version-dev и Multica0.6.1/source2ea — разные артефакты; installed/global launcher не менялись.
- Central instructions8d7a…: настройки внутреннего CLI/native/Eval сохранены; модель берётся только из сквада.
- LAB53 approved scope d4241c818; [draft PR44](https://github.com/gooddaytoday/loginom-ai-agent/pull/44) common-preparation→shared-oauth.
- Published clean source6a97eb3cd264059dc95f3de9302e494683921f67/tree1d391b6b…; source-only F3 CLOSED.
- Source4d880827: независимый detached-child RED/P2 сохранён; source6a97: независимые68+4cases PASS.
- Parent: Reviewer3 APIbytes/hash,2manifest artifacts,23candidatefiles/16VERSION bindings и tree независимо сверены.
- [Source review](reports/2026-10-08-node-recheck/common-source-f3-review.json) не означает server cleanup/full LAB53/model acceptance.
- Worker01a11f7d-3749… running10:07:42MSK: UI lifecycle/finite parent-readback adapters в той же карточке/PR.
- Оба unconditional gates закрыты; полный lifecycle/install/runtime NOT_ACCEPTED; готовы только source-части.
- Cause Timeout48/45 executed-helper bytes NOT_ESTABLISHED; исправления F1/F2/F3 не объявлены причиной старых сбоев.
- LAB45/48 old marker/history retained; operator hashes MATCH/MATCH и59 exact retained PID nonlive — прежние наблюдения.
- Новая existing Mac Admin3128/unique mstSelf/connected/GUIDhash8d9e…; owner сохранён, parent login/Close/Stop0.
- 07:24:45UTC readback: count8/8=roots8, nodes10/packages2, Info/type/name/date equality, masks0, hashed inventory6628….
- Operator bucket содержит только positively bound owner3128; observer3119/priorowner3123 absent; old GUID algorithm binding PENDING.
- Старый3123 receipt immutable; [новый3128](reports/2026-10-08-node-recheck/existing-admin-mac-readback-3128.json) не покрывает будущие операции.
- 07:30UTC mas CPU12/load0, MemAvailable30140616kB/free408538505216B; daemon212379 active/running1/wait0/report0;8blocked/model acceptance0.
- Next: old-effects exact reconciliation→полные adapters/review→fresh operation-bound live proof→те же8; schedules/merge-release0.
