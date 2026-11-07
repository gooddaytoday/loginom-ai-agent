Предложение LAB-1046, **checkpoint, этап 0 не завершён**. До утверждения владельцем
ни один новый случай здесь не является runnable-кейсом run-check или PASS.

| Задание в acceptance/ | Вход из fixtures/ | Expected здесь | Статус |
|---|---|---|---|
| task-continuous-manual.md | continuous.csv | expected.json | Предложены явные границы 0/7/14; численно не выполнено |
| task-unseen.md | train.csv, unseen.csv | expected-unseen.json | Карантин: гипотеза unknown/NULL → NULL-производные |
| task-zero-frequency.md | zero-frequency.csv | expected-zero-frequency.json | Карантин: гипотеза additive alpha=0.5 |

`python3 docs/node-development/nodes/preprocessing-coarseclasses/acceptance/modes/oracle.py --write`
воспроизводит JSON; `--check` сверяет. Stdlib/Decimal ln с 50 знаками; данные из CSV,
границы задаются бизнес-требованием. Предсказания оптимизатора не имитируются.
Старый независимый oracle используется для известных схем и дискретной модели.
WoE = ln(p_non_event / p_event); IV = (p_non_event - p_event) * WoE.
Для continuous E=N=4, два класса 3/1 и 1/3, общий IV=ln(3).

Случай zero-frequency отдельно предполагает (count+0.5)/(total+K*0.5),
неизменённые исходные частоты и конечные WoE/IV. Наличие такого коэффициента в
Loginom **не установлено**; пользовательское задание разрешает сообщить отказ.
Поэтому этот JSON нельзя использовать как pass-or-fail до отдельного решения.
То же относится к NULL-производным новых категорий: это предложение, не наблюдение.

Все три JSON проходят существующий parseExpectedOutputs. Для непрерывных границ
использован стандартный typed Variant `{cell_type:"integer",value:...}`.
Метки классов в continuous не заданы пользователем: применяется существующий
category_labels_any (биекция), метки колонок — label_any. Номера классов пока
предложены 0/1; их соответствие нужно подтвердить native-редактором.
Проверки всех трёх портов, типов, строк, точных NULL и Real abs/rel=1e-12 остаются.

Новый native decoder не нужен по текущей оценке: makeNodePortOutputCode уже
принимает typedVariants. Его можно запросить из coarse-classes-output.mjs;
проверку численного пути всё равно должен подтвердить живой прогон этапа 1.

Схема/карточка и fixtures/*proposal.md — оценочные документы, не runtime-регистрация.
Внешние/ручные/frozen-свойства схемы ещё требуют подтверждения всех UI-мутаций.
Hash-поля карточки — 64 нуля. Модели — только выбранные task и CSV.

**Осталось:** связанный numeric-сценарий, внешние диапазоны и их точная схема,
ручные/замороженные разбиения с Save/reopen, новые/NULL-категории, нулевые частоты.
В этом запуске изучена объявленная входная схема X/Target без подтверждённого
подключения источника. Она доказывает наличие настроек continuous, не обучение.
