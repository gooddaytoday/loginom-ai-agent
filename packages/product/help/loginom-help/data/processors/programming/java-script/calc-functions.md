# Импорт функций Калькулятора

В коде JavaScript возможно использование [функций Калькулятора](../../func/calc-func/README.md). Для этого используется встроенный модуль `"builtIn/Calc"`. Доступны все функции, включая реализованные в плагинах, за исключением следующих:

- IF, IFF — имеется аналог в JS: `if (<условие>) {...}`;
- Функций работы со входными данными (`Data`, `RowNum`, `RowCount`, `DisplayName`, `CumulativeSum`) — имеются аналоги в [API](api-description.md) (`RowCount`, `DisplayName`) или легко реализуются кодом JS.

Примеры использования функций:

```javascript
import { OutputTable } from "builtIn/Data";

// Импорт модуля функцией require
const calcModule = require("builtIn/Calc");
OutputTable.Append();
let currentDate = new Date();
OutputTable.Set(0, calcModule.AddWeek(currentDate, 1));
OutputTable.Set(1, calcModule.AddQuarter(currentDate, -1));

// Импорт через значение по умолчанию
import calcDefault from "builtIn/Calc";
OutputTable.Append();
OutputTable.Set(0, calcDefault.Val("1"));
OutputTable.Set(1, calcDefault.Str(1e6));

// Импорт всего содержимого модуля
import * as calc from "builtIn/Calc";
OutputTable.Append();
OutputTable.Set(0, calc.Count("AAA"));
OutputTable.Set(1, calc.Lower("AAA"));

// Импорт конкретных функций
import { RegExMatchCount, RegExMatchedExp } from "builtIn/Calc";
OutputTable.Append();
OutputTable.Set(0, RegExMatchCount("a+?", "aaa"));
OutputTable.Set(1, RegExMatchedExp("a+", "aaa"));

// Динамический импорт
import("builtIn/Calc").then(calc => {
    OutputTable.Append();
    OutputTable.Set(0, calc.Repeat(1, 10));
});
```
