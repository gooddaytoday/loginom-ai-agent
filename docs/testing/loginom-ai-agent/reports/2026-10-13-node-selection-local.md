# Локальная приёмка выбора узлов Loginom — промежуточный отчёт

Статус: приёмка не завершена. Исходная серия `20261013T093809Z-f5d429`
остановлена после трёх baseline; её результаты сохранены отдельно. Пользователь
поручил самостоятельно устранять блокеры: дефект `imports.text.date_format`
исправлен по TDD в `263df9620`, 144 теста PASS. После проверки отсутствия
собственных Loginom-сессий адресно архивирован также guard monthly.
Новая сопоставимая серия `20261013T132356Z-0a3983`: baseline 0/18, candidate 0/25;
обе сборки и deterministic native proof проверены. Ни один старый провал
не переименован в успех и не включён в новую серию.

## Новая сопоставимая пара

Обе сборки выполнены последовательно в одном managed worktree `node-selection-build`
на общем source `6768520a0`, версия `0.1.17`. Baseline использует точные два старых
skill-файла; затем они восстановлены к HEAD для candidate. Source verification
обоих payload завершилась exit 0. Манифесты SHA256: baseline
`861ce1594806414b1a40a3339a787cb893b1d583f79c990738ea565d4857b522`, candidate
`ffc4a0d09e9d6787115f42f920e5d0c5b69f753897bb9973fc18a14481c6107b`.
Skill digests прежние; baseline dirty, candidate clean отражены честно.

Независимая проверка каждого payload: 5725/5725 CLI entries, 4728/4728 resource
entries, SHA256/modes/symlinks PASS. Полная разница — шесть файлов: два skill,
два манифеста и два build-inputs. Runtime, compiled CLI/Host, dependencies,
Node/Chromium побайтно одинаковы. Разница build-inputs касается только
представления import paths; входные inventories и outputs совпадают.
Private evidence: `baseline-attestation.json`, `candidate-attestation.json`,
обе skill inventories и `pair-independent-review.json` в новом run.

## Native proof исправления дат

`date-format-native-2` через настоящий Host без LLM завершился exit 0.
`imports.text` SUCCEEDED/settled/cleanup_complete: readback `yyyy/mm/dd` и
`Слэш (/)`, datetime schema, две ненулевые даты `13.10.2026`, `14.10.2026`.
Save SUCCEEDED/save_completed; package cleanup SUCCEEDED/package_closed,
logged_out true, unsaved_changes_discarded false. Точность времени preview
не подтверждает (`datetime_display_precision`); она здесь не заявляется.

Первый smoke сохранён как неуспешный: импорт был успешен, но проверка ошибочно
ожидала ISO `cell.value` вместо публичного formatted display и остановилась
до Save. Cleanup BLOCKED/CONFIRMED_SAVE_REQUIRED не переименован в успех.
Точный native GUID связал собственную сессию `user:17` с init 13:39:18.798 UTC;
после проверки текущей admin inventory она адресно закрыта в 13:54:11.952 UTC.
Readback отсутствия и серверный close закреплены в `native-first-session-closure.json`
и before/after PNG. Admin logout проверен, MCP завершён. Сторонние сессии,
storage и профиль не изменялись. Ни один smoke не занимает модельный слот.

## Изменение и проверки

Product skill изменён только в `SKILL.md` и `references/workflow.md`, коммит
`fdb90ca1e`: стандартные узлы и их композиции по умолчанию; JS только в явно
запрошенной части или для подтверждённого функционального пробела. Ошибка узла
не разрешает fallback на JS. Существующие JS-узлы не удаляются автоматически.

Root checks из `evals/`: 95 целевых тестов, 219 assertions, 0 failures;
`bun typecheck` и `git diff --check` — exit 0. Проверены audit, runner, graph,
fixtures и oracle. Независимый review закрыл две ошибки привязки evidence:
экспортёр CSV к сохранённому XML (`80d55e0c7`) и публичный запрос к runtime
document/workflow/node (`0d44e677a`); повторные пять регрессий прошли.

Bundled skills: 9/9 до и после; полный staging 13/13 без SKIP, host typecheck PASS.
Baseline и candidate собраны и проверены. Node/Bun/Chromium dependencies совпали;
различия Product-исходников между payload commits — ровно два skill-файла.
Время сборки исходники были заморожены. `acceptance-lock.json` закрепляет 72 файла.

