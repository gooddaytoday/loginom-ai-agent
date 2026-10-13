# Локальная приёмка выбора узлов Loginom — промежуточный отчёт

Статус: приёмка не завершена. Исходная серия `20261013T093809Z-f5d429`
остановлена после трёх baseline; её результаты сохранены отдельно. Пользователь
поручил самостоятельно устранять блокеры: дефект `imports.text.date_format`
исправлен по TDD в `263df9620`, 144 теста PASS. После проверки отсутствия
собственных Loginom-сессий адресно архивирован также guard monthly.
Серия `20261013T132356Z-0a3983` остановлена: два baseline неуспешны, candidate 0/25.
Обнаружен и исправлен второй общий runtime-блокер `c2c898aca5` (dataset output
socket в overflow), TDD/310 tests/independent review PASS. Следующая сопоставимая
серия `20261013T142936Z-072953`: завершены baseline 18/18, oracle/calculation 18;
ABC CLI exit 0, wrapper exit 2, evidence восстановлены offline; candidate 2/25 начаты: sales full PASS, ABC runtime-blocked без JS.
Обе сборки/pins и native overflow proof проверены.
Ни один старый провал
не переименован в успех и не включён в новую серию.

## Историческая вторая сопоставимая пара

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

Immutable baseline/candidate pins проверены независимо: 43 уникальных слота,
72/72 source lock hashes PASS; task/model/seed fields неизменны. Frozen models
и исторический lock сохранены побайтно; новая привязка — в
`pins-preparation-review.json`. Actual baseline native prepare подтвердил build
7.4.2 и 16 типов с доступным `programming.javascript` (`baseline-catalog-attestation.json`).
`current-run.txt` переключён на новый run; первый `sales-by-category/1` запущен.

## Историческая вторая серия: модельные исходы

`sales-by-category/1`, Session `ses_eca6f32d6ffeMWoNUZKw5hyJuQ`: CLI exit 1,
wrapper exit 3, modelStarted true, cleanupConfirmed false. Offline audit exit 2:
history/identity подтверждены, JS calls/successful calls 0/0, JS nodes неизвестны
без XML, policy incomplete, calculation false, oracle не проверен без CSV.
Импорт выполнен (500 строк). Группировка создана и связана с импортом, но
`group-category-1` остановилась в фазе open с `WIZARD_OPEN_NOT_CONFIRMED`.
Configure/Execute группировки не начинались, пакет и CSV не сохранены.

Source review исключил коллизию позиций и не подтвердил ошибочный выбор узла.
Позднее UI-наблюдение показывает нужный мастер, но catch повторно читает UI;
исходный snapshot отказа отсутствует. `grouping_structure_unverifiable` не
объясняет opening: DOM reader ожидает непустые keys и measures у ещё не
настроенного узла. Конкретный failed conjunct не установлен; спекулятивной
runtime-правки нет. Evidence: `forensic/group-category-1-diagnosis.json` и
`forensic/source-analysis.json` внутри попытки.

Точный GUID собственного импорта связывает попытку с `user:21`, созданной
14:01:05.859 UTC. Текущая admin inventory подтверждена; закрыта только эта
сессия, server close и отсутствие после refresh проверены. `user:20` не трогали.
После проверки отсутствия own процессов и nonce/mtime архивирован только guard
этой попытки. Хеши исходных attempt/events/parts/pins не изменились;
`forensic/profile-recovery.json` фиксирует восстановление отдельно от исходного
cleanup=false. Admin logout и закрытие MCP подтверждены. Это первый из 18
baseline, повтор его слота не выполняется. Следующий плановый ABC/1 запущен.

`abc-pareto-groups/1`, Session `ses_eca65e74effehzx2YIw9HkvGOz`: CLI exit 1,
wrapper exit 3, modelStarted true, cleanupConfirmed false; offline audit exit 1.
History/identity подтверждены, один JS apply и ноль terminal-confirmed successful
JS calls; XML/CSV отсутствуют, calculation false, policy failed у старого skill.
Это baseline-замер, не причина менять candidate policy. Импорт/сортировка успешно
выполнены. Declared JS дошёл до materialization execute и native mapping verified,
но output port_context unobserved отклонил Close до жеста; Save не состоялся.

