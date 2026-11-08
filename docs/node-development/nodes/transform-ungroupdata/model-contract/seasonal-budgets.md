# Размеры сезонного предложения LAB-1127

База `ecb11c0e2dce6972aaa00978050680145fd12b04`, UTF-8, компактный JSON.
Существующий compressed apply измерен штатным тестом базы, а не raw schema:

```sh
cd packages/loginom-runtime/client
node --test test/model-schema-budget.test.mjs
```

Exit 0, 185 тестов. `model_tool_bytes=8051`,
`full_input_schema_bytes=71306` (полная схема модели не отправляется).
CLI не собирался. Зависимости client — pinned Node 24.19.0,
`npm ci --ignore-scripts --omit=dev`.

Оценка аддитивного seasonal-предложения, без computed и чужих типов:

```sh
node docs/node-development/nodes/transform-ungroupdata/model-contract/measure-seasonal.mjs
```

| Поверхность | База, Б | Предложение, Б | Предел, Б |
|---|---:|---:|---:|
| Сжатый модельный dock_node_apply | 8 051 | 8 051 | 20 000 |
| Полная inputSchema (не передаётся модели) | 71 306 | 72 302 | нет |
| Карточка типа с session envelope, без guidance | 5 600 | 7 022 | — |
| Карточка типа с полным proposed guidance и guidance_modes | — | **11 935** | 12 000 |
| Общий SKILL.md после одной замены маршрута | 28 823 | 28 844 | 40 000 |
| Файл references/nodes/transform.ungroup_data.md | 4 165 | 4 834 | 6 000 |
| Строка маршрута, включая LF | 117 | 138 | около 200 |

Первая редакция (12 203 Б) превышала бюджет на 203 Б. Сжато без потери
правил: semantics не повторяет guidance и не называет ожидаемые значения
фикстур; описания seasonality с единственным enum укорочены; seasonal-блок
guidance оставляет только действия модели и получил закрывающий
`<!-- /mode -->` (без него загрузчик навыка отвергает файл:
`LOGINOM_SKILL_NODE_MODES_INVALID`); в shares-блоке убраны две фразы,
ложные при наличии seasonal. Итог измерителя — 11 139 Б. Измеритель берёт
semantics предложения вместо текущей (shares-правила 941 Б не считаются)
и сырой файл с маркерами. Сборка как в `skill.mjs` с сохранённой
shares-semantics даёт 11 892 Б для всех режимов. На базе с computed
(#883) сумма трёх режимов превышает 12 000 Б и 6 000 Б файла — это
решение этапа 1, не этого предложения.

LAB-1166: semantics предложения теперь содержит действующие правила shares
(без фразы базы «seasonality… unsupported») и seasonal; служебные пометки
«PROPOSAL, not implemented», «Seasonal proposal (requires approval…)» и
«lack an independent oracle» убраны из текста для модели. Измеритель с этой
semantics даёт 11 935 Б из 12 000 (запас 65 Б). Статус: предложение LAB-1127,
не реализовано и не утверждено владельцем; непостоянная опора и формула
доверительных границ не имеют независимого oracle.

Размер файла предложенной карточки (компактный JSON) — 6 080 Б.
`cache_key` — 64 нуля, `session_manifest={}`; измеритель подставляет текущую
форму session envelope и placeholder skill revision, ничего не публикует
как действующий pin. Вызовы сервера/браузера в измерителе запрещены.

`userNodeTool` скрывает полную схему параметров за существующим модельным
контрактом, поэтому рост полной inputSchema не увеличил model_tool_bytes.
Неизменный размер compressed apply не означает готовности writer/readback.
Объём и неутверждённые границы — в [исследовании](../seasonal-stage0.md).
