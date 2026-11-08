# Предложение режимов v0.4.0, LAB-1022

Статус: **не утверждено**. Это численная основа и задания этапа 0;
stock run-check ещё не зарегистрирован и PASS этих режимов не заявляется.
Модели передаются только соответствующий task и CSV, не oracle/expected.

Checkpoint после двух восстановлений соединения (см. новый раздел plan.md).
Новые series/null fixtures рассчитаны независимо; native сравнение выполнено
на factor matrix/null с Integer continuous. Точные Real-типы новых fixtures,
переключение time→frequency, CSV/cold и модельная приёмка ещё не проверены.

| Задание | Вход | Численная основа |
|---|---|---|
| task-frequency.md | fixtures/series.csv | time → frequency одного узла; сравнение прямых сумм и zero-padded DFT |
| task-pacf.md | fixtures/series.csv | X, четыре отсчёта; partial correlation остатков регрессии |
| task-multiple.md | fixtures/series.csv | X и Y различаются; все блоки, без скрытой сортировки |
| task-null.md | fixtures/null.csv | NULL только в X; никакой импутации или удаления строк |

UTF-8, запятая, точка, заголовок; RowID Integer, X/Y Real continuous;
NULL `?`; служебные Z Integer / Tag String не выбирать. Все CSV имеют
одинаковую схему для обновления того же импорта. `lag_count=4` означает 0…3.
Числа обеих серий, ошибки и значимость
обычной АКФ получены независимым исходным oracle; DFT написана прямыми
суммами с zero padding до 2N, без FFT или runtime/Loginom. PACF — Pearson
остатков двух OLS-регрессий концов окна на константу и промежуточные лаги;
на каждом lag k используются N−k строк. Нормальные уравнения решаются
точными Fraction; проверяются ортогональность остатков и affine-инвариантность.
Спектральная и прямая АКФ совпадают до 1e-12.

`python3 -B …/acceptance/modes/oracle.py --write` создаёт expected;
`--check` сверяет числа и независимые тождества. На живом matrix.csv обеих
серий наблюдены lag0=1, точные OLS partial correlations на lag1…3 и совпадение
frequency ACF с прямыми суммами. Первоначальный кандидат Yule-Walker
отвергнут: он давал для X на lag1 .65 вместо native .8796296296296295.
Один порт: Lag integer, блоки <field>_ACF real, _StdErr real,
_Significant boolean для всех серий в порядке входа, затем <field>_PACF real.
Для ЧАКФ нет отдельных StdErr/Significant. Полные typed предложения в cases.
Frequency+PACF с пропуском выбранной Y отказал: «Данные содержат пустые значения».
Предлагается negative NULL-case с понятным отказом, без нового результата.
Спектральное padding при другой длине ещё требует наблюдения.

Предлагаются полные таблицы обеих серий, точные типы и порядок,
abs=1e-8/rel=1e-10, label_any без заданных пользователем меток,
CSV/Save/cold/cleanup, ≥2/3 + независимые 2/3 на одном SHA.
Два независимых oracle не заменяют cold выполнения сохранённого пакета.
Новый matcher, снятие требований NULL или ослабление порядка не предлагаются.