Два ABC forensic журнала воспроизвели одну boundary. Публичный offline RED
подтвердил missing dataset overflow icon; минимальная правка добавляет один
selector, сохраняя guards. Existing matrix 28 случаев и полные 310 tests PASS;
независимый review PASS. Evidence: `forensic/diagnosis.json`, `source-analysis.json`
и `evidence/dataset-output-fix/{verification,independent-review}.json`.
Native DOM style/class в историческом incident не сохранены, поэтому native proof
именно repaired overflow-ветки ещё требуется.

Собственная `user:24`, init 14:11:06.719 UTC, привязана точными JS/import GUID.
Закрытие подтверждено server log; после промежуточной строки «Удаляется» выполнен
ещё один refresh, отсутствие всей записи проверено и снят `admin-after-settled.png`.
Guard архивирован после проверки own процессов, nonce/mtime в own CLI window;
исторические hashes/cleanup=false не изменены. `user:20` и `user:23` не трогали,
admin logout проверен. Серия stopped 2/18 сохранена отдельно от следующей полной.

## Native proof обоих исправлений на третьей паре

Host без LLM выполнил импорт `EventDate,Amount` и declared JS (passthrough даты,
Amount+1). Native операции SUCCEEDED/cleanup true, Save и package close/logout
подтверждены. Строгий offline audit проверил actual DataSet+hidden overflow marker,
GUID/index/opening ID и последующий Close/graph verification. JS output: две строки,
целые значения 11/21 exact, календарные даты 13–14.10.2026. Import retains display
precision limitations; JS local datetime/millisecond/timezone unspecified.

Исходный native driver exit 1 не скрыт и не переписан: он ожидал одинаковое
display date в discrete import и continuous JS. Save предшествовал assertions,
finally подтвердил package cleanup, ACK и runtime exit 0. Native не повторялся.
Независимая проверка 25 evidence hashes и 287 runtime sources, затем root offline
verification завершились exit 0. Evidence в третьем run:
`native-proof-offline-review.json`, `native-proof-offline-verify.py`, исходные
`native-proof.{ts,stdout.txt,stderr.txt}` и receipts. Persisted reopen, обычный
CLI teardown и модельная политика этим smoke не подтверждаются.

## Третья сопоставимая серия и очистка

Source обеих сборок `1bfc1354306a418d33b9710718edc455f3d188d7`, версия `0.1.17`.
Baseline source tree `a5ec8ab3c0a14dc2cb25fa1893ccd943ea14d0dba7d23ffe6baf432940f1cc07`
dirty; candidate `a0fda2e9dad55807c8ee7a531d5fb6082e46143cda8e7225a3a2e08cb7495fc4`
clean. Manifest SHA baseline `e0210ac2fceb6e44cea32f5683f5bf880cf78ffa574ff6be50a180ddd64eb473`,
candidate `4b53a39397c2921de89e59bf7ca2041dd78c032cbe51a242c5cd29b381aead67`.
Source verification обоих exit 0; full independent inventories 5725/5725 и
4728/4728 PASS. Runtime/CLI/Host/dependencies/browser совпали; различаются два
skill, два manifests, два build-inputs. Pins 0400, прежние inputs/model/seed;
72 hashes и 43 уникальных слота проверены. `current-run` переключён, первый
sales baseline запущен. Пять старых попыток двух остановленных серий отдельно.

Неиспользованный candidate второй серии сжат в `obsolete-candidate.tar.gz`
(SHA `c4953583424ea3e4964a034480f6f0795d6b9180c84c8f5a7deac0b6c208afc9`).
Перед удалением собственного каталога проверены все 5725 manifest entries,
modes/symlinks и точное совпадение cli-manifest. Активных ссылок процессов нет;
baseline и browser source сохранены, model evidence/pins не менялись. Удалено
765055067 байт исходных файлов, архив 331404633 байт; другие агенты не затронуты.
Квитанция `obsolete-candidate-cleanup.json` в старом run. Первая попытка очистки
остановилась до удаления из-за Python 3.10/hashlib.file_digest; после совместимого
streaming SHA256 архив повторно проверен и операция завершена.

