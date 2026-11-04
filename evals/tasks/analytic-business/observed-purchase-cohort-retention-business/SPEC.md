# Когортное удержание из наблюдаемых покупок

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

## Задача и происхождение данных

Одна строка на наблюдаемую пару (cohort_month, age_month) календаря: фиксированный размер когорты, разные активные клиенты и доля удержания. Detailed/business разделяют входы, определения, rubric, tolerance и oracle; подробная форма раскрывает способ расчёта.

Данные полностью синтетические, созданы eval author: purchase_lines.csv содержит 11 строк продаж, cohort_calendar.csv — 6 строк календаря. Оба raw заморожены до независимого ручного gold и oracle. Это не UCI, реальные покупки или производный снимок; внешние datasets/пакеты/сторонние лицензии не использованы, лицензия репозитория — MIT.

purchase_lines(invoice_id, customer_id, purchase_timestamp, qty, amount) имеет зерно строки продажи: invoice_id повторяется и не является PK, отдельного регистра клиентов нет. Только customer_id может быть пустым. Ключи ASCII с учётом регистра; qty — знаковое целое, amount — неотрицательная сумма строки с двумя знаками после точки. Нули и отрицательная qty намеренно сохранены. cohort_calendar(cohort_month, age_month, activity_month, observed) имеет PK(cohort_month, age_month); age_month целое 0–2, observed целое 0/1; activity_month равен cohort_month плюс возраст в календарных месяцах. Все календарные когорты имеют положительный размер.

Timestamp локальный Europe/Moscow, YYYY-MM-DD HH:MM:SS, без преобразования зоны. Январь/февраль 2026 полностью наблюдаются; март/апрель не наблюдаются. Входы UTF-8, `;`, заголовок, десятичная точка, двойная кавычка как текстовый ограничитель.

Независимый Python stdlib csv/datetime/Decimal/defaultdict oracle отбирает допустимые raw-строки, строит множества месяцев каждого клиента, минимальный месяц когорты и множества её клиентов. Для observed=1/age0–2 считает разных активных клиентов и делит на фиксированный размер без промежуточного округления. Полная ручная таблица 3×5 создана до native; native CSV не используется для расчёта oracle. Actual Python runtime/version записан в provenance.

## Фактический native reference

Unit_0/Info.xml задаёт Name=Unit1; граф — Unit_0/Unit.xml. Наблюдаются 16 native компонентов и 17 data links. Это описание принятого reference, а не требования к именам, числу узлов или внутреннему графу эквивалентного решения. JavaScript и готовые итоговые значения не подставлены.

1. «Строки покупок» — TBGImportTextFile: PRIVATE_STORAGE invoice/customer/timestamp dtString, qty dtInteger, amount dtFloat. UTF8/semicolon/decimaldot/empty-NULL.
2. «Календарь наблюдения» — TBGImportTextFile: PRIVATE_STORAGE cohort/activity month dtString, age/observed dtInteger; те же CSV-параметры.
3. «Допустимые покупки» — TBGFilterDataEngine: AND customer_id isNotNull и notEqual empty, qty>0, amount>0, invoice_id notStartingWith C с CaseSensitive=true. Все условия применены до когорт и активности; проходят 6 строк. C00/I09 не сдвигают когорты в декабрь; I06/I07/I08 исключены.
4. «Месяц покупки» — TBGCalcData: activity_month=Left(purchase_timestamp, 7), dtString. На данном ISO-формате минимум месяца эквивалентен месяцу минимального timestamp; часовой пояс не меняется.
5. «Уникальная активность клиента» — TBGGroupDataEngine: customer_id/activity_month utGroup Order0/1. invoice_id gdCount даёт invoice_id_Count→line_count (dtInteger), лишь вспомогательное число строк. Выход: C01/Jan, C02/Jan, C03/Feb с line_count 3/1/2; это не числитель удержания.
6. «Первая допустимая покупка» — TBGGroupDataEngine: customer_id utGroup, activity_month gdMin; activity_month_Min→cohort_month. Одна строка на каждого из трёх клиентов.
7. «Размер когорты» — TBGGroupDataEngine: cohort_month utGroup, customer_id gdCount; customer_id_Count→cohort_size. Фиксированные Jan2/Feb1 рассчитаны по реестру клиентов.
8. «Активность по когортам» — TBGJoinDataEngine INNER/jtJoin по customer_id: unique customer-month слева, единственная когорта клиента справа. Получаются три строки активности.
9. «Активные клиенты месяца» — TBGGroupDataEngine: cohort_month/activity_month utGroup Order0/1, customer_id gdCount→active_customers. line_count не используется в агрегировании; Jan/Jan2, Feb/Feb1.
10. «Полностью наблюдаемые периоды» — TBGFilterDataEngine: observed=1 AND age_month between 0..2; сохраняются Jan0/Jan1/Feb0, все три будущие строки excluded.
11. «Календарь и размер когорты» — TBGJoinDataEngine INNER/jtJoin по cohort_month: календарь слева, размеры справа. INNER сохраняет полный наблюдаемый календарь при гарантированно положительных когортах; Jan size2 сохраняется в обоих возрастах.
12. «Календарь и активность» — TBGJoinDataEngine default LEFT: календарь+size слева, active_customers справа, ключи cohort_month и activity_month вместе. Jan1 остаётся с NULL активностью.
13. «Нулевая активность и удержание» — TBGCalcData: active_customers=NVLF(active_customers, 0), dtInteger/Replaced=true; retention=NVLF(active_customers, 0) / cohort_size, dtFloat. Доля без округления; Jan1=(2,0,0), NULL в результате нет.
14. «Пять итоговых показателей» — TBGReformColumnsEngine: исключает activity_month/observed, сохраняет cohort_month, age_month, cohort_size, active_customers, retention.
15. «Сортировка когорт и возраста» — TBGSortingEngine: cohort_month ASC, age_month ASC численно (dtInteger), LocaleAware=false.
16. «Итоговый CSV удержания» — TBGExportTextFile: PRIVATE_STORAGE один UTF8 CSV, `;`, ctUseColumnNames, decimaldot, двойная кавычка как текстовый ограничитель; LF/noBOM подтверждены actual CSV.

