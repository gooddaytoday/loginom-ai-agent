# Контент по миссии и типу медиа

Источник: `analitic-tasks/task61-nasa`. Единственный фиксированный вход — `data/dataset.csv`, все 100 строк. `hd_image` — исходный флаг записи для любого media_type; video и article не исключаются.

## Фактический граф

В `reference.lgp` пять стандартных узлов, один линейный путь:

1. Импорт UTF-8 CSV с заголовком, запятой и десятичной точкой.
2. Группировка по `mission,media_type`: Count(data_id) → `events`, Sum(image_count) → `images`, Sum(hd_image) → `hd_events`, Avg(keywords_count) → `mean_keywords`. data_id заполнен во всех строках, Count равен числу записей. HD не умножается на image_count.
3. Сортировка `mission ASC, media_type ASC`, LocaleAware=false.
4. Калькулятор: `hd_event_pct=Round(100.0*hd_events/events,6)`, замена `mean_keywords=Round(mean_keywords,6)`, приведение `images` и `hd_events` к целым через Int. Выходное сопоставление оставляет ровно семь заданных колонок.
5. Единственный экспорт UTF-8 CSV с заголовками по именам, запятой и точкой: `/user/analytic-evals-mission-media-content-1.result.csv`.

JavaScript, дополнительные ветки и подставленные итоговые строки отсутствуют. Пакет построен CLI 0.2.2, модель `openai/gpt-6.1-sol/xhigh`, primary-попытка 1 без подсказки и без упрощения.

## Результат и проверки

18 строк; колонки `mission,media_type,events,images,hd_events,hd_event_pct,mean_keywords`. Три счётчика целые, два вещественных результата округлены в конце до шести знаков. Эталон — полный `oracle.csv`, допуск `1e-6`. Oracle на Python stdlib подтверждён независимым слепым SQL-расчётом.

Проверены SHA256 входа, фактические суммы/среднее/процент, связность и весь CSV после CLI. Сохранённый пакет заново открыт и выполнен в браузере; все пять узлов активны, ошибок нет. Пакет закрыт без сохранения, новый CSV повторно совпал со всеми строками oracle. Пути доказательств — в provenance.json.

Сценарий: http://localhost/app/?testable=true#packages/user/analytic-evals-mission-media-content-1/Unit1/workflow