`sales-by-category/1` третьей серии, Session `ses_eca4160a6ffetc3GcVPs4aXuGm`:
CLI/wrapper exit 0, cleanupConfirmed true. Полный audit PASS: JS nodes/calls 0/0,
oracle/calculation/history/runtime/identity/graph/export identity true, failures [].
Сохранены пакет и CSV с новым prefix; package SHA
`dbccff922600803df11431203f36106895a935f0659ca1733c768790c3534b1e`.
CLI время 336.384 секунды, без timeout. Это первый из новых 18 baseline;
следующий `abc-pareto-groups/1` завершился и оценён отдельно ниже.

## ABC третьей серии: восстановление collection failure

Session `ses_eca3a1284ffeZGQg7hUjWiiokX`: CLI exit 0, cleanupConfirmed true,
wrapper exit 2 (`SELECTION_COLLECTION_FAILED`), время CLI 417.524 секунды.
Save/Export и managed package close/logout SUCCEEDED. Причина wrapper failure —
текст `loginom_find` с named import `{ OutputTable, DataType }`, ошибочно переданный
в JSON-парсер managed receipts. Полный Help и история сохранены; модель не повторяли.

После независимой сверки public/runtime bindings скопированы только два точных
собственных пути. Пакет: 11333 bytes, SHA
`dddd3fc96c6036cc74cf9096efd3a596a863b8d45e5417cc006e895d82b48e2a`;
CSV: 228 bytes, SHA
`45a56e494b383ff377cbfd792a1db899717f3bcfbf207c707302f0bf5482ac03`, совпал с receipt.
Original `attempt.json` и source evidence hashes неизменны. В отдельной проекции
`evidence/abc-collector-recovery` восстановлены только package/result paths;
исходные CLI0/wrapper2/blocker сохранены и явно привязаны к original SHA.

Первый offline audit до распаковки сохранил PACKAGE_XML_INVALID; это ошибка
оператора copyout, а не исходного пакета. Результат оставлен в
`selection-audit-before-unpack.json`. После существующего unzip повторный audit
exit 1: oracle/calculation/history/runtime/identity/graph/export true, JS 2 nodes,
2 successful calls; единственный отказ JAVASCRIPT_NOT_ALLOWED. Это baseline
с прежним skill, его JS policy failure не блокирует измерение «до».
Evidence: `forensic/receipt-recovery.json`, `copyout-recovery.json`,
`collector-diagnosis.json` и отдельная audit-проекция. Исправление collector
`f5eb5373e2` выполнено по TDD: RED → GREEN, 4 suites/88 tests/206 assertions,
typecheck/diff-check PASS. Независимый review Approved: 4 regressions/8 assertions
PASS, actual 68 parts дают 16 managed calls без ошибок; испорченный managed JSON
по-прежнему отклоняется. Изменены только runner и его tests; общие payload/runtime
не пересобираются. `collector-fix-lock.json` SHA
`3296113f675d8d87505feb2cd402dc2f08eca7c1d277c0b74b1944cf026ca438`
фиксирует новое sourceHead/runner, 71 неизменённый historical hash и прежние pins.
Независимый `forensic/copyout-recovery-review.json` подтвердил 11 original hashes,
21 shared evidence file и все 14 ZIP members; pure audit/oracle повторно прошли.
Изменения проекции исчерпываются двумя receipt paths и явным collectorRecovery.

## Monthly-demand третьей серии

Session `ses_eca1a7be2ffejnqGRJRYOiKoix`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI время 392.816 секунды, timeout false. Стандартные импорт дат, калькулятор
месяца, группировка, сортировка и экспорт; JS nodes/calls 0/0. Audit PASS: весь
oracle, calculation/history/runtime/identity/graph/export identity true, failures [].
Package SHA `f2f13e6958323961bd6f74122db0e5b287a71b124ef72e663320e5507c57a35a`.
Обе ранее исправленные runtime boundaries прошли в текущей сопоставимой серии;
исходные отказы сохранены. Это третий baseline, candidate ещё не выполнялся.
Следующий risky-approved-claims/1 завершился, исход ниже.

Независимый `collector-fix-lock-review.json` SHA
`ec2ee550f2ed7a8605ecb2d111b23e596e0e3304eca4dff325b1e4a603636323`
подтвердил byte-equal historical lock, committed runner/test, прежние pins,
auditVersion и task/prompt/input/oracle bindings. Полные payload inventories
не повторялись; сверены прежние attestation и critical payload hashes.

