# Приёмочный комплект Pearson — предложение владельцу

Этап 0 не является PASS обработчика: runtime ещё не реализован, модельных
прогонов и cold-check.mjs нет. Критерии ниже утверждает владелец до этапа 1.
Порог схемы <46 000 Б сохраняется; регистрация типа — после F2/LAB-516.

| Задание | Данные | Expected |
|---|---|---|
| task.md | pairs.csv | expected.json |
| task-update.md | pairs.csv, update.csv | expected-update.json |
| task-null.md | null.csv | expected-null.json |
| age-pressure-task.md | age-pressure.csv | expected-age-pressure.json |

Модели передавать только задание и соответствующие входы из data/.
Oracle, expected, manifest, discovery и parameter-schema остаются вне её
workspace. `{{PACKAGE_PATH}}` заменяется перед запуском на новый путь своей пары.
Сценарии run-check регистрируются в этапе 1; здесь runner не менялся.

Oracle — Python stdlib: точные Fraction-суммы и Decimal sqrt (precision 50).
Схема native вывода закреплена живым исследованием; числа вычисляются только
из исходных CSV, без Loginom/runtime/handler и без подгонки по результату.
Воспроизведение из корня:

```sh
python3 docs/node-development/nodes/research-corranalysis/acceptance/oracle.py --check
node docs/node-development/nodes/research-corranalysis/fixtures/schema-size.mjs
```

`--write` пересоздаёт expected и fixtures/manifest.json, pearson-reference.json.
Подготовить их до любых модельных прогонов, фиксировать SHA; не перегенерировать
для обхода FAIL. Для CSV NULL — ?, decimal — точка; cold сверяет native NULL.
`fixtures/parameter-schema.json` — предложение контракта, не runtime регистрация.

| Критерий | Предложение |
|---|---|
| Метрика | Только Pearson числовых integer/real полей; новый/существующий узел, полный readback |
| Пары | Полное произведение наборов; self/симметричные пары сохраняются |
| Порядок | ordered:true; второй набор снаружи, первый внутри, в native порядке входных полей; порядок колонок точный |
| Выход | research.corr_analysis, табличный output_port:0; ColSet1, ColSet1_Label, ColSet2, ColSet2_Label, Pirson |
| Точность | Только Pirson: real, abs 1e-6. Имена/метки/типы/NULL точны; relative tolerance не задан |
| NULL/константы | Попарное исключение пропусков; нулевая дисперсия даёт NULL. Полный expected-null.json содержит все четыре пары |
| Изменение | Те же GUID импорта и корреляции, свежие значения update.csv, незапрошенные настройки/связи сохранены |
| Persistence | Save, новое открытие, обычный Execute без обучения, полный cold-check результатов и очистка |
| Age-pressure | Native порт корреляции плюс финальный export_input; 300 строк, средние 43.32/117.584667, r=0.832286 после итогового округления |
| Приёмка | На одном SHA worker ≥2 PASS из 3 и независимая проверка 2/3, полный cold-check, тесты изменённых путей по регламенту |

Метки узлов задачами не заданы и в expected не фиксируются. Для вычисленных
полей финального age-pressure допускаются любые метки через label_any; имена
и типы фиксированы. Метки native выхода корреляции фиксированы по UI.

Граница этапа 1 — непустой источник с ≥2 совместными наблюдениями на пару;
частичные NULL и константы покрыты. empty.csv сохранён как fixture последующего
r05/этапа 3: native на 0 строках показал значения прежнего результата даже в новой Table.
Такой результат не принят математическим oracle; expected-empty не создавался.
Полностью пустые пары/одна совместная строка и текстовые категории не проверены
и не объявлены поддержанными этапом 1. Это явное предложение границы владельцу.

Будущие модельные прогоны — только run-check start + foreground wait,
openai/gpt-6.1-sol medium, 1800 с, новая основа/профиль/чат, назначенная пара.
Сборок CLI и регистрации сценариев на этапе 0 нет.
