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

До использования Генератор проверяет установленный launcher, version/source/capability, manifest и файлы, актуальный daemon cap и ресурсы mas, затем подготавливает собственную пару worker/reviewer штатным accounts-only provisioning. Отдельные admin первоначально назначены, но необходимость не доказана: новые записи удержаны до диагностики нескольких сеансов общего admin. Текущее удержание описано в checkpoint. Общий исходный admin используется для короткого bootstrap под существующим постоянным account flock с точным logout/cleanup; основная подготовка идёт через собственный admin. Worker/reviewer остаются без Admin. Закрытый `cards/<UUID>/operator.json` не содержит OAuth/native Codex tokens; секреты не публикуются. Пара проходит ready/identity/permissions/cleanup. Каждый исполнитель и ревьюер использует отдельные checkout, кандидат, пустой профиль CLI, каталог пакетов вне Git, Loginom account, Host/browser и evidence. Общий OAuth остаётся отдельным; старый пул не используется.

Цель волны — улучшить надёжность самостоятельного построения реальных аналитических сценариев Loginom агентом. Итог — самостоятельное создание, настройка, выполнение и сохранение сценария через Loginom CLI, независимый модельный прогон на том же clean published SHA и предусмотренный подпланом cold reopen. Модель получает только задание и входы; oracle/expected/история дефектов остаются вне её контекста. Требуются полная матрица, адресные регрессии, проверенные значения/типы/схема/граф, порядок там, где он обещан, подтверждения `package_closed=true`/`logged_out=true` и cleanup. Снимки ресурсов и provider errors сохраняются в приватных доказательствах; API queue не доказывает отсутствие дочерних процессов.

Адресный дефект исправляется в той же карточке, затем выполняется новая итоговая попытка с новым UUID/профилем. Прежние попытки и неизвестные эффекты сохраняются. Общий дефект, новые критерии, нехватка доступа или три последовательные попытки без прогресса — конкретный вопрос владельцу. Checkpoint каждой карточки — не более 20 строк; итоговый статус требует независимой приёмки.

## Checkpoint наблюдения — новая параллельная волна, 09.10.2026

- Документация до продолжения02da9bf2; baseline4e626d547/basef9bf332c; loginom0ca не включён; remote SHA сверены.
- Node SHA: LAB45 a00b0203/PR42, LAB46 41e0b170/PR43, LAB47 c92a3bfd; LAB48–52 4e626d547; назначения сохранены.
- Caps8/8/8, daemon12;8 running одновременно NOT_CONFIRMED; stock3m claim cadence оставлена по команде владельца.
- Owner SSH verified; временные5s отменены; два stock restart в idle/terminal_reports0, interruption0; тот же daemon/runtime/profile.
- daemon PID212379/argv3m0s+12/readback PASS; installed Multica0.6.1/source2ea; server exact SHA NOT_OBSERVED.
- Native capacity classified model_not_found_or_unavailable, auto retry не назначен; stock rerun сохранён, модели не менялись.
- Protocol:5 attachments/4 manifest artifacts hash PASS; finite diagnostic:4 attachments/3 artifacts hash PASS; не node acceptance.
- root3114 GUID↔numericID через mstSelf confirmed в loaded-store9/9; cross-profile validation NOT_RUN.
- Settings multi-session разрешают входы; SessionKeepAlive1800000ms; UI logout=disconnect, mstSelf нельзя закрыть штатной UI строкой.
- root3112 отсутствие калибровано; root3114/admin3113 текущий server cleanup PENDING; marker/history сохранены.
- Original A exception не восстановить: message/stack/DOM потеряны; private copy recorder исправлен/offline PASS, network NOT_RUN.
- Exact root3114 reconnect key NOT_FOUND; ключ failed A другой; reuse/подмена не выполнялись; негативный probe не полный cleanup PASS.
- Exact own PID/startticks/fd absence подтверждены; permanent lock inodes сохранены; foreign sessions unchanged.
- mas02:03MSK load0/0/0,MemAvailable30267192KiB,disk409886097408B,queue0; fresh attempt ресурсы снимает отдельно.
- Installed CLI launcher+manifest current SHA256 match; source597 evidence retained; CLI/model/build0; новые admin не создаются.
- Один новый instrumented run LAB47 01a11dc5-2fb1-77c2-b8c9-8670cbe1923e running, max2 root profiles/new UUID; first reconciliation, затем2-profile proof.
- Остальные приёмки удержаны; scheduled observer не возобновлён/не создан; source/контракты/критерии не менялись.
- [SHA/tasks/hashes/ограничения](reports/2026-10-08-node-recheck/parallel8-restart.json); PR40 draft; docs hook typechecks PASS из cache для02da9bf2.
- Приёмка8 NOT_CONFIRMED/load12 NOT_RUN; LAB29/30 Backlog, Eval unchanged; merge/release NOT_RUN.
- Следующий шаг: получить finite calibrated reconciliation/2-profile result и exact cleanup; общий fix согласовывать отдельно.
