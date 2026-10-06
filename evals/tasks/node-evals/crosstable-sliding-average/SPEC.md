# Кросс-таблица: скользящие категории и среднее

Независимый oracle.py использует csv и Decimal; рассчитан до builder-попыток. Единственный вход — data/sales.csv. Модель получает только prompt и этот CSV и сама создаёт текстовый импорт; reference/SPEC/oracle ей не передаются.

Обязателен граф TBGImportTextFile → TBGCrossTabEngine → TBGExportTextFile. Ровно одна Кросс-таблица, категории sliding. Region: utActive/dtString; Category: utGroup/dtString; Amount: utValue/dtFloat, единственный агрегат avg. Скользящий режим сохраняется как SlidingUniqueValues=true; отсутствие флага означает fixed. Sum/avg сохраняются как ctatSum/ctatAvg в TBGCrossTabColumnDefExtension. Выгрузка UTF-8, запятая, CaptionType=ctUseColumnNames. Вспомогательная сортировка допустима.

Полный свежий результат сравнивается по именам колонок с tolerance=0; порядок строк обязателен, колонки могут переставляться. Без лишних строк/колонок:

```csv
Region,A,B
N,7.5,7
S,3,2
```

Код проверяет XML из реального package.lgp и совпадение unpacked XML, неизменённые input bytes по native upload receipt, завершённые execute/read, native экспорт с совпадением bytes/SHA256 и save после чтения/экспорта. Неполное/неверное доказательство — FAIL, ошибка инфраструктуры/cleanup/валидатора — ERROR. --skip-judge не означает PASS; вердикт находится в code-verdict.json.

Reference принят через modelConfirmed по БД сессии, input bytes, CLI graph/CSV check, cold rerun в отдельном браузерном контексте и finalize. Provenance содержит SHA256 и gates. Model builder openai/gpt-6.1-sol/xhigh; evaluated model отдельно openai/gpt-6-sol/default. Судья, калибровка, пороги не используются.
