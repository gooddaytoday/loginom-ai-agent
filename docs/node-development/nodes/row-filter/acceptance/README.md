# Предложение приёмки условий из переменных

LAB-834, этап 0. Handler ещё не поддерживает эти операнды; модельных PASS нет.
Критерии и включение режима в v0.4.0 требуют решения владельца.
Общий порт и typed variable cold — из W1, без своей проверяющей обвязки.

| Task | Вход | Начальное expected | Финальное expected |
|---|---|---|---|
| `task-variable-mixed.md` | `../fixtures/variables.csv` | `expected-mixed-initial.json` | `expected.json` |
| `task-variable-list.md` | тот же CSV | `expected-list-initial.json` | `expected-list-final.json` |
| `task-variable-scalar.md` | тот же CSV | `expected-scalar-initial.json` | `expected-scalar-final.json` |
| `task-variable-empty.md` | `../fixtures/variables-empty.csv` | `expected-empty.json` | тот же файл |

Дополнительный крайний случай `expected-mixed-none.json`: те же условия
mixed, limit=100 и codes=C. Его включение в живую матрицу согласуется перед
этапом 1; отдельного сценария runner на этапе 0 не создаётся.

Модель получает только task и исходный CSV (копию в data/ сценария будущей
регистрации). Ей не передаются oracle, expected, manifest, этот README,
proposed-type-card, proposed-reference или история исследования.
В task нет ожидаемых RowID/числа строк или инструкций реализации handler.
Названия CSV-результатов свободные, порядок полей/строк не задан пользователем.

`expected.json` описывает финальные таблицы для существующего matcher:
оба `output_port`, точные имена/типы/ячейки, `column_order:any`,
`ordered:false`, `label_any:true`. До чтения подставить реальный PACKAGE_PATH.
В W1 отдельно проверить финальные пользовательские переменные:
mixed — limit integer 15, codes string C; list — codes string 15;
scalar — wanted string a; empty — limit integer 10, codes string A,B.
Проверять реальную control-связь/mapping и сохранённую ссылку в условии,
а не только совпадение финальной таблицы с literal-эквивалентом.

Независимый Python oracle рассчитывает разделение по исходным CSV; обе
части содержат все поля. NULL `?` преобразуется в JSON null, не в 0 или текст.
Простые списки разобраны stdlib csv; для fixture они не содержат пробелов,
кавычек, пустых элементов или вложенных разделителей. Результаты за пределами
этой грамматики не объявляются подтверждённой семантикой Loginom.

Воспроизведение, без Loginom и сборки CLI:

```sh
python3 docs/node-development/nodes/row-filter/acceptance/oracle.py --write
```

Регистрация в существующем run-check, модельные 2/3 на одном SHA,
независимые 2/3, CSV, Save/cold и cleanup относятся к этапу 1 после W1.
Сейчас нет новой регистрации сценариев или нового механизма проверки.
