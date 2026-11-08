# Факторный анализ (`research.factor_analysis`)

<!-- mode: pca_fixed -->
Заданное число факторов
Для `mode:"pca_fixed"` задай `parameters.factor_analysis.factors`.
Для ограничения выдачи сохрани `factors`, меняй только `output_factors`.
Используй `dock_action_describe` и `dock_node_apply` типа
`research.factor_analysis`, `read.ports:[0,1]`, `mappings:[]`.
Новый узел: полный `factor_analysis.features` в порядке входа и `rotation:"none"`.
Признаки — непрерывные Integer/Real без NULL, констант и дефицита ранга;
RowID/текст оставь без роли. `finish:"execute"` обучает текущий вход и выполняет.
Существующий узел меняй на месте; пропущенные настройки сохраняются.
`output_factors` — независимый cap выдачи: число ≥1 включает, `false` снимает;
обученное число не меняется. Без cap остаются P Factor-полей: лишние scores NULL,
нагрузки 0. Cap физически убирает лишние поля обоих портов. Читай полные порты:
0 — факторы и исходные поля, 1 — ColumnName/ColumnDisplayName и нагрузки.
Порядок закрепляет обработчик. Выгрузи нужные CSV и сохрани пакет.
Вращения и apply старой модели пока недоступны.
<!-- /mode -->

<!-- mode: pca_eigenvalue -->
Автоотбор по собственному значению
Для `mode:"pca_eigenvalue"` задай `parameters.factor_analysis.eigenvalue`
(0.1…1.5). Выбираются факторы выше порога. `factors` не передавай.
При смене критерия явно передай его порог; новый узел не нужен.
Используй `dock_action_describe` и `dock_node_apply` типа
`research.factor_analysis`, `read.ports:[0,1]`, `mappings:[]`.
Новый узел: полный `factor_analysis.features` в порядке входа и `rotation:"none"`.
Признаки — непрерывные Integer/Real без NULL, констант и дефицита ранга;
RowID/текст оставь без роли. `finish:"execute"` обучает текущий вход и выполняет.
Существующий узел меняй на месте; пропущенные настройки сохраняются.
`output_factors` — независимый cap выдачи: число ≥1 включает, `false` снимает;
обученное число не меняется. Без cap остаются P Factor-полей: лишние scores NULL,
нагрузки 0. Cap физически убирает лишние поля обоих портов. Читай полные порты:
0 — факторы и исходные поля, 1 — ColumnName/ColumnDisplayName и нагрузки.
Порядок закрепляет обработчик. Выгрузи нужные CSV и сохрани пакет.
Вращения и apply старой модели пока недоступны.
<!-- /mode -->

<!-- mode: pca_variance -->
Автоотбор по накопленной дисперсии
Для `mode:"pca_variance"` задай `parameters.factor_analysis.variance_percent`
(1…100 процентов). `factors` и `eigenvalue` не передавай.
При смене критерия явно передай его порог; используй тот же узел.
Используй `dock_action_describe` и `dock_node_apply` типа
`research.factor_analysis`, `read.ports:[0,1]`, `mappings:[]`.
Новый узел: полный `factor_analysis.features` в порядке входа и `rotation:"none"`.
Признаки — непрерывные Integer/Real без NULL, констант и дефицита ранга;
RowID/текст оставь без роли. `finish:"execute"` обучает текущий вход и выполняет.
Существующий узел меняй на месте; пропущенные настройки сохраняются.
`output_factors` — независимый cap выдачи: число ≥1 включает, `false` снимает;
обученное число не меняется. Без cap остаются P Factor-полей: лишние scores NULL,
нагрузки 0. Cap физически убирает лишние поля обоих портов. Читай полные порты:
0 — факторы и исходные поля, 1 — ColumnName/ColumnDisplayName и нагрузки.
Порядок закрепляет обработчик. Выгрузи нужные CSV и сохрани пакет.
Вращения и apply старой модели пока недоступны.
<!-- /mode -->
