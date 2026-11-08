# Новые режимы: предложение LAB-1103, ещё не приёмка

08.11.2026: продолжение native discovery описано в [LAB-1103](../modes-lab1103.md).
Текст LAB-1018 ниже — история исходных гипотез, не текущие наблюдения.
Mean/limit expected пересчитаны после их опровержения; quality скрыт в UI,
apply новым входом пересчитывает статистику, поэтому оба режима исключены
из предлагаемого этапа 1 до решения владельца.

| Новый различитель | Task / expected | Независимая команда |
|---|---|---|
| Строгие IQR-границы, Q1=3/Q3=7 | task-quartile-boundaries.md / expected-quartile-boundaries.json | `python3 -B oracle.py --case quartile-boundaries --quartile-convention upper_rank` |
| Среднее нормальной выборки | task-replacement-discriminator.md / expected-replacement-mean.json | `python3 -B oracle-policies.py mean --fixture replacement-discriminator.csv` |
| Медиана всей non-NULL выборки | task-replacement-median.md / expected-replacement-median.json | `python3 -B oracle-policies.py median --fixture replacement-discriminator.csv` |
| Гистограммная мода всей non-NULL выборки | task-replacement-most-probable.md / expected-replacement-most-probable.json | `python3 -B oracle-policies.py most_probable --fixture replacement-discriminator.csv` |
| SD 1/2 clip по нормальной выборке | task-replacement-limit.md / expected-replacement-limit.json | `python3 -B oracle-policies.py limit --fixture replacement-discriminator.csv` |

`oracle-policies.py` классифицирует исходную non-NULL выборку, затем считает
mean по нормальным значениям, median и most_probable по всем non-NULL. Limit —
2+sqrt(4/3) для первого набора SD 1/2; на втором точная Table дала
19/7+sqrt(150/49). Обобщение произвольного clipping пока не установлено.
Новые expected до утверждения
не регистрируются в run-check. Модели oracle не передаётся.

## История LAB-1018 (состояние до продолжения)

Живое исследование этого узла не началось: два разрыва связи остановили
сессию при исследовании Разгруппировки. Наблюдения старого detect в соседнем
README не подтверждают новые режимы на текущем SHA. Все новые expected ниже
— **математические гипотезы**, не принятая спецификация Loginom.

| Срез | Task | Expected | Статус |
|---|---|---|---|
| Удаление | task-delete.md | expected-delete.json | Native не проверен |
| Среднее | task-mean.md | expected-mean.json | Включение выбросов в среднее не установлено |
| Медиана | task-median.md | expected-median.json | Конвенция медианы не установлена |
| Наиболее вероятное | task-most-probable.md | expected-most-probable.json | Гистограммная гипотеза, не native доказательство |
| Константа | task-constant.md | expected-constant.json | -7; влияние на боковые выходы не установлено |
| Ограничение | task-limit.md | expected-limit.json | Гипотеза границ 1σ/2σ; нужно native подтверждение |
| Apply | task-apply.md | expected-apply.json | Параметры fit из policies.csv; Train запрещён после смены входа |
| Quality | task-quality.md | отсутствует | Схема и смысл выходов ещё не исследованы |

Источники — `../fixtures/policies.csv` (8 строк) и `policies-apply.csv`
(4 строки). X импортировать как real/continuous явно. Остальные поля неизменны.
NULL `?` сохраняется. Среднее обучающей выборки 32/7, population variance
2000/49. При строгих границах 1σ/2σ в training только RowID=7 — экстремум;
на apply RowID=2 — выброс, RowID=3 — экстремум. При переобучении apply-порты
будут другими: различитель проверяет смысл сохранённой модели.

`oracle-policies.py` использует только CSV и Python stdlib. Предполагает:
среднее со всеми ненулевыми значениями training, верхнюю медиану, центр
модального интервала Sturges, исходные значения на боковых выходах. Это
явно проверяемые **кандидаты**, их надо подтвердить или отвергнуть до
утверждения критериев и до первого модельного прогона. Expected не подгонять
под FAIL обработчика. Шесть старых квартильных гипотез и различитель
`../fixtures/quartile-conventions.csv` сохранены без изменений; квартильная
конвенция не определена этим checkpoint.

Воспроизведение: `python3 -B oracle-policies.py <policy>`, где policy —
`delete|mean|median|most_probable|constant|limit`; apply:
`python3 -B oracle-policies.py constant --apply`. Сравнить JSON с
соответствующим expected семантически, не по форматированию.
Модели передавать только task и соответствующие CSV. Эти файлы не
регистрируются в run-check до завершения discovery и решения владельца.

После подтверждения native семантики предлагается прежний стандарт:
полные типизированные три выхода, точные ID/NULL/порядок, для вычисленных
real abs/rel 1e-10, для констант/неизменённых значений точное сравнение;
непредписанные метки — label_any. Save, CSV, cold без перенастройки, cleanup,
2/3 исполнителя и 2/3 независимой проверки одного SHA. Нового verifier нет.
