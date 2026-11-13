# A04. Wilson conversion interval

Reference detailed attempt1: actual openai/gpt-6.1-sol/xhigh подтверждены по сессии, CLI0, input bytes match, полный CSV oracle PASS; assisted=false, бюджет1/3. Один reference для D/B.

## Фактический граф

| Узел | Native type |
| --- | --- |
| Реестр потоков | TBGImportTextFile |
| Независимые испытания | TBGImportTextFile |
| Суммы испытаний и успехов | TBGGroupDataEngine |
| Полный реестр и суммы | TBGJoinDataEngine |
| Нулевые счётчики без испытаний | TBGDataRecoveryEngine |
| Уилсон 95 процентов z 1.96 | TBGCalcData |
| Колонки результата и целые счётчики | TBGReformColumnsEngine |
| Порядок потоков | TBGSortingEngine |
| Шесть знаков для экспорта | TBGCalcData |
| Итоговый CSV | TBGExportTextFile |

Group суммирует trials/successes по cohort_id. Left join полного реестра и native DataRecovery создают нулевые counts для пустого потока, сохраняя семантику отсутствия данных. Calculator использует n_safe=IF(trials=0,Null,trials), observed_rate=successes/n_safe, d=1+1.96²/n_safe, center=(observed_rate+1.96²/(2*n_safe))/d, half=1.96*Sqrt(observed_rate*(1-observed_rate)/n_safe+1.96²/(4*n_safe²))/d. При k=0 lower=0, при k=n upper=1; при trials=0 bounds/rate NULL. Decision по неокруглённым strict bounds относительно target_rate; пустой поток no_data. ReformColumns, сортировка cohort_id, только затем Round6 для вывода и один TextExport. Не Wald и не среднее batch rates.

## Независимый oracle и контракт

Oracle Decimal50precision инвертирует score-неравенство бисекцией; closed form Wilson используется только дополнительной математической сверкой. Никакие native выходы не участвуют в expected values. Входы собственные искусственные batches/cohorts; испытания непересекаются. Полный CSV: семь строк, восемь полей, весь эталон в rubric. Exact keys/NULL/order, numeric tolerance1e-6. NULL не известный ноль; interval не вероятность истинности гипотезы.

## Cold

Browser cold выполнил все10 native узлов и ветви без настройки/Save, создал новый полный CSV, check-rerun PASS. Фактический server LGP SHA до/после совпал. Cleanup SUCCEEDED/package closed/logout; исходный CSV перед запуском припаркован. Переиспользован неизменный принятый wide helper, runtime/guards не менялись. Калибровка/контроль учитываются отдельно.
