# Бюджеты предложения LAB-1051

База `96d09addfcca8619adcc9f55baf04d6cb7643c43`, Node 24.19.0.
Docs-only proposal; public tools, handlers и активный skill не менялись.

| Что видит модель | Текущий размер, Б | После предложения, Б | Лимит, Б |
|---|---:|---:|---:|
| Сжатый dock_node_apply (`model_tool_bytes`) | 14539 | 14539 при неизменном сжатом tool | 20000 |
| Карточка variables.from_table (`JSON.stringify(card)`) | 3475 | 4052 | 12000 |
| Главный SKILL.md | 28670 | 28670 | 40000 |
| Строка маршрутизации типа, включая LF | 132 | 132 | около 200 |
| Reference узла, UTF-8 файл | 2944 | 3933 | 6000 |

`full_input_schema_bytes=64290` измерен отдельно; это **не** размер,
отправляемый модели, и лимит 20000 к нему не применяется.
Будущий implementation SHA снова обязан пройти schema-budget test:
нынешняя цифра не удостоверяет ещё не внесённые изменения схемы/reader.

Карточка — [node-card-aggregate-types-proposal.json](node-card-aggregate-types-proposal.json).
Все её hash/cache/skillRevision поля — 64 нуля; это не реальные contract pins.
Enum расширяется до 14 функций того же режима aggregate. Для concat
предложен минимальный срез с native defaults: schema параметров списка
не добавляется, custom settings отдельно not_checked. Variant в карточке
помечен зависимостью от решения владельца, он ещё не callable-поддержка.

Reference — [skill-aggregate-types-proposal.md](skill-aggregate-types-proposal.md),
полная замена файла узла. Правила остаются под `<!-- mode: aggregate -->`;
в главный SKILL не добавляется тело правил. #803 ещё открыт на момент
подготовки: merge не ожидается и активные product-файлы не переписываются.

Воспроизведение действующего замера из `packages/loginom-runtime/client`:

```sh
nice -n 19 node --test test/model-schema-budget.test.mjs
```

Компактная карточка измерена после `userActionInventory(runtime.describe({
node_types:['variables.from_table']}))` с bundled catalog и полным набором
pins того же теста. SkillRevision заменён 64 нулями, длина не меняется.
Для проверки опубликованного предложения из корня:

```sh
python3 - <<'PY'
import json
from pathlib import Path
p = Path('docs/node-development/nodes/variables-datatovar')
card = json.loads((p / 'node-card-aggregate-types-proposal.json').read_text())
print('card', len(json.dumps(card, ensure_ascii=False, separators=(',', ':')).encode()))
skill = Path('packages/product/skills/loginom-automation/SKILL.md').read_bytes()
print('skill', len(skill))
print('route', len(next(line for line in skill.splitlines(keepends=True) if b'variables.from_table' in line)))
print('reference', len((p / 'skill-aggregate-types-proposal.md').read_bytes()))
PY
```

Все перечисленные бюджеты укладываются. Это размер предложения, а не
разрешение менять общий Variant-контракт. Затронутые production-пути и
условная оценка 2 + 1–2 циклов приведены в
[исследовании](discovery-aggregate-types.md#причина-остановки-и-оценка-реализации).
