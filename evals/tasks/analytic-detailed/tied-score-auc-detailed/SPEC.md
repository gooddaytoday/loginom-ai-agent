# A02. Ранжирование ROC AUC с ties

Reference построен detailed CLI attempt1, фактические `openai/gpt-6.1-sol/xhigh` подтверждены по сессии. Бюджет 1/3, assisted=false. Полные inputs совпали побайтно; CLI0, LGP и весь CSV прошли независимый oracle. Отдельного authoring B нет: обе формы получают тот же reference.

## Фактический граф

| Узел | Native type |
| --- | --- |
| Реестр моделей | TBGImportTextFile |
| Исходные scores | TBGImportTextFile |
| Положительные случаи | TBGFilterDataEngine |
| Отрицательные случаи | TBGFilterDataEngine |
| Все пары positive × negative | TBGJoinDataEngine |
| Индикаторы согласия и равенства | TBGCalcData |
| Пары по моделям | TBGGroupDataEngine |
| AUC с половиной равных пар | TBGCalcData |
| Количество положительных | TBGGroupDataEngine |
| Количество отрицательных | TBGGroupDataEngine |
| Реестр и положительные | TBGJoinDataEngine |
| Реестр и оба класса | TBGJoinDataEngine |
| Полный реестр с AUC | TBGJoinDataEngine |
| Нулевые счётчики отсутствующих случаев | TBGDataRecoveryEngine |
| Округление AUC для CSV | TBGCalcData |
| Итоговая схема и целые счётчики | TBGReformColumnsEngine |
| Итог по model_id | TBGSortingEngine |
| Итоговый CSV | TBGExportTextFile |

Положительные и отрицательные scores фильтруются отдельно; equijoin по model_id образует все positive × negative сочетания. Два integer индикатора — `If(score_positive > score_negative,1,0)` и `If(score_positive = score_negative,1,0)`. Group даёт comparable/concordant/tied counts, calculator считает `(concordant_pairs + 0.5*tied_pairs)/comparable_pairs`. Отдельные class counts присоединены left joins к полному реестру. Native DataRecovery заменяет отсутствующие счётчики на нули, сохраняя NULL auc. Последний calculator округляет только итоговый auc до шести знаков; ReformColumns закрепляет итоговую схему и целые счётчики, Sorting — model_id по возрастанию, TextExport — один полный CSV. JavaScript и готовые ответы не используются.

## Oracle и контракт

Независимый oracle на Fraction интегрирует ROC трапециями по блокам ties и отдельно сверяет результат прямыми парами. Читает только data/. Полный CSV — шесть строк, семь колонок; NULL auc для отсутствующего класса, нулевые counts сохраняются. Допуск 1e-6, строковые ключи/NULL/порядок строк точны, порядок колонок не оценивается. В rubric включён весь oracle CSV.

## Cold подтверждение

Отдельный browser cold2 открыл точный сохранённый пакет и выполнил все 18 executable native nodes, включая все ветви. Новый полный CSV прошёл check-rerun при неизменном SHA фактического server LGP. Настройки/Save не применялись; package closed/logout подтверждены. Cold1 после 15/18 узлов отказал по UI_REFERENCE_OBSCURED до взаимодействия; его evidence и cleanup сохранены. В принятом private-вызове изменён только viewport браузера, runtime/guards не менялись. Точная причина первоначального отказа не объявляется доказанной. Калибровка и измерения фиксируются отдельно в каноне пилота.
