LAB-1055, 07.11.2026, mas3: **checkpoint после второго разрыва связи, blocked**.
Продолжение #851, docs-only; новые критерии требуют утверждения владельцем.
Утверждённые назначением DateTime/manual и auto/SD повторно не исследовались.

| Дополнение | Комплект | Статус |
|---|---|---|
| Ties=current, count=4, Integer | task-ties-current.md / expected-current.json | наблюдено: 104+52 ячейки, схемы и порядок обоих портов совпали точно |
| Плитки по суммам, count=2 | task-sum-current.md / expected-sum.json | not_checked: второй разрыв до настройки; weighted-CDF — только гипотеза |
| unchanged / equal_tiles | пока без численного expected | UI-пункты наблюдены, вычисления not_checked: лимит переподключений |
| rounding=true | пока без численного expected | флаг виден; численная конвенция и полнота зависимых controls not_checked |
| Открытые нижний/верхний края | пока без численного expected | флаги видны; значения вне конечных пределов not_checked |
| random | исключён из схемы | UI-пункт наблюдён; seed не установлен, нужен критерий владельца |

`python3 docs/node-development/nodes/preprocessing-binning/acceptance/modes/oracle-edges.py --check`
воспроизводит current/sum независимо, только из ties-modes.csv и формулы.
Current: последние ранги групп по две строки, все копии границы относятся
к текущей плитке; cut=0/2/6/10/14, номера 0,0,0,1,2,2,3,3.
Обобщение на неделимое N/вырожденные интервалы не установлено.
Sum — предположение положительной взвешенной CDF: цель 54/2=27, cut=10,
суммы 28/26. Это **не** наблюдённая семантика Loginom и не критерий PASS.
Оба случая используют обычные два выхода, точные Integer/Boolean/NULL,
ordered/column_order=exact, прежний формат экспорта и cold-проверки.
Точных CSV/cold этих опытов и модельных прогонов не было; preview-cache
не подтверждает production-reader. Все новые файлы остаются предложениями.

Полные TID/причины — [discovery LAB-1055](../../discovery.md#lab-1055-tiescurrent-и-остановка-на-mas3).
Бюджеты и дальнейшие циклы — [подплан](../../plan.md#8-lab-1055-checkpoint).
Модели передаются только выбранный task и CSV, без oracle/expected/schema/card.

Историческое предложение LAB-1046, **checkpoint, этап 0 не завершён**. Критерии не утверждены,
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
