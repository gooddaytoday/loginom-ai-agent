# Количество уникальных — исследование 2026-11-01

База `004e96dbfa47e8b5251493ab38ae5766ecc0fa5a`, Loginom 7.4.2,
Linux mas, закреплённый Chromium 1246. Наблюдение на
`https://app.loginom.ai/app/?testable=true` в собственном новом черновике
назначенного worker. Все изменения выполнены UI-жестами; локальные stores
прочитаны существующими `readGroupingBrowser` / `readMappingBrowser`.

`MF;TF-2;WizrdMCF;GroupDataWizard;colUsedFields_Customer` открывает редактор;
`...;FactorEditDialog;grpFactors;chb-8;DisplayEl` — «Кол-во уникальных»
(иконка `gdUniqueCount`), `chb-1;DisplayEl` — «Количество».
После `FactorEditDialog;btnApply` GroupFunctions строкового Customer = 258
(2 | 256), целого CustomerId = 256. Собственный бит unique_count — 256.

В выходном `DerivedDataSourceOutputSocketWizard` source имеет
`Customer_Uniq`, `Customer|Кол-во уникальных`, integer; count одновременно
имеет `Customer_Count`, `Customer|Количество`, integer. Для единственной
функции source — `CustomerId_Uniq`, target — `CustomerId`, оба integer.
Суффикс CrossTable `UniqueCount` к Группировке неприменим.

В быстром просмотре `ModelForm;PreviewWindow;PreviewForm;DataSetForm;
grdDataTable;grd-1;tbl` на `acceptance/unique/data/customers.csv`:

| Region | count(Customer) | unique_count(Customer) | unique_count(CustomerId) |
|---|---:|---:|---:|
| North | 6 | 3 | 2 |
| South | 4 | 2 | 1 |
| NullOnly | 2 | 0 | 0 |
| EmptyOnly | 2 | 1 | 0 |

Импорт: UTF-8, `;`, qualifier `"`, null marker `\N`; CustomerId явно integer,
Customer и Region string. Пустая числовая ячейка становится NULL, строковая
`""` остаётся пустой строкой. NULL исключён из unique_count; пустая строка
учитывается один раз; повтор значения не меняет число. Count включает все
строки. Проверенный объём unique_count — integer/string; другие типы и
агрегаты не расширяются. Oracle и expected подготовлены до реализации.
