# Сглаживание (`preprocessing.smoothing`)

## Ходрик–Прескотт

`mode:"hodrick_prescott"`, `parameters.smoothing:[{field:"X",lambda:1}]`.
Для каждого continuous integer/real поля — ровно lambda (0.0625…102659800000000)
или связанный period (2…20000). Исходные значения сохраняются, добавляется real
X_S. Исходный порядок строк задаёт последовательность ряда.
Пропуск smoothing на existing сохраняет правила, [] выключает обработку.
NULL наблюдения имеют нулевой вес HP; all-null может дать нативную ошибку.

## Вейвлеты

`mode:"wavelet"`, правило содержит field, family, depth и boundary.
family: daubechies с order 1…10, coiflet с order 1…5, cdf_9_7 без order.
Глубина 1…10; пригодность для длины ряда проверяется отдельно.
boundary: symmetric, antisymmetric, zero, constant, periodic,
symmetric_without_endpoint, antisymmetric_without_endpoint.
Например, `{field:"X",family:"daubechies",order:1,depth:1,boundary:"symmetric"}`.
У CDF не передавай фиктивный порядок. Не заменяй сглаживание Калькулятором
или JavaScript. Численный нулевой ряд проверяет только нулевой результат,
а не правильность фильтра или выбора способа продолжения границ.

Для обоих методов — `finish:"execute"`, `read.ports:[0]`, без обучения.
Выход сохраняет число/порядок строк, исходные поля и добавляет real-поля _S.
Явный порядок полей задавай существующим output mapping с autosync=false,
перечислив все поля. После смены файла выполняй тот же узел.
Интерполяция NULL в вейвлетах пока не подтверждена: не обещай конечный результат
и не изменяй источник ради обхода. Пакет сохраняй отдельным действием.
