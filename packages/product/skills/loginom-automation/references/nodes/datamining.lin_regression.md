# Линейная регрессия (`datamining.lin_regression`)

Используй native-узел в `dock_node_apply`. `input_fields`/`target_field` — технические имена непрерывных числовых полей; остальные сохраняются вне обучения.
Сохраняй типы/значения: целые X и ID — `type:"integer", data_kind:"Непрерывный"`; Real — дробные поля или явно запрошенный Y. После импорта читай все поля полностью.
По умолчанию обучаются все строки, с константой, без нормализации/валидации; `finish:"execute"` обучает вход, затем исполняет. Изменение того же узла требует Teach; не пересоздавай узел.
Читай `read.ports:[0,1]`, `sample_rows:100`, `require_exact_numbers:true`: порт 0 — прогнозы и исходные поля, порт 1 — коэффициенты с константой. CSV прогнозов — `exports.text` от порта 0 в названный файл; сохрани пакет. Cold выполняет сохранённый граф без настройки.
Сводка — третий выход, отдельно `read.variable_ports:[0]` после Execute: полный свежий `VariablesForm`, 15 переменных. Это отдельный ordinal переменных; `read.ports:[2]` неверен. Показывай прочитанные значения, без Калькулятора/JS или пересчёта.

<!-- mode: enter apply -->
`enter` (пере)обучает. Прогноз новых данных — `mode:"apply"` на том же обученном Enter-узле: прежние `input_fields`/`target_field`, `inputs:[]`, `finish:"execute"`. Apply сохраняет модель и настройки без Teach.
Последовательное обучение/тест — Enter, `linear_regression.partition:{method:"sequential",train_count:16,test_count:2}`. Размеры в строках: первые 16 обучают, следующие 2 только прогнозируются.
Полная статистика коэффициентов (SE, t, p, 95% границы) — `mode:"enter"`, `linear_regression:{statistics:"full"}`: порт 1 из 9 native-столбцов, включая NULL. По умолчанию `statistics:"coefficients"`: Name и Y_coefficients. Покажи коэффициенты чтением обоих портов.
<!-- /mode -->

<!-- mode: forward backward stepwise -->
R² (`r2`) недоступен: native-приёмка не подтверждена. `criterion:"r2"`, включая пороги 0/1, отклоняется до эффекта: `NOT_APPLIED`, `effect_possible:false`. Сообщи причину; не подменяй R² другим критерием или Калькулятором/JS.
`parameters.linear_regression.selection.criterion`: `f`, `adjusted_r2`, `aic`, `aicc`, `bic`, `hqc`. По умолчанию F; число выбранных факторов определяется критерием. Пороги значимости только для F, строго 0..1.
<!-- /mode -->

<!-- mode: forward -->
Пошаговое включение — `mode:"forward"`. F: `add_significance:0.05` редактирует включение; отключённый `remove_significance:0.1` только проверяет сохранённое значение. Для остальных критериев пороги не передавай.
<!-- /mode -->

<!-- mode: backward -->
Пошаговое исключение — `mode:"backward"`. F: `remove_significance:0.1` редактирует исключение; отключённый `add_significance:0.05` только проверяет сохранённый порог. Для остальных критериев пороги не передавай.
<!-- /mode -->

<!-- mode: stepwise -->
Включение/исключение — `mode:"stepwise"`, `linear_regression.selection:{criterion:"f",add_significance:0.05,remove_significance:0.1}`. Оба порога редактируются, добавление меньше исключения. Для остальных критериев пороги не передавай.
<!-- /mode -->

<!-- mode: ridge -->
Manual Ridge: `mode:"ridge"`, `parameters:{input_fields:["X1","X2","X3"],target_field:"Y",linear_regression:{lambda_l2:1}}`. L2 — конечное число ≥0. Автоподбор и привязки не поддерживаются; сообщи причину.
<!-- /mode -->

<!-- mode: lasso -->
LASSO: `mode:"lasso"`, `linear_regression:{lambda_l1:1}`. Ручной L1 — конечное число ≥0. Штраф RSS+λΣ|β| включает константу. Автоподбор λ и привязки не поддерживаются; сообщи причину. Строгая точность на коррелированных данных не гарантируется.
<!-- /mode -->

<!-- mode: elastic -->
Elastic Net: `mode:"elastic"`, `linear_regression:{lambda_l1:1,lambda_l2:3}`. Ручные конечные λ≥0, сумма >0; без автоподбора метода/λ и привязок. Изменение λ того же узла: `finish:"execute"` переобучает; читай порты [0,1]. Порт 1 — Name и Y_coefficients с константой и X3. Строгая точность на коррелированных данных не гарантируется.
<!-- /mode -->