## Risky-approved-claims третьей серии

Session `ses_eca13c7e1ffeH14ploooTK0n9G`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 460.428 секунды, timeout false. JS nodes/calls 0/0, сплошной oracle и полный
audit PASS: calculation/history/runtime/identity/graph/export true, failures [].
Package SHA `9dc6980b08cbe131d5fcc2f8ec515e92fac7cd0b665c8a681d64c336ad9f1f63`.
Первый фильтр NOT_APPLIED/REQUEST_REJECTED из-за Unsupported node label,
effect_possible false, cleanup true. Агент исправил название и повторил стандартный
фильтр с новым operation ID; успешные фильтрация/группировка/сортировка/экспорт
подтверждены. Это естественная ошибка baseline, не замена обязательного recovery
candidate. Следующий campaign-roi-by-channel/1 завершился; candidate 0/25.

## Campaign-roi-by-channel третьей серии

Session `ses_eca0bfffbffe314nanPq1R43k8`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 409.688 секунды, timeout false. JS nodes/calls 0/0; oracle и полный audit PASS:
calculation/history/runtime/identity/graph/export true, failures []. Package SHA
`160782e00d1096a173d6b050c15b46dc11133ac71fa7b09e4014367adfdb7e3b`.
Стандартные импорт, группировка, калькулятор, сортировка и экспорт подтверждены.
Следующий first-last-touch/1 завершился — первый проход baseline завершён.

## First-last-touch и итоги первого прохода baseline

Session `ses_eca0538c6ffegD2qIgKCab6nuk`: CLI exit 0, wrapper exit 1,
cleanupConfirmed true, CLI 241.446 секунды, timeout false. JS nodes/calls 1/1,
successful JS calls 1. Oracle/calculation/history/runtime/identity/graph/export
true; единственный отказ JAVASCRIPT_NOT_ALLOWED у старого skill. Package SHA
`f0b446c8267b1e79c2acd1e877b651346be2fb5b5f41ac02a9be2f8c0416f8db`.
Это baseline-замер; wrapper1 по политике не останавливает серию «до».

Шесть разных baseline cases первого прохода: oracle/calculation 6/6, cleanup 6/6,
standard policy 4/6, JS суммарно 3 nodes/3 successful calls в двух сценариях.
Original ABC wrapper2 остаётся collection failure с отдельной проверенной
audit-проекцией, остальные outcomes не переписаны. Начат sales-by-category/2.
Среднее CLI время шести попыток 376.381 секунды (около 6.3 минуты). Грубый прогноз
оставшихся 12 baseline + 25 candidate — около 3.9 часа модельных попыток плюс
review/overhead; первые 9 candidate — около 56 минут. Это экстраполяция малой
выборки: candidate композиции и исключения могут иметь другие длительности.

## Второй проход baseline: sales-by-category/2

Session `ses_ec9ffdc34ffe6tL6k6RpX3wCom`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 343.882 секунды, timeout false. JS nodes/calls 0/0; oracle и полный audit PASS:
calculation/history/runtime/identity/graph/export true, failures []. Package SHA
`1c0eb77f14a3eb05ce98cfebed0d32872352887a669b9df8378c6ee565fb64a1`.
Начат abc-pareto-groups/2; сборка, pins, inputs/model/oracle прежние.

## ABC/2: неподтверждённое согласование операции

Session `ses_ec9f9ea4fffe3ennmoDQkOo9Ht`: CLI exit 0, wrapper exit 1,
cleanupConfirmed true, CLI 459.388 секунды, timeout false. JS nodes/calls 2/2,
successful JS calls 1. Oracle/history/identity/graph/export true, но runtimeSettled
и calculation false: RUNTIME_APPLY_MISMATCH, TOOL_OPERATION_UNSETTLED,
TOOL_RECEIPT_INCOMPLETE; JAVASCRIPT_NOT_ALLOWED ожидаем для старого skill.
Package SHA `dd9604cf371586fd9092f0cd885805dead3f4a81b03101fdb4cf51b80b890513`.
Первая JS-операция после running wait проверена через operation_inspect,
затем выполнена сводка. Save/Export и CLI cleanup подтверждены; отличие формы
квитанции или недостающий public settlement требуют диагностики, успех не подменён.
Следующая модель пока не запускается, candidate 0/25.

