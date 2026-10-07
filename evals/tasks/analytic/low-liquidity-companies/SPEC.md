# Компании с текущей ликвидностью ниже 1

Импорт CSV → фильтр `current_ratio < 1` → сортировка по коэффициенту и идентификатору → экспорт пяти колонок.

Имена файла пакета и файла результата задаёт harness (см. TASK.md); при оценке имена файлов не учитываются.

## Назначение

Широкая схема, строгое условие, два ключа сортировки и отбор колонок.

## Сценарий

| Узел | Компонент | Настройка |
|:-----|:----------|:----------|
| Импорт dataset.csv | Текстовый файл | `dataset.csv`, первая строка — заголовок; 16 колонок, `company_id` — целое, `current_ratio`, `current_assets` и `current_liabilities` — вещественные |
| current_ratio | Фильтр строк | `current_ratio` строго меньше 1; дальше идёт выход с выполненным условием |
| current_ratio ASC, company_id ASC | Сортировка | сначала `current_ratio` по возрастанию, затем `company_id` по возрастанию |
| ref-low-liquidity-companies-1.result.csv | Текстовый файл | пять колонок: `company_id`, `industry`, `current_ratio`, `current_assets`, `current_liabilities` |

Связи: Импорт dataset.csv → current_ratio → current_ratio ASC, company_id ASC → экспорт.

## Входные данные

`dataset.csv` — 200 компаний, 16 колонок; копия `analitic-tasks/task45-financial-statements/data/dataset.csv` без изменений.

## Ожидаемый результат

35 строк и ровно 5 колонок. Первая строка — `company_id` 26, `current_ratio` 0.01; последняя — `company_id` 103, `current_ratio` 0.95. При равном `current_ratio` порядок `company_id` возрастающий: 126, 135 (0.27); 29, 170, 196 (0.52); 100, 199 (0.74). Полный набор строк — `oracle.csv`.
