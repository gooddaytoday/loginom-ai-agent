Предложение этапа 0 LAB-1120 от `ecb11c0e`, продолжение LAB-1012 (#826).
Критерии ещё утверждает владелец. Свежие UI-наблюдения — в
[`../../discovery.md`](../../discovery.md), раздел LAB-1120.

| Задание в acceptance/ | Вход из fixtures/ | Независимый expected | Таблиц |
|---|---|---|---:|
| task-numeric-aggregates.md | aggregate-values.csv | expected-numeric.json | 4 |
| task-scalar-aggregates.md | aggregate-values.csv | expected-scalar.json | 2 |
| task-datetime-aggregates.md | aggregate-values.csv | expected-datetime.json | 2 |
| task-null-cells.md | aggregate-values.csv | expected-null-cells.json | 1 |

`python3 docs/node-development/nodes/transform-crosstable/acceptance/modes/oracle.py --check`
воспроизводит четыре файла в памяти; `--write` обновляет их. Oracle использует
только CSV и уже существующий независимый `../stage2/oracle.py`, без runtime,
Loginom и захваченного вывода. Fixture — малый пятистрочный typed-пример
прежнего этапа 2, вынесенный в fixtures; байты совпадают с `stage2/typed.csv`.

Предлагается стандартная точная сверка всех полей, типов и значений, NULL,
порядка колонок, `label_any` для неоговорённых меток; строки — мультимножество.
Каждый выход содержит 2 строки и не более 8 полей. Numeric и DateTime разделены
на небольшие отчёты, чтобы проверить все функции в действующем cap, не повышая его.
Real сравнивается с abs=rel=0 по прежней спецификации binary64 oracle этапа 2.
Count включает NULL; UniqueCount исключает NULL; пустое пересечение возвращает
NULL у всех функций, а наблюдённая all-NULL группа даёт Count=n, UniqueCount=0,
NullCount=n. Исходный порядок значим для First/Last.

Предварительная проверка LAB-1153, 08.11.2026, Loginom 7.4.2, без модели,
на `0dbc0e139820e2504acd77724d7779f0c138ba14`:

- Native binary64 и скачанный CSV подтвердили StdDev Amount и Units
  `1.9999999999999998`, When — `2.0000000298023224`; NULL-группа сохранила NULL.
- При наблюдённых `date_format=yyyy/mm/dd`, `date_separator=-`,
  `time_format=hh:nn:ss.zzz`, `time_separator=:` CSV содержит `2026-01-01`,
  `2026-01-05`, `2026-01-03` для Min/Max/Avg When. Нулевое время отсутствует.
  Это расходится с прежним требованием буквального `yyyy-mm-dd hh:nn:ss.zzz`.
  Данных с ненулевыми миллисекундами эта fixture не содержит; их сохранность
  данным опытом не доказана.

Предлагаемое уточнение задания: проверять выбранные настройки экспорта и
допускать отсутствие нулевого времени. Ожидаемые значения DateTime остаются
каноническими ISO-строками с `.000`; все четыре `expected-*.json` неизменны.
Штатный CSV comparator уже сравнивает `datetime.fromisoformat`, поэтому дата
без времени равна ожидаемой полночи. Допуск, округление и новый comparator
не нужны. Модельные прогоны цикла A остановлены до принятия уточнения владельцем;
этот опыт не заменяет CSV/Save/cold и 2/3 приёмки.

Для Variant сохраняется прежний независимый комплект: `../task.md` (два
Variant-отчёта), `../data/variant-source.csv`, `../stage2/oracle.py` и
`../stage2/generate.py::variant_report`. Подготовленный источник содержит
только import/Collapse; expected и агрегаты в источник не включаются.
Это существующий контракт, включая subtype/DateTime, а не новый comparator.

В этап 1 модели передаются только выбранное задание и его CSV. Oracle,
expected и proposal-карточка остаются у приёмки. В этой карточке нет сборки CLI,
регистрации сценариев или модельных запусков. CSV/Save/cold, 2/3 + 2/3 — NOT_RUN.
После утверждения нужны аддитивная регистрация в штатном run-check и стандартные
проверки каждого сценария на одном SHA, без передачи oracle модели.

Невозможные в UI агрегаты и исключение Required-источников фиксируются как
ограничения платформы. Никаких замен функции, удаления обязательных источников,
повышения 50×8/1 MiB или нового механизма проверки не предлагается.

`node-card.proposal.json` — полный образец карточки с guidance режима pivot;
hash-поля состоят из 64 нулей. `fixtures/reference.proposal.md` и строка навыка
не активированы. Замер обоих типов, включая guidance и реальную проекцию модели:

```sh
node docs/node-development/nodes/transform-crosstable/fixtures/measure-proposals.mjs
```

Измеритель работает только с временной копией bundled skill и штатными
describe/skill-loader. `--write` сохраняет proposal-карточки, не меняя product skill.
