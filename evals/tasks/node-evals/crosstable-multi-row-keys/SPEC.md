Кросс-таблица: два ключа строк

Вход и prompt — точные байты исходного manifest LAB-26. Oracle рассчитан до builder скриптом oracle.py: csv.DictReader, Decimal, группировка по (Region, Month, Category), сумма; порядок ключей Region затем Month, строки в лексикографическом порядке пар.

Один UTF-8 CSV import: Region/Month/Category — dtString, dkDiscrete; Amount — dtFloat, dkContinuous. Одна fixed CrossTable: row keys Region затем Month, Category как единственное измерение колонок, единственный Amount с sum, без NULL/Other/variables. XML и verified native readback сохраняют роли и порядок; полный fresh native read содержит оба текстовых ключа и категории A/B. Реальный граф import → CrossTable → (опционально Sorting) → CSV export; ручные таблицы и другие helpers запрещены.

Числовой допуск 0. Oracle проверяет все строки и колонки, порядок колонок допускается любой. Полный read требует sample_complete, полного покрытия и exact native bytes с owner/port/execution binding. Export должен иметь fresh absence/execution/hash proof и завершённый package.save_checkpoint после final read/export.

Негативы: потеря/перестановка Month, перенос Month в categories/facts, integer Amount, неверный агрегат/режим, stale/partial read, подменённые input bytes, неверный CSV/отсутствующий LGP и потеря fresh creation.