Статические tags-контракты candidate сверены: пять файлов побайтно совпали с
baseline и исходниками, проверены экспорты 16 типов узлов и релевантные схемы.
Генератор, цикл и dynamic split-to-rows не объявлены. Статус
`static-gap-supported` относится к требованию общего разворачивания списков
произвольной длины, не к невозможности всех мыслимых композиций. Evidence:
`candidate-gap-attestation.json` в private run, SHA256
`0d2bdcdb35e8c5d8af595cc19cb34424998a368c163dd7f094bd22935a01c0aa`.
Фактические `prepare.knowledge.node_types` и `action_describe.parameter_schema`
ещё нужно сверить в candidate Session до tags; live-доступность и поведение
модели эта проверка не подтверждает. CLI, профиль и браузер не запускались.

Audit version: `1f1e63ba844350aa21b9722ced44579050d12eaade0b78217085d5ae797eb34d`.
Baseline skill digest: `74cc9ac0b5a22724909bd1ba3123e8f6e3abedbe85a3b87dee6596119bbfb340`.
Candidate skill digest: `ff18dc5f2b4da3d7b6c66d0419d48aae7590b2a07e0d2e50f7a01cd9f3f34261`.

## Условия и сохранённые попытки исходной серии

Текущий местный Loginom: `http://localhost/app/`, user, `/user`, существующий
`loginom-server-7.4.2-test`. Нового стенда нет. CLI использует frozen payload,
`openai/gpt-6-sol-fast`, `medium`; alias запрашивает API model `gpt-6-sol` и
priority tier. Фактически обслуженный tier по имени alias не предполагается.
Модельный каталог, inputs/prompts/oracle, manifest и seed закреплены в отдельных
baseline/candidate pins. Одна попытка — один процесс, без модельных retries.

Private run: `evals/results/node-selection-local/20261013T093809Z-f5d429/`.
Сырые журналы, профиль и секреты в Git не включены.

- `sales-by-category/1`, Session `ses_ecb36b60fffelEBfHHVtrg0Wbw`: CLI exit 0,
  335.392 секунды. JS nodes/calls 0/0; oracle, policy, calculation, history,
  settlement, identity, export identity и graph PASS. Артефакты сохранены.
  Исходный wrapper exit 2 относится к минимальному Task 1A; финальный offline
  audit exit 0. Исторический `attempt.json` не переписан. Evidence:
  `baseline/sales-by-category/1/selection-audit.json`.
- `abc-pareto-groups/1`, Session `ses_ecb0f6648ffeNtALKokieQR6xW`: CLI exit 1,
  wrapper exit 3, 429.086 секунды. History/provenance подтверждены; один JS apply,
  ни одного подтверждённого успешного JS. Policy failed для старого baseline;
  это измерение исходного поведения, не основание исправлять candidate skill.
  JS nodes неизвестны: пакет не сохранён. Oracle не проверен, calculation не
  подтверждён, runtime settlement false. Evidence:
  `baseline/abc-pareto-groups/1/forensic/summary.json` и `readonly-audit.json`.

Таким образом, среди трёх начатых baseline один полный расчётный успех и один
oracle-pass. Это промежуточные числа, не результат всей матрицы 18/25.
Первый отказ OAuth до inference сохранён отдельно в `incidents/`; после успешной
авторизации по коду этот запланированный слот впервые дошёл до модели.

## Исходный блокер ABC и его восстановление

`pareto-cumulative-1` осталась `AMBIGUOUS` на `output_mapping` с
`cleanup_complete:false`. Собственный package cleanup завершился
`BLOCKED/CLEANUP_OR_OPERATION_UNCONFIRMED`; runtime close отверг cleanup.
Source editors закрыты, но это не закрывает внешнюю node operation. Поздний
context read также неопределён. Resume/cancel/recover уже отказали;
`recovery_options:[]`, `internal_resume_available:false`.

CLI и runtime процессы завершены. `.writer` первоначально сохранён намеренно;
отсутствие процессов не доказывает закрытие Loginom-пакета. Штатный `loginom recover` сначала
требует свободный writer, не снимает guard и не возобновляет node operation.
Recovery UUID-записей нет. История, storage и сервер не очищались.