Collector fix подтверждён в обычном live CLI: один полный loginom_find содержит
named import `{ OutputTable, DataType }`, но сбор Save/Export/пакета/CSV и audit
завершился без collection failure. Исходные outcomes и audit сохранены.

Диагностика доказала delivery-path false negative: wait получил USER_RESPONSE_BUDGET
с next_step operation_inspect; успешная resolved/verified inspection содержит
полный canonical node.apply outcome, deep-equal runtime completed.outcome.
Все original hashes совпали. `e871bf81d2` исправил разбор только в auditor/test:
106 tests/236 assertions PASS, final 18 regressions/30 assertions, typecheck/diff
PASS. Independent review Approved, 38 отрицательных mutations прошли.
Для inspect проверены operation ID, внутренний status, cleanup, node/execution
и runtime; generic error не скрывается. Raw outcomes не менялись.

Новый lock SHA `cf81c625a3dd354e8cd4659b636fc5a8ac231acc814f6aab858805b5569ca140`,
auditVersion `2654bfc1c61d4d0ecc73c7a6f4fa9613b5d5244ea83a7fdb8712be2ed452e445`.
70 historical hashes неизменны; изменены только runner и node-selection,
historical locks и оба pins сохранены. Runtime/payload/skill не пересобирались.

Восемь сохранённых baseline переоценены в отдельных hardlink-проекциях
`evidence/settlement-reassessment-e871bf81d2`, без overwrite прежних audits.
Original inventory SHA `361a0dc13228d7b0fa4fb437635031ddebcbbfb7601bdf96ee7554aec48c26d6`;
`settlement-reassessment.json` SHA
`0ac9ee23bb8286d4221534cb281caed75fb58a9f0380dd7f18bc6ee5e345939c`.
Итог: oracle/calculation 8/8, policy 5/8, JS nodes/calls/successful calls 5/5/5.
ABC/2 теперь runtimeSettled/calculation true, единственный отказ JAVASCRIPT_NOT_ALLOWED;
исходный wrapper1/calculationfalse отдельно сохранён. Повтора модели нет.
Независимый review reassessment PASS, findings 0; receipt SHA
`2298dca182655fc5a7406148a9e6f0d832e18aab96c664cbaf3b8ec87ab27084`.
96 protected original files и восемь prior audits сохранили hashes. Новые
attempt metadata побайтно равны prior assessment (ABC/1 сохраняет explicit
collector projection); CLI/wrapper/blocker не подменены. У семи изменился только
auditVersion, у ABC/2 — successfulJS 1→2, runtime/calculation true и сняты три
settlement errors. Pins/model/tasks/oracle и build metadata прежние.
Повторных тестов/audits и semantic review reviewer не делал. Monthly-demand/2 запущен.

## Monthly-demand/2 на финальном аудиторе

Session `ses_ec9e08ac3ffelGiTyxf3V91hSd`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 562.562 секунды, timeout false. JS nodes/calls 0/0; oracle/calculation/history/
runtime/identity/graph/export true, failures []. AuditVersion `2654bfc1…`.
Package SHA `4265528b5bd90861aaad00e5e0da3aa889a1d728a092ec6b864387b8f5599941`.
Стандартная цепочка включает reform_columns для целочисленного promo_days;
inputs/model/oracle прежние. Завершены 9/18 baseline, policy старого skill 6/9;
следующий risky-approved-claims/2 запущен, candidate 0/25.

## Risky-approved-claims/2

Session `ses_ec9d670ecffeA544O9qLGHk1IR`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 488.485 секунды, timeout false. JS nodes/calls 0/0; oracle/calculation/history/
runtime/identity/graph/export true, failures []. Package SHA
`a6dcdfe312b67ce4a34cbbd9718260cc22dd48cb15e7fd9fe5e6cb3a42991749`.
Unsupported node label вернул NOT_APPLIED/REQUEST_REJECTED с effect_possible false;
агент повторил стандартный фильтр с исправленным названием и новым operation ID.
История отказа сохранена. Всего baseline 10/18, policy 7/10, JS5/5/5;
следующий campaign-roi-by-channel/2 запущен, candidate 0/25.

