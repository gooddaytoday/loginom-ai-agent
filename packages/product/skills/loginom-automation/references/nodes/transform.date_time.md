# Дата и время (`transform.date_time`)

<!-- mode: calendar -->
## Дата и время

Для календарных признаков выбирай `loginom_dock_node_apply` с
`target.type:"transform.date_time"`, `mode:"calendar"` и
`parameters.fields:[{field:{kind:"input_field",name:"DateA"},transformations:[{operation:"iso_year",name:"ISOYear",label:"Год ISO"}]}]`.
Входные поля должны уже иметь тип `datetime`. Календарный год — `year`,
ISO-год — `iso_year`, номер ISO-недели — `iso_week`, её понедельник в полночь —
`iso_week_start`, день недели от понедельника 1 до воскресенья 7 — `day_of_week`.
Эти признаки вычисляй данным узлом. Поддержаны также `quarter`, `month`,
`day_of_month`, `hour`, `minute`, `second`, `year_start`, `year_end`, `quarter_start`, `quarter_end`,
`month_start`, `month_end`, `date`. На поле допускается до 12 преобразований.
`minute` и `second` извлекают целые значения 0…59; пропуски остаются NULL.
Каждый элемент `fields` заменяет полный набор преобразований указанного поля;
для удаления одного признака перечисли все сохраняемые преобразования этого
поля. Неуказанное второе поле сохраняется. На existing узле `parameters:{}`
сохраняет настройки, `transformations:[]` очищает только указанное поле.
Порядок выходов задавай через `mappings` output 0 с `autosync:false` и полным
списком `fields`, адресуя конечные имена как `source:{kind:"configured_field",name:"ISOYear"}`.
Используй `finish:"execute"`, `read.ports:[0]`; Save выполняй отдельно.
Конец ISO-недели (`iso_week_end`) недоступен из-за ошибки платформы Loginom:
на такую просьбу сообщи ограничение и не подставляй рассчитанное значение.
Для CSV дат используй формат и разделители из [правил экспорта](exports.text.md).

### Календарные признаки datetime

Год/квартал/месяц/день/час, границы периодов, ISO-год/неделя/понедельник. `iso_week_end` недоступен из-за ошибки Loginom: сообщи ограничение без подстановки вычисления.
<!-- /mode -->
