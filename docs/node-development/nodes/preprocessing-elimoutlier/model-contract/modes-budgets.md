# Бюджеты предложений LAB-1103

База `v040@d355159858e2b090a60b11cc21735fa5206c9308`. Runtime и продуктовые
SKILL/references не менялись. Учитываются только два узла этого назначения.
Hash-поля предложенных карточек — 64 нуля; реальный cache_key не коммитится.

Метод: UTF-8 байты minified JSON для карточки/схемы, байты файла для текста.
`measure-modes.mjs` использует production `userNodeTool`, current manifest pins
и предложенные parameter_schema/guidance. Для карточек берётся весь guidance
обоих режимов outlier (верхняя оценка), с логикой секций текущего skill loader.
Компактная схема не регистрируется; код не обращается к браузеру или сети.

Из корня checkout:

```sh
node docs/node-development/nodes/preprocessing-elimoutlier/model-contract/measure-modes.mjs
(cd packages/loginom-runtime/client && node --test test/model-schema-budget.test.mjs)
```

Production тест базы: **184/184**, `model_tool_bytes=8051`,
`full_input_schema_bytes=70930`. Это именно три поля name/description/inputSchema,
которые получает модель; полная inline схема не отправляется и предела не имеет.
Данные предложений ниже нужно повторно измерить после фактической регистрации
на этапе 1. Возможные новые поля subtype/readback сюда не включены.

| Поверхность | Предложение | Предел |
|---|---:|---:|
| Сжатый dock_node_apply | 8051 Б | 20000 Б |
| Полная inline схема | 71760 Б | только измерение |
| Карточка outlier, pins + все guidance | 7349 Б | 12000 Б |
| Карточка Quality, pins + весь guidance | 6170 Б | 12000 Б |
| Индекс SKILL.md после двух замен маршрутов | 28845 Б | 40000 Б |
| Строка маршрутизации outlier / Quality | 153 / 153 Б | около 200 Б |
| Файл outlier / Quality | 3059 / 3125 Б | 6000 Б каждый |

Quality остаётся profile с расширением допустимых входных типов. Hidden actions
и apply не имеют выдуманной схемы. Outlier предлагает detect/edit; скрытый
quality и неустановленный saved-model apply исключены. Это не превышение бюджета
и не запрос менять общий SKILL или deadline. Значения предыдущего LAB-1018
в `../../transform-ungroupdata/model-contract/modes-budgets.md` исторические.
