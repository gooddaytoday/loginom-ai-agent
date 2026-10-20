# Профиль исходных валютных изменений

Источник: `analitic-tasks/task62-exchangerate`. Фиксированный вход — `data/dataset.csv`, все 240 строк. high, low, даты и timestamp не участвуют. Исходный change_pct уже в процентах; среднее/min/max не умножаются на 100, отрицательные значения сохраняются.

## Фактический граф

В `reference.lgp` восемь стандартных узлов, один линейный путь:

1. Импорт UTF-8 CSV с заголовком, запятой и точкой.
2. Калькулятор: `row_one=1`, `negative_row=IFF(change_pct<0,1,0)`.
3. Группировка по target_currency: Sum(row_one) → observations, Avg(rate) → mean_rate, Avg/Min/Max(change_pct) → соответствующие показатели, Sum(negative_row) → negative_count. Все строки входят в знаменатель.
4. Калькулятор: `change_span_pp=max_change_pct-min_change_pct`, `negative_change_pct=100.0*negative_count/observations`. Диапазон в процентных пунктах.
5. Сортировка сырых change_span_pp по убыванию, затем target_currency по возрастанию; LocaleAware=false.
6. Калькулятор заменяет шесть вещественных показателей явными Round(показатель,6), observations приводит к целому через Int; target_currency проходит без изменения. Округление после расчётов и сортировки.
7. Параметры полей исключают negative_count, оставляют восемь заданных колонок.
8. Единственный UTF-8 CSV-экспорт с заголовками, запятой и точкой: `/user/analytic-evals-currency-change-profile-1.result.csv`.

JavaScript, дополнительные ветки и подставленные итоговые строки отсутствуют. CLI 0.2.2, модель openai/gpt-6.1-sol/xhigh, primary-попытка 1 без подсказки и без упрощения. Внутри попытки агент исправил отклонённое до эффекта имя узла и штатно восстанавливал таймаут сопоставления/открытия финального мастера. После освобождения дошёл до успешного исполнения источника и проекции. Отдельно проверенная пауза между вызовами не была зависшим node_wait.

## Результат и проверки

Десять строк; колонки `target_currency,observations,mean_rate,mean_change_pct,min_change_pct,max_change_pct,change_span_pp,negative_change_pct`. Полный oracle.csv с допуском 1e-6; Python stdlib oracle подтверждён независимым слепым SQL-расчётом.

Проверены SHA256 входа, исходные mean/min/max, строгий порог отрицательного изменения, диапазон/процент, связность, Round6 после сырой сортировки и полный CSV. После CLI сохранённый пакет заново открыт и выполнен в браузере: все восемь узлов активны, ошибок нет. Пакет закрыт без сохранения, новый CSV повторно совпал со всеми строками oracle. Пути доказательств и история — в provenance.json.

Сценарий: http://localhost/app/?testable=true#packages/user/analytic-evals-currency-change-profile-1/Unit1/workflow
