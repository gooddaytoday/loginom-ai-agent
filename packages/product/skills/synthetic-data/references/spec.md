# Спецификация

Корень — объект JSON.

| Поле | Смысл |
| --- | --- |
| `name` | Имя набора, до 64 символов, без `/` и `\` |
| `seed` | Целое `0..4294967295`. Один seed повторяет байты |
| `tables` | От 1 до 40 таблиц |
| `defects` | Необязательный список дефектов |
| `realism` | Необязательные ограничители грязных данных, см. [правдоподобие](realism.md) |
| `entities` | Необязательный общий справочник элементов для нескольких таблиц, см. [связи](relations.md) |

У таблицы: `name`, `rows` (1..100000, сумма по всем таблицам до 200000), `columns`, необязательный `output`, `split` и `enumerate`. `enumerate` называет сущность и выпускает по строке на каждый её элемент; `rows` можно не задавать.

`split`: `{ "by": "store", "file": "sales-{value}.csv" }`. `{value}` — значение колонки, путь в шаблоне запрещён.

## Колонки

`name` начинается с буквы. `type`:

| type | Поля |
| --- | --- |
| `sequence` или `id` | `start`, `step`, `prefix`, `width` |
| `int`, `float`, `decimal` | `min`, `max`, `scale` для decimal, `distribution`: `uniform`, `normal`, `lognormal`, `poisson`. Для normal — `mean` и `sd`, для lognormal — `mu` и `sigma`, для poisson — `lambda` |
| `string` | `length` или `pattern`: `#` — цифра, `?` — буква |
| `category` | `values`, необязательные `weights` |
| `date`, `datetime` | `from`, `to` как `YYYY-MM-DD`, необязательный `format` |
| `bool` | `probability` |
| `dictionary` | `dictionary`: `fio`, `cities`, `products`, `organizations` |
| `text` | короткие русские фразы |
| `ref` | `table`, `column`, `distribution`: `uniform` или `zipf`, `zipf`, `unique` |
| `lookup` | `table`, `column`, `match` — колонка текущей строки, обычно предшествующий `ref` |
| `expr` | арифметика `+ - * /`, функции `min`, `max`, `abs` и скобки по уже созданным колонкам. Необязательный `scale` `0..8`. Имя с пробелом пишется как `{Сумма продаж}` |
| `linked` | кортеж из `links` или `entities`. Необязательный `field` — какое поле брать, см. [связи](relations.md) |
| `offset` | смещение от более ранней даты |
| `walk` | шаг временного ряда |

У любой колонки можно задать `optional` (доля пустых ячеек по замыслу), `hidden` (не писать в файл) и `limits` (физические границы). Связи, группы строк, ряды и правила — в [отдельном описании](relations.md).

Тренд и сезонность у числовой колонки: `trend: { "date": "date", "slope": 0.2 }` и `season: { "date": "date", "amplitude": 5, "period": 365 }`. Колонка даты стоит раньше. После тренда значение может выйти за `min`/`max`.

`ref` и `lookup` не образуют цикл и не ссылаются на свою таблицу. `unique: true` берёт каждое значение родителя не больше одного раза, поэтому строк не больше, чем у родителя.

## output

`format`: `csv` (по умолчанию), `tsv`, `txt`, `xlsx`, `json`, `jsonl`, `xml`.

`file` — имя без пути. Иначе имя строится из таблицы и расширения. `defects.csv` и `manifest.json` заняты.

Остальные поля формата описаны в [formats.md](formats.md). Несколько таблиц могут попасть на разные листы одного XLSX, если у них одно и то же `file`. Для CSV одно имя файла на одну таблицу.
