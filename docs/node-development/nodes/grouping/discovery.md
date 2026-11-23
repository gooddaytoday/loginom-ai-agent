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

## Типы агрегатов — native-проба LAB-1581, 2026-11-13

База `eb92f4f467ef05cc5c2205a0239891e14f3e553b`, Loginom 7.4.2,
Linux mas, Node 24.19.0, Chromium 1246. Отдельный собственный пакет
на `https://app.loginom.ai/app/?testable=true`; конфигурация только UI-жестами.
Матрица прочитана в `MF;TF-1;WizrdMCF;FactorEditDialog;grpFactors;chb[-N]`
после открытия соответствующего `GroupDataWizard;colUsedFields_<Name>`.
Полные результаты — штатным exact port reader после нового Execute;
Variant прочитан с native-подтипами. Пакет сохранён, закрытие и logout подтверждены.

Ответы на вопросы 1–9 из предложения LAB-1558:

1. Real: включены chb 0–12, выключен 13 (concat). DateTime, Boolean,
   Variant: включены 1,2,3,6,8,9,10,11,12; выключены 0,4,5,7,13.
   То есть count/min/max/mode/unique_count/null_count/first/last/only —
   у всех четырёх типов, sum/avg/median/stddev — также у Real, concat — нет.
   У Real unique_count/null_count/first/last/only подтверждены только матрицей;
   значения и типы выхода в этой пробе не наблюдались.
2. Ничья: integer 5/3 → 3; Real 1.5/0.5 → 0.5; Boolean True/False → False;
   string Beta/alpha → Beta (порядок кодовых точек, не локальная сортировка).
3. DateTime: при равной частоте выбирается ранняя дата; на группе A
   `types.csv` это `2026-01-05T00:00:00.000`. Variant 10/3.5/"text" →
   Real 3.5; 1/1.0/"1" → Integer 1. Это наблюдения этих смешанных наборов,
   не полная спецификация сравнения всех подтипов Variant.
4. All-NULL mode: Real → 0 (не NULL), Boolean → False (не NULL).
   Дополнительно: DateTime → `1899-12-30T00:00:00.000`, Variant → NULL.
5. Boolean min/max сохраняют Boolean, False < True, all-NULL → NULL.
   Real median/stddev имеют выход Real; все 15 значений пяти групп `types.csv`
   совпали с неизменённым `cases.real`. Singleton stddev → 0;
   all-NULL median/stddev → NULL.
6. Variant Min пропускает NULL: [NULL, 2.5, "word"] → Real 2.5,
   [-4, 0.25, NULL] → Integer -4. Гипотеза о NULL как нижнем значении
   Кросс-таблицы для Группировки не подтвердилась. First/Last включают
   крайний NULL и сохраняют подтипы: Integer 10 / String "text";
   NULL / String "word"; NULL / NULL; Integer -4 / NULL.
   Свёртка идёт RowID × (IntValue, RealValue, TextValue), пустые сохранены.
7. Header-only `empty.csv`: Import и Grouping Execute успешны, выход 0 строк,
   схема Region string, Rows integer, Total real, FirstDay datetime,
   AnyFlag boolean; `sample_complete:true`. Соответствует `cases.empty`.
8. DateTime-ключи и меры сохранили календарный день и полночь, включая NULL
   и даты января/февраля/июня/июля; exact reader даёт local datetime,
   timezone unspecified. Для этих входов полдень не нужен; другие часовые
   пояса и переходы летнего времени не проверены.
9. Variant unique_count для Integer 1, Real 1.0, String "1" → 2:
   числовые 1 и 1.0 равны, строка отдельна.

Основной вход — неизменённый `fixtures/types/types.csv`; первые четыре
строки Variant взяты из `fixtures/types/variant.csv` с теми же значениями
и порядком полей. Дополнительный собственный CSV расширяет native-пробу
смешанными подтипами, строковой ничьей Beta/alpha и DateTime-ключами.
Это операторская проба, не модельная приёмка. Oracle/контейнер expected
не изменялись. В цикле Real открываются только подтверждённые Real-функции;
DateTime/Boolean/Variant остаются будущими циклами runtime.
