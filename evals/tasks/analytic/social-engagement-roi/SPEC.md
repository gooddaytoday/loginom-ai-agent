# Вовлечённость и отношение выручки к бюджету

Источник: analitic-tasks/task26-social-media, 200 строк data/dataset.csv. Исходный CSV сохранён побайтово. Итоговый revenue_budget_ratio — выручка/бюджет без вычитания 1 и без перевода в проценты.

## Фактический граф

Описание проверено по Unit_0/Unit.xml принятого пакета. Семь стандартных узлов образуют один линейный путь; JavaScript отсутствует.

1. «Импорт dataset.csv» — импорт UTF-8 с запятой и десятичной точкой. Загруженный CSV совпадает с источником по SHA256; фильтра нет.
2. «Взаимодействия likes + shares + comments» — Калькулятор: engagements=likes+shares+comments, целое поле.
3. «Суммы и число публикаций по channel» — единственный ключ channel; Count(post_id)→posts, Sum(impressions)→total_impressions, Sum(engagements)→total_engagements, Sum(campaign_budget)→total_budget, Sum(revenue_generated)→total_revenue. Все 200 post_id заполнены, поэтому count соответствует числу строк.
4. «Engagement % и Revenue / Budget без округления» — Калькулятор: engagement_pct=100.0*total_engagements/total_impressions, revenue_budget_ratio=total_revenue/total_budget. Суммы показов и взаимодействий приводятся к целому типу; posts уже целое. Отношения вычисляются из агрегатов, до округления.
5. «Рейтинг: revenue_budget_ratio DESC, channel ASC» — Сортировка по неокруглённому revenue_budget_ratio DESC, затем channel ASC, LocaleAware=false.
6. «Финальное округление: шесть знаков, десятичная точка» — четыре нецелых показателя заменяются строковым представлением. Для каждого x сначала вычисляется Int(Round(x*1000000)), затем целая часть через Div(...,1000000), точка и ровно шесть дробных цифр через StrZero(Mod(...,1000000),6). Это окончательное округление до шести знаков после сортировки. Все эти показатели положительны на фиксированном входе. Выходное сопоставление оставляет ровно восемь требуемых колонок; три счётчика сохраняются целыми.
7. «Итоговый CSV — social engagement ROI» — единственная выгрузка UTF-8 с заголовками из имён колонок, запятой и десятичной точкой. Несмотря на название узла, экспортируется указанное отношение выручки к бюджету.

## Результат и проверка

Колонки: channel,posts,total_impressions,total_engagements,total_budget,total_revenue,engagement_pct,revenue_budget_ratio. Пять строк: Telegram, Instagram, VK, YouTube, TikTok. Полный oracle находится в oracle.csv, числовой допуск 1e-6.

CLI 0.2.2, openai/gpt-6.1-sol/xhigh, primary-попытка 1 без внешней подсказки, exit=0. Упрощение не применялось.

Официальная проверка графа и полного CSV прошла. Сохранённый пакет отдельно открыт через меню браузера и выполнен целиком: семь узлов активны, ошибок нет. Новый CSV полностью совпал с oracle; пакет закрыт без сохранения браузерных изменений. Версии, SHA256 и независимая слепая сверка приведены в provenance.
