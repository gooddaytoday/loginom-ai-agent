# Таблица в переменные

<!-- mode: aggregate -->
Используй `dock_node_apply`, `type:"variables.from_table"`, `mode:"aggregate"`
для агрегирования текущей таблицы в переменные. Один табличный вход 0:
`inputs:[{source:NodeRef,output:0,input:0}]`. Выход — исходные переменные 0;
табличного выхода и обучения нет.

Задавай полный набор выбранных полей и функций, например:
`parameters:{fields:[{field:{kind:"input_field",name:"N"},aggregations:["median","mode","standard_deviation","unique_count","null_count","first","last","only","concat"]}]}`.
Бери имена из текущей схемы. Порядок fields задаёт порядок блоков результата.
Внутри поля функции идут в native-порядке:
sum,count,min,max,avg,median,mode,standard_deviation,unique_count,null_count,first,last,only,concat.
Максимум 16 выбранных полей и 128 выходных переменных.

| Тип входа | Допустимые функции |
|---|---|
| integer/real | Все 14 |
| string | count,min,max,mode,unique_count,null_count,first,last,only,concat |
| boolean/datetime | count,min,max,mode,unique_count,null_count,first,last,only |

Count включает строки с NULL. Unique_count считает разные значения без NULL,
null_count — пропуски. Пустая строка — значение, false не равен NULL.
Sum/avg/median/standard_deviation возвращают real; отклонение выборочное.
Count/unique_count/null_count — integer; min/max/mode/first/last/only сохраняют
тип входа. Only даёт значение при одном различном непустом значении,
иначе типизированный NULL.

Concat возвращает string; в этом срезе только запятая, без обрамления,
уникальные значения в порядке появления, без сортировки. NULL исключается,
пустая строка сохраняется. Например b,a,a,NULL,пустая строка → `b,a,`.
Настройки списка за пределами этого среза не поддерживаются.
На числовом N=2,4,4,NULL,8 медиана 4, мода 4, выборочное отклонение
2.516611478423583, unique_count 3, null_count 1.
Общее разрешение ничьих моды, NULL на границах first/last и новые функции
на empty/all-NULL входе требуют отдельного подтверждения; не обещай результат.

Одна функция сохраняет имя поля, несколько получают native-суффиксы.
Читай действительные имена и метки; не конструируй их вместо чтения.
Для полного результата `read:{ports:[],variable_ports:[0]}`; проверь порядок,
имена, метки, типы и все значения. Variant в переменных требует отдельного
допуска точного чтения; не заменяй его строкой или догадкой о subtype.

Для повторного выполнения прежнего узла без смены функций: существующий
target, `parameters:{}`, `inputs:[]`, `mappings:[]`, `finish:"execute"`.
После изменения входных данных снова выполни тот же узел и прочитай весь
набор. Сохрани пакет через `package.save_checkpoint` или `package.save_as`.
