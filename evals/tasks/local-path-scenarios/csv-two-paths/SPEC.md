# Продажи из двух локальных путей

Агент получает два CSV только путями внутри каталога попытки (`input_mode: paths`).
У обоих файлов basename `sales.csv`; пробелы, кириллица, `#` и `%` находятся в каталогах.
Первый файл содержит Alpha=10/Beta=20, второй — Alpha=7/Gamma=5. Вложения не передаются.

Фактический reference построен candidate CLI из `bbd2e1af7d`, Loginom 7.4.2.
В `Unit_0/Unit.xml` шесть узлов и пять табличных связей:

- «Продажи Первый» и «Продажи Второй»: `TBGImportTextFile`, разные подтверждённые серверные copies. UTF-8, запятая, Category — строка, amount — integer.
- «Объединение продаж»: `TBGUnionDataEngine`, два входа, явное сопоставление Category и amount обоих источников. Все четыре строки сохраняются.
- «Сумма по Category»: `TBGGroupDataEngine`, Category имеет UsageType=utGroup; amount — utValue с GroupFunctions=gdSum.
- «Category по возрастанию»: `TBGSortingEngine`, ключ Category, ASC, LocaleAware=false.
- «Итог CSV»: `TBGExportTextFile`, UTF-8, запятая, CaptionType=ctUseColumnNames, десятичная точка.

Связи: оба импорта → объединение → сумма по Category → сортировка → экспорт.
Имена upload copies и итоговых файлов назначаются текущим запуском и не являются критерием аналитического графа.
SHA обоих переданных источников связан с relative path, admission, grant, upload operation и фактическим FileName импорта.

Ожидаемый результат, с точными строками и именами колонок:

```csv
Category,amount
Alpha,17
Beta,20
Gamma,5
```

`oracle.py` независимо читает оба исходника через csv.DictReader и суммирует числа стандартной библиотекой Python.
Числовой допуск — 0; порядок строк точен. Общая сверка harness сопоставляет колонки по именам.
CLI-выгрузка и отдельная выгрузка после холодного открытия через browser MCP совпали с oracle.
При cold rerun все шесть узлов имели активное состояние; пакет закрыт без сохранения.
