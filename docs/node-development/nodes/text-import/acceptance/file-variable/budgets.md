# Проект карточек и бюджетов FileName binding

Этап 0 LAB-886. `card-imports.text.json` и `card-exports.text.json` — полные
проекты карточок `dock_action_describe`, не зарегистрированные handlers.
Скопирован опубликованный shape карточек из W1
`d01482c0534d90e652360d56ea7000dcc92ceb52`; добавлены только необязательный
`parameter_schema.properties.file_name_variable` и пояснение semantics.
Все значения `cache_key` и других полей с 64-значным hex-хешем заменены на
**64 нуля**. Их содержимое не является рабочим pin; длина сохранена.
Актуальность самого W1 подтверждается SHA, а не этими заглушками.

Метрика карточки — UTF-8 `JSON.stringify(card)`, а не pretty-printed размер
файла на диске. Числа зафиксированы в `budget-proposal.json`. Запас:

| Что получает модель | База v040 | W1 | Проект после W1 | Предел |
|---|---:|---:|---:|---:|
| Сжатый `dock_node_apply`: name + description + inputSchema | 13 331 | 14 512 | 14 512 | 20 000 Б |
| Карточка `imports.text` с полной parameter_schema | 7 390 | 7 390 | 8 154 | 12 000 Б |
| Карточка `exports.text` с полной parameter_schema | 3 564 | 3 564 | 4 328 | 12 000 Б |
| `SKILL.md` | 38 215 | 38 892 | 38 964 | 40 000 Б |
| Строка маршрутизации импорта | — | — | 140 | около 200 Б |
| Строка маршрутизации экспорта | — | — | 142 | около 200 Б |
| `references/nodes/imports.text.md` | 4 756 | 4 756 | 5 362 | 6 000 Б |
| `references/nodes/exports.text.md` | 4 887 | 4 887 | 5 557 | 6 000 Б |

`skill-additions.json` содержит точные замены двух строк таблицы SKILL и
добавляемые абзацы двух references. Размер посчитан для полного прежнего файла
после замены/добавления, не только для новых строк. Действующий продуктовый
skill не изменён. Надпись «Предложение v0.4.1» в проекте references должна быть
переписана на утверждённое поведение только на этапе реализации.

Полная inputSchema: база **53 963 Б**, W1 **59 276 Б**, проект W1 с новым
полем **59 751 Б**. Модель её не получает, предела для неё нет. Сжатый tool
остаётся того же размера, потому что `userNodeTool` заменяет подробные
parameters на compact object; полная настройка приходит в карточке типа.
Проекция не включает ещё не написанное расширение result/readback и будущие
изменения текста описания инструмента. Нельзя переносить эти числа на будущий
код без повторного теста.

Фактический `model_tool_bytes` получен штатным
`node --test test/model-schema-budget.test.mjs` из `packages/loginom-runtime/client`
с pinned Node 24.19.0, под `nice -n 19`: база v040 — 45/45, W1 — 50/50, exit 0.
На этапе 1 тот же тест нужен уже на точном реализованном SHA. Проектные размеры
получены загрузкой тех же `userActionInventory`/`userNodeTool` и измерением
JSON с добавленным декларативным свойством; они не выданы за тест ещё
несуществующей production-ветки обработчика.

Пример воспроизведения сохранённых размеров без runtime и браузера:

```sh
python3 - <<'PY'
import json
from pathlib import Path
p = Path('docs/node-development/nodes/text-import/acceptance/file-variable')
for name in ('imports.text', 'exports.text'):
    card = json.loads((p / ('card-' + name + '.json')).read_text())
    wire = json.dumps(card, ensure_ascii=False, separators=(',', ':')).encode()
    print(name, len(wire))
PY
```

Все проектные бюджеты соблюдены. После W1 запас полного SKILL составляет
1 036 Б, references импорта/экспорта — 638/443 Б. Массовое описание других
управляющих полей или Excel в эти строки не добавляется.
