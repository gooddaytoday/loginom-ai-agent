# Факторный анализ (`research.factor_analysis`)

<!-- mode: pca_fixed -->
Заданное число факторов
Для `mode:"pca_fixed"` задай `parameters.factor_analysis.factors`.
`output_factors` — только по просьбе ограничить выдачу; «N факторов» — это `factors`.
<!-- /mode -->

<!-- mode: pca_eigenvalue -->
Автоотбор по собственному значению
Для `mode:"pca_eigenvalue"` задай `parameters.factor_analysis.eigenvalue`
(0.1…1.5). Выбираются факторы выше порога. `factors` не передавай.
При смене критерия явно передай его порог; новый узел не нужен.
<!-- /mode -->

<!-- mode: pca_variance -->
Автоотбор по накопленной дисперсии
Для `mode:"pca_variance"` задай `parameters.factor_analysis.variance_percent`
(1…100 процентов). `factors` и `eigenvalue` не передавай.
При смене критерия явно передай его порог; используй тот же узел.
<!-- /mode -->

<!-- mode: pca_fixed pca_eigenvalue pca_variance -->
Используй `dock_action_describe` и `dock_node_apply` типа
`research.factor_analysis`, `read.ports:[0,1]`, `mappings:[]`.
Новый узел: полный `factor_analysis.features` в порядке входа и явное `rotation`: `none`, `varimax` или `quartimax`.
Признаки — непрерывные Integer/Real без NULL, констант и дефицита ранга;
RowID/текст оставь без роли. `finish:"execute"` обучает текущий вход и выполняет.
Существующий узел меняй на месте; пропущенные настройки сохраняются.
`output_factors` — независимый cap выдачи: число ≥1 включает, `false` снимает;
обученное число не меняется. Без cap остаются P Factor-полей: лишние scores NULL,
нагрузки 0. Cap физически убирает лишние поля обоих портов. Читай полные порты:
0 — факторы и исходные поля, 1 — ColumnName/ColumnDisplayName и нагрузки.
Порядок закрепляет обработчик. Выгрузи нужные CSV и сохрани пакет.
Для Варимакс/Квартимакс задай `rotation:"varimax"`/`"quartimax"` (Kaiser).
Пропуск `rotation` на existing сохраняет значение; readback показывает фактическое.
<!-- /mode -->

<!-- mode: apply -->
Применение сохранённой модели без обучения
После замены файла импорта выполни импорт и проверь новые строки.
Для того же обученного узла: `mode:"apply"`, `target.kind:"existing"`,
`parameters:{}`, `inputs:[]`, `mappings:[]`, `finish:"execute"`.
Настройки, роли, вращение и cap сохраняются; мастер закрывается с отменой,
Teach не вызывается. Новый узел и правка параметров в apply запрещены.
Читай полностью `read.ports:[0,1]`: 0 — новые scores, 1 — прежние нагрузки.
После Save/reopen снова используй apply. Выгрузи обе таблицы и сохрани пакет.
<!-- /mode -->
