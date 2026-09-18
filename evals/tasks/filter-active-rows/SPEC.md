# filter_active_rows.lgp

Минимальный пакет Loginom: импорт CSV → фильтр `Active=true` → экспорт результата.

Файл пакета: `filter_active_rows.lgp`.

## Назначение

Проверка базовой ETL-цепочки: текстовый импорт, фильтр строк по логическому полю,
экспорт отфильтрованной таблицы.

## Сценарий

| Узел   | Компонент        | Настройка |
|:-------|:-----------------|:----------|
| Import | Текстовый файл   | `data/orders.csv`, первая строка — заголовок, suggest format |
| Filter | Фильтр строк     | поле `Active`, условие «истина» (`frtIsTrue`) |
| Export | Текстовый файл   | `filter_active_rows.result.csv` |

Связи: Import `Output_Data-0` → Filter `Input_Data-0` → Export `Input_Data-1`.

## Входные данные

`data/orders.csv` — 4 строки (A/B/C/D), из них `Active=true` у A и C.

## Ожидаемый результат

Экспорт содержит **2 строки** с `Active=true` (Item: A, C).

Пересборка эталона — через browser automation (skill `loginom-automation`).
