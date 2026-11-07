# Линейная регрессия (`datamining.lin_regression`)

## Применение линейной регрессии

Для прогноза LinReg на новых данных используй `mode:"apply"` на уже обученном узле с сохранёнными `input_fields`/`target_field`, `inputs:[]`, `finish:"execute"`; `enter` обучает или переобучает модель.

### LinReg на новых данных

Сохранённые input_fields/target_field; enter обучает/переобучает.

## Режим forward

Перед импортом сохрани исходные типы числовых полей: целочисленный предиктор передавай в `imports.text` как `type:"integer", data_kind:"Непрерывный"`. Непрерывный вид данных не требует преобразования Integer в Real. Идентификаторы оставляй Integer; в Real преобразуй только явно запрошенный отклик либо дробное поле. После импорта проверь типы полным чтением. Сохраняй исходные технические имена и значения.

Для пошагового включения факторов выбирай `datamining.lin_regression`, `mode:"forward"` в `dock_node_apply`. Укажи `input_fields` и `target_field` по техническим именам непрерывных числовых полей; остальные поля сохраняются без использования в обучении.

Критерий: `parameters.linear_regression.selection.criterion` = `f`, `adjusted_r2`, `aic`, `aicc`, `bic` или `hqc`. По умолчанию F, `add_significance:0.05`. Для F можно задать порог включения; исключение в Forward отключено мастером, `remove_significance` только проверяет сохранённый порог (обычно 0.1). R² (`r2`) пока недоступен: native-приёмка не подтверждена. Запрос с `criterion:"r2"`, в том числе с порогами 0/1, отклоняется до эффекта с `NOT_APPLIED`, `effect_possible:false`. Сообщи пользователю причину; не подменяй требуемый R² другим критерием или Калькулятором/JS. Другие критерии не принимают пороги значимости. Все строки для обучения, без нормализации и валидации, с константой; точность решателя 0.0000000001. `finish:"execute"` сначала обучает native-модель, затем исполняет её. Читай `read.ports:[0,1]`: прогнозы и коэффициенты; число выбранных факторов определяется критерием. Для CSV подключи `exports.text` к порту 0, затем сохрани пакет.

## Режим backward

Для пошагового исключения факторов выбирай `datamining.lin_regression`, `mode:"backward"` в `dock_node_apply`. Импорт, числовые типы, роли, обучение, чтение обоих портов, CSV и Save — как в forward выше. Передай `parameters.input_fields`, `target_field` и `linear_regression.selection.criterion:"f"`; `remove_significance:0.1` — порог исключения, `add_significance:0.05` — проверка отключённого сохранённого порога добавления. Настраиваемый порог исключения должен быть строго между 0 и 1. Для adjusted_r2/aic/aicc/bic/hqc пороги не передавай. R² (`r2`) отклоняется до эффекта с `NOT_APPLIED`, `effect_possible:false`; сообщи причину пользователю. Используй native Backward вместо Калькулятора или JS. Сохранение и повторное открытие должны сохранять метод и выбранные факторы без перенастройки.

## Режим stepwise

Для отбора с включением и исключением факторов используй `dock_node_apply`, тип `datamining.lin_regression`, `mode:"stepwise"`, вместо Калькулятора или JS. Импорт, типы и роли — как в forward. Передай `parameters.input_fields`, `target_field`, `linear_regression.selection:{criterion:"f",add_significance:0.05,remove_significance:0.1}`. Оба порога редактируются: строго 0..1, добавление меньше исключения. `finish:"execute"` обучает, затем исполняет; читай оба порта `read.ports:[0,1]`, экспортируй прогнозы с порта 0 и сохрани пакет. После открытия исполняй сохранённый граф без перенастройки. R² (`r2`) отклоняется до эффекта; сообщи причину, не заменяй критерий.

## Ridge

Use native `datamining.lin_regression` in `dock_node_apply`, `mode:"ridge"`, instead of Calculator/JS. Set `parameters:{input_fields:["X1","X2","X3"],target_field:"Y",linear_regression:{lambda_l2:1}}`. Manual L2 only; no auto-selection or bindings. Import Y as real/continuous, retain other source types. All rows train with intercept, no normalization/validation. `finish:"execute"` trains then executes; `read.ports:[0,1]` reads predictions and coefficients. Export port 0 with `exports.text`, Save; cold executes the saved graph.