Для продолжения требовалось проверенное завершение собственной Loginom-сессии и
адресное offline-восстановление профиля, разрешённое пользователем.
Сохранённый Dock document UUID не является серверным Session GUID, а уникального
пути сохранённого пакета нет. Имя `user:<номер>`, время и `Package1` сами по себе
не дают надёжной привязки. Диагностическое подключение с сохранённым `user`
установлено, но чтение списка сессий и logout не подтверждены; исходный guard
не менялся до проверки. Встроенный браузер не отвечал до формы входа; затем по
запросу пользователя установлен официальный `@playwright/mcp` 0.0.83 в Codex,
с существующим Chrome и отдельным временным профилем. MCP handshake, каталог,
навигация, административные вход и выход проверены. Для этой UI-проверки применён
глобальный `loginom-automation`; оценочные baseline/candidate payload не менялись.
Остальная конфигурация Codex семантически сохранена, backup создан.

Точный native GUID ABC-узла связан серверным журналом с экземпляром `user:8`,
созданным 11:05:58.329 UTC и окончательно закрытым сервером по тайм-ауту
11:42:50.547 UTC. Серверный GUID в журнале отсутствует; связь подтверждена
последовательностью init/own-node/disconnect/final-close без переинициализации.
Обновлённый admin-диспетчер до восстановления показал только собственную
`admin:12`, без user-сессий. Источники и хэши закреплены в
`server-session-closure-attestation.json`, `admin-sessions-inventory.yml` и PNG.

После повторной проверки nonce/mtime собственного guard и отсутствия own процессов
он атомарно перенесён в `profile-guard-archive/analytic-evals.writer` текущего run.
Исторические `attempt.json` не изменились; чужие сессии и пакеты не закрывались.
Модель-free `loginom status` и `loginom check` завершились exit 0: failure/recoveries
нет, Help ready, browser verified, новые guards освобождены. Evidence:
`profile-recovery-attestation.json`, `recovery-status.json`, `recovery-check.json`,
`playwright-mcp-installation.json`. Техническое восстановление не превращает
исторический runtime cleanup ABC в успешный и не подтверждает её oracle.
Провалы ABC и monthly остаются в исходной остановленной серии; её слоты 1
не повторяются. После общей runtime-правки начата подготовка новой полной
сопоставимой серии. Candidate начинается после нового baseline: сначала девять
случаев, затем повторы только после чистой первой волны.

## Исходный runtime-блокер monthly и принятое решение

`monthly-demand/1`, Session `ses_ecac06e84ffet1Rxb3IuG67J54`: CLI exit 1,
wrapper exit 3, 111.993 секунды; modelStarted true, cleanupConfirmed false.
Операция `monthly-import-001`, native GUID `75355558-68d1-4885-a9e5-489c546a0335`,
осталась `AMBIGUOUS/configure`, `Unsupported import format field`.
Замороженный `text-import-procedure.mjs` принимает `date_format` в validator,
но направляет его в setter, поддерживающий лишь delimiter/text_qualifier/
null_marker/decimal_separator. Это дефект настройки стандартного импорта,
а не основание переходить на JavaScript или менять правило skill.

Evidence: `baseline/monthly-demand/1/forensic/monthly-import-001-diagnosis.json`.
Тогда строгая server identity не была подтверждена: own GUID/input path/Dock IDs
в server log отсутствовали, backups были пусты. Одного совпадения времени
`user:15` недостаточно для CloseSession, поэтому адресного закрытия не выполняли.
Позднее свежая admin inventory показала только собственную admin-сессию и
отсутствие всех user-сессий; после проверки own процессов и nonce архивирован
только monthly guard. Evidence: `monthly-profile-recovery-attestation.json`.
Пользователь затем поручил самостоятельно устранять блокеры; принято решение
о минимальном TDD-исправлении runtime и новой сопоставимой паре, описанной выше.
Исходные frozen payload/pins и первоначальные evidence не изменены.

Не проверены live explicit-js/tags/recovery, candidate no-JS 18/18, сравнение
oracle-pass всей серии и обязательное содержательное review. Не проверены
Desktop/natural activation и cold reuse tags. Итоговая приёмка не заявляется.
