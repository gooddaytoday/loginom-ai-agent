# Калькулятор (`transform.calculator`)

Для формул с переменными сценария используй `dock_node_apply` с
`target.type:"transform.calculator"`, `mode:"expression"`.
В `parameters.expressions[].formula` пиши `Var.Amount`; табличное поле
`Amount` сохраняет своё имя. Таблицу подключи через `inputs` (input 0),
выход 4 узла `variables.user` — через
`variable_inputs:[{source:ref,output:4,input:0,kind:"variables"}]`.
Переменную сначала задай на существующем `variables.user`, mode `values`,
по правилам [переменных](variables.user.md).
Для проверяемого входа добавь mapping
`{direction:"input",kind:"variables",port:0,autosync:false,fields:[{source:{kind:"configured_field",name:"Amount"}}]}`.
Табличные mapping без kind; для точного порядка результата задай полный
output mapping port 0 с autosync:false.
После изменения только значения источника выполни тот же Калькулятор:
`target.kind:"existing"`, его ref, `parameters:{expressions:[]}`, `inputs:[]`,
`variable_inputs:[]`, `mappings:[]`, `finish:"execute"`, `read.ports:[0]`;
формулы, поля и связи сохраняются. Прочитай результат полностью: старый read
пересчёт не подтверждает. Не подставляй значение переменной в формулу;
ошибку отсутствующего Var читай как отказ Loginom.

Формулы проверяет «Предпросмотр» до завершения настройки. При
`WIZARD_CALCULATOR_VALIDATION_FAILED` возьми текст Loginom и имена полей из отказа:
исправь формулу и выполни `next_step` с новым operation_id на том же узле. После
подтверждённой отмены черновика не вызывай `node_wait`; сохрани связи.

В строковом литерале Loginom кавычку удваивай `""`, например `RegExMatchedSubExp("""id"":([0-9]+)", Values, 1)`; обратный слэш её не экранирует.

Накопительные суммы, доли и ранги в одной таблице считай функциями Калькулятора
после Сортировки нужного порядка; слияние таблицы с собой не нужно.
[CumulativeSum("ИмяПоля")](https://help.loginom.ru/userguide/processors/func/calc-func/mathematical.html#cumulativesum)
считает накопительную сумму; доля от итога таблицы —
`CumulativeSum("Revenue") / Stat("Revenue", "Sum")` при ненулевом итоге.
[Stat("ИмяПоля", "Тип")](https://help.loginom.ru/userguide/processors/func/calc-func/statistical.html#stat)
работает по входным полям: показатель, вычисленный здесь же, передай
в следующий Калькулятор. Для ранга по позиции используй
[RowNum()](https://help.loginom.ru/userguide/processors/func/calc-func/other.html#rownum);
начало нумерации и равные значения сверяй с заданием и Help.

## Промежуточные выражения и кэш

`intermediate:true` — вспомогательное выражение: не выход, в `mappings` не
указывай, дальше — `Expr.Имя`. `cached:true` включает кэш; незаданные флаги
сохраняются. `order` включает все выражения. Кэш выключается так:
`target:{kind:"existing",name:"Helper"},cached:false`, `finish:"execute"`;
выход прочитай заново целиком.

## JavaScript

`parameters.syntax:"javascript"` задаёт язык всего узла (у нового по умолчанию
`expression`, у существующего пропуск сохраняет). Формула — тело с `return`:
`return Quantity * UnitPrice;`. Имя читает входное поле, `this.Expr.Имя` —
выражение узла; `this.Field` не используй. Смена языка не переводит формулы:
задай новую `formula` каждому оставленному выражению. Для JavaScript в
Калькуляторе выбирай этот узел, не `programming.javascript`. Предпросмотр
не заменяет выход: прочитай всю таблицу.

## Продолжение пакета

После открытия пакета сохранение не доказывает активность выхода. Перед новым
`transform.calculator` подтверди выход того же табличного источника:
`loginom_dock_node_read` с успешной локальной операцией текущей подготовки, иначе
existing apply с точным ref, прежним типом/mode, `inputs:[]`, пустым patch и
`finish=execute` ([Граф и узлы](../canvas.md#продолжение-пакета)). Дождись
подтверждённого выполнения источника.
Отказ `calculator preflight requires an active source output` (`NOT_APPLIED`,
`effect_possible=false`): узел не создан; после выполнения источника повтори запрос
с новым operation_id, не пересоздавая источник. Повтор неизвестного запуска и
автозапуск REST/JS/экспорта вне просьбы это не разрешает.
