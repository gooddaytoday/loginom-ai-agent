Кросс-таблица: только min и max

Oracle рассчитан до builder oracle.py из точного CSV через Decimal; отдельно min/max для каждой пары Region/Category. Числовой допуск 0, строки N затем S.

Один UTF-8 CSV import: Region/Category — строковые дискретные, Amount — вещественный непрерывный. Одна fixed CrossTable: Region row key, Category column dimension, единственный факт Amount; точный набор функций {min,max}, native mask 12 (4|8), отсутствие sum и иных функций. XML и native configure/readback должны совпасть. NULL/Other/variables запрещены.

Собственный выход CrossTable: Region,A_min,A_max,B_min,B_max. Verified native output mapping принадлежит этому document/workflow/node/port; каждый source record уникален, входит в полный source inventory, сохраняет type и соответствует native category/fact/function. Полный fresh schema/category_fields доказывает A/B × min/max, с real типами. CSV/Export renaming само по себе недостаточно. XML сохраняет собственное mapping, source identity проверяется через native readback.

Граф import → CrossTable → опциональная сортировка → CSV export. Полный exact native read и sample_complete, coverage/bytes/binding; fresh export и final save после read/export. Негативы: пропущенная/подменённая функция, extra sum/mask13, swapped min/max source, foreign/incomplete mapping, неверный category/type, stale/partial read, неверный CSV и missing artifact.
