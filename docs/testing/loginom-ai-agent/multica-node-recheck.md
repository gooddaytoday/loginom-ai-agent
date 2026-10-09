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

- Docs prechange8b50b4181; baseline4e626d547/basef9bf332c; loginom0ca исключён; node assignments сохранены.
- Node SHA:45 a00b0203/PR42,46 41e0b170/PR43,47 c92a3bfd;48–52 4e626d547; старыйPASS не переносится.
- Caps8/8/8/runtime24aa…/daemon12/stock3m сохранены;8 реальных параллельных приёмок и нагрузка12 NOT_PROVED.
- Installed CLI597/version-dev и Multica0.6.1/source2ea — разные артефакты; global launcher не менялся.
- Central instructions8d7a… unchanged: target CLI selection/native/Eval/caps сохранены, LAB53 live hold действует.
- LAB53 approved scope d4241c818; Generator completed03:48:43MSK, Worker completed04:12:57MSK.
- [Draft PR44](https://github.com/gooddaytoday/loginom-ai-agent/pull/44) common-preparation→shared-oauth; clean publishedSHA9b93201de2007d013bb9f57416a9e33452677f78.
- Parent verified Worker attachments2/APIbytesPASS, report manifest bytes/SHA PASS, tree7f60a518… и19/19publishedfilesbytes/SHA PASS.
- Worker25offline claimed; parent10portablePython+3JSsyntax PASS/sourceblockingfindings0; Linux/browser native review pending, неlive/model acceptance.
- Native Reviewer01a11e3c… running04:17:26MSK, отдельный checkout9b; толькоsource/offline review, live block сохранён.
- Candidate nondeployable: обе live entrypoints останавливаются доLoginom; lifecycle/install/rollback/runtime qualification NOT_RUN.
- Общие post-flock legacy marker gate/navigation/private diagnostics подготовлены; timeout cause48 NOT_ESTABLISHED.
- LAB45 attempt6d13… numericNOT_CAPTURED/serverUNKNOWN/marker9595…; LAB48 attempt8d6f… numeric/causeNOT_ESTABLISHED/marker74f25….
- Root47 старые3117/3118 cleanup PASS только для прежнихeffects; observer3119 serverabsence PENDING; markers/history сохранены.
- Owner: existingAdmin browser наmas; Worker /proc/CDP/profiles и parentSSH baremas не нашлиbrowser/GUI; endpoint/access pending.
- Fresh complete Dispatcher inventory/caller mstSelf positive NOT_READ; новыхLoginom входов/admin/model/build0.
- 04:19MSK все8 node cards blocked/latestGeneratorcompleted; новыхWorker/Reviewer nodehandoff0.
- 01:18:26UTC mas CPU12/load0/0/0/MemAvailable30120016kB/free408564547584B; это не workload12/serverabsence proof.
- [SHA/hashes/границы](reports/2026-10-08-node-recheck/parallel8-restart.json); schedules/pools/merge-release0; чужие изменения сохранены.
- Далее: source review→existingAdmin доступ→finite45/48/3119 cleanup+полный lifecycle/runtime review LAB53→те же8 без новогоapproval.
