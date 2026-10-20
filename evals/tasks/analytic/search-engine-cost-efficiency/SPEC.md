# Эффективность затрат по поисковым системам

Источник: analitic-tasks/task50-seo-sem, 300 строк data/dataset.csv. Исходный CSV сохранён побайтово. CTR, конверсия, CPC и CPA рассчитываются из сумм; исходные готовые коэффициенты не усредняются.

## Фактический граф

Описание проверено по Unit_0/Unit.xml принятого пакета. Шесть стандартных узлов образуют один линейный путь; JavaScript отсутствует.

1. «dataset.csv — все исходные строки» — импорт UTF-8 с запятой и десятичной точкой. Загруженный CSV совпадает с источником по SHA256; фильтра нет.
2. «По search_engine — число строк и суммы» — единственный ключ search_engine; Count(keyword_id)→keywords, Sum(impressions)→total_impressions, Sum(clicks)→total_clicks, Sum(conversions)→total_conversions, Sum(cost)→total_cost. Все 300 keyword_id заполнены, поэтому count соответствует числу строк. Готовые ctr, conversion_rate и cost_per_click не участвуют в агрегатах.
3. «CTR, конверсия, CPC, CPA — отношения сумм» — Калькулятор: ctr_pct=100*total_clicks/total_impressions, conversion_pct=100*total_conversions/total_clicks, cpc=total_cost/total_clicks, cpa=total_cost/total_conversions. Округления здесь нет.
4. «CPA ↑ без округления, затем search_engine ↑» — Сортировка по неокруглённому cpa ASC, search_engine ASC, LocaleAware=false.
5. «Итоговый CSV — целые счётчики и 6 знаков» — суммы показов, кликов и конверсий заменяются целыми через Int; keywords уже целое. Пять остальных показателей заменяются строками: для каждого x вычисляется Round(x*1000000), целая часть через Div(...,1000000), точка и шесть дробных цифр через StrZero(Mod(...,1000000),6). Это окончательное округление до шести знаков после сортировки. Все пять показателей положительны на фиксированном входе. Выходное сопоставление оставляет ровно десять требуемых колонок.
6. «analytic-evals-search-engine-cost-efficiency-1.result.csv» — единственная выгрузка UTF-8 с заголовками из имён колонок, запятой и десятичной точкой.

## Результат и проверка

Колонки: search_engine,keywords,total_impressions,total_clicks,total_conversions,total_cost,ctr_pct,conversion_pct,cpc,cpa. Три строки: Yandex, Google, Bing. Полный oracle находится в oracle.csv, числовой допуск 1e-6.

CLI 0.2.2, openai/gpt-6.1-sol/xhigh, primary-попытка 1 без внешней подсказки, exit=0. Упрощение не применялось.

Официальная проверка графа и полного CSV прошла. Сохранённый пакет отдельно открыт через меню браузера и выполнен целиком: шесть узлов активны, ошибок нет. Новый CSV полностью совпал с oracle; пакет закрыт без сохранения браузерных изменений. Версии, SHA256 и независимая слепая сверка приведены в provenance.
