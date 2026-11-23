Построй два нативных круга экспорта в LGD и обратного импорта.

Пустой набор:
1. Импортируй typed.csv строго по schema.json: заголовок, запятая, точка,
   UTF-8, маркер пропуска \N. Сохрани имена, метки, типы, виды, порядок.
2. Штатным Фильтром строк отбери Id > 99, выход 0. Проверь 0 строк и все 5 полей.
3. Экспортируй именно этот пустой выход нативным exports.lgd «WriteEmpty»
   в {{EXPORT_DIRECTORY}}/Empty.lgd: LZ4, checksum сжатых данных, overwrite=reject.
   Скачай LGD. Нулевые строки — ожидаемый успешный результат, не ошибка.
4. Импортируй этот LGD узлом «ReadEmpty», checksum=verify. Проверь 0 строк
   и точную сохранённую схему. Не выдавай исходный CSV за результат импорта LGD.

Variant:
5. Создай и выполни штатный Калькулятор переменных: Count/метка Count,
   integer, значение 7; Text/метка Text, string, значение "native";
   Missing/метка Missing, string, NULL. Сохрани этот порядок и прочитай значения.
6. Узел «Переменные в таблицу», режим rows: Name/Имя string,
   DisplayName/Метка string, Value/Значение Variant, вид Неопределенное.
   Проверь 3 строки: Count/Count/7(integer), Text/Text/native(string),
   Missing/Missing/NULL. Не преобразуй Variant в строку.
7. Экспортируй эту таблицу узлом «WriteVariant» в {{EXPORT_DIRECTORY}}/Variant.lgd
   с LZ4, checksum сжатых данных, overwrite=reject; скачай LGD.
8. Импортируй этот LGD узлом «ReadVariant» с checksum=verify, сохрани Value
   как Variant и точные подтипы integer/string/NULL. Проверь все 3 строки.

Файл из экспорта выбирай через dock_storage_source: повторно не загружай его.
Для обоих результатов нужен реальный LGD-импорт. Отказ импорта сообщай точно,
не заменяй его исходной таблицей или CSV и не объявляй writer неподдерживающим
Variant: штатная запись Variant подтверждена отдельно.
Итоговые CSV: сначала ReadEmpty, затем ReadVariant. Отдельно сохрани пакет
{{PACKAGE_PATH}}. После reopen должны сохраняться оба пути и свойства полей.
