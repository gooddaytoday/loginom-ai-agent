# Линейная регрессия (`datamining.lin_regression`)

`input_fields`/`target_field` — имена непрерывных числовых полей. Остальные вне обучения.
Сохраняй типы/значения: целые X/ID — `type:"integer", data_kind:"Непрерывный"`; Real — дробные поля или явно запрошенный Y. После импорта читай все поля полностью.
Все строки, константа, без нормализации/валидации; `finish:"execute"` — Teach и Execute. Изменения — Teach того же узла.
Выходы: **0 — прогноз `<target>_rergession` и исходные поля; 1 — коэффициенты `Name`/`<target>_coefficients` с константой; 2 — сводка**. Таблицы: `read.ports:[0,1]`, `sample_rows:100`, `require_exact_numbers:true`.
CSV прогнозов — `exports.text` от порта 0, `inputs:[{source:regression.node,output:0,input:0}]`, в том числе при `statistics:"full"`. Коэффициенты: порт 1; их CSV — лишь по запросу, отдельно. сохрани пакет; cold без настройки.
После Execute читай сводку через `read.variable_ports:[0]` (физический порт 2). Сверь 15 свежих переменных в `VariablesForm`. В `read.ports` указывай табличные порты. Передавай нативные значения.

<!-- mode: enter apply -->
`enter` (пере)обучает. Прогноз новых данных: `mode:"apply"` того же обученного Enter-узла, прежние `input_fields`/`target_field`, `inputs:[]`, `finish:"execute"`; модель/настройки сохраняются без Teach.
Последовательное обучение/тест — Enter, `linear_regression.partition:{method:"sequential",train_count:16,test_count:2}`. Первые 16 строк обучают, следующие 2 только прогнозируются.
Сводка качества модели с F/p — `statistics:"coefficients"` (по умолчанию), порт 1 — Name/Y_coefficients. F/p сводки (порт 2) не требует `full`. SE/t/p/95% границы **коэффициентов** — по запросу: `mode:"enter"`, `linear_regression:{statistics:"full"}` — порт 1, 9 native-столбцов с NULL.
Оценивай значимость фактора по `<target>_PValue` порта 1. При расхождении укажи `ModelPValue` отдельно.
Категории: дискретная строка в `input_fields` и `linear_regression:{statistics:"full",normalization:[{field:"Category",method:"indicator",reference:"first"}]}`. Первый элемент native-списка — опорный, с видимым нулевым коэффициентом. Name повторяется; категории различает UniqueValues (string). Только Enter, без apply/других опорных значений; числовые поля не нормализуются.
<!-- /mode -->

<!-- mode: forward backward stepwise -->
R² (`r2`) не прошёл native-приёмку. `criterion:"r2"`, включая пороги 0/1: отказ до эффекта, `NOT_APPLIED`, `effect_possible:false`. Сообщи причину без подмены критерием/Калькулятором/JS.
`parameters.linear_regression.selection.criterion`: `f`, `adjusted_r2`, `aic`, `aicc`, `bic`, `hqc`. По умолчанию F; число выбранных факторов определяется критерием. Пороги значимости только для F, строго 0..1.
<!-- /mode -->

<!-- mode: forward -->
Пошаговое включение — `mode:"forward"`. F: `add_significance:0.05` редактирует включение; отключённый `remove_significance:0.1` только проверяет сохранённое значение.
<!-- /mode -->

<!-- mode: backward -->
Пошаговое исключение — `mode:"backward"`. F: `remove_significance:0.1` редактирует исключение; отключённый `add_significance:0.05` только проверяет сохранённый порог.
<!-- /mode -->

<!-- mode: stepwise -->
Включение/исключение — `mode:"stepwise"`, `linear_regression.selection:{criterion:"f",add_significance:0.05,remove_significance:0.1}`. Оба порога редактируются, добавление меньше исключения.
<!-- /mode -->

<!-- mode: ridge -->
Manual Ridge: `mode:"ridge"`, `linear_regression:{lambda_l2:1}`. L2 — конечное число ≥0. Автоподбор и привязки не поддерживаются; сообщи причину.
<!-- /mode -->

<!-- mode: lasso -->
LASSO: `mode:"lasso"`, `linear_regression:{lambda_l1:1}`. Ручной L1 — конечное число ≥0. Штраф RSS+λΣ|β| включает константу. Автоподбор λ и привязки не поддерживаются; сообщи причину. Строгая точность на коррелированных данных не гарантируется.
<!-- /mode -->

<!-- mode: elastic -->
Elastic Net: `mode:"elastic"`, `linear_regression:{lambda_l1:1,lambda_l2:3}`. Ручные конечные λ≥0, сумма >0; без автоподбора метода/λ и привязок. Изменение λ того же узла: `finish:"execute"` переобучает; читай порты [0,1]. Порт 1 — Name и Y_coefficients с константой и X3. Строгая точность на коррелированных данных не гарантируется.
<!-- /mode -->
