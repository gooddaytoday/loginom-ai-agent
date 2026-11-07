# Калькулятор (`transform.calculator`)

<!-- mode: expression -->
Для формул с переменными сценария используй `dock_node_apply` с
`target.type:"transform.calculator"`, `mode:"expression"`.
В `parameters.expressions[].formula` пиши `Var.Amount`; табличное поле
`Amount` сохраняет своё имя. Подключи таблицу через `inputs` (input 0),
а пользовательский выход 4 узла `variables.user` — через
`variable_inputs:[{source:ref,output:4,input:0,kind:"variables"}]`.
Переменную сначала задай на существующем `variables.user`, mode `values`,
по правилам [переменных](variables.user.md).
Для проверяемого входа добавь отдельный mapping
`{direction:"input",kind:"variables",port:0,autosync:false,fields:[{source:{kind:"configured_field",name:"Amount"}}]}`.
Табличные mapping остаются без kind; для точного порядка результата
задай полный output mapping port 0 с autosync:false.
После изменения только значения источника выполни тот же Калькулятор:
`target.kind:"existing"`, его ref, `parameters:{expressions:[]}`,
`inputs:[]`, `variable_inputs:[]`, `mappings:[]`, `finish:"execute"`,
`read.ports:[0]`. Это сохраняет формулы, поля и связи. Прочитай новый
результат полностью; старый read не подтверждает пересчёт.
Не подставляй значение переменной в формулу. Ошибку отсутствующего Var
читай как исходный отказ Loginom.

Калькулятор проверяет формулы через «Предпросмотр» до завершения настройки.
При `WIZARD_CALCULATOR_VALIDATION_FAILED` используй текст Loginom и имена
вычисляемых полей из отказа: исправь формулу и выполни `next_step` с новым
operation_id на том же узле. После подтверждённой отмены черновика не вызывай
`node_wait` и не жди отключения узла; сохрани существующие связи.

В строковом литерале Loginom записывай кавычку удвоением `""`, например `RegExMatchedSubExp("""id"":([0-9]+)", Values, 1)`; обратный слэш кавычку не экранирует.

Накопительные суммы, доли и ранги в пределах одной таблицы вычисляй функциями
Калькулятора, предварительно задав нужный порядок строк Сортировкой; слияние
таблицы с самой собой для этого не нужно.
[CumulativeSum("ИмяПоля")](https://help.loginom.ru/userguide/processors/func/calc-func/mathematical.html#cumulativesum)
считает накопительную сумму; доля от итога таблицы —
`CumulativeSum("Revenue") / Stat("Revenue", "Sum")` при ненулевом итоге.
[Stat("ИмяПоля", "Тип")](https://help.loginom.ru/userguide/processors/func/calc-func/statistical.html#stat)
работает по входным полям: если показатель вычислен здесь же, передай его
в следующий Калькулятор. Для ранга по позиции используй
[RowNum()](https://help.loginom.ru/userguide/processors/func/calc-func/other.html#rownum);
начало нумерации и правила для равных значений сверяй с заданием и Help.

## Продолжение пакета

В продолжении после открытия пакета сохранение не доказывает активность выхода.
Перед новым `transform.calculator` подтверди нужный выход того же существующего табличного
источника. Используй `loginom_dock_node_read` с успешной локальной операцией
текущей подготовки; если её нет — existing apply с точным ref, прежним типом/mode,
`inputs:[]`, пустым patch по схеме и `finish=execute`. Дождись подтверждённого
выполнения/чтения источника; примеры пустого patch — [Граф и узлы](../canvas.md#продолжение-пакета).
Отказ `calculator preflight requires an active source output` с `NOT_APPLIED`,
`effect_possible=false`, `cleanup_complete=true` означает, что новый узел ещё не
создан: после выполнения источника повтори запрос с новым operation_id, не
пересоздавая источник и не освобождая несуществующий целевой узел. Это не разрешает
повтор неизвестного запуска или автоматический запуск REST/JS/экспорта вне просьбы.
<!-- /mode -->