Связи: purchase import→eligibility→month→unique customer-month; от unique идут первая покупка и левая ветвь join активности. Первая покупка питает размер когорты и правую ветвь join активности; join→active count. Calendar import→observed filter→левая ветвь calendar-size join; cohort size→его правая ветвь. Calendar-size→левая ветвь calendar-activity join, active count→правая. Далее NVLF/retention→Reform→sort→sole export. Оба ключа последнего join сохраняют зерно и наблюдаемый ноль.

## Полный результат и принятые проверки

Ровно три строки и пять колонок; порядок cohort_month, затем числовой age_month. Колонки сопоставляются по точным именам, их порядок свободен. Все 15 значений сверяются с абсолютным допуском ±0.001 для чисел. Все 9 age_month/cohort_size/active_customers — неотрицательные целые без дробной части/тысяч. retention — доля 0–1 без дополнительного минимума знаков после точки; пустых значений/NULL нет.

```csv
cohort_month;age_month;cohort_size;active_customers;retention
2026-01;0;2;2;1
2026-01;1;2;0;0
2026-02;0;1;1;1
```

Повтор I01 и несколько чеков I01/I02 клиента C01 не увеличивают людей; I04/I05 клиента C03 дают одного клиента. Наблюдаемый Jan1 сохраняется с нулём, будущие периоды отсутствуют. Когорта означает первую допустимую покупку в предоставленном файле, а не первую покупку за жизнь.

A1 принят: CLI0/980s/observed1 из budget3, confirmed openai/gpt-6-sol/xhigh; 52tools/43Loginom/0toolErrors/0memory. История исправления сохранена: exec13 дал NULL retention для Jan1 из обращения к исходному полю; fix-retention-null на том же узле, exec14 и сохранённый XML подтверждают NVLF в самой формуле retention. Это не новая CLI попытка и не tool error.

Save save-cohort-package SUCCEEDED/save_completed=true/workflow_preserved=true/cleanup_complete=true/modified=false; receipt persisted_content_verified=false сохранён, actual persisted XML проверен отдельно. Arrangement warning result_unconfirmed не подтверждает раскладку и не меняет предметный контракт. Запрошен standard/default без fast alias; response service tier NOT_OBSERVED, speed NOT_MEASURED.

Accepted browser cold D1: один park прежнего CSV, точный saved LGP, toolbar «Выполнить все» выполнил все 16 узлов; предыдущее F9 с предупреждением выбора не заявлено исполнением. Новый полный CSV/check-rerun PASS, actual server LGP SHA/stat и оба raw unchanged; Configure/Save не вызывались. NoSave→Home→logout→own ownTab[private] closed. Cold idle переиспользует post-A1 при отсутствии последующих profile calls; нового live status нет. Native34/cold29 independently APPROVE/root FULLREAD; эти доказательства переиспользуются.

Public финализация является offline-подготовкой. Mutants native/cold не исполнялись, judge/calibration/sole D+B и итоговая приёмка P17 pending; Benchmark status/close остаётся отдельным блокером.
