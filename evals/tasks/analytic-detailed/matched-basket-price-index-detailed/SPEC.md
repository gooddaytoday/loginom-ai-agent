# Индекс цен на сопоставимой товарной корзине

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

## Задача и данные

Одна строка на category исходной базовой корзины: число базовых и сопоставимых SKU, покрытие базовой выручки, две стоимости фиксированной корзины и индекс с базой 100. D/B разделяют raw, общий контракт, rubric, tolerance и oracle; подробная форма раскрывает расчёт.

Данные полностью синтетические, созданы eval author: sales_lines.csv содержит 13 строк продаж, замороженных до отдельного полного ручного gold и независимого oracle. Это не UCI, реальные продажи или производный снимок; внешние datasets/пакеты/сторонние лицензии не использованы, лицензия репозитория — MIT.

sales_lines(sku,category,timestamp,qty,amount) имеет зерно строки продажи, SKU не PK. Категория каждого SKU постоянна; все поля непустые, без NULL, ключи ASCII с учётом регистра. qty — целое неотрицательное количество, amount — неотрицательная выручка строки с двумя десятичными знаками. Допустимы только qty>0 AND amount>0; обе нулевые текущие строки A03 исключены. Вход UTF-8, «;», заголовок, decimal dot, двойная кавычка как текстовый ограничитель.

Timestamp локальный Europe/Moscow, YYYY-MM-DD HH:MM:SS, без timezone conversion. Base=[2026-01-01 00:00:00,2026-04-01 00:00:00),current=[2026-04-01 00:00:00,2026-07-01 00:00:00); начало входит, конец нет. Строки Dec31/Jul1 вне интервалов исключены.

Независимый Python stdlib csv/datetime/Decimal/dicts oracle читает только raw, накапливает qty/revenue каждого SKU/квартала, пересекает SKU, переоценивает фиксированные базовые количества и отдельно сохраняет всю исходную базовую выручку. Полная ручная таблица 2×7 создана после raw freeze и до oracle/native; native CSV не используется для oracle. Runtime/version записан в provenance.

## Фактический native reference

Unit_0/Info.xml задаёт Name=Unit1; граф — Unit_0/Unit.xml. Наблюдаются 16 native узлов и 17 data links. Это описание принятого reference, не требования к именам/числу узлов или внутренней композиции эквивалентного решения. JS/scripts/готовых подставленных ответов нет.

1. Import762f5cdc — TBGImportTextFile: PRIVATE_STORAGE sku/category dtString, timestamp dtDateTime,qty dtInteger,amount dtFloat; UTF8/semicolon/decimaldot,DateFormat yyyy/mm/dd/DateSeparator -,empty-NULL.
2. Base filter0fddf120 — TBGFilterDataEngine: timestamp≥Jan1 AND timestamp<Apr1 AND qty>0 AND amount>0; пять допустимых базовых строк.
3. Current filter1f732e8e — TBGFilterDataEngine: timestamp≥Apr1 AND timestamp<Jul1 AND qty>0 AND amount>0; четыре текущие строки.
4. Base SKU6df7b1d1 — TBGGroupDataEngine: sku/category utGroup Order0/1,qty/amount gdSum; qty_Sum→base_qty(dtFloat),amount_Sum→base_amount(dtFloat).
5. Current SKU7b6aebdf — TBGGroupDataEngine: те же ключи/sums; qty_Sum→current_qty,amount_Sum→current_amount(dtFloat).
6. Base categoriesba85809b — TBGGroupDataEngine по category: sku gdCount→base_skus(dtInteger),base_amount gdSum→base_revenue(dtFloat); независимая полная базовая registry, base-only ассортимент не теряется.
7. Intersection83b0e8d9 — TBGJoinDataEngine INNER/jtJoin по sku И category: две SKU-таблицы, только A01/A02.
8. Prices8b07b5ea — TBGCalcData: base_price=base_amount/base_qty,current_price=current_amount/current_qty; выручка на суммарную единицу, не среднее цен строк.
9. SKU costs61a0ec4c — TBGCalcData: sku_base_cost=base_qty*base_price,sku_current_cost=base_qty*current_price; обе стоимости в одних фиксированных базовых количествах.
10. Matched categoriesfe4c38cc — TBGGroupDataEngine по category: sku gdCount→matched_skus; sku_base_cost/sku_current_cost/base_amount gdSum→basket_base_cost/basket_current_cost/matched_revenue. Для CAT_A matched count2,costs70/80,matched revenue70.
11. Full registryf495eeb3 — TBGJoinDataEngine default LEFT по category: base registry слева, matched aggregate справа. CAT_B сохраняется с joined NULL; current-only CAT_C не попадает в основание.
12. Metrics3ccbd69d — TBGCalcData: coverage=NVLF(matched_revenue,0)/base_revenue; price_index=100*basket_current_cost/basket_base_cost. matched_skus=NVLF(matched_skus,0),costs=NVLF(costs,0),Replaced=true. Index использует исходные nullable joined inputs: у CAT_B он остаётся NULL, а не фиктивным нулём; это подтверждено native readback и CSV.
13. Money textfb7b76d7 — TBGCalcData после арифметики: Replace(Str(cost),",",".") и IF/Find/Count/Concat добавляют .00 или недостающий второй знак, остальные цифры сохраняются. Только окончательный формат, без промежуточного округления.
14. Reform6b5d3c95 — TBGReformColumnsEngine сохраняет семь контрактных колонок; base_cost_text/current_cost_text mapped в basket_base_cost/basket_current_cost(dtString),лишние служебные поля исключены.
15. Sort8e14e776 — TBGSortingEngine: category ASC,LocaleAware=false; counts dtInteger сохраняются.
16. Exportb136356a — TBGExportTextFile: PRIVATE_STORAGE sole UTF8 CSV,semicolon,ctUseColumnNames,decimaldot,empty-NULL,double-quote qualifier; LF/noBOM проверены actual CSV.

