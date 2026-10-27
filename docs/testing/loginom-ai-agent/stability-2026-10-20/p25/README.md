## p25: импорт без метки → Кросс-таблица (D83)

Постоянная регрессия по `evals/tasks/node-evals/crosstable-local-variable-bindings/`.
Источник просьбы и входа — `demo-022@fe3b024050a3ac06c972adea39dac782d2f2202b`.
`prompt.md` содержит `task.json.prompt` без изменений; `data/sales.csv` — побайтная
копия eval-входа. Модели передаются только просьба и CSV.

Просьба использовать автоматические native имена и метки воспроизводила импорт
без метки (3/3 в LAB-262 и 3/3 в LAB-314). Это наблюдаемое поведение модели,
а не требование оставить метку импорта пустой: в обоих живых прогонах нужно
отдельно проверить фактически переданный `label`. D83 ломал настройку такого
импорта из-за раскрытого меню; исправление — PR #463,
`59a041b0a4442ce7873768843f2740c815142081` (`d83-import-overflow`).

Скользящая Кросс-таблица ограничена категорией A через локальную переменную
GroupLimit=1, с CategoryNames=true и CaptionSeparator=".". Эталон требует
ровно Region/A_Amount_Sum/A_Amount_Count, строки N/15/2, затем S/3/1;
порядок колонок свободный. Типы string/real/integer и метки Region,
A.Amount.Сумма, A.Amount.Количество строгие, без `label_any`.

`python3 -B oracle.py` независимо суммирует исходный CSV и побайтно
воспроизводит оба expected-файла из любого cwd. Необязательный аргумент
меняет только `package_path`. Эталоны читают вход CSV-экспорта, связанный
с Кросс-таблицей, и требуют импорт, Кросс-таблицу и экспорт в графе.

Запуск из checkout этой ветки:

```sh
python3 scripts/node-acceptance/run-check.py start --head fe3b024050 --scenarios p25 --pair <pair> --cold
python3 scripts/node-acceptance/run-check.py wait <result-directory> --timeout 4500
python3 scripts/node-acceptance/run-check.py start --head 59a041b0a4442ce7873768843f2740c815142081 --scenarios p25 --pair <pair> --cold
python3 scripts/node-acceptance/run-check.py wait <result-directory> --timeout 4500
```

Ожидание — FAIL на старом продукте, PASS после исправления. CSV проверяет все
значения и порядок строк; stock cold без повторного применения настроек
проверяет также native типы и строгие метки. Save, cleanup обоих сеансов и
runtime-close ACK обязательны. Фактические результаты и журналы — в LAB-316.

Граница проверки: обычный run-check не сравнивает локальные переменные,
PropBinder, число Кросс-таблиц и отсутствие ручного переименования с XML
эталона eval. Совпадение таблицы само по себе не доказывает эти части просьбы;
полный eval остаётся их отдельной проверкой. Эталон результата не ослаблен.
