# Таблица в переменные

<!-- mode: aggregate -->
Для агрегатов текущей таблицы в переменные (сумма, количество, минимум,
максимум, среднее, медиана, мода, отклонение, число уникальных и пропусков,
первое, последнее, единственное значение, список) используй `dock_node_apply`
с `type:"variables.from_table"`, `mode:"aggregate"`. Узел получает таблицу
через `inputs:[{source:NodeRef,output:0,input:0}]` и создаёт исходный порт
переменных 0. Табличного выхода и обучения нет.

Полная настройка выбранных полей:
`parameters:{fields:[{field:{kind:"input_field",name:"N"},aggregations:["median","mode","standard_deviation","unique_count","null_count","first","last","only","concat"]}]}`.
Бери точное техническое имя из прочитанной схемы входа. Порядок `fields`
задаёт порядок блоков результата: перечисляй поля в требуемом порядке.
Внутри поля native-порядок функций:
sum,count,min,max,avg,median,mode,standard_deviation,unique_count,null_count,first,last,only,concat.
При изменении настройки указывай весь набор выбранных полей и функций.

| Тип входа | Допустимые функции |
|---|---|
| integer/real | все 14 |
| string | count,min,max,mode,unique_count,null_count,first,last,only,concat |
| boolean/datetime | count,min,max,mode,unique_count,null_count,first,last,only |

Variant в этом узле не поддерживается: не выбирай такое поле.
Count считает все строки, включая NULL; unique_count — разные непустые
значения; null_count — пропуски. Пустая строка — значение, false — не NULL.
Sum, avg, median и standard_deviation (выборочное) имеют тип real; count,
unique_count, null_count — integer; min, max, mode, first, last, only
сохраняют тип входа. Only даёт значение, если различное непустое значение
одно, иначе типизированный NULL. Concat — string: запятая, без обрамления,
уникальные значения в порядке появления, NULL пропускается, пустая строка
сохраняется; другие настройки списка не поддерживаются. Например,
b,a,a,NULL,пустая строка → `b,a,`. На пустой таблице count равен нулю,
остальные значения NULL.

Одна функция сохраняет имя поля (метка `<поле>|<функция>`), несколько
получают native-суффиксы, например X_Sum, N_Median, N_Std, S_Uniq, S_Concat.
Читай действительные имена и метки из результата; не назначай суффиксы сам.

Для полного набора переменных передавай `read:{ports:[],variable_ports:[0]}`.
Проверяй полный упорядоченный набор, имена, метки, типы и точные значения
в `output.variable_ports`; даты показывай с миллисекундами без часового
пояса. Для нового чтения успешной операции используй `dock_node_read` с её
`source_operation_id`: этот путь повторно выполняет исходный узел. После смены
CSV сохраняй прежний узел и набор агрегатов: существующий `target`,
`parameters:{}`, `inputs:[]`, `mappings:[]`, `finish:"execute"`, затем прочитай
переменные. Сохрани пакет штатным действием `package.save_as` или
`package.save_checkpoint`.

Калькулятор таблицы вычисляет поля строк, JavaScript задаёт код; запрос
агрегированных переменных, в том числе по строкам, датам и логическим
полям, направляй в `variables.from_table`, а не в Калькулятор или JavaScript.
<!-- /mode -->
