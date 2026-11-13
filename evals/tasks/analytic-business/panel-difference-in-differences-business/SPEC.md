# A03. Контроль изменения и диагностический pretrend

Reference detailed attempt1: actual openai/gpt-6.1-sol/xhigh подтверждены по сессии, CLI0, full oracle CSV PASS, input bytes match; assisted=false, бюджет1/3. Один reference для D/B.

## Реальный сохранённый граф

| Узел | Native type |
| --- | --- |
| Реестр единиц | TBGImportTextFile |
| Результаты по периодам | TBGImportTextFile |
| Панель с группами | TBGJoinDataEngine |
| Средние по группе и периоду | TBGGroupDataEngine |
| Шесть средних на программу | TBGCrossTabEngine |
| Число единиц из реестра | TBGGroupDataEngine |
| Размеры групп T и C | TBGCrossTabEngine |
| Средние и размеры групп | TBGJoinDataEngine |
| Имена и типы итоговых полей | TBGReformColumnsEngine |
| DiD и диагностика предтренда | TBGCalcData |
| Итог по program_id | TBGSortingEngine |
| Итоговый CSV | TBGExportTextFile |

Outcomes соединены с реестром по составному program_id/unit_id. Средние сначала группируются по program_id/arm/period; fixed cross table разворачивает шесть сочетаний в отдельные поля. Независимые counts из реестра по program_id/arm разворачиваются второй fixed cross table и присоединяются по program_id. ReformColumns закрепляет имена и типы. Calculator последовательно вычисляет treated_change=t_post-t_pre1, control_change=c_post-c_pre1, did_estimate=treated_change-control_change, pretrend_gap=(t_pre1-t_pre2)-(c_pre1-c_pre2), parallel_compatible=IFF(Abs(pretrend_gap)<=1,1,0). Сортировка по program_id и один полный TextExport.

## Контракт и независимый oracle

Все unit имеют pre2/pre1/post; равный вес unit внутри T/C при разных размерах групп. Oracle Fraction сначала вычисляет два изменения каждого unit, затем средние изменений T/C и их разности; средние уровни рассчитаны отдельно. Такой unit-first пересчёт независим от period-first native графа. Флаг не доказывает причинность и не скрывает did при значении0. Counts — unit, не строки периодов.

Три строки,14колонок, весь CSV в rubric; числовой допуск1e-6, ключи/порядок/NULL точны. JavaScript и готовые ответы не применяются.

## Cold подтверждение

Отдельный browser cold исполнил все12 native nodes и все ветви без настройки/Save. Новый полный CSV прошёл check-rerun; фактический server LGP SHA до/после совпал. Старый destination перед запуском отсутствовал, новый CSV создан после launch. Cleanup SUCCEEDED/package closed/logout. Переиспользована неизменная принятая wide-копия private helper; runtime/guards не менялись. Калибровка/контроль учитываются отдельно в каноне пилота.