Связи: import→оба фильтра→две SKU grouping. Base SKU→полная category registry и левая ветвь INNER intersection; current SKU→правая. Intersection→prices→fixed costs→matched category aggregate. Registry→LEFT main,matched aggregate→LEFT joined. Далее metrics→money text→Reform7→ASCII sort→sole export. Полная registry и исходный base_revenue отделены от пересечения, coverage не делится на matched revenue.

## Полный результат и проверки

Ровно CAT_A,CAT_B в ASCII ASC; семь точных имён, колонки сопоставляются по именам, порядок колонок свободен. Все 14 ячеек проверяются с абсолютным числовым допуском ±0.001; четыре счётчика — целые неотрицательные без дроби/тысяч, четыре money — не менее двух цифр после точки. Coverage доля0–1,index база100; дополнительного minprecision/запрета scientific notation нет. Единственная пустота — CAT_B.price_index,не0/NULL.

```csv
category;base_skus;matched_skus;base_revenue_coverage;basket_base_cost;basket_current_cost;price_index
CAT_A;3;2;0.4117647058823529411764705882;70.000000;80.000000;114.2857142857142857142857143
CAT_B;1;0;0E+2;0.000000;0.000000;
```

CAT_A: базовые A01/A02/A03,сопоставимые A01/A02. Baseqty3/2,prices10/20→20/10,full base revenue170,matched70; coverage7/17,costs70→80,index800/7. Новые A04/current-only CAT_C исключены из сопоставимой корзины. CAT_B: base_skus1,matched0,coverage0,costs0/0,index пуст. Текущие qty1/8 не заменяют базовые веса; обе invalid A03 строки не создают match.

Actual A1 принят: CLI0/1060s/used1of3,confirmed openai/gpt-6-sol/xhigh;51tools/42Loginom/0toolErrors,official memoryToolCalls0. Пять readonly knowledge calls и три bundled file reads не объявляются отсутствием чтения; записывающих memory/knowledge tools в actual events нет. Запрошен STANDARD/default; response tier NOT_OBSERVED,speed NOT_MEASURED.

Original Save#50 SUCCEEDED/save_completed/workflow_preserved/modified=false,но reopened=false/persisted_content_verified=false/arrangement attempted-result_unconfirmed-warning сохранены. Собранные LGP/XML и CSV проверены отдельно; success Save не заменяет content proof. Original Close/logout и оба managed/Knowledge ACK+actual exit0/postidle подтверждены native actual review.

Accepted cold D1: один park,new inode CSV,one toolbar Execute all,все16native grey→green/47active ports; server LGP/raw SHA+stat unchanged. Configure/Save не вызывались; NoSave→Home→logout→own ownTab[private] closed,final IAB inventory empty,postidle/config unchanged. Новый полный CSV/check-rerun PASS,4integer4money/soleempty подтверждены независимо. Operational A/storage.json обновлён collect --rerun, исходные native bytes сохранены S/native-storage.json/QA pointer; эта история не переписана.

Native33/cold30 independently APPROVE/root FULLREAD; offline public финализация переиспользует эти доказательства. Native mutants не исполнялись; judge/group calibration/sole D+B и итоговая приёмка P23 pending до всех G06 prerequisites. P17 ONLY-B остаётся group-gate conditional, отдельный ONLY-B P23 не требовался.
