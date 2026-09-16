# Узел13: terminal failure R2 интегрирован и проверен

Назначение `node13:r2-integration:1:47830abe656d8a5abed35e27ee4ca54fb8d46bb4e5b45ce4f47b2b6dc833a182`.
Координатор передал прямое разрешение пользователя на этот точный перенос и
живую проверку test-3. Исходный HEAD `c4d9c9354b8ff74d019c8ffb214397301b5a35d8`;
ветка `codex/node-13-date-time`, прежняя задача/worktree. Hermes не запускался.

## Точный перенос

Применён только [terminal-failure.patch](transfers/node13-r2/terminal-failure.patch)
SHA256 `47830abe656d8a5abed35e27ee4ca54fb8d46bb4e5b45ce4f47b2b6dc833a182`:
11 файлов/18 hunks из `a63586fe096f4fd7f17f346c391834d3e34bdaa4`, подготовленных
на target `7d7f0bc2a23c8db5d57fbeb9ceb57d3a8ca29907`.

Повторно сверены source/parent/target/HEAD blobs, SHA256 патча, отсутствие изменений
его целевых файлов и git apply --check (exit0). Затем выполнен один git apply.
После применения добавленные/удалённые строки всех11 файлов побайтово сверены с
подготовленным пакетом. Mixed commit целиком не переносился, cherry-pick/merge нет.
Missing-values schema/readback, input-mapping recovery и новый placement fix14
не включались. Собственные configure recovery13 и manual output сохранены.
Исходный transfer manifest остаётся историческим документом подготовки без
применения; факт последующей разрешённой интеграции фиксируется этим отчётом.

## Живой тест и доказательство ошибки

Сеанс `aa03cb93-8df3-4b1c-808e-6a13e835caf4`, runtime
`2488fdaa08e4d6da9b7a31fb7598f675a8ad972efd65640b34cbc851feb16e2b`.
Loginom7.4.2/test-3, visible Chromium, viewport=null, native окно1508×949,
страница1508×862. Диагностический candidate-каталог прежний; это не финальный admission.

Собственная копия `/test-3/N13-aa03cb93.lgp` создана из принятого manual baseline
`/test-3/N13-bafafea6.lgp`. Базовый public node13-r2-baseline: SUCCEEDED/cleanup,
свежая таблица4×8, sample_rows=0 (схема/исполнение; полный values audit этого
базового вызова не заявляется). Input/output autosync=false, Amount excluded.

Для fault загружен отдельный `/test-3/node13-r2-aa03cb93.csv`:164 bytes,
SHA256 `6154193cef31d3d7504727a6ca0cc2f934f57a416f5263f9cd75c5c3854ac3a1`.
Это побайтовая копия fixture. В мастере импорта собственной копии изменён путь,
прочитаны4 строки и сохранены четыре типизированных поля. После Done новый CSV
временно переименован в `.held` через файловое хранилище; исходный общий
`/test-3/Node13-dates.csv` не менялся. Временное отсутствие точного пути подтверждено.

Public node13-r2-failure завершился **FAILED/local_node_failed/cleanup_complete=true**.
Execution `1789296062410-1q7bqmxwhy6:457:5`, root457, group5, record1343.
Native причина: `Файл "/test-3/node13-r2-aa03cb93.csv" не найден`.
Полная свежая группа содержит source5.1/record1344/failed, filter5.2/record1345/
parent_failed и Date/time5.3/record1346/parent_failed. Последний связан native owner
с GUID `6b840be2-3723-4dc4-9e06-098016b76e60`. Ошибка зависимости не представлена
как выполнение целевого child. Native group terminal=true, can_cancel=false,
children_loaded=true, причина подтверждена перед закрытием консоли.

Независимый `date_time_terminal_failure.py`: **PASS**. Проверены исходная история,
ровно один новый launch/group, владельцы и native record IDs, исходная причина,
закрытие консоли/возврат в свой сценарий, отсутствие read phase и stale output.
Публичный выход: not_refreshed, evidence_ref=null, ports=[]. Строгий public MCP
response принят без нарушения schema. Первый запуск аудитора искал процессную
историю в последнем узком graph read; выбор исправлен на последнее полное native
наблюдение до launch. Сам runtime после начала сеанса не менялся.

Repeat/resume вернули тот же FAILED, browser sequence **1057→1057→1057**.
Inspect: resolved/cleanup_confirmed=true. assertPreparationAllowed не обнаружил
pending; затем отдельный новый запрос действительно был принят.

**15/15** отрицательных подмен отклонены: root, group record, старая группа,
неполная история, пустая причина, доступная отмена, не загруженные дети, чужой
owner/context, отсутствие source child, ложное завершение Date/time,
неподтверждённый cleanup, stale output, read phase и failure_verified=false.

CSV восстановлен по точному исходному пути; `.held` отсутствует. Новый public
node13-r2-restored завершился SUCCEEDED/cleanup_complete=true: свежие **4×8**,
независимые config/raw/values PASS. Итоговый `date_time_r2_gate.py` подтвердил
порядок трёх операций, разные execution IDs, отсутствие pending, точное совпадение
полных сохранённых матриц/input/output mappings до и после fault и прежнее
Amount excluded/autosync=false. **R2_terminal_live=PASS** в этом focused scope.

Собственная диагностическая копия закрыта без сохранения изменений source path;
принятый manual baseline не перезаписан. Новый CSV восстановлен (164 bytes),
.held отсутствует, диалогов нет. Собственный browser/harness закрыт exit0.
Новая проверка package persistence в R2 не проводилась; сохраняется ранее
принятое доказательство manual-output save/reopen.

[Машиночитаемые результаты, native proof, hashes](node-13-r2-integration-evidence.json).
Исходные browser replies/журналы находятся в собственном .dock/stream-runtime/sessions/
aa03cb93-8df3-4b1c-808e-6a13e835caf4/ и в Git не включены.

Воспроизведение независимых проверок из корня worktree:
```text
python3 tools/loginom-acceptance/date_time_terminal_failure.py <session-dir> --missing-path /test-3/node13-r2-aa03cb93.csv
python3 tools/loginom-acceptance/date_time_terminal_negatives.py <session-dir>
python3 tools/loginom-acceptance/date_time_audit.py <session-dir> node13-r2-restored
python3 tools/loginom-acceptance/date_time_r2_gate.py <session-dir>
```

## Проверки и сохранность

- Focused135 PASS: terminal failure, configure recovery, manual output additions.
- Полный клиент1477 PASS/1 SKIP; Python533 PASS.
- Исходники client совпадают с выбранным переносом; дополнительные Python-файлы
  служат независимыми аудиторами этого теста.
- [Снимок реально выполненного harness](../../tools/loginom-acceptance/node13-r2-snapshot/README.md)
  содержит исходные шаги/CSV и их SHA256; основа — существующий date-time-live.mjs
  и public-node-wire.mjs. Селекторы Files/rename/upload сверены с E2E
  bg/selectors.ts:1492/1512/1517, bg/helpers/filestorage.ts и реальным UI.
- Старые FAIL, configure recovery и manual-output persistence не переобозначались;
  [принятый manual-output отчёт](node-13-manual-output-followup-1.md) сохранён.

Полный review, Hermes, main/push/deploy, общий плагин и memory routing не менялись.
Готовность полного autonomous declared goal из10 строк этим focused gate не заявлена.
Чужие AGENTS.md/.gitignore сохраняются отдельно от коммита.
