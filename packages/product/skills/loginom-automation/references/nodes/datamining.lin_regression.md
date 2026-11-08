# Линейная регрессия (`datamining.lin_regression`)

<!-- mode: enter apply -->
## Применение линейной регрессии

Для прогноза LinReg на новых данных используй `mode:"apply"` на уже обученном узле с сохранёнными `input_fields`/`target_field`, `inputs:[]`, `finish:"execute"`; `enter` обучает или переобучает модель.

### Новые данные

Сохранённые input_fields/target_field; enter обучает/переобучает.
<!-- /mode -->

<!-- mode: forward backward stepwise -->
Перед импортом сохрани исходные типы числовых полей: целочисленный предиктор передавай в `imports.text` как `type:"integer", data_kind:"Непрерывный"`. Непрерывный вид данных не требует преобразования Integer в Real. Идентификаторы оставляй Integer; в Real преобразуй только явно запрошенный отклик либо дробное поле. После импорта проверь типы полным чтением. Сохраняй исходные технические имена и значения.

Укажи `parameters.input_fields` и `target_field` по техническим именам непрерывных числовых полей; остальные поля сохраняются без использования в обучении.

R² (`r2`) пока недоступен: native-приёмка не подтверждена. Запрос с `criterion:"r2"`, в том числе с порогами 0/1, отклоняется до эффекта с `NOT_APPLIED`, `effect_possible:false`. Сообщи пользователю причину; не подменяй требуемый R² другим критерием или Калькулятором/JS.

Все строки для обучения, без нормализации и валидации, с константой; точность решателя 0.0000000001. `finish:"execute"` сначала обучает native-модель, затем исполняет её. Читай `read.ports:[0,1]`: прогнозы и коэффициенты; число выбранных факторов определяется критерием. Для CSV подключи `exports.text` к порту 0, затем сохрани пакет.
<!-- /mode -->

<!-- mode: forward -->
## Режим forward

Для пошагового включения факторов выбирай `datamining.lin_regression`, `mode:"forward"` в `dock_node_apply`.

Критерий: `parameters.linear_regression.selection.criterion` = `f`, `adjusted_r2`, `aic`, `aicc`, `bic` или `hqc`. По умолчанию F, `add_significance:0.05`. Для F можно задать порог включения; исключение в Forward отключено мастером, `remove_significance` только проверяет сохранённый порог (обычно 0.1). Другие критерии не принимают пороги значимости.
<!-- /mode -->

<!-- mode: backward -->
Для исключения факторов выбирай `mode:"backward"`, `linear_regression.selection.criterion:"f"`. `remove_significance:0.1` — порог исключения строго 0..1; `add_significance:0.05` — проверка отключённого порога добавления. Для adjusted_r2/aic/aicc/bic/hqc пороги не передавай.
<!-- /mode -->

<!-- mode: stepwise -->
Для включения и исключения выбирай `mode:"stepwise"`, `linear_regression.selection:{criterion:"f",add_significance:0.05,remove_significance:0.1}`. Оба порога редактируются, строго 0..1; добавление меньше исключения. Для остальных критериев пороги не передавай.
<!-- /mode -->

<!-- mode: ridge -->
## Ridge

Use native `datamining.lin_regression` in `dock_node_apply`, `mode:"ridge"`, instead of Calculator/JS. Set `parameters:{input_fields:["X1","X2","X3"],target_field:"Y",linear_regression:{lambda_l2:1}}`. Manual L2 only; no auto-selection or bindings. Import Y as real/continuous, retain other source types. All rows train with intercept, no normalization/validation. `finish:"execute"` trains then executes; `read.ports:[0,1]` reads predictions and coefficients. Export port 0 with `exports.text`, Save; cold executes the saved graph.
<!-- /mode -->

<!-- mode: lasso -->
Для LASSO используй `dock_node_apply`, `datamining.lin_regression`, `mode:"lasso"`, `parameters:{input_fields:["X1","X2","X3"],target_field:"Y",linear_regression:{lambda_l1:1}}`. Ручной L1 — конечное число ≥0. Точность 1e-10. Штраф RSS+λΣ|β| включает константу. Автоподбор λ и привязки не поддерживаются; сообщи причину. Строгая точность коэффициентов на коррелированных данных не гарантируется. Используй native LASSO вместо Калькулятора/JS. Y импортируй real/continuous, остальные типы сохраняй; все строки обучающие, константа, без нормализации/валидации. `finish:"execute"` явно обучает, затем исполняет; повторная настройка того же узла также требует обучения. Читай `read.ports:[0,1]`, экспортируй порт 0 через `exports.text`, сохрани пакет. Cold исполняет сохранённый граф без перенастройки.
<!-- /mode -->
