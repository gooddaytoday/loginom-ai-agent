# Приёмка двух таблиц по позиции

До любых модельных прогонов: fixtures, бизнес-задания, независимый oracle и
expected. Критерии утверждены оркестратором в рамках `v040-scope` (LAB-773,
комментарий `01a1a3df-0ef5-78ca-9127-ac5fa9aa0093`). W0 разрешена на этап 1.
Первым шагом отдельно назначенного этапа 1 перепроверить пустые входы
с обеих сторон, fulltype и точное полное чтение; расхождение — стоп с вопросом.
Oracle использует только CSV и Python stdlib; не импортирует Loginom/runtime,
не читает фактический результат и не подгоняет expected по UI.

```sh
python3 -B docs/node-development/nodes/transform-coluniondata/acceptance/oracle.py --write
python3 -B docs/node-development/nodes/transform-coluniondata/acceptance/oracle.py --check
```

`--write` регенерирует ожидаемые документы, `--check` проверяет их неизменность.
Приёмочные CSV/cold проверяются существующей оснасткой. Нового механизма
верификации не добавлено. Регистрация сценариев run-check — только этап 1.
Модель получает только соответствующее задание и выбранные CSV из `../fixtures`;
oracle, expected, manifest, discovery и proposal ей не передаются.

| Предлагаемый сценарий | Задание | Expected | Передаваемые CSV |
|---|---|---|---|
| colunion-edit | task.md | expected.json | main, attached |
| colunion-repeat | task-repeat.md | expected-repeat.json | main, attached |
| colunion-matrix-regular | task-matrix-regular.md | matrix/regular.json | main, attached |
| colunion-matrix-reverse | task-matrix-reverse.md | matrix/reverse.json | main, attached-long |
| colunion-matrix-empty-main | task-matrix-empty-main.md | matrix/empty-main.json | empty-main, attached |
| colunion-matrix-empty-attached | task-matrix-empty-attached.md | matrix/empty-attached.json | main, empty-attached |
| colunion-matrix-both-empty | task-matrix-both-empty.md | matrix/both-empty.json | empty-main, empty-attached |

Имена CSV в таблице без `.csv`. Каталог источников оснастки можно направить
на fixtures и задать `input_files`; дублировать входы в data не требуется.
Основной сценарий меняет repeat → last на одном узле, выгружает **только last.csv**.
Cold проверяет конечное сохранённое состояние. Промежуточное repeat отдельно
проверяет сценарий colunion-repeat; cold не должен искать две версии одного узла.

В каждой матрице 12 отдельных узлов с уникальными предписанными метками,
один выход 0 на узел. CSV выгружаются в порядке expected: минимум, максимум,
главная, присоединённая; внутри — пропуски, повтор набора, последняя запись.
Это 60 матричных outputs плюс 2 отдельных ожидания, по 8 колонок.
Каждый expected содержит не более 12 outputs и 4 строк на output — внутри
существующих ограничений cold-check 32 outputs/100 строк.

## Утверждённые ожидаемые числа

| Длины main/attached | minimum | maximum | main | attached |
|---|---:|---:|---:|---:|
| 3/2 | 2 | 3 | 3 | 2 |
| 3/4 | 3 | 4 | 3 | 4 |
| 0/2 | 0 | 2 | 0 | 2 |
| 3/0 | 0 | 3 | 3 | 0 |
| 0/0 | 0 | 0 | 0 | 0 |

Для main=3/attached=2 при maximum BRowID:
NULL → `[10,20,null]`, repeat → `[10,20,10]`, last → `[10,20,20]`.
Живо наблюдено только maximum/repeat с парами `(1,10),(2,20),(3,10)`.
При обратных длинах недостающий RowID: NULL, 1 или 3 соответственно.
Пустой вход во всех способах дополнения предлагается заполнять NULL;
это ещё требуется переподтвердить после снятия W0.

## Утверждённые критерии

- Ровно две таблицы, логические входы 0/1, выход 0. Сопоставление по позиции,
  без ключей, сортировки или удаления повторов. Все строки сверяются с oracle.
- Порядок строк **ordered=true**; порядок полей **column_order=exact**:
  RowID, Code, Amount, Flag, Day, BRowID, AttachedCode, Rate.
  Оба Code сохраняются, AttachedCode задаётся явным выходным mapping.
  Это требуемый пользователем layout, а не обещание нативного порядка по умолчанию.
- Типы объявлены в fixtures/manifest.json. Метки полей свободны (`label_any`),
  метки матричных узлов предписаны для однозначного выбора каждого результата.
- NULL, `""`, 0 и false различны. В CSV NULL-маркер строго `?`.
  У пустого результата остаётся вся восьмиполевая схема и header-only CSV.
- Real копируются без арифметики: **abs=0, rel=0**. Все дроби fixtures точно
  представимы в binary64; округлённый preview не годится вместо точного чтения.
  DateTime — локальные гражданские значения, целые секунды, без timezone conversion.
- Один исходный и один изменённый режим на том же узле, затем Save, независимое
  cold reexecute/read без перенастройки, полный CSV, close/logout.
- Дополнительный диагностический шаг этапа 1: заменить attached на attached-long
  в том же импорте, не перенастраивая Соединение; сверить с matrix/reverse.json
  соответствующую пару режима/дополнения. Отдельный автоматический сценарий
  смены источника ещё нужно закрепить до его прогона, не менять oracle после FAIL.

Успех продукта не заявлен. На этапе 1 — регламентные ≥2/3 PASS
на одном SHA у исполнителя и независимого проверяющего, с cold, CSV и cleanup.
