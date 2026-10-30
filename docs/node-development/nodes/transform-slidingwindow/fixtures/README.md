# Адресные входы

UTF-8, запятая, десятичная точка, первая строка — заголовки, NULL-маркер ?.
Порядок строк сохранять; автоматическую сортировку не добавлять.

| Файл | Строк | Типы / назначение |
|---|---:|---|
| series.csv | 5 | RowID,X:integer; X=10,20,30,40,50 |
| null-inside.csv | 5 | Те же типы, X=NULL в строке 3 |
| two-windows.csv | 5 | RowID,X,Y:integer; разные окна |
| short.csv | 1 | RowID,X:integer; окно длиннее ряда |
| empty.csv | 0 | Только заголовки RowID,X |
| replace.csv | 5 | RowID,X:integer; новые значения |
| help-example.csv | 6 | Month:string, Sales:integer; исторический пример подплана |
| types.csv | 5 | RowID,I:integer, R:real, S:string, B:boolean, D:datetime |
| types-null.csv | 5 | Та же схема, настоящий I=NULL в строке 3 |
| types-order.csv | 5 | Те же записи в порядке RowID 3,1,5,2,4 |
| types-short.csv | 1 | Первая запись types.csv |
| types-empty.csv | 0 | Заголовки types.csv; схема сохраняется |

Для types-CSV в импорте подтверждены yyyy/mm/dd и разделитель даты «-»,
decimal_separator «.», заголовки. Boolean true/false, datetime yyyy-mm-dd hh:mm:ss.
Адресные окна I=2/1, R,S,B,D=1/0; RowID=0/0.
types-one-lag-* в oracle используют types.csv и только I=1/0.
Типы смещённых полей сохранены; справочник native DataType — в discovery.md.

Основной модельный вход отдельно: ../acceptance/data/sales.csv.
Fixture-CSV не добавлять в его data/: run-check передаёт модели все файлы этого каталога.
Квитанций, сырых пакетов, журналов и доказательств происхождения в комплекте нет.
