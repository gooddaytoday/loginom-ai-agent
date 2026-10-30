Входы предложения LAB-533: UTF-8 без BOM, LF, заголовок, разделитель `,`,
десятичная точка, кавычка `"`, NULL-маркер `?`.

| Файл | Явная схема | Назначение |
|---|---|---|
| rows.csv | RowID integer, Class string, Value integer | 20 строк; основной живой результат подтверждён |
| update.csv | та же | RowID+100, Value+1000; обновление тех же узлов; NOT_RUN |
| null.csv | RowID integer, Class string, Value real, Flag boolean, Stamp datetime | 3 строки; пустая строка, NULL, false, real и даты; NOT_CHECKED |
| empty.csv | те же5 полей, что null.csv | заголовок без данных; сохранение явных типов; NOT_CHECKED |

Основной task получает только data/rows.csv. Дополнительные expected
воспроизводит oracle.py --case CASE; они не доказывают поведение продукта.
Oracle/expected не передавать модели.