## Campaign-roi-by-channel/2

Session `ses_ec9cb31b8ffeQ6G3RHEHj9VsbS`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 412.373 секунды, timeout false. JS nodes/calls 0/0; oracle/calculation/history/
runtime/identity/graph/export true, failures []. Package SHA
`b98dabdc3abe538adb45351aea55a127af7b3ffbb9f30fa19a30ecaec23e3f4c`.
Завершены 11/18 baseline, policy 8/11; следующий first-last-touch/2 запущен.

## First-last-touch/2 и итоги двух проходов

Session `ses_ec9c2d2e2ffeFIgWa5RLVXOyjG`: CLI exit 0, wrapper exit 1,
cleanupConfirmed true, CLI 244.122 секунды, timeout false. JS nodes/calls/successful
calls 1/1/1; oracle/calculation/history/runtime/identity/graph/export true.
Единственный отказ JAVASCRIPT_NOT_ALLOWED у старого skill. Package SHA
`6c5fdf953dc36b3c1ae9b18858a722b817c1106f62fa49bceec2e0436b1a6a79`.
Baseline 12/18: oracle/calculation/cleanup 12/12, policy 8/12, JS6/6/6 в четырёх
ABC/attribution попытках. Первые восемь используют отдельный final reassessment,
дальнейшие четыре — тот же auditVersion непосредственно; original outcomes
не переписаны. Начат третий проход, sales-by-category/3; candidate 0/25.
Среднее CLI время 12 попыток — 397.425 секунды (6.6 минуты). Грубая оценка
оставшихся 6 baseline + 25 candidate — 3.4 часа модели плюс review/overhead;
первая candidate-волна по этой выборке около 60 минут. Это не гарантированная ETA.

## Sales-by-category/3

Session `ses_ec9bd7697ffe6a6nL92XuL3hNC`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 342.201 секунды, timeout false. JS nodes/calls 0/0; oracle/calculation/history/
runtime/identity/graph/export true, failures []. Package SHA
`608ce38c6b0a1d5f013e99eeeedefebcb011f59aa498a92f3c6c8a6406cb174a`.
Все три sales baseline успешны без JS. Всего 13/18, policy 9/13, JS6/6/6;
следующий abc-pareto-groups/3 запущен, candidate 0/25.

## ABC/3

Session `ses_ec9b742dbffed3h1gEHM1LxaMi`: CLI exit 0, wrapper exit 1,
cleanupConfirmed true, CLI 369.017 секунды, timeout false. JS nodes/calls/successful
calls 2/2/2; oracle/calculation/history/runtime/identity/graph/export true.
Единственный отказ JAVASCRIPT_NOT_ALLOWED. Package SHA
`98190084e2374d4e88ee02b84b2486e366cb21e96ef7d20aedeb9a924b07de38`.
Все три ABC расчётно успешны; original ABC/1 collection failure и ABC/2 prior
settlement assessment сохранены отдельно. Всего 14/18, policy 9/14, JS8/8/8;
следующий monthly-demand/3 запущен, candidate 0/25.

## Monthly-demand/3

Session `ses_ec9b11270ffeU4LKty64fCXG8F`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 474.881 секунды, timeout false. JS nodes/calls 0/0; oracle/calculation/history/
runtime/identity/graph/export true, failures []. Package SHA
`10d9312119e3258164f948130df59223f773642ccdd022e219ed764fc85901fd`.
Все три monthly baseline успешны без JS. Всего 15/18, policy 10/15, JS8/8/8;
следующий risky-approved-claims/3 запущен, candidate 0/25.

## Risky-approved-claims/3

Session `ses_ec9a93e6affeZNu00G2ctcWpxH`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 497.751 секунды, timeout false. JS nodes/calls 0/0; oracle/calculation/history/
runtime/identity/graph/export true, failures []. Package SHA
`ef211840d5cbdd5eb6f3e74a26795a8e8cb61381c91b7cc41cff68a1b4f7495f`.
Все три risky baseline успешны без JS. Всего 16/18, policy 11/16, JS8/8/8;
следующий campaign-roi-by-channel/3 запущен, candidate 0/25.

## Campaign-roi-by-channel/3

