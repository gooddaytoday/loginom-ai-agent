# Предложенные модельные поверхности LAB-1018

База `c317bf8999a9fb6825dad12c6c6d0dca80d2c039`. UTF-8, компактный JSON
для карточек и инструмента; файлы навыка и маршруты — исходные байты с LF.
Продуктовые schema и SKILL этим PR не меняются. Это оценка подготовленного
checkpoint, не размера ещё неизвестного полного сезонного/Quality-контракта.

| Поверхность | База, Б | Предложение, Б | Предел, Б |
|---|---:|---:|---:|
| Модельный dock_node_apply | 14 539 | 14 567 | 20 000 |
| Полная inputSchema (не передаётся модели) | 64 170 | 65 135 | нет |
| Карточка transform.ungroup_data с pins | 5 600 | 6 108 | 12 000 |
| Карточка preprocessing.elim_outlier с pins | 3 167 | 4 325 | 12 000 |
| Карточка research.quality с pins | 2 899 | 3 201 | 12 000 |
| SKILL.md после замены трёх строк маршрутов | 28 178 | 28 210 | 40 000 |
| Файл узла transform.ungroup_data | 4 128 | 5 025 | 6 000 |
| Файл узла preprocessing.elim_outlier | 1 725 | 2 623 | 6 000 |
| Файл узла research.quality | 5 172 | 5 837 | 6 000 |
| Строка маршрута transform.ungroup_data, с LF | 117 | 127 | около 200 |
| Строка маршрута preprocessing.elim_outlier, с LF | 131 | 153 | около 200 |
| Строка маршрута research.quality, с LF | 153 | 153 | около 200 |

Карточка computed не включает seasonal и его неизвестную схему выхода 1.
Карточка выбросов содержит **неподтверждённый** проект edit/quality/apply:
действия двух классов, константы и флаг качества. Quality сохраняет только
profile/parameters={}: 3 201 Б — нижняя граница после описания ограничений,
а не оценка неизвестных hidden-settings/apply. Умещение в бюджет не означает
утверждения критериев или доступности UI. Будущие полные поверхности нужно
перемерить после завершения discovery.

Файлы `modes-type-card.proposal.json` не содержат реальных pins; `cache_key`
— 64 нуля, `session_manifest={}`. Их собственные JSON-размеры: 5 246 / 3 463 /
2 339 Б. Измеритель подставляет реальный по форме release/session envelope
и 64-байтовый placeholder skill revision, не пишет его hashes в файлы.
Разница между envelope и файлами — по 862 Б. Hash-поля не используются
как действительные контракты или идентификаторы пакета.

Воспроизведение из корня (закреплённый Node 24.19.0; client dependencies
через `npm ci --ignore-scripts --omit=dev`):

```sh
node docs/node-development/nodes/transform-ungroupdata/model-contract/measure-modes.mjs
```

Измеритель читает текущую production schema и три предложенные карточки,
сохраняет существующие mode enum, аддитивно добавляет новые mode/поля и
применяет штатный `userNodeTool`. Он ничего не регистрирует, не вызывает
браузер/сервер и не меняет schema. Для утверждённой базы исходный размер
модели взят именно из `model_tool_bytes`:

```sh
cd packages/loginom-runtime/client
node --test test/model-schema-budget.test.mjs
```

Тест базы прошёл (51/51). Это проверка размеров существующих production
поверхностей, а не приёмка предложенных новых режимов.
