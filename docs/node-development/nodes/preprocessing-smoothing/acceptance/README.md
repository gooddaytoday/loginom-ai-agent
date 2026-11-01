# Приёмочное предложение этапа 1

Критерии утверждает владелец до реализации. Это не PASS обработчика.
Модель получает только task.md и data/series.csv, data/update.csv.
Oracle, expected и fixtures/manifest.json модели не передавать.

## Независимый oracle

oracle.py использует только Python >=3.9 и stdlib. Точные рациональные нормальные
уравнения минимизируют сумму квадратов ошибок по известным точкам плюс Lambda
на сумму квадратов вторых разностей тренда. Пропуски имеют нулевой вес ошибки;
исходные NULL сохраняются. Для N≥2 при менее двух известных значениях решение неединственно:
all-null не выдаётся за численный PASS и обсуждается отдельно по живому наблюдению.
Ни Loginom, ни будущий обработчик, ни actual CSV в расчёт oracle не входят.

```sh
python3 docs/node-development/nodes/preprocessing-smoothing/acceptance/oracle.py
python3 docs/node-development/nodes/preprocessing-smoothing/acceptance/oracle.py --case series
python3 docs/node-development/nodes/preprocessing-smoothing/acceptance/oracle.py --case null
```

expected.json — финальный update.csv, 8 строк/6 полей, output_port=0,
ordered=true, column_order=exact. Порядок закреплён в пользовательском задании:
RowID,X,R,Tag,X_S,R_S; естественная схема Loginom зависит от истории выходного
сопоставления (см. discovery). Для явного порядка используется имеющийся контракт
mappings (autosync=false), отдельная общая схема не требуется. У X_S/R_S тип real независимо от
целочисленного X. Типы и значения исходных полей, NULL, RowID и строки точны;
для вычисленных real abs=1e-8, rel=1e-10. Незаданные метки — label_any=true.

expected-series/null/edge-null/linear/constant/empty.json — адресные предложения;
совпадение файла с oracle не означает, что соответствующий UI-сценарий выполнен.
Матрица живых наблюдений находится в discovery.md. Lambda=1, период=6 — связанные
варианты одной настройки. Минимальная сила=0.0625, period=2; крайние настройки
не заменяют основной численный сценарий. Вейвлеты не входят в этап 1.

## Запуск после утверждения критериев и реализации

Существующий run-check принимает узловой сценарий через --cases. Никакой новой
оснастки этап 0 не добавляет. Из корня checkout, опубликованный чистый SHA:

```sh
result=$(python3 scripts/node-acceptance/run-check.py start --head <SHA> --cases "$PWD/docs/node-development/nodes/preprocessing-smoothing" --scenarios acceptance --pair "$PAIR" --cold) && python3 scripts/node-acceptance/run-check.py wait "$result" --timeout 4500
```

Один foreground-вызов start+wait; модель openai/gpt-6.1-sol, medium, 1800 с.
Пара задаётся карточкой. Приёмка: cold PASS и минимум 2/3 PASS на одном SHA
для исполнителя и отдельные 2/3 на том же SHA у независимой проверки.
CLI и модельные прогоны на этапе 0 не запускались.
