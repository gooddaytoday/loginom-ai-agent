# Приёмочный комплект — предложение

Этап 0 LAB-840; критерии утверждаются до этапа 1. Это данные для будущего
run-check/W1, не новый механизм верификации и не зарегистрированный сценарий.

Модель получает только [task.md](task.md), [variables.json](../fixtures/variables.json)
и [rules.json](../fixtures/rules.json). При запуске подставляется уникальный
`{{PACKAGE_PATH}}` в собственном каталоге назначенной роли. Входные типы
и NULL заданы JSON явно; таблица CSV вместо variables-порта недопустима.
`initial` — таблицы пар, `update` — полная новая таблица только Count,
`source_update` — новое значение только исходного Color.

[oracle.py](oracle.py) и [expected.json](expected.json) остаются вне контекста
модели. Из корня checkout:

```sh
python3 docs/node-development/nodes/variables-replace/acceptance/oracle.py > /tmp/variables-replace-expected.json
diff -u docs/node-development/nodes/variables-replace/acceptance/expected.json /tmp/variables-replace-expected.json
```

Oracle stdlib Python использует типизированные ключи, Decimal и одно
обращение к словарю для исходного значения. Он не читает Loginom, DOM,
результаты выполнения, runtime и сохранённый `.lgp`.

Три ожидаемых состояния по 10 переменных; в initial Count=5, Color=blue;
в updated Count=8; в source_updated Color=green. Во всех состояниях
Amount=2.5, Case="Red", Enabled=false, Missing="missing", Empty="blank",
Zero=NULL, Untouched=7, NullInt=NULL. Типы и порядок заданы полным массивом.

Формат `port_kind:variables`, `output_port:0`, `ordered:true` — предложение
для W1. До run-check адаптировать его к принятому W1 без удаления проверки
типа/порядка/NULL. Real tolerance abs=rel=1e-12; поиск числовых пар precision=0.
Save после последнего расчёта и чтения; fresh cold повторяет выполнение
сохранённого пакета и сверяет source_updated с порта 0. Результаты модели
и cold в этой карточке не запускались: runtime handler ещё отсутствует.

Матрица: три положительных состояния, один исходный порт → variables input,
10 выходных значений, 4 типа; отдельные отказы дубликата ключа, неверного
типа пары, неизвестного имени и неподдержанных режимов. Прямой native-прогон
из discovery подтверждает UI-семантику, но не заменяет 2/3 модельных PASS
и независимую приёмку одного SHA.