Session `ses_ec9a007a3ffeSrwEoRYQIFAEBY`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 421.374 секунды, timeout false. JS nodes/calls 0/0; oracle/calculation/history/
runtime/identity/graph/export true, failures []. Package SHA
`a80221fb50d3a1db9e08ab2f6091a029b020b77068150f83f8d865d1e5b46355`.
Все три campaign baseline успешны без JS. Всего 17/18, policy 12/17, JS8/8/8;
следующий first-last-touch/3 запущен, candidate 0/25.

## First-last-touch/3 и итог baseline

Session `ses_ec9991e6fffevrkgnHx3umenbP`: CLI exit 0, wrapper exit 1, cleanupConfirmed true,
CLI 237.150 секунды, timeout false. JS nodes/calls/successful calls 1/1/1;
oracle/calculation/history/runtime/identity/graph/export true. Единственный отказ
JAVASCRIPT_NOT_ALLOWED. Package SHA
`4b025d52f8689cde0ecac0ef3e397cd9c537886f705ece24fbab9b553058871d`.
Все 18 baseline завершены: oracle/calculation 18/18, cleanup 18/18, policy 12/18;
JS nodes/calls/successful calls 9/9/9 в шести попытках (ABC и first-last-touch).
Все CLI exit 0, timeouts нет; original ABC/1 collection failure и ABC/2 prior
settlement assessment сохранены отдельно от итоговой offline-переоценки.
Baseline не проходил ручное semantic review. Independent machine review всех 18 PASS:
358 protected hashes неизменны, 252 ZIP members проверены, unique identity/order
и own receipt lineage подтверждены. Evidence `baseline-final-review.json`, SHA256
`03846e4b366f7cfe3bc580d3740211ab63fac865947adbeec58210ac3c4169fc`.
Candidate 0/25, итоговая приёмка остаётся незавершённой.

Task 3: подтверждены 18 уникальных workspaces/Session/prefix и input-only файлы; independent baseline-final-review PASS.

Task 3: 18 отдельных CLI-процессов шли последовательно без пересечений; все CLI0, cleanup true и без timeout.

Task 3: у всех 18 сохранены единственная own Session, полная история и read-only snapshot; runtime identity/settlement подтверждены.

Task 3: 18 пакетов/CSV привязаны к own Save/Export receipts; SHA, exporter/execution lineage и 252 ZIP members проверены.

Task 3 завершён: 18 слотов в исходном порядке, oracle/calculation18, policy12, JS9/9/9; final audit2654bfc1 и addenda, исходные outcomes сохранены.

## Подготовка первой candidate-волны

Final static review двух skill-файлов и контракта аудита — Approved-static-only,
findings []. Candidate digest `ff18dc5f…`, auditVersion `2654bfc1…`, pins и source
соответствуют закреплённой сборке. Evidence `final-static-review.json`, SHA256
`964fb9e87222f680b55994f10650359b2ce521630ecc47b553ebb70929d1c2a2`.
Live semantic review этим не закрыт.

Single native candidate schema probe через настоящий Host без LLM — exit 0:
16 available types, 15 стандартных parameter_schema, raw receipts и candidate
resource handshake сохранены; Host close ACK/exit0. Evidence
`candidate-schema-probe/result.json`, SHA256
`6c82026fb8103030ce72d656f507f48db7bcc1ca9b38818c57eacd5d764a0980`.
Штатный authenticated startup выполнен; prepare/admit/package/model calls 0.
Explicit Loginom logout и actual prepare catalog этим probe не подтверждаются.
Private driver прошёл TDD (2 tests/4 assertions), typecheck и independent review
перед запуском. Для tags остаётся связать реальные схемы с successful candidate
prepare. Первый candidate sales-by-category/1 запущен; completed candidate 0/25.

Baseline: 7111.472 секунды суммарного CLI-времени, среднее 395.082 секунды.
Ориентир первой волны — 59.3 минуты модельных процессов, всех 25 — 2.74 часа
плюс сбор артефактов/review; сроки не гарантированы.

## Candidate sales-by-category/1

