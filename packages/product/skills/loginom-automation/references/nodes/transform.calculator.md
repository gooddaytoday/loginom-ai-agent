# Калькулятор (`transform.calculator`)

Калькулятор проверяет формулы через «Предпросмотр» до завершения настройки.
При `WIZARD_CALCULATOR_VALIDATION_FAILED` используй текст Loginom и имена
вычисляемых полей из отказа: исправь формулу и выполни `next_step` с новым
operation_id на том же узле. После подтверждённой отмены черновика не вызывай
`node_wait` и не жди отключения узла; сохрани существующие связи.

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
