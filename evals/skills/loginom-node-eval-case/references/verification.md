# Проверка и финализация

## Обязательные доказательства

Пакет и CSV проверять existing node validator на точном attempt evidence.
`check_reference.py <case> <package.lgp> [result.csv]` — самостоятельная read-only
проверка графа и CSV через compareCsv выбранного AGENT_REPO; exit 0/1/2 означают
pass/несоответствие/ошибку проверки. Она не доказывает создание, исполнение,
последовательность или native mask.

Переходы подтверждать событиями одного свежего запуска и identity узла: исходное
применение, первое исполнение/read, требуемое изменение и финальное исполнение/read,
экспорт/сохранение. Реальный полный sample допустим, только если действующий API и
валидатор подтверждают полноту и точные значения; не придумывать coverage=full.
Для смены CSV сохранить исходный source_operation_id, новую execution/schema,
требуемую неизменность узла и отсутствие запрещённого re-apply.
Нативные mask/roles читать из собственных подтверждённых native observations,
с source/line/hash; не вычислять маску из имён агрегатов или заменять её текстовым receipt.

Проверять чувствительность на собственных копиях: неверный агрегат/режим/CSV,
подменённый узел, пропущенное создание/первое чтение, нарушенный переход,
отсутствующий пакет/обязательный receipt/native proof. Состав соответствует кейсу.
Мутация необязательного промежуточного события может остаться PASS; повреждать
последнее обязательное доказательство и сохранять positive baseline.

## Cold rerun

Использовать текущий COLD-RERUN runbook назначенного runtime. Если его нет локально:

1. Подтвердить собственный допуск, фактический container ID, пустое выделенное
   хранилище, отсутствие других клиентов и собственный ledger будущих файлов.
2. Прочитать пути импорта/экспорта из точного reference Unit.xml. Записать хэши пакета
   и соответствующих конечному состоянию inputs, отсутствие output до запуска.
   Положить только эти input и копию пакета, проверив их байты. Пакет не переписывать.
3. В доступном браузерном MCP открыть копию, выполнить сохранённый граф, дождаться
   терминального выполнения. Не настраивать узел заново. Собрать новый output,
   проверить его по независимому oracle и граф через check_reference.py.
4. Закрыть собственный браузер/пакет и удалить только файлы ledger после сверки
   текущих хэшей/принадлежности. Подтвердить чистое хранилище и отсутствие клиентов.

Cold проверяет только сохранённое состояние. Историю sum→avg или initial→updated
CSV подтверждает свежий событийный validator, а не cold. При source refresh последний
CSV в XML достаточен для cold; исходный CSV всё равно остаётся обязательным в истории.

## Последовательный gate финализации

Пройти все пункты перед переносом черновика:

1. Сверить исходные input/oracle/task хэши и собственный независимый расчёт.
2. Получить PASS check-node-artifacts на точной builder-попытке, включая требуемое
   native evidence, и static graph/CSV check. Не исправлять oracle под выгрузку.
3. Подтвердить actual model/variant по assistant messages собственной архивной БД
   session_id с учётом WAL/SHM. Архив находится в confirmed profile_history stage
   cleanup.json. Пользоваться read-only SQLite/Python, сохранять только session/model/
   variant и хэш доказательства, приватную БД не публиковать. Requested config не доказательство.
4. Подтвердить cold graph/CSV, terminal run, browser close и ledger cleanup.
5. Скопировать именно проверенный artifact/package.lgp в reference.lgp. Сохранить
   раздельное provenance: oracle — программа/входы/все ожидаемые результаты/хэши;
   reference — builder attempt и бюджет, session/actual model, CLI/harness SHA,
   product skill revision/action manifest, package hash, code checks, cold/cleanup
   и реальные пути evidence. Не смешивать revision этого skill с revision продукта.
6. Сверить хэши источника/назначения, повторить offline checks на доставляемом evidence,
   уточнить SPEC по XML и загрузить итоговую коллекцию через существующий loadTasks.
   Одна загрузка файлов или warning-free collection не заменяет предыдущие проверки.

Затем автор/приёмщик выполняет свой один fresh node eval на точном срезе:

```sh
bun "$AGENT_REPO/evals/script/run-node-evals.ts" --only "$CASE_ID" --tasks "$FINAL_COLLECTION"
bun "$AGENT_REPO/evals/script/check-node-run.ts" "$PRODUCT_RUN_DIR" "$CASE_ID" "$FINAL_COLLECTION"
```

Проверить синтаксис текущих script entrypoints в назначенном checkout; команды
не задают модели/таймаут, используются согласованные EVAL_* настройки product профиля.
Code verdict PASS/FAIL/ERROR и cleanup сохраняются независимо от ACCEPT/REJECT/BLOCKED.
Product FAIL с корректным измерением и подтверждённой очисткой допустим для ACCEPT.
Штатный infra retry fresh runner сохраняется; внешних повторов ради PASS не делать.

Evidence содержит команды, exact SHA, безопасные relative paths, SHA256/manifest,
независимый расчёт, позитивы/негативы, actual models, code/cold/live и cleanup.
Runtime-local путь не заменяет доставку. Работник сообщает итог по действующему
операционному контракту; этот skill не публикует комментарии и не меняет карточку.
