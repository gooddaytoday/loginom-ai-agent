# Продуктивность форм работы по отделам

Источник: analitic-tasks/task15-hypothesis-testing, 300 строк data/dataset.csv. Исходный CSV сохранён побайтово. По каждому отделу сравниваются готовые формы работы Office, Remote, Hybrid, без статистической проверки гипотез.

## Фактический граф

Описание проверено по Unit_0/Unit.xml принятого пакета. Шесть стандартных узлов образуют линейный путь; JavaScript отсутствует.

1. «Исходный dataset.csv» — импорт UTF-8, запятая и десятичная точка. Используются department, work_type, productivity_score; загруженный CSV совпадает с источником по SHA256.
2. «Отдел × форма работы: число строк и средняя продуктивность» — Кросс-таблица: department как строковый ключ, work_type как значения колонок, productivity_score с агрегациями ctatCount и ctatAvg. Все 300 productivity_score заполнены, поэтому count соответствует числу строк. Сохранённая схема кросс-таблицы содержит категории Office, Remote, Hybrid; в каждом из пяти отделов представлены все три формы.
3. «Разница Remote − Office без округления» — Калькулятор: remote_minus_office=Remote_productivity_score_Avg−Office_productivity_score_Avg. Выходное сопоставление переименовывает шесть агрегатов: office_employees,avg_office_productivity,remote_employees,avg_remote_productivity,hybrid_employees,avg_hybrid_productivity; счётчики имеют целый тип.
4. «Сортировка: разница ↓, department ↑ — до округления» — Сортировка неокруглённого remote_minus_office DESC, затем department ASC, LocaleAware=false.
5. «Финальное округление до 6 знаков после сортировки» — Калькулятор заменяет три средних и разницу через Round(...,6). До этого значения не округляются.
6. «Итоговый CSV: 5 отделов, 8 колонок» — единственная выгрузка UTF-8 с заголовками из имён колонок, запятой и десятичной точкой.

## Результат и проверка

Колонки: department,office_employees,avg_office_productivity,remote_employees,avg_remote_productivity,hybrid_employees,avg_hybrid_productivity,remote_minus_office. Пять строк: Marketing, Finance, Sales, HR, IT. Полный oracle находится в oracle.csv, числовой допуск 1e-6.

CLI 0.2.2, openai/gpt-6.1-sol/xhigh, primary-попытка 1 без внешней подсказки. Пакет сохранён с exit=0; упрощение не применялось.

Официальная проверка графа и полного CSV прошла. Сохранённый пакет заново открыт через меню и выполнен целиком: шесть узлов активны, ошибок нет. Новый CSV полностью совпал с oracle; пакет закрыт без сохранения изменений браузерной сессии. Версии, SHA256 и независимая слепая сверка приведены в provenance.
