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
| Полная inputSchema (не передаётся модели) | 71 306 | 72 550 | нет |
| Карточка типа с session envelope, без guidance | 5 600 | 6 974 | — |
| Карточка типа с полным proposed guidance и guidance_modes | — | **12 203** | 12 000 |
| Общий SKILL.md после одной замены маршрута | 28 823 | 28 844 | 40 000 |
| Файл references/nodes/transform.ungroup_data.md | 4 165 | 5 141 | 6 000 |
| Строка маршрута, включая LF | 117 | 138 | около 200 |

Карточка с полным guidance превышает бюджет на **203 Б**. Это пункт отчёта
этапа 0, не разрешение править общую schema/бюджет. На этапе 1 достаточно
сжать собственное описание и повторить штатное измерение; добавление
требований полного estimator может увеличить размер. Оценка включает все
два mode-блока целиком, без выгоды от фильтрации выбранного режима;
до регистрации это расчёт предложенной поверхности, не ответ реально
установленного seasonal-handler. Guidance сериализовано как строка JSON,
поэтому overhead больше исходных байтов файла.

Размер файла предложенной карточки (компактный JSON) — 6 032 Б.
`cache_key` — 64 нуля, `session_manifest={}`; измеритель подставляет текущую
форму session envelope и placeholder skill revision, ничего не публикует
как действующий pin. Вызовы сервера/браузера в измерителе запрещены.

`userNodeTool` скрывает полную схему параметров за существующим модельным
контрактом, поэтому рост полной inputSchema не увеличил model_tool_bytes.
Неизменный размер compressed apply не означает готовности writer/readback.
Объём и неутверждённые границы — в [исследовании](../seasonal-stage0.md).
