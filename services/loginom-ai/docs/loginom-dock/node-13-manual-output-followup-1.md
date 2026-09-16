# Узел13: ручная выходная схема — focused follow-up

Назначение `node13:manual-output-followup:1:b01f2e83ca6253087bba71150f078b9d9083f612`,
13 сентября 2026. Исходный HEAD `b01f2e83ca6253087bba71150f078b9d9083f612`.
Целевое исправление и независимый save/reopen/execute завершены.
Работа выполнена в прежней ветке `codex/node-13-date-time`, test-3. Ниже исходные
неуспехи сохранены отдельно; окончательный статус определяется новыми аудитами.

## Подтверждённая семантика и причина

[Help: интерфейс Связи](https://help.loginom.ru/userguide/workflow/ports/connections-interface.html)
описывает точечное создание выхода выбранного входного поля. Это отдельная команда
от синхронизации всей схемы. При ручной схеме пользователь фиксирует состав и связи;
новый вычисленный источник не обязан автоматически стать выходным столбцом.
[Help: мастер портов](https://help.loginom.ru/userguide/workflow/ports/mapping-master.html).
E2E подтверждает выбор исходной строки и затем `btnCreateMapping`:
`/Users/kartamyshev/Git/e2e-tests/tests/toreview/acceptance/mapping/mapping_actions.ts:822`,
селектор — `bg/sels/sMapping.ts:215`. В этом follow-up E2E служит источником
последовательности/селекторов; полный E2E-suite не запускался.

Live-сеанс `8f9abcf3-293e-4ffe-8000-00583c8f6e44`, runtime `db331fdc…`:
обычный node13-manual-add без reply-loss повторил `output source bijection required`.
У существующего «Пустой календарь» после добавления DateB quarter/hour —9 источников
и7 выходов, autosync=false. Следовательно, ограничение не вызвано configure recovery.
Вручную выбран native source DateB_Q_1 (record634), затем DateB_HRS_1 (record635).
Точечные Create output дали7→8→9 target records, сохранили все старые7 соответствий,
имена/метки и autosync=false. Изменения черновика отменены, сеанс закрыт exit0.
Этот исходный failing вызов не объявлен успешным.

## Исправление

Date/time добавляет только явно запрошенные отсутствующие обязательные источники.
Перед добавлением проверяются источники, занятые имена и прежние связи/исключения.
В режиме Связи выбирается одна видимая строка с точным native record ID; кнопка
Create output используется только после подтверждённого одиночного выбора.
После каждого создания проверяются неизменность прежних target records, их
относительного порядка и атрибутов, полная исходная схема и прежний autosync.
Новый выход должен быть точной копией выбранного источника перед его обычным
переименованием согласно parameters. Прежний табличный вид восстанавливается.

`date-time-output-additions.mjs` содержит фазу точечного добавления;
`date-time-output.mjs` использует её перед полной проверкой соответствий.
`node-mapping-context.mjs` дополнен чтением режима Связи и native selection с
проверкой DOM-строк. `workspace-ui.mjs` выдаёт только связанные с native record
source cells в двух известных output-формах; произвольные table cells не открыты.
Автосинхронизация не включается. Незапрошенный пропущенный источник и коллизия имени
останавливают подготовку; потерянный ответ Create output не повторяет клик.

## Диагностические итерации

- `58befc9d-e076-431b-a156-08125d7de881`, runtime `6d6ae878…`: успешно подготовлены
  manual output с Amount excluded и собственный источник Id>0. Первый прототип
  остановился до Create output: source cells отсутствовали в UI refs. Добавлена
  точная привязка этих ячеек; незавершённый Date/time draft отменён. Только seed
  сохранён отдельной диагностической копией `/test-3/N13-manual-seed-58befc9d.lgp`.
  Сеанс закрыт exit0. Он не является положительной приёмкой исправления.
- `bb056cee-bfd0-48a3-853a-da93c6bf70ee`, runtime
  `7eec216e196d0344da27fe13eb02336e9812043c2f8fe5ce2bc0703771d54d4c`:
  новая копия `/test-3/N13-bb056cee.lgp`; два Create output выполнились, Amount
  остался исключённым. Операция остановилась на ошибочном требовании отдельного
  мастера для уже существующего исключения. Исправлено отсутствие повторного
  исключения и сохранение групп при reorder в inline-форме. Черновик отменён,
  пакет освобождён, сеанс закрыт exit0; исходный FAIL сохранён.
- `74521ebd-2679-496e-9f59-99d42ac1a1c2`, runtime
  `81ed254c027429933dd0290458779eb04b8f8442bc8f9e2801bf9fb09906fe91`:
  новая копия `/test-3/N13-74521ebd.lgp`: сохранение исключения прошло,
  но inline global EditColumnDefForm не был связан наблюдателем с grid. Native
  record664 / DateB_Q_1 / index6 и совпадение store record подтверждены напрямую.
  Добавлена inline-форма в narrow discovery и native portal binding. Тесты
  bound/foreign_record/foreign_wizard/wrong_index прошли в full/root discovery.
  Редактор и мастер отменены, пакет освобождён, сеанс закрыт exit0.

Все браузеры — видимые, viewport=null, окно1508×949/страница1508×862; Loginom7.4.2.
Архивная диагностическая candidate-конфигурация не объявлена финальным admission.

## Положительный live-прогон

Сеанс `bafafea6-df03-4bce-b438-1c4c1579a98c`, runtime
`25706c0215637218f61d5c89cc47ded2dd2636e635e66ac79843152b154513cc`.
Обычный public `node13-manual-add` существующего GUID
`6b840be2-3723-4dc4-9e06-098016b76e60` завершился SUCCEEDED/cleanup_complete.
Независимые config/raw/values PASS, **4×8**. Все старые6 активных столбцов,
соответствия, Amount excluded и input/output autosync=false сохранены.
Добавлены SmallQuarter/«Квартал B» и SmallHour/«Час B»; нативные источники
DateB_Q_1 и DateB_HRS_1. Quarter=[1,1,1,NULL], hour=[12,0,23,NULL].

`date_time_manual_output.py` подтвердил исходные9 sources/7 targets, ровно2 Create
output, сохранение старой схемы и отсутствие включения autosync. Первый проход
аудитора пытался использовать предварительное наблюдение ещё без native sources;
уточнено требование inventory_complete/source_identity_verified для baseline.
Это исправление выбора доказательства, а не изменение результата операции.
Семь подмен журнала отклонены: autosync, old name, exclusion, new source,
selection, missing Create и repeat effect. Исходный журнал не изменялся.

Repeat/resume: SUCCEEDED, browser sequence **991→991→991**. После успешного вызова
однократно выполнен package.save_checkpoint для `/test-3/N13-bafafea6.lgp`;
save_completed=true. Пакет освобождён, сеанс закрыт exit0.

Отдельный сеанс `df361bf1-66a2-4dae-9283-f74c8caa39d7`, тот же runtime25706c02…,
открыл точный сохранённый путь операцией base-open без SaveAs. Public
node13-manual-reopen выполнил тот же GUID с parameters={} / mappings=[]:
SUCCEEDED, cleanup_complete, **4×8**, config/raw/values PASS.
`date_time_persistence.py` подтвердил единственное awaited сохранение после
настройки, независимый exact open, неизменный GUID, полные матрицы и input/output
mapping, свежие значения. **package_persistence_verified=true**. Пакет освобождён,
сеанс закрыт exit0. На вопрос сохранения после повторного выполнения выбрано
«Не сохранять»: проверенный исходный файл повторно не перезаписывался.
Hermes acceptance=false.

[Машиночитаемые результаты и хэши журналов](node-13-manual-output-evidence.json).
Журналы находятся в собственном `.dock/stream-runtime/sessions/<session-id>/`;
сырые журналы и browser replies в Git не включены.

Воспроизведение аудита из корня worktree:
```text
python3 tools/loginom-acceptance/date_time_audit.py <configure-session-dir> node13-manual-add
python3 tools/loginom-acceptance/date_time_manual_output.py <configure-session-dir>
python3 tools/loginom-acceptance/date_time_manual_output_negatives.py <configure-session-dir>
python3 tools/loginom-acceptance/date_time_audit.py <reopen-session-dir> node13-manual-reopen
python3 tools/loginom-acceptance/date_time_persistence.py <configure-session-dir> node13-manual-add <reopen-session-dir> node13-manual-reopen
```

## Проверки и R2

Текущий клиент:1472 PASS/1 SKIP, Python533 PASS. Sandbox-запуск получил9
ошибок из-за запрета локальных сокетов (EPERM); полный повтор с нужным доступом
прошёл. Профильный port-mapping suite —25 PASS. Новые проверки покрывают
точную выбранную строку, чужой owner/source/selection, изменение старой связи,
исключения/имени, включение autosync, неверный новый выход, позицию и повтор
Create output при потере ответа. Дополнительный независимый manual-schema auditor
проверяет исходные9/7, ровно две точечные вставки и сохранение исключений.

Исправление, аудиторы и отчёт зафиксированы коммитом
`7d7f0bc2a23c8db5d57fbeb9ceb57d3a8ca29907`.

[R2 transfer packet](transfers/node13-r2/README.md) подготовлен как отдельный
patch/manifest, без применения. Источник строго
`a63586fe096f4fd7f17f346c391834d3e34bdaa4`; только terminal failure из11 файлов.
Финальный dry-check на целевой базе `7d7f0bc2a23c8db5d57fbeb9ceb57d3a8ca29907`
прошёл (exit0, рабочие файлы до/после совпали). Только контекст d.ts/test
адаптирован; payload добавляемых/удаляемых строк совпал с выбранным источником.
Пакет содержит source/target blobs, 18 исходных и 18 transfer hunk hashes.
Patch SHA256 `47830abe656d8a5abed35e27ee4ca54fb8d46bb4e5b45ce4f47b2b6dc833a182`.
`applied=false`, `transfer_authorized=false`. Новый target-placement fix14 исключён.

Hermes, полное новое ревью, node15, перенос14→13, main/push/VPS/plugin/routing
не выполнялись. Чужие AGENTS.md/.gitignore не включаются в коммиты follow-up.
