# Замена (`transform.replace_columns`)

<!-- mode: exact regex mixed -->
Для словаря соответствий, в том числе логического результата, и замены по
регулярному выражению выбирай `dock_node_apply`,
`target.type="transform.replace_columns"`. Вычисляемая формула и разбор
произвольного текста относятся к Калькулятору.
<!-- /mode -->

<!-- mode: exact -->
## Точный словарь — mode="exact"

В `parameters.rules` задай `field:{kind:"input_field",name:…}`, `type` входного
поля (`string`, `integer`, `real`), `pairs:[{from:{type,value},to:{type,value}}]`
и `other:{mode:"keep"|"null"|"value",value?:{type,value}}`.
Строковый ключ требует явный `case_sensitive`, без `precision`.
Числовой ключ требует `precision≥0` с максимум двумя десятичными знаками,
без `case_sensitive`. Это абсолютный включительный допуск: ближайший ключ,
при равенстве — больший. Ненулевой допуск добавляет real `<поле>_Delta=ключ−вход`.
Большие Int64 передавай десятичными строками, а не округлёнными JSON-числами.

`result_type` задаёт тип `to` и `other.value`: string/integer/real/datetime/boolean;
без него результат сохраняет входной тип. Тип `from` всегда равен входному `type`.
Для yes/no → логический признак используй Замену с `result_type:"boolean"`,
`to:{type:"boolean",value:true}` и `to:{type:"boolean",value:false}`,
`other:{mode:"null"}`. Boolean допускает true/false/NULL, а не строки и не 0/1.
Boolean: `other` null или keep (Variant: совпавшие логические, прочие с
исходным типом/NULL); другой тип с keep отклоняется. Datetime: other.null,
локальный ISO `YYYY-MM-DDTHH:mm:ss`.
Это словарь, а не автоматическое преобразование текста: незаданный ключ
подчиняется `other`. При other.null исходный NULL тоже даёт NULL и флаг true.
<!-- /mode -->

<!-- mode: regex mixed -->
## Regex — mode="regex"

`type:"string"`, `pairs` — упорядоченные строковые шаблоны from и строковые
константы to; `other:{mode:"keep"}` или `null`. Полностью опускай
`case_sensitive` и `precision`; регистр игнорирует inline `(?i)` перед шаблоном.
Поддержаны ASCII-литералы, группы, `[0-9]`, положительный `{n}`, якоря `^`/`$`.
Первое совпадение, в том числе подстроки, заменяет ВСЮ ячейку константой.
Ссылки на группы (знак доллара с номером) остаются буквальным текстом.
Смена типа результата в regex, внешние таблицы и прочие конструкции не поддержаны.
<!-- /mode -->

<!-- mode: mixed -->
## Две таблицы в одном поле — mode="mixed"

Для exact и regex в одном узле используй `mode:"mixed"`, а не два узла,
Калькулятор или JS. Правило строковое: `type:"string"`, `case_sensitive:true|false`,
`pairs` — точный словарь, `regex_pairs` — упорядоченные regex from/to того же
формата. `precision` опускай. Точная таблица имеет приоритет; только при
отсутствии точного ключа проверяются regex, затем `other.keep/null`.
Например, pairs AB-12 → EXACT-FIRST и regex_pairs AB-([0-9]{2}) → REGEX
дают EXACT-FIRST для AB-12 и REGEX для XAB-34Y.
Regex-регистр задаётся inline `(?i)` независимо от exact `case_sensitive`.
Каждое переданное правило целиком заменяет ОБЕ таблицы своего поля;
если regex_pairs опущен, regex-таблица пуста. Для сохранения одной таблицы
при изменении другой передай её прежние пары явно. Незаданные поля сохраняются.
<!-- /mode -->

<!-- mode: exact regex mixed -->
## Выход и повторное выполнение

`parameters.output_mode:"replace"` заменяет исходное поле результатом;
`"add"` сохраняет исходное и добавляет `<имя>_Replace` нового типа.
`<имя>_Replaced` — boolean. Сохраняй требуемый порядок через output mappings,
`autosync:false`, полные `fields` с configured_field источниками.
Существующий узел: `parameters:{}`, `inputs:[]`, `mappings:[]` и прежний mode
повторно выполняют сохранённые правила без перенастройки. При patch передавай
полное правило изменяемого поля; незаданные поля и output_mode сохраняются.
<!-- /mode -->