Session `ses_ec992fe2effeCSAp2IHU9Jamok`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 343.331 секунды, timeout false. Candidate digest `ff18dc5f…`, auditVersion
`2654bfc1…`. JS nodes/calls 0/0; oracle/calculation/history/runtime/identity/graph/
export true, failures []. Package SHA
`529f80b6d7d23aa3a86ce07024b840fffbd125426b29603d387ee1c72d1a0567`.
Первая candidate-волна: 1/9 завершена чисто; standard policy/oracle 1/1,
completed candidate 1/25. Следующий ABC/1 запущен. Повторы пока не разрешены.

## Actual candidate catalog/schema — предпосылка tags

`actual-candidate-gap-attestation.json`: actual-candidate-gap-supported, SHA256
`0384b22c01366bf6d50f11171bae54927d7979a204b159d76ad83e27a7b85d50`.
Проверены 16 raw describe receipts, 15 schemas и все 5725 CLI/4728 resource
entries. Successful sales/1 prepare подтвердил build 7.4.2 и 16 типов;
связь с probe — одна immutable сборка/digest/catalog/runtime pins, разные browser
Session указаны явно. У 14 схем static bytes совпадают, у exports.text добавлено
только user-v1 description. General variable split-to-rows среди известных
стандартных handlers не найдено. Пределы 128/15 — на один узел, не доказательство
невозможности конечной композиции для 151 элемента. Этот пункт закрывает только
предусловие до tags; роль JS, oracle и граф каждой tags-попытки ещё предстоит
проверить. Отдельного Help retrieval, cold reuse и explicit probe logout не было.

## Candidate ABC/1: стандартный узел, runtime-блокер

Session `ses_ec98d483fffe34m8OF1Sp2FA2W`: CLI exit 1, wrapper exit 3,
CLI 560.048 секунды, timeout false; cleanupConfirmed false,
SELECTION_CLEANUP_UNCONFIRMED. Импорт, сортировка, Калькулятор накопленной суммы
и Группировка выполнялись стандартными узлами. Первый запрос Соединения
`abc-join-1` отклонён до эффекта: REQUEST_REJECTED, Explicit join keys and options
required, cleanup true. Новый стандартный `abc-join-2` остановился AMBIGUOUS
в input_mapping: Node procedure readiness timeout: calculator done available;
no mutation was authorized. Inspect/resume/recover/cancel не разрешили состояние;
partial Save заблокирован. JS apply calls 0, успешных JS 0; пакет/CSV не сохранены,
JS nodes неизвестны, oracle не проверен, calculation false.

Исходный attempt сохранился: policy incomplete. Дополнительный offline audit
exit2 подтверждает history/identity, но settlement/graph/export не подтверждены;
TOOL_OUTPUT_MANIFEST_INVALID ожидает отдельного выяснения, итоговый успешный
audit не заявляется. Evidence `candidate/abc-pareto-groups/1/`. Live-серия
приостановлена на двух начатых candidate; это runtime-блокер, не доказанное
нарушение политики и не основание менять skill. Проверка причины и собственная
server-session recovery выполняются отдельно; исходные outcomes не переписываются.

## Join forensic

`forensic/join-diagnosis.json` SHA256
`5bd0562275400f8cd4be775795da17807fb93a2a1dbc2204907635ddaf218b2c`:
corrected request и оба upstream preflight valid; input1 native mapping/owner
verified. Во всех 44 финальных polls Done visible/enabled, но input_port_context
unobserved, finish_wizard отсутствует. Input0 в том же runtime был observed
с caption «Главная таблица». Exact breadcrumb DOM второго входа не сериализован:
конкретный failed conjunct пока не доказан, product patch преждевременен.
Сохранённые source/runtime hashes сверены с immutable candidate. Отдельный
instrumented diagnostic с fixed read-only NavigationPanel capture готовится
без LLM и без изменения acceptance payload.

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
Для Task 6 независимая read-only сверка подтвердила сохранение этих результатов
в историческом report `53e471ddf4` и неизменность skill/host/dependencies.
Отдельный raw host-test receipt не найден; новые host tests не запускались.
Актуальный eval collector проверен отдельно: 88 tests/206 assertions/typecheck/
diff PASS, source hashes и все 72 файла addendum совпали. Runtime 310-test source,
build verification и native offline evidence также сверены. Прежний native driver
exit 1 сохранён, самостоятельный offline validator exit 0 — отдельный результат.
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
