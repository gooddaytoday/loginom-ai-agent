Предложение LAB-1046, **checkpoint, этап 0 не завершён**. Критерии не утверждены,
runtime не изменён, сценарии run-check не зарегистрированы. После второго
восстановления сеанса живое исследование остановлено по условию карточки.

| Задание в acceptance/ | Вход из fixtures/ | Expected здесь | Статус |
|---|---|---|---|
| task-datetime-manual.md | modes.csv | expected.json | Native discovery: оба полных выхода совпали с oracle |
| task-auto.md | numeric-modes.csv | expected-auto.json | Формула автопределов — предложение, Real-прогон не выполнен |
| task-sd.md | numeric-modes.csv | expected-sd.json | Population SD без округления — предложение, Real-прогон не выполнен |

`python3 docs/node-development/nodes/preprocessing-binning/acceptance/modes/oracle.py --write`
воспроизводит JSON; `--check` сверяет. Только Python stdlib, без Loginom/runtime
или actual-таблиц. DateTime/manual: явные бизнес-границы, календарная арифметика,
точные millisecond civil dates, оба выхода и все исходные поля. Числовые случаи:
count=2 располагает min/max в центрах крайних интервалов; SD использует population
variance и ±1/±2 σ. Эти две формулы ещё не приняты как полный native-контракт.

Штатный parser принимает все три expected после замены {{PACKAGE_PATH}}.
ordered/column_order/порты/NULL/типы — стандартные; Real abs/rel=1e-12,
остальные значения точны, незаданные метки колонок — label_any.
Нового verifier нет. Модели можно передавать только выбранное задание и CSV;
oracle/expected/schema/card/proposed skill ей не передавать.

`parameter-schema.proposal.json` и `node-card.proposal.json` — незарегистрированные
данные для оценки. Hash-поля карточки заполнены 64 нулями. `semantics.txt` заменяет
текст semantics целиком, чтобы старое запрещение DateTime не противоречило предложению.
Тексты будущего навыка — fixtures/*proposal.md, основной SKILL.md не меняется.

**Осталось:** численные width-DateTime/автопределы/SD, current/unchanged/equal_tiles,
суммы, округление и открытые края; сохранение/повторное открытие ручной модели.
Random виден в UI, но исключён из предложенной схемы до выбора критерия владельцем:
детерминированный expected при повторениях на границе недостаточен. Seed не наблюдён.
Это не разрешение расширять matcher или ослаблять проверку строк.
