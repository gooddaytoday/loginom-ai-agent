# group_sum_qty.lgp

Минимальный пакет Loginom: импорт CSV → группировка по `Item` с суммой `Qty` → экспорт результата.

Файл пакета: `group_sum_qty.lgp`.

## Назначение

Проверка базовой ETL-цепочки: текстовый импорт, группировка с агрегацией суммы,
экспорт свёрнутой таблицы.

## Сценарий

| Узел   | Компонент        | Настройка |
|:-------|:-----------------|:----------|
| Import | Текстовый файл   | `data/sales.csv`, первая строка — заголовок, suggest format |
| Group  | Группировка      | ключ группировки `Item`, показатель `Qty` — сумма |
| Export | Текстовый файл   | `group_sum_qty.result.csv` |

Связи: Import `Output_Data-0` → Group `Input_Data-0` → Export `Input_Data-1`.

## Входные данные

`data/sales.csv` — Item/Qty: A×5, A×10, B×25.

## Ожидаемый результат

Экспорт содержит **2 строки**: Item A с Qty=15, Item B с Qty=25.

Пересборка эталона — через browser automation (skill `loginom-automation`).
