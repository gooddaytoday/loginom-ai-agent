# Кросс-таблица: перенастройка суммы в среднее

Независимый oracle.py использует csv и Decimal; рассчитан до builder-попыток. Единственный вход — data/sales.csv. Модель получает только prompt и этот CSV и сама создаёт текстовый импорт; reference/SPEC/oracle ей не передаются.

Обязателен граф TBGImportTextFile → TBGCrossTabEngine → TBGExportTextFile. Ровно одна Кросс-таблица, категории fixed. Region: utActive/dtString; Category: utGroup/dtString; Amount: utValue/числовой тип (dtFloat или dtInteger), единственный конечный агрегат avg. Скользящий режим сохраняется как SlidingUniqueValues=true; отсутствие флага означает fixed. Sum/avg сохраняются как ctatSum/ctatAvg в TBGCrossTabColumnDefExtension. Выгрузка UTF-8, запятая, CaptionType=ctUseColumnNames. Вспомогательная сортировка допустима.

Полный свежий результат сравнивается по именам колонок с tolerance=0; порядок строк обязателен, колонки могут переставляться. Без лишних строк/колонок:

```csv
Region,A,B
N,7.5,7
S,3,2
```

Код проверяет XML из реального package.lgp и совпадение unpacked XML, неизменённые input bytes по native upload receipt, завершённые execute/read, native экспорт с совпадением bytes/SHA256 и save после чтения/экспорта. Неполное/неверное доказательство — FAIL, ошибка инфраструктуры/cleanup/валидатора — ERROR. --skip-judge не означает PASS; вердикт находится в code-verdict.json.

Reference принят через modelConfirmed по БД сессии, input bytes, CLI graph/CSV check, cold rerun в отдельном браузерном контексте и finalize. Provenance содержит SHA256 и gates. Model builder openai/gpt-6.1-sol/xhigh; evaluated model отдельно openai/gpt-6-sol/default. Судья, калибровка, пороги не используются.

## Обязательная последовательность

В той же попытке первоначально создать fixed/sum, завершить выполнение и прочитать ВСЕ строки/ячейки начальной таблицы. Ожидание initial-oracle.csv рассчитано независимым oracle.py до builder. Только после подтверждённого полного чтения менять тот же {document_id,workflow_id,node_id} на fixed/avg. Завершить новую execution с иным execution_id, полностью прочитать конечную таблицу, экспортировать её и сохранить пакет. Native sample допускается как полная таблица только при sample_complete=true, sample_rows=row_count и подтверждённой точности; усечённая выборка не доказательство. Отдельный dock_node_read тоже допустим при завершённом source_operation_id, свежем выполнении и неизменной идентичности. Полные JSONL tool-parts дедуплицируются по ID, wait/resume сопоставляется по operation_id. Ошибочная или неуспешная промежуточная попытка конфигурации не заменяет успешную стадию.

Начальная таблица:

```csv
Region,A,B
N,15,7
S,3,2
```
