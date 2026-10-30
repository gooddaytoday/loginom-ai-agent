Подготовленные адресные входы, ещё не принятые живым исследованием.
UTF-8, запятая, десятичная точка, первая строка — заголовки, NULL-маркер `?`.
Порядок строк сохранять как записан; сортировку автоматически не добавлять.

| Файл | Строк | Предлагаемые типы и назначение |
|---|---:|---|
| series.csv | 5 | RowID:integer, X:integer; края окна 1/1 |
| null-inside.csv | 5 | Те же типы, X=NULL в строке 3; настоящее пропущенное значение |
| two-windows.csv | 5 | RowID,X,Y:integer; разные окна полей |
| short.csv | 1 | RowID,X:integer; окно длиннее ряда |
| empty.csv | 0 | Только заголовки RowID,X |
| replace.csv | 5 | RowID,X:integer; те же поля, новые значения |
| help-example.csv | 6 | Month:string, Sales:integer; исторический пример подплана |
| types.csv | 5 | RowID,I:integer, R:real, S:string, B:boolean, D:datetime |

Формат datetime `yyyy-mm-dd hh:mm:ss`; Boolean `true`/`false`.
Разбор этих типов импортом ещё не подтверждён. Manifest с происхождением,
квитанции и сырые доказательства в комплект не входят.
