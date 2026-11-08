LAB-1055: **checkpoint / blocked после второго разрыва**, 07.11.2026, mas3.
Живые опыты остановлены по лимиту карточки; критерии ниже остаются предложением.
Непроверенные случаи не считаются отсутствующими в 7.4.2.

Продолжение LAB-1055: шесть ненулевых filter-case ниже численно исследованы на
7.4.2. Это предложения критериев, не PASS обработчика; runtime/skill не менялись.
Haar depth 1/2, утверждённые назначением, повторно не принимаются.

| Новое задание в acceptance/ | Expected здесь | Полный preview-cache, max abs |
|---|---|---:|
| task-db2-symmetric.md | expected-db2-symmetric.json | 3.56e-15 |
| task-db2-depth2.md | expected-db2-depth2.json | 3.56e-15 |
| task-db2-zero.md | expected-db2-zero.json | 1.12e-16 |
| task-coif1-symmetric.md | expected-coif1-symmetric.json | 2.41e-12 |
| task-cdf97-symmetric.md | expected-cdf97-symmetric.json | 1.60e-14 |
| task-cdf97-reflect.md | expected-cdf97-reflect.json | 1.96e-14 |

Вход всех шести — существующий маленький `fixtures/wavelet.csv`, 8 строк
непостоянного ряда. `oracle-filters.py --write --check` воспроизводит JSON с зависимостями
из `requirements-filters.txt` (на mas3 Python 3.14). Oracle получает только CSV и
явные математические параметры. Loginom, runtime и actual-файлы он не читает.
RowID/X/Tag сверяются точно, X_S — прежним Real abs=1e-8/rel=1e-10.
Задания требуют RowID,X,Tag,X_S: естественный UI-порядок RowID,X,X_S,Tag надо
изменить штатным output mapping. Нового verifier или допуска не требуется.

Добеши/Койфлеты — multilevel DWT, все детали нулевые, обратное восстановление.
CDF — независимые четыре lifting-шага и обратные шаги после удаления деталей;
низкочастотные отсчёты на нечётных исходных индексах (от нуля), до преобразования
полное symmetric/reflect продолжение. Это существенная конвенция: обычный
нерасширенный `pywt.wavedec(...,'bior4.4')` расходится с UI до 0.521 и не является
предлагаемым CDF-oracle. Второй filter-bank расчёт с той же явной фазой проверяет
lifting-вариант независимо от Loginom. Длина 8 намеренно затрагивает границы;
предупреждение PyWavelets о boundary effects ожидаемо. Другие длины,
CDF depth>1 и остальные порядки остаются `not_checked`.

Определения: [DWT PyWavelets](https://pywavelets.readthedocs.io/en/latest/ref/dwt-discrete-wavelet-transform.html),
[продолжения](https://pywavelets.readthedocs.io/en/latest/ref/signal-extension-modes.html),
[lifting CDF 9/7, Pascal Getreuer](https://getreuer.info/posts/waveletcdf97/index.html).
Источники задают математику; соответствие фазовой конвенции Loginom — вывод
из наблюдения этого входа, не утверждение о всех параметрах.

**NULL остаётся в карантине.** На wavelet-null.csv/db1/depth1 исходный NULL
сохранён; первые шесть X_S конечны, последние два — NaN в preview-cache.
Конечная линейная интерполяция не наблюдается. Native NULL против nonfinite,
CSV и cold этого случая — `not_checked`; expected-null.json из LAB-1046 нельзя
использовать как критерий PASS или обещать модели интерполяцию.
Нулевой CDF-case остаётся только smoke и не заменяет шесть случаев выше.

Модели передаются только выбранный task и CSV. Oracle, expected, schema и
карточки ей не передаются. Новые run-check до утверждения не зарегистрированы.

Историческое предложение LAB-1046, **checkpoint, этап 0 не завершён**. Runtime/skill не менялись,
новые run-check не зарегистрированы. Это не приёмка обработчика.

| Задание в acceptance/ | Вход из fixtures/ | Expected здесь | Статус |
|---|---|---|---|
| task-wavelet.md | wavelet.csv | expected.json | Независимая Haar-проекция; полный clean-input опыт не выполнен |
| task-wavelet-depth2.md | wavelet.csv | expected-depth2.json | Средние блоков длины 4; численно не выполнено |
| task-wavelet-null.md | wavelet-null.csv | expected-null.json | Карантин: предложение линейной интерполяции до Haar |
| task-wavelet-zero.md | wavelet-zero.csv | expected-zero.json | Только linearity smoke CDF; не доказательство правильного фильтра |

`python3 docs/node-development/nodes/preprocessing-smoothing/acceptance/modes/oracle.py --write`
воспроизводит JSON; `--check` сверяет. Python stdlib/Fraction: проекция Haar
даёт среднее каждой пары при depth=1, блока из четырёх при depth=2.
Clean depth=1: 1,1,4,4,9,9,13,13; depth=2: 2.5×4,11×4.
NULL-предложение линейно восстанавливает 12 между 10 и 14, сохраняет NULL источника.
Ни Loginom, ни runtime, ни actual-таблицы в oracle не используются.

Штатный parser принимает все четыре JSON. Порядок полей задан задачами и existing
mapping; RowID/X/Tag/NULL точны, X_S real с abs=1e-8, rel=1e-10, label_any.
Существующий формат проверки не расширяется.

В живом смешанном входе modes.csv первые три пары db1/depth1 дали 1/4/9.
У пары с NULL локальный preview-cache содержал NaN. Это ещё не доказывает,
что на native-порту находятся IEEE NaN, а не представление NULL кэшем:
точное чтение этих ячеек, экспорт и cold не выполнялись. Поэтому expected-null
остаётся в карантине и обещать интерполяцию в карточке/skill нельзя.

Порядок 1…10, глубина 1…10 и семь вариантов продолжения видны в UI.
Предложенная схема ограничивает coiflet 1…5, у CDF не принимает order;
в UI ввод coiflet=6 пропустил Next, но вычисление не запускалось и draft отменён.
Зависимые пределы/состояния контролов ещё требуют независимой проверки.

Для остальных порядков Добеши/Койфлетов и всех способов продолжения нужен
недегенеративный независимый filter oracle. Нулевой ряд не различает фильтры
и не подтверждает boundary-конвенцию. Стандарт приёмки не ослабляется.
Схема/карточка/fixtures/*proposal.md — предложения, hash-поля — 64 нуля;
модели передаются только выбранное задание и CSV.
