# Скидка заказа в выручке товарных категорий

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

## Задача и происхождение данных

Одна строка на category: число разных заказов, стоимость до скидок, распределённая скидка и чистая выручка. Detailed/business имеют одинаковые входы, общий контракт, rubric, tolerance и oracle; подробная форма раскрывает вычисления.

Данные полностью синтетические, созданы eval author: 3 заказа и 7 строк. Два raw CSV заморожены до ручного gold и независимого oracle. Это не UCI, реальные продажи или производный снимок; внешние datasets, готовые пакеты и сторонние лицензии не использованы, лицензия репозитория — MIT. Временного окна и преобразований дат нет.

orders.csv(order_id,order_discount) имеет уникальный order_id; lines.csv(line_id,order_id,category,qty,unit_price) — уникальный line_id и существующий orders FK. Ключи/category — ASCII с учётом регистра; все входные ячейки непустые, без NULL. qty — положительное целое, суммы/цены неотрицательны, стоимость каждого заказа положительна. Повтор категории внутри заказа и несколько категорий заказа допустимы. Входы UTF-8, `;`, заголовок, десятичная точка, двойная кавычка как текстовый ограничитель.

Независимый Python stdlib csv/Decimal oracle читает оба raw, рассчитывает qty×unit_price и totals/order, распределяет discount пропорционально стоимости строк без промежуточного округления. По category суммируются gross/discount, distinct order_id считаются через sets, net=gross−discount; сортировка ASCII ASC. Полная ручная таблица 3×5 создана независимо до native. Фактический Python runtime/version записан в provenance; готовый native CSV в oracle не используется.

## Фактический native reference

Saved Unit_0/Info.xml задаёт Name=Unit1; граф — ZIP member Unit_0/Unit.xml. Наблюдаются 14 native узлов и 14 data links — описание принятого reference, не требования к числу/именам узлов или внутренней композиции. JavaScript и готовые ответы не подставлены.

1. «Заказы» / «Строки заказов» — TBGImportTextFile. Читают PRIVATE_STORAGE и PRIVATE_STORAGE Строковые ключи/category сохранены, qty integer, цены/скидки real; UTF-8/`;`/header/decimal-dot/empty-NULL.
2. «Стоимость строки» — TBGCalcData, line_gross=`qty * unit_price` (dtFloat).
3. «Стоимость заказа» — TBGGroupDataEngine: order_id utGroup, line_gross gdSum; output mapping line_gross_Sum→order_gross.
4. «Стоимость заказа в строках» — TBGJoinDataEngine INNER/jtJoin по order_id: полные строки со стоимостью в MainDataSource, один total/order в JoinedDataSource.
5. «Скидка заказа в строках» — TBGJoinDataEngine INNER/jtJoin по order_id: предыдущие строки в MainDataSource, orders в JoinedDataSource. INNER сохраняет все строки при гарантированных PK/FK и положительных totals.
6. «Доля скидки строки» — TBGCalcData, line_discount=`order_discount * line_gross / order_gross` (dtFloat), без округления.
7. «Чистая выручка строки» — TBGCalcData, line_net=`line_gross - line_discount` (dtFloat).
8. «Заказ и категория» — TBGGroupDataEngine: order_id/category utGroup/Order0/1, line_gross/line_discount/line_net gdSum. Mappings line_gross_Sum→order_category_gross, line_discount_Sum→order_category_discount, line_net_Sum→order_category_net. line_id не ключ группировки. Одна строка на (order_id,category) устраняет повторный подсчёт заказа.
9. «Выручка по категориям» — TBGGroupDataEngine: category utGroup; order_id gdCount, три order_category меры gdSum. Mappings order_id_Count→orders (dtInteger); order_category_gross_Sum→gross_revenue, order_category_discount_Sum→allocated_discount, order_category_net_Sum→net_revenue (dtFloat).
10. «Категории по возрастанию» — TBGSortingEngine: category ASC, LocaleAware=false.
11. «Формат денежных полей CSV» — TBGCalcData после всей арифметики. gross_text/discount_text/net_text — dtString; Str/Replace нормализуют точку, Find/Count/Concat дополняют отсутствие дробной части до .00 или одну цифру до двух. Остальные цифры сохраняются; промежуточных округлений и изменения денежной математики нет.
12. «Пять колонок CSV» — TBGReformColumnsEngine исключает исходные real money поля; output mappings gross_text→gross_revenue, discount_text→allocated_discount, net_text→net_revenue. category и integer orders сохранены.
13. «Итоговый CSV» — TBGExportTextFile: PRIVATE_STORAGE UTF-8, `;`, заголовки ctUseColumnNames, decimal-dot, double-quote text qualifier. Единственный экспорт содержит ровно пять заданных колонок.

Связи: «Строки заказов»→«Стоимость строки»; от неё две ветви к «Стоимость заказа» и MainDataSource первого join, total→JoinedDataSource того же join. Первый join→MainDataSource второго, «Заказы»→JoinedDataSource второго. Далее единая цепь: второй join→скидка строки→net строки→(order_id,category)→category→sort→формат money→Reform→экспорт. Это actual graph, эквивалентные штатные композиции допустимы.

## Полный результат и принятые проверки

Одна строка на category, CAT_A/CAT_B/CAT_C ASCII ASC. Все 15 ячеек сопоставляются по точным именам колонок с допуском ±0.001; порядок колонок свободен. Все 3 orders — целые без дробной части; все 9 money — не менее двух цифр после точки, с точностью допуска. Шесть знаков gold не задают минимальную точность.

```csv
category;orders;gross_revenue;allocated_discount;net_revenue
CAT_A;2;32.000000;6.666667;25.333333
CAT_B;2;37.000000;6.000000;31.000000
CAT_C;1;1.000000;0.333333;0.666667
```

O01/O02 содержат повтор CAT_A; order/category свёртка сохраняет distinct orders. У O02 три равных строки, поэтому промежуточное округление частей скидки до центов меняет итог сильнее допуска. O03 с нулевой скидкой сохранён. Полная скидка не повторяется на каждой строке; net вычитает распределённую скидку.

Actual A1 принят: 878s, observed1/allowed3, 58tools/53Loginom/2toolErrors/0memory; исходные ошибки и safe recovery описаны в provenance без raw SDK logs. Единственный Save#44 SUCCEEDED, reopened=false/persisted_content_verified=false; arrangement attempted/result_unconfirmed/warning=true сохранён. Последующий CLI readback не является отдельным browser cold и не меняет Save receipt.

Accepted actual browser cold: точный saved package, single park→новый полный CSV, все ветви выполнены, server LGP и оба raw неизменны, Configure/Save не вызывались, закрытие без Save/logout/own-tab close/post-idle подтверждены; check-rerun PASS. Native и cold independently APPROVE/root FULLREAD; offline finalization переиспользует эти доказательства. G05 calibration, sole D+B и приёмка пары pending; мутанты native/cold не исполнялись.
