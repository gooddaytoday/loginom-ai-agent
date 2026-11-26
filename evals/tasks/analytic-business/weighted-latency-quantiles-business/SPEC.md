# A05. Взвешенные квантили точных задержек

Reference detailed attempt1: actual openai/gpt-6.1-sol/xhigh подтверждены по сессии, CLI0, input bytes match, full oracle CSV PASS; assisted=false, бюджет1/3. Один reference для D/B.

## Фактический native граф

| Узел | Native type |
| --- | --- |
| Реестр сервисов | TBGImportTextFile |
| Частоты задержек | TBGImportTextFile |
| Сумма частот одинаковых задержек | TBGGroupDataEngine |
| Положительные частоты кандидатов | TBGFilterDataEngine |
| Всего запросов по сервисам | TBGGroupDataEngine |
| Кандидаты и частотный факт | TBGJoinDataEngine |
| Вклад частоты в накопление | TBGCalcData |
| Накопленная частота кандидата | TBGGroupDataEngine |
| Накопление и полное число запросов | TBGJoinDataEngine |
| Достижение порогов p50 и p90 | TBGCalcData |
| Кандидаты достигшие 50 процентов | TBGFilterDataEngine |
| Левый взвешенный p50 | TBGGroupDataEngine |
| Кандидаты достигшие 90 процентов | TBGFilterDataEngine |
| Левый взвешенный p90 | TBGGroupDataEngine |
| Исходные частоты и p90 | TBGJoinDataEngine |
| Вес строго медленнее p90 | TBGCalcData |
| Число запросов строго выше p90 | TBGGroupDataEngine |
| Реестр с полным счётчиком | TBGJoinDataEngine |
| Реестр с медианой | TBGJoinDataEngine |
| Реестр с p90 | TBGJoinDataEngine |
| Все сервисы со всеми показателями | TBGJoinDataEngine |
| Подготовка итоговых полей CSV | TBGCalcData |
| Итог по возрастанию service_id | TBGSortingEngine |
| Итоговый CSV | TBGExportTextFile |

Частоты одинаковой service_id/latency_ms сложены, нулевые частоты исключены из кандидатов. Equijoin кандидатов с частотным фактом по service_id образует сравнения задержек. Calculator contribution=IF(compared_latency<=latency_ms,compared_frequency,0), Group cumulative по кандидату. Join полных totals, flags IF(cumulative>=0.50*total,1,0) и IF(cumulative>=0.90*total,1,0). Две отдельные ветви Filter+GroupMin выбирают левые inverse ECDF p50/p90 без интерполяции. Raw frequency rows присоединены к p90; exceed_weight=IF(latency_ms>p90_ms,requests,0), Group суммирует строгий хвост. Left joins полного реестра, Int(NVL(total,0)), share=Round(exceed_count/IF(total>0,total,Null),6); сортировка service_id и один полный TextExport. При total0/NULL все три метрики NULL, включая сервис с нулевыми строками частот. JavaScript/готовые ответы не используются.

## Oracle и контракт

Независимый oracle разворачивает точные целочисленные частоты fixture и берёт порядковые статистики ceil(p*n), затем считает строгий tail. Это иной алгоритм, чем native pairwise cumulative. Реальные веса — запросы, не bucket rows; latency не интервальные bins. Пять строк, пять колонок, все значения всего CSV включены в rubric. Numeric1e-6; точные keys/NULL/order; inputs полностью искусственные.

## Cold

Отдельный browser исполнил все24 native узла и ветви без настройки/Save, создал новый полный CSV, check-rerun PASS. Фактический server LGP SHA до/после неизменен, старого destination до launch не было, новый CSV появился после. Cleanup SUCCEEDED/package closed/logout; неизменная принятая wide-копия private helper.

Blind-B уже выполнен координатором в отдельном свежем контексте только B+inputs; ответ заморожен до сравнения, полный CSV PASS. Новый solver не запускался. Калибровка и контроль фиксируются отдельно в каноне.
