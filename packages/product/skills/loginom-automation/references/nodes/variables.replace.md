# variables.replace

<!-- mode: exact -->
Замена значений переменных по точным парам: `dock_node_apply`, target.type
`variables.replace`, mode `exact`. Сначала `dock_action_describe({node_types:["variables.replace"]})`.
Один variables input 0, variables output 0; inputs=[], mappings=[],
read={ports:[],variable_ports:[0]}, finish="execute". Не используй таблицу как вход.

parameters.rules:[{variable:{kind:"input_variable",name:"Count"},type:"integer",
pairs:[{from:2,to:5}],other:"keep",precision:0}]. Имя — техническое из входного
набора, не метка. Тип integer/real/string/boolean одинаков для входа и замены.
Строкам case_sensitive:true, числам precision:0; неуместные опции опускай.
NULL — JSON null, отличается от пустой строки, false и 0. Ключи уникальны.
Каждое исходное значение заменяется один раз; без совпадения сохраняется.

Меняется полная таблица пар каждой перечисленной переменной. Остальные правила,
имена, метки, типы и порядок сохраняются. Native добавляет суффикс «Замена» к
меткам: handler восстанавливает исходные метки. Не меняй связи ради результата.
Done сохраняет настройки, Execute вычисляет без обучения. Читай полный typed-выход 0;
preview не доказывает точность real или отличие NULL от пустой строки. Затем Save.
Для Execute после изменения источника: тот же ref, parameters={}, inputs=[],
mappings=[], без нового variable_inputs. Для изменения — только нужные rules.

Калькулятор служит источником простых типов через name,label,type,formula; строки —
литералы, NULL — формула NULL. Дай источнику устойчивую target.label. Если отменённый
черновик оставил пустой Expr1, настрой его existing и добавь остальные new.
Перед подключением проверь полный состав, метки и порядок. Адресуй узлы по ref/GUID.
Exact не поддерживает regex, нечувствительность к регистру, ненулевой допуск,
смену типа, datetime/Variant replacement, файлы правил и unmatched кроме keep.
При native-отказе читай ошибку; не выбирай «Всё равно далее».
<!-- /mode -->

<!-- mode: rules -->
Для regex, сравнения без учёта регистра, числового допуска и остальных в NULL
выбирай `variables.replace`, mode `rules`; не заменяй этот узел Калькулятором или JS.
Параметры узла — в `dock_action_describe`. Один variables input 0; inputs=[], mappings=[], read={ports:[],variable_ports:[0]},
finish="execute". parameters.rules адресует точные технические имена.
Типы integer/real/string/boolean сохраняются. Строкам обязательно case_sensitive,
числам конечная неотрицательная precision. case_sensitive:false игнорирует регистр
(проверен ASCII). precision — допуск поиска, не округление: 1.25 по ключу 1.2
при precision:0.1 становится 2.5; другие границы допуска не проверены.

Точные пары: type:"string", pairs:[{from:"red",to:"blue"}], case_sensitive:false,
other:"keep". Regex: type:"string", pairs:[], regex_pairs:[{pattern:"^Ab-[0-9]+$",
replacement:"matched"}], case_sensitive:true, other:"keep". Это native regex и
постоянная строка замены. Не смешивай exact и regex для одной переменной и не
используй захваты. Остальные в NULL: pairs:[], other:"null" с опцией сравнения
по типу. NULL отличается от пустой строки. Неперечисленные правила и переменные,
включая datetime, сохраняют метки и типы. Первичный порядок точный; после
Save/reopen допустим штатный порядок при autosync.
Смена типа, Variant replacement, datetime-пары, файлы правил и other=value/regex
не поддерживаются.

Источники — существующие пути. variables.user/values поддерживает дату целой секунды; новые метки равны именам.
После values сделай Save и dock_node_read с новым operation_id и variable_ports:[4].
Перед подключением проверь весь источник и его метаданные. Done сохраняет настройки,
Execute вычисляет; после чтения полного typed-выхода 0 сохрани пакет отдельно.
Для повторного Execute сохранённого узла: тот же ref, mode rules, parameters={},
inputs=[], mappings=[], без нового variable_inputs. При patch передавай только
изменяемые rules целиком, остальные сохраняются.
<!-- /mode -->
