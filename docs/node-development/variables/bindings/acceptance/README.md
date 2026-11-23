# Предложение приёмки двух узлов

Комплект предложения для будущей модельной приёмки. **Не зарегистрировано в run-check,
не утверждено, модельных PASS нет.** Независимые expected — желаемая семантика,
не новые наблюдения Loginom. Новый verifier/runner в этом PR не добавлен.

| Сценарий | Пользовательское задание | Данные | Две фазы |
|---|---|---|---|
| Предлагаемый `bindings-filter` | [task-filter.md](task-filter.md) | `../fixtures/filter.csv` | Limit integer 5 → 8, прежний Фильтр и две его таблицы |
| Предлагаемый `bindings-import` | [task-import.md](task-import.md) | `../fixtures/import-a.csv`, `import-b.csv` | CsvPath string: verified A → verified B, прежний Импорт и одна таблица |

Модель получает только соответствующие task и исходные CSV; собственные пути
назначаются штатной доставкой. Oracle, expected, manifest, binding-inventory,
описание implementation и журналы модели не передаются. Источник переменных
и проверяемый узел создаются штатными API текущего назначения; никакого JS
для подмены параметров константами или внешнего чтения Loginom.

Оба задания включают постороннюю переменную Sentinel="keep": patch значения
целевой переменной не должен менять её имя, тип, значение или ID. Основной
сценарий не изменяет тип переменной. В import проверяется string path; оба
файла предварительно допускаются и доставляются в собственный каталог,
каждый имеет свою provenance. Нет обращения к чужому файлу/аккаунту/пакету.

## Независимый oracle

`oracle.py` использует только stdlib, читает авторские CSV, считает integer
предикат Amount > Limit с NULL→не соответствует; для импорта возвращает
точные строки выбранного файла. Общий источник ожиданий не связан с DOM,
runtime и ответами модели. Числа и строки с NULL различаются; знак/ноль не теряются.
Ожидания в `filter/` и `import/`: `expected-initial.json`, `expected.json`.

```sh
python3 docs/node-development/variables/bindings/acceptance/oracle.py --check
python3 docs/node-development/variables/bindings/acceptance/oracle.py --node filter --phase final --port 0 --csv <скачанный.csv>
python3 docs/node-development/variables/bindings/acceptance/oracle.py --node import --phase initial --csv <скачанный.csv>
```

`--write` детерминированно обновляет четыре expected и manifest fixtures.
`--check` сравнивает их побайтно и проверяет граничные опорные значения.
Stock expected уже используют существующие таблицы + W1 `variable_inventory`.
Перед запуском подставить `{{PACKAGE_PATH}}`, `{{SOURCE_A}}`, `{{SOURCE_B}}`
из **проверенных** квитанций собственной доставки. Это не пути из репозитория.
Не добавлять project-only binding inventory в stock expected без утверждения
и реализации его проверки: сейчас stock matcher не доказывает сохранённый binding.

## Порядок исполнения и отдельное доказательство binding

1. До Execute зафиксировать полную схему, реальные input/output GUID, source
   identities, mapping и setting→variable inventory. Один проверяемый узел;
   не создавать новый для второй фазы. В Фильтре input table ordinal 0,
   control input ordinal 0; в Импорте variables input ordinal 0, табличного входа нет.
2. Начальная фаза: выполнить, прочитать целиком выходы, скачать CSV каждого
   выхода, сравнить с expected-initial. Имя файла экспорта свободное; CSV —
   UTF-8, запятая, заголовки RowID/Amount, NULL `?`. Порядок строк не является
   условием бизнес-задачи, дубликаты сохраняются.
3. Изменить только значение Limit/CsvPath в прежнем source. Сохранить остальные
   переменные и binding. Повторное выполнение на том же node GUID, новые execution
   IDs. Compare final CSV/typed output с expected.json. Не настраивать Фильтр/Импорт
   между выполнениями, включая скрытый literal patch.
4. Save финального состояния с modified=false, закрыть, новый документ. Сначала
   read-only сверить W1 link/mapping и binding, затем новое Execute без настройки
   узла. Exact final таблица, каждый CSV, Save/cold и cleanup true/true обязательны.
5. Inventory предложения [binding-inventory.proposal.json](binding-inventory.proposal.json)
   проверяет active variable mode и точный parameter, тип, mapped name,
   source endpoint до/после Done/Save/cold, сохранение других настроек.
   Это проект расширения **существующего** cold audit для утверждения, не новая
   реализация. Пока его нет, CSV-only результат нельзя объявить bindings PASS.

После утверждения зарегистрировать задачи в существующем run-check с двумя
фазами, как принятые composite случаи. Не писать собственную обвязку.
Запуск реализации: start → wait одной командой, точный SHA, модель и ограничения
регламента; ≥2/3 и независимые 2/3, cold. В этом этапе сборка запрещена назначением.

## Негативные cases: тоже предложение

| Запрос / состояние | Ожидание контракта | Что проверять до/после |
|---|---|---|
| Limit string "8"; CsvPath integer 1; любой typed NULL | Отказ без конверсии/снятия связи | Прежние binding/mapping/parameters/source value, нет нового Execute/export; Native picker исключает неверные scalar types; NULL-реакция зависит от поля, см. discovery |
| Unknown pointer, mapped name, другой workflow или subtype | Отказ до записи, если известно preflight | Нет нового узла/связи при детерминированном preflight отказе |
| Literal и binding одного parameter; duplicate pointer | `BINDING_CONFLICT` | Никакого приоритета по порядку |
| Путь вне своей области; A receipt вместо B | `BINDING_SOURCE_UNVERIFIED` | Ни чтения нового файла, ни изменения источника/привязки |
| `bindings:[]`, patch посторонней переменной | Сохранить binding и неуказанные настройки | Не вызвать SwitchButton, literal не подставить |
| Старый existing Filter variable operand / CrossTable local / LGD binding | Прежняя семантика сохранена | Существующие живые regression cases, не только новый envelope |

Native тип/NULL и Variant-кейсы пяти полей и трёх табличных узлов описаны
в discovery. Живой Фильтр использовал одну строку Amount=7 и Limit 5→9;
это отдельный минимальный опыт, не прогон предлагаемого fixture из восьми строк
с Limit 5→8. Import проверен на тех же исходных CSV A/B, с именами собственной
доставки. Этот комплект покрывает два узла, не заменяет всю матрицу или
exact Variant W2-приёмку.
