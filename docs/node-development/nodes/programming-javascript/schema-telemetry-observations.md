# JavaScript: наблюдения технических имён и меток

Стенд: `http://logi-test-plan.bg.local/app/`, Loginom Enterprise 7.4.2.
Оператор: Ubuntu, headed Chromium, отдельный профиль на каждую пробу.
Runtime: `9d9a2af27ae5780f26fbb61a438643eb802ca40d` (source96).
Метод и ограничения: [schema telemetry design](schema-telemetry-design.md).

## Подтверждённые результаты

Проверяется `OutputTable.AssignColumns` с двумя полями: исследуемое Integer
и служебное String `__JS_Metadata`. Скрипт сохраняет фактические `GetColumn`
до Append и после записи значения. Независимое native-чтение получает оба
значения и отдельно связанную с таблицей схему из Preview cache.

| Проба | Запрошенный Name | Запрошенная метка | Фактический Name | Фактическая метка |
| --- | --- | --- | --- | --- |
| T-schema-control | Value | Value | Value | Value |
| T-schema-cyrillic | Сумма | Value | Summa | Value |
| T-schema-space | Value Total | Value | Value_Total | Value |
| T-schema-leading-digit | 1Value | Value | _1Value | Value |
| T-schema-unicode-label | Value | Сумма ё | Value | Сумма ё |

Во всех пяти пробах before/after/Preview совпали. Integer сохранился точно:
`-9007199254740991`, native int64LE `010000000000e0ff`. Все четыре исходные
ячейки совпали при повторном чтении. Пакеты закрыты, выход из аккаунта
и закрытие браузера подтверждены. Каждый запуск проверен отдельно, без replay.

Это наблюдения конкретных литералов, а не доказательство общего алгоритма
транслитерации или нормализации. Нельзя предсказывать результирующее имя из
запрошенного: handler должен читать фактическую схему. Для нового кода остаётся
рекомендация задавать допустимые латинские Name и нужные пользовательские метки
в DisplayName. Метка `Сумма ё` в проверенной пробе сохранена без изменений.

## Проверяемые доказательства

Private campaign:
`~/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/`.
Для каждой пробы сохранены report, execution-events, source manifest, launch receipt,
independent verification и source-verification. Полные журналы не добавляются в git.

| Каталог пробы | Profile / original session | Report SHA256 | Journal refs |
| --- | --- | --- | --- |
| native-schema-telemetry-control-probe-01 | 109 / 57994 | 6a0163d575385d8a58c66c1b586cc251403e4477fe09cba1fd6874306439a155 | 616 |
| native-schema-telemetry-cyrillic-probe-01 | 110 / 15546 | 6bbe81d6548f6fac0ad19dc4b0d7924adb26636ad6dd501c5b07ceec655317a6 | 616 |
| native-schema-telemetry-space-probe-01 | 111 / 76147 | e3a63c4723caf22520c8b0bba89fd58c4904e3909320b12accfde3f472d0f052 | 621 |
| native-schema-telemetry-leading-digit-probe-01 | 112 / 71930 | e073a804777c79daba83498270685ff5c66ea78235684c4b9f15de49fcc604c0 | 608 |
| native-schema-telemetry-unicode-label-probe-01 | 113 / 60970 | d9eb2791c3807453f2508d52df586aa636426287e660005645ba41aed97651d3 | 628 |

Всего проверены 50 ячеек и 3089 ссылок на журнал. Private сводка —
`schema-telemetry-observations.json`. Все 1289 source pins проверены для каждого запуска.
Независимый аудит читает native
bytes, проверяет input/output/upstream, source/execution identity, журнал и cleanup.
Initial input raw execution содержит краткую квитанцию; полный completed child
проверяется отдельно через binding. Свежие transport message IDs и неиспользуемые
байты NULL не обязаны совпадать между чтениями; значения и native int64 проверяются.

`bridge_verified=false`: Preview cache не объявляется native D.ColumnDefs или
доказанной связью engine/model sockets. Не доказаны server atomic snapshot,
отсутствие ABA и сохранение после cold reopen. Прежние одноколоночные D cases
не переименованы в T и не закрыты задним числом. Полный G5, публичный handler,
доставка знаний модели и CLI-приёмка остаются отдельными требованиями.

## Публичный lifecycle: scoped J24, 2026-10-01

Те же пять exact AssignColumns sources дополнительно прошли публичный new-Code
apply lifecycle на child`eed5760102`: ordinary headed Ubuntu, native input4cells,
два independent Execute, full typed output1×2, actual code API JSON → complete
native source/reciprocal target mapping → physical schema, полный user-v1 и
независимый source-read. Observed пары в первой таблице подтверждены этим путём.
Каждый run417–421 прошёл independent audit v3, negative50/50 и cleanup3/3/
process absence. [Дизайн и границы](public-column-names-design.md), hashes/handles
и failed416 без повышения до PASS — в [checkpoint](checkpoint.md).

Knowledge1.1 на child`276c344820` доставляет scoped Name/DisplayName rule;
actual bridge MCP fixture и budgets/source/direct проверены. Historical1.0
asset/exact examples unchanged. Source native descriptors не содержат data_kind:
это свойство проверено у target и физической таблицы, не выдумано у source.
General normalization/AddColumn/empty/collision/atomicity/ABA/full G5 и actual
candidate/CLI этим не принимаются; прежние T/D outcomes не переписаны.
