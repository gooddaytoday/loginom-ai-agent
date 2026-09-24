> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-d85e67cc5d7c` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Node16: третий Hermes остановлен на Close; диагностика продолжается — 13 сентября 2026

Run `20260913-205733-a38816e5`, candidate97809b7a/source721cf71f/runtimecd997be4,
user-v1, Sol/low: **FAIL**, PID74522 остановлен SIGTERM после неразрешимого
`:close` AMBIGUOUS/target (`Collapse input snapshot: native schema fingerprint`).
Exit-15, timeout=false,103 calls/12698 events; original runtime/harness unchanged.
Исходные export/audit сохранены с SHA в `original-export-hashes.json`; wide output
и сохранение отсутствуют. Model/MCP/browser processes проверены отсутствующими.
Координатор освободил слот, назначил его другому узлу. Новый Hermes не разрешён.

Девять завершённых случаев дают278 точных ячеек (60+44+20+75+55+24, пустые случаи0).
Это НЕполный успех. Координатор явно разрешил отдельную versioned reevaluation
того же raw export: исходный verifier не менялся; новый независимый verifier
в `unavailable:artifact-dd08b8faee38be4e` исправляет только documented user-v1 проекцию
(schema.header_tid и совпадающий sample.value/display_text) и единственную явную
привязку reconfigured→reconfigured-final. Исходная операция имела NOT_APPLIED,
effect=false,cleanup=true,0steps; cached replay совпал, resume отказан; между
ними выполнен тот же источник, новый request отличался только operation_id.
Новый отчёт `versioned-partial-reevaluation.json` подтвердил9cases и сохранил
full_goal_passed=false. 15 отрицательных подмен projection/recovery отклонены.
Original model identity не повышена до успешной: model был остановлен, wide и
full fresh/currentloss отсутствуют. Исходный audit не переписан.

Прямая UI-диагностика в отдельной копии `Node16-input-hash-20260913-205733.lgp`,
сессия `unavailable:artifact-c7a69cc483715c17`: на переоткрытом старом широком узле
native hash Uint8Array20/25fields/usage192,active=false,105/105references released.
Это пока не воспроизведение модельного отказа. Проверяется отличие нового узла
после Done до первого выполнения. После удаления старого узла в собственной
копии попытка создать новый получила отдельный Graph is blocked/target; этот
операторский AMBIGUOUS также сохранён. Не считать его модельным повтором или
успехом. Следующая диагностика использует чистую отдельную сессию.

---

# Node16: новый кандидат допущен к третьему Hermes — 13 сентября 2026

Координатор назначил node16:hermes-full:3:63038231 и эксклюзивный слот
`node16-hermes-20260913-97809b7a`. Candidate721cf71f собран на VPS, четыре файла
прошли побайтный readback, активации нет. Manifest SHA
`97809b7a970c7d2af1f802087c1422ef39a26882034c92d4d36cbefbad2799e2`.
Свежая настоящая user-v1 MCP rehearsal в `unavailable:artifact-2320dfeb00b6f9a6`
подтвердила READY7.4.2, текущий runtimecd997be4, расширенное окно и единственный
разрешённый каталог test-1/node16. Создан отдельный новый черновик; старая
диагностическая копия не использована. Bridge закрыт. Admission TOOLING_PASS/ready.
Binding tests14 PASS. Следующий шаг — назначенный полный повтор без нового запроса;
исторические FAIL и неполная автономная приёмка ниже остаются в силе.

---

# Node16: два отказа Hermes разобраны; новый кандидат требуется — 13 сентября 2026

Актуальный production source `721cf71f341bd978385a1dae41279ead08499ac9`, runtime
`cd997be4f90452d92c36195d62ef709e1db9b47a2f518389d38ea457b9dbe6aa` (172 inputs).
Node16 НЕ принят: полная автономная проверка десяти случаев, независимых открытий
и потери ответа ещё предстоит на новом кандидате и новом слоте координатора.

Первый Hermes `20260913-195029-9b0fa965` завершился exit0 без вызовов: историческая
формулировка задания заставила модель ждать допуска. Исправлено только описание
уже выданного допуска в сформированном запросе; замороженная цель не изменена.
Второй `20260913-200748-03313038` выполнил импорт и Свёртку, но получил исходный
AMBIGUOUS/read «static topology changed». Собственный PID68287 остановлен, записан
FAIL/-15; исходный результат сохранён. Координатор освободил слот. Новых запусков нет.

Причины подтверждены в отдельном живом Loginom7.4.2. Для имён «Импорт mixed» /
«Свёртка mixed» DOM-идентификатор нормализует пробелы в подчёркивания. Проверка связи
переведена на штатные объекты единственной связи, владельцев портов и их GUID
(commit `bb6b13ad`). После переоткрытия пакета временное FPortIndex отсутствует:
это независимо прочитано в собственной копии. Последний commit использует нулевую
позицию в штатной коллекции портов, сохраняя проверку родителей, типа и GUID,
повторные проверки вокруг каждого ожидания и обнаружение замены объектов.
Атомарность наблюдений не заявляется.

Полный клиент: **1517 PASS / 1 SKIP**, адресные проверки native link: **37 PASS**.
Настоящий MCP user-v1 на текущем runtime повторно выполнил сохранённый mixed:
**60/60 ячеек**, настройки, полная схема, source lineage и подтверждённые байты
совпали с замороженным oracle. Сохранение подтвердилось реальным публичным ответом
и журналом; empty/conflict/missing дали проверенные отказы до мутаций. Доказательства:
`unavailable:artifact-93393996ea3b9e71{operator-evidence,targeted-audit}.json`.
Это операторская диагностика, НЕ автономная приёмка. Предыдущие десять случаев
на runtime51 остаются историческими. Native/auditor suite: **38 PASS** (исторические
файлы явно заданы только историческим тестам); runner suite: **14 PASS**.

Общий Dock config не имел hermes_profile и выдавал diagnostic. Создана отдельная
закрытая копия `unavailable:artifact-7a571049187216b8` (0600) с user-v1 /
executor-replay. Она содержит секреты, не входит в Git/комплект. Runner теперь
отклоняет профиль без этой явной настройки до запуска модели. Внешний аудитор
связывает короткий workflow_id только с последней выданной ссылкой того же caller,
проверяет точную публичную проекцию сохранения и реальные формы MCP-ошибок.
Допуск кандидата также требует настоящую user-v1 rehearsal и metadata profile.

Текущая диагностическая MCP-сессия закрыта, отсутствие её процессов проверено.
Logout через ограниченный публичный UI не подтверждён; серверную блокировку
этой диагностической копии нельзя считать снятой. Предыдущая исходная диагностическая
копия также могла остаться заблокированной закрытой сессией. Новые модельные пакеты
должны иметь уникальные имена; чужие сессии/блокировки не изменялись.

Для следующего шага требуется пересобрать кандидат на VPS из нового минимального
комплекта184, проверить stage/readback, затем выполнить свежую user-v1 rehearsal
и получить новый эксклюзивный слот. Отличия от комплекта621bf7a4: изменены только
`packages/loginom-runtime/client/lib/variant-native-read.mjs` и `packages/loginom-runtime/tools/loginom-acceptance/run.py`; добавлен
ранее согласованный `packages/loginom-runtime/executor/capability-abi.json`. Полный исходник не передаётся.
Старый stage56b73b83 и старые rehearsal не переобозначены: admission сейчас BLOCKED.
Следующий Hermes сохраняет openai-codex/gpt-5.6-sol/low, timeout7200/max-turns140,
обязательный --dock-config с указанной частной копией, test-1 и прежний каталог.
Main/push/deploy/общий plugin не изменялись. Повторного полного review не было.

---

# Node16: исправление проверено, подготовлен переход к Hermes — 13 сентября 2026

Production source `621bf7a41657dfdc9da60c7510b9f212b8652d79`, runtime
`e33dd667c8e7eba1edd96a13621aa7251874198e2340e2efede15baa3681b98b` (172 inputs).
Сохранённые эффективные имена входа проверяются до open_input_port, повторно
непосредственно перед жестом. Missing field отказал без изменения active node/port,
связей или открытия мастера. Реальное EntityId→Id прошло до и после корректного
запроса: 75+75 ячеек, схема и настройки совпали. Full client1506PASS/1SKIP;
14 адресных тестов. Нет обещания атомарности snapshot; general sorting-preflight
и NULL последней правкой не менялись.

Историческая матрица:10cases/470cells плюс десять новых сессий с чтением реальных
CSV/LGP ДО записи, полным native topology/settings/readback — runtime51ceb0d1.
Её сырые данные заново проверены текущим диагностическим verifier с явно указанной
исторической версией. Это НЕ10cases на runtimee33. Текущая адресная проверка выше
подтвердила impact изменения; итоговый Hermes должен пройти все10cases заново.
Старый AMBIGUOUS после реальной деактивации оставлен без повышения до успеха.

Native producer collapse_native_sessions_v1 реализован. Простая JSON receipt
по-прежнему не принимается. Outer auditor использует реальные raw bytes, MCP пары,
journal, сохранённые package/port/link и все ячейки. Отказы conflict/empty проверяются
как невыделенные request.validate, missing — как settled NOT_APPLIED до первого
шага. 32native/auditor tests,8runner tests,2public-wire tests PASS.

Замороженная цель говорит «при неоднозначной операции», а не просит Hermes создавать
ошибку транспорта. Настоящая инъекция потери ответа выполняется независимым harness
после модельного прогона; outer требует её current runtime, operation_id текущего
run и реальные gesture/replay/resume. Старый diagnostic loss51 не может закрыть
model audit. Синтетическое событие collapse_independent_loss_observed больше не
требуется. Любой AMBIGUOUS модели сохраняет отрицательный итог до диагностики.
Done/Close проверяются и по модельным операциям, и независимо по сохранности настроек.

Готовый локальный runner остаётся BLOCKED до coordinator-owned candidate stage,
readback/rehearsal7.4.2 и выдачи единственного Hermes слота. READONLY_PRODUCER больше
не None; отсутствие запуска не выдаётся за отсутствие реализованного загрузчика.
Путь полной автономной приёмки ещё не проверен настоящим Hermes run. Node16 НЕ принят.
Все собственные диагностические браузеры закрыты с logout; очереди файлов пусты.
Main, push, deploy, общий plugin, memory routing не изменялись.

Следующий запуск: существующий run.py --run --goal collapse-node-complete,
--model-profile chatgpt-sol (openai-codex/gpt-5.6-sol/low), test-1,
http://logi-test-plan.bg.local/app/?testable=true,
/test-1/node16-20260913-a56c2488, timeout7200/max-turns140,
с точными manifest URI/SHA от координатора. Сразу после run: экспорт, десять
независимых сохранённых случаев через readonly-first, отдельный loss, полный outer
аудит. Exit0 или текст Hermes не являются критерием успеха. Новое полное review
не запускается. Команды не запускать до слота; нет автоматического polling.

Дальше — хронология исходной диагностики; старые OPEN/«не реализовано» ниже
описывают соответствующий момент и заменены текущим состоянием выше.

---

# Node16: native gates — текущая фаза

Фаза координатора: `node16:close-native-gates:1:fc92e69a`.
Source handler остаётся `77385e36`, runtime
`db6d957169c50bcd5cb169db80d744fd846b8ffa4eee683178619c001fb22bab`.
Новые изменения только в acceptance tooling. Hermes, merge, push, VPS,
установленный клиент и shared routing не затронуты. Фаза не завершена.

## Подтверждено

- `live-1789308981552`: header-only false — CASE_PASS, 0 строк, полная схема.
  Сохранён `Node16-native-gates-20260913.lgp` в собственном каталоге
  `/test-1/node16-20260913-a56c2488`.
- `live-1789310363604`: новая browser/session/document. Режим `--readonly-first`
  скачал CSV 13 B и LGP 8802 B до создания action runtime. CSV и пакет побайтно
  совпали с baseline; пакет SHA
  `1f29a2919682daaa96085bca7e82db96a21639c0261f320f4f54f2954ed11bda`.
  Native XML Component обоих узлов и link/port GUID совпали. Это readonly
  diagnostic PASS, не autonomous admission или повторное исполнение.
- Там же header-only true — CASE_PASS, 0 строк. Реальный сохранённый пакет
  `Node16-gates-header-ignore-20260913.lgp`, 8781 B, SHA
  `8c652e4b47c0c7ed95e86b546e3058c11fa920617fe958fa9cdf8842b400082d`.
- `live-1789311024793`: отдельный чистый all-null опыт после закрытия предыдущей
  сессии. All-null false — CASE_PASS (5×4, 20 ячеек); true — CASE_PASS (0×4).
  `Node16-native-all-null-clean-20260913.lgp` и
  `Node16-native-all-null-ignore-clean-20260913.lgp` сохранены. Их отдельная
  fresh-session проверка ещё впереди. Mixed 15×4/60 и ignore 11×4/44 также CASE_PASS; отдельные пакеты сохранены.
- 14 локальных проверок native XML и readonly trace прошли с указанными
  настоящими диагностическими файлами. Эти тесты не доказывают автономную цель.

## Таймаут доставки и снятая гипотеза

Исходная операция `node16-native-1789310610915:upload-all-null` осталась
`settled / AMBIGUOUS / destination`, `upload_submitted_or_unknown=false`.
Её статус не переписан; resume/replay не выполнялись. Сырой журнал:
`live-1789310363604/browser-390…581.json`. TF-8 была открыта в `/`, затем
активировалась существовавшая TF-5 в конечном собственном каталоге; ожидание
промежуточного `/test-1` не завершилось. Почему Loginom переключил вкладку,
не доказано; production исправление не предпринималось.

Первая диагностика ошибочно включила скрытый старый msgbox в список видимых:
`checkVisibility()` без `checkVisibilityCSS`. Гипотеза о save conflict была снята
строгим повторным наблюдением, сообщена координатору как ошибочная. Отмена
отказала до жеста, так как `innerText` скрытого окна пуст. Реальные LGP старого
пакета и новой ещё не настроенной all-null копии скачаны; их Component/link
совпали, источник в обоих оставался header-only. Не считать копию all-null PASS.

Оба file input привязаны по объектной идентичности к `FFileInput` своих
FileStorageForm; files=0. У обеих managers active loaders=0, upload/download
paths пусты, коллекции upload/download loaders пусты. Исходный upload ID не
зарегистрирован в executor. Подтверждены logout, закрытие harness/browser и
отсутствие процессов профиля. Только после этого координатор разрешил новый
независимый опыт с новыми session/path/CSV/ID.

## Mapped: ограничение выбранного existing-source patch

В live-1789311024793 проверенный новый mapped CSV доставлен через единственную
Files вкладку. Existing Import patch остановился с AMBIGUOUS: поле Zone
отсутствует в parsed source. Реальный мастер показывает прежние Id/I/R/S/B/D.
Исходный запрос не повторяется и не повышается до успеха; product handler не
меняется. Для другой структуры нужен отдельный опыт с новым import и полным
описанием колонок. Mapped/wide и общий persistence остаются OPEN.

## Остаётся

Полная матрица 10 cases, fresh-session byte/settings/topology/readback для всех
сохранённых результатов, настоящий loss evidence bridge, интеграция в outer
runner, минимальный coordinator-owned candidate packet. Все недоказанные gates
остаются OPEN. `READONLY_PRODUCER=None`, Hermes заблокирован.

Raw evidence сохраняется под `unavailable:artifact-1f3f00ac9e4d7670`; исторические manifest/receipts
не исправляются задним числом. Рабочие `native-gates` инструменты не являются
приёмочным допуском только потому, что локальный verifier вернул PASS.

## Новый Import: точный регистр Null marker

`live-1789311587730`: новый import правильно распознал Zone,S,Id,D,B,R,I.
Настройка остановилась на шаге 34 (`set_wizard_field` null_marker=`NULL`):
жест подтверждён, после blur прочитано `null`, ответ
`WIZARD_FIELD_NOT_CONFIRMED`. Native combobox содержит отдельные записи `null`
и `NULL`; фактические `lastQuery='NULL'`, `value/rawValue/lastValue='null'` сохранены в raw.
Точный видимый пункт `boundlist;NULL` найден. Public попытка выбрать его отказала
до жеста из-за pending node phase; первоначальный AMBIGUOUS не сброшен.
Координатору направлен минимальный scope для text-import-procedure: выбирать
точный предустановленный Null option вместо текстового ввода с неоднозначным
регистром; произвольные маркеры и fail-closed проверки сохранить. Client source
пока не изменён; успех mapped не заявляется.

## Разрешённый точечный перенос исправления

Решение координатора `node16:null-marker-transfer:1:814f3146` разрешило hunks
из `814f31467b8e93fa9bd27225edb3ec0074d4bd15` только для
`packages/loginom-runtime/client/lib/text-import-procedure.mjs` и `packages/loginom-runtime/client/test/text-import-wide.test.mjs`.
Patch применился без конфликтов; ordered upload lineage не менялся. Дополнен
focused тест произвольного `\N` marker. Перенос закоммичен:
`370020bcff06e1ab39f9d6b13b6066b2733c453a`.

Новый runtime: `51ceb0d186560a82c7f91b54390bf6300945456bc052c5358d3a948ca534ab1e`.
Полный клиентский suite: **1492 PASS / 1 SKIP / 0 FAIL**. Первый запуск в sandbox
сохраняется как неуспешный: loopback tests получили EPERM; повтор с разрешёнными
локальными сокетами прошёл. Производственная функция совпадает с исходным
исправлением узла14; альтернативная реализация не добавлена.

Старый новый mapped draft закрыт без сохранения после пустого upload manager;
старый AMBIGUOUS остаётся историческим. В **новой** `live-1789312084497` импорт
выбрал `NULL`, настроил все 7 полей; mapped **CASE_PASS 15×5/75** и Save As
прошли. Другие случаи на старом runtime не повышаются автоматически до
final-current: необходимая перепроверка и fresh-session evidence ещё впереди.
Активные SOURCE/RUNTIME runner обновлены, неизменяемый исходный acceptance-kit
сохранён как историческая исходная заморозка fixtures/expected goal.

## Текущая диагностическая матрица и реальный loss

Все десять исходных cases дали CASE_PASS, всего 470 ячеек. Реальные CSV+LGP
(16 уникальных файлов) скачаны из собственного хранилища; registry и raw replies
сохранены локально. В live-1789312084497 текущий runtime подтвердил mapped,
mapped-ignore, reconfigured и wide; первые шесть исторических случаев требуют
fresh execution на текущем runtime, это выполняется отдельной цепочкой.

В отдельной копии Node16-native-obligations-fixed-20260913.lgp Done применил
ignore_empty=true без execution. Close с false вернул configuration=discarded;
следующий readback без параметров сохранил true, также без execution.
Реальный set_checked false выполнен в browser-3538, затем ответ намеренно потерян.
Operation `node16-native-1789312112124:lost-flag` осталась AMBIGUOUS/configure.
Повтор того же публичного запроса и resume оставили browser sequence 3538;
resume завершился отказом unresolved phase. Native browser-3539 подтвердил false
и исходные Id/M1…M24. `verify_loss.py` сравнивает raw gesture, public envelopes,
исходный outcome и native state; одного JSON утверждения ему недостаточно.

## Обнаруженный negative existing-node блокер

В live-1789314289104 fresh mapped успешно прочитан (75 ячеек, точные native
байты/Component/link/параметры). Первоначальная проверка format остановилась на
эквивалентных видимых обозначениях: `;`/«Точка с запятой», `"`/«Двойная кавычка
(")», `.`/«Точка (.)». Добавлены только эти наблюдённые пары **после точного
сравнения Component**; NULL/null, другие маркеры и разделители не нормализуются.
Повторный offline verifier прошёл; сценарий не запускался повторно.

После завершённого mapped readback отрицательная операция существующей Свёртки
`20260913-152627-90db97e6:diagnostic-negative-missing-complete` с полным набором
information=[Id], transposed=[__MissingField__] получила
AMBIGUOUS/input_mapping/effect_possible=true/cleanup_complete=false,
`Collapse input field missing: __MissingField__`. Сохранён видимый мастер входного
сопоставления; execution отсутствует, пакет не сохранялся. Исходная операция не
повторялась. Контракт no-effect для этого existing-node случая **не доказан**.

Причина по исходникам: sorting-preflight.mjs намеренно откладывает валидацию
existing node до эффективной схемы input wizard, поскольку сохранённые имена
могут отличаться от upstream. collapse-preflight.mjs использует этот путь.
Отказ resolveCollapseParameters после открытия мастера остаётся консервативным
AMBIGUOUS. Production исправление этого поведения не входило в разрешённый NULL
transfer и не выполнено. Координатор уведомлён отдельным blocker event.

Ранние неверно составленные диагностические negative requests (без budgets и
без полного information/transposed) сохранены как ошибки harness, не приняты как
доказательство missing-field. Конфликт ролей и пустой список получили настоящие
MCP validation errors без browser work. Их envelope отличается от worker
NOT_APPLIED; полный outer obligations пока не объявляется прошедшим.

После проверки пустых native upload/download managers выполнены logout и close;
процесс 53802 отсутствует. Оставшиеся fresh cases запускаются в новых сессиях.

## Уточнённый эффект и разрешённое продолжение

Raw browser-356 подтвердил, что open_input_port не был простым чтением:
input_port_menu_verified → input_port_deactivation_question_verified(true) →
input_port_deactivation_issued → input_port_wizard_verified. Это единственный
node_step данной неуспешной operation. После него browser-359 прочитал mapping
stores; редактирования/commit настроек, создания узла/связи, execute/save в её
журнале нет. Нет отдельного post-failure Component snapshot, поэтому отсутствие
всех конфигурационных побочных эффектов не утверждается. Сводка сохранена в
missing-field-effect-evidence.json рядом с сырыми ответами.

Координатор разрешил продолжить в том же этапе: только Collapse existing-role,
сначала доказать readonly эффективный вход и identity/version binding до
open_input_port, затем локально перенести resolveCollapseParameters; upstream
имена не подставлять, общий sorting-preflight и NULL не менять. На stale,
incomplete, foreign snapshot — отказ до жеста. Нельзя выдать безусловный отказ
всех existing за исправление. Hermes и полное повторное ревью не разрешены.

В новой live-1789314876117 подготовлена отдельная собственная копия
Node16-existing-input-preflight-20260913.lgp. Production source пока не изменён.
В active-node исследовании native graph cache пуст; найден наблюдённый readonly
путь InputPort.get_Socket → QueryInterface(IBGTuneDataSourceSocket) →
get_TuneDataSource → get_Columns. Чтение полного списка, get_Active и
GetColumnsHash(PresentUsageTypes) сохранило node=1/state=0/input=1 и link GUID.
GetColumnsHash без аргумента возвращал пустой массив: это ошибка ранней
диагностики, не version proof. Правильный аргумент берётся из самого columns.
Hash — native schema bytes с верхним регистром имён и типами, **не монотонная
версия и не обещание атомарности**; точные имена нужно дополнительно сравнивать.
В отдельной копии старый runtime успешно переназначил Id→EntityId, затем выполнил
узел с точным чтением. Проверяется, что readonly путь возвращает EntityId из
эффективного входа, а не исходное upstream Id.

## Hermes: первый запуск без действий; повтор ожидает слот

Назначение node16:hermes-full:1:be4073fc. Координатор собрал/staged/readback
кандидат2026.09.13-node16-621bf7a4-candidate, SHA
56b73b83ad8ccaf5da652fbed5ce80752658723635c15ec0eaafeaf15e619c4d, без активации.
Настоящий MCP rehearsal unavailable:artifact-c80601301a714d17 подтвердил
READY7.4.2, текущий runtimee33, тот же manifest/action/selectors, candidate Collapse,
exactstorage root и окно1508×862/outer1508×949/available1512×949, viewportnull.
Обработчик здесь не выполнялся; пакет открыт без редактирования, bridge/browser закрыты.
Штатный preflight Hermes0.21.0/openai-codex/gpt-5.6-sol/low PASS.

Первый вызов --run отказал до создания run из-за старого общего budget3600/100.
Разрешённые7200/140 добавлены только для Collapse, границы проверены тестом.
Затем run20260913-195029-9b0fa965 реально запустил PID66305, завершилсяexit0,
1APIcall/23672tokens,0tools/0calls/0events. FULL audit FAIL: отсутствуют действия.
Единственный final: «Задание принято и заморожено. До отдельного явного допуска
ничего в Loginom не запускаю и не изменяю». Это подтверждённая причина остановки:
исторический заголовок frozen template, не ошибка handler/auth. Попытка сохранена
без переобозначения успехом; процессов PID/run/browser после неё нет.

Rendering runtime prompt исправлен: заголовок требует выполнить задание сейчас,
явно указан уже выданный допуск. Frozen template/fixtures/oracle неизменны.
Каждый итоговый случай сохраняется отдельным пакетом с одной Import→Collapse парой
для уже проверенного независимого аудитора; основной путь прямо в выделенном
каталоге, без предположения о существовании дочернего packages. Не изменены
семантика десяти случаев, точные клетки или требования сохранности.

После освобождения слота координатор передал его Node17. Второй model run НЕ
запускался. Допуск теперь читает canonical coordinator registry и отказывает, если
его owner не Node16/этот task/этот candidate/Sol-low. Финальный auditor проверяет
сохранённый допуск исходного запуска, а не владение слотом после завершения модели.
13адресных runner/admission tests PASS. Следующее действие — новое назначение
эксклюзивного слота координатором, затем обоснованный повтор с исправленным prompt.
Node16/hermes_acceptance/subplan_complete остаются FALSE.
