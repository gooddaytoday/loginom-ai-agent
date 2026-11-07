Предложение LAB-1046, **checkpoint, этап 0 не завершён**. Runtime/skill не менялись,
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
