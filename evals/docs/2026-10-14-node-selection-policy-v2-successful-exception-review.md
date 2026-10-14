# Политика v2: отдельное ревью успешного JS-исключения

Execution-r5 фиксируется до следующей модели после explicit-js/2.
Критерии v2 `5b5053d1…`, матрица31, model/inputs/runtime не меняются.
Пользователь прямо разрешил минимальные изменения runner с сохранением
исходных файлов и обязательного ревью всех JS-исключений.

## Наблюдаемая необходимость и решение

Explicit-js/2 finished18:01:32.840Z: policy/oracle/calculationPASS, JS1,
CLI0/HostACK0/normalcleanuptrue. Оригинальный wrapper2 отражает pending review,
а не неправильный расчёт. Runner остановился с `MANUAL_REVIEW_REQUIRED`.
После обязательного нового graph review прежний путь потребовал бы обновить
исходный audit.reviewStatus. Это противоречит сохранению исходного вердикта.

Расширяется существующий R3 путь учёта ревью в памяти. Только с opt-in v2,
исходными policy/oracle/calculation PASS и корректным самостоятельным review
runner может учитывать новое reviewStatus=passed. Исходный audit остаётся
pending/not-required на диске. Для JS-исключений обязательны прежние проверки
разрешённой роли JavaScript, Session/package identity и существующих evidence.
Чужое, отрицательное, неполное ревью или несоответствующая JS-роль не допускают
продолжение. Отрицательные аналитические результаты и R4 отказ остаются на
своих прежних путях. Default v1 и все strict-release проверки неизменны.

## Минимальная реализация и проверка

Меняются только `evals/script/run-node-selection-series.ts` и его test-файл.
По TDD через публичный runSeriesSlot проверяются фактическая успешная explicit
проекция, сохранность audit/attempt, v1 refresh, чужой Session/package,
неверная/отсутствующая JS-роль, отрицательное/пустое ревью и originalFAIL.
Существующие R3/R4 regressions сохраняются. После GREEN/typecheck и независимого
ревью фиксируется новый immutable execution-r5 lock; readonly gate использует
этот же закрытый explicit-js/2 без модели, Oracle или runtime rerun.

Предыдущие R4 sources сохранены readonly до изменения. Следующий слот tags/2;
успешный explicit-js/2 не повторяется. Обработчики узлов и runtime не меняются
и не пересобираются. До нового допуска модель не запускается.
