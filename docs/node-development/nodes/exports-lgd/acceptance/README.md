# Экспорт и круг LGD

Общий [приёмочный контракт](../../imports-lgd/acceptance/README.md),
[oracle](../../imports-lgd/acceptance/oracle.py) и
[discovery](../../imports-lgd/discovery.md) покрывают оба направления.
`expected.json` — предложение; `file.output_port=null`, табличный результат
отдельно в `roundtrip.output_port=0`. Поля экспортируемого файла и обратного
импорта сравниваются с CSV/schema, не только между собой.

До утверждения общих изменений и независимого LGD reader запуск через stock
run-check запрещён: существующий XLSX oracle не проверяет бинарный LGD.
Вход typed.csv: 5 строк × 5 полей. Имена и порядок Id, Text, Amount, Occurred,
Active; метки Номер, Текст, Сумма, Момент, Активен. Integer и datetime имеют
discrete kind, real — continuous. Это позволяет заметить замену вида умолчанием.
