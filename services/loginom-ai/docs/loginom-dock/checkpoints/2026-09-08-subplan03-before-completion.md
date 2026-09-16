> **8 сентября 2026, 22:29 МСК:** configuration readback реализован; полный MCP run222113 delivery/output/save/reopen/readback/public audits PASS на полном pin83. Новый Hermes222819 достиг model_started (Sol/low), итог ожидается. [Checkpoint](../resume-checkpoint.md).

> **8 сентября 2026, 22:12 МСК:** четвёртый Hermes `20260908-220328-c2a6b6f2` frozen FAIL (лишний UI после успешного reexecute). Выявлена и исправлена отдельная ошибка optional target.label в verifier: import120 PASS, persistence diagnostic PASS/3 negatives. Следующий шаг — наблюдённые настройки в публичном результате обработчика, Codex verification, затем новая автономная приёмка. [Точный checkpoint](../resume-checkpoint.md).

> **8 сентября 2026, 22:04 МСК:** текущий remote delivery/output/persistence и полный pin82 PASS; общий operator audit FAIL из-за отклонённого до UI ошибочного target. Исправленная операция успешна. Новый Hermes `20260908-220328-c2a6b6f2` достиг model_started (Sol/low); итог ещё не принят. [Точный checkpoint](../resume-checkpoint.md).

> **8 сентября 2026, 21:50 МСК:** новый source replacement PASS/12 negatives;
> неверные integer/real→Null PASS/5; полный pin8d8967ca…e9d5/82files.
> Post-Execute graph unlock принят live без повторного жеста. Полный03 открыт.
> [Checkpoint](../text-import-node.md).

> **8 сентября 2026, 21:39 МСК:** общий stop с зависимостью принят на новом
> pin d5d46052…ec2c4b/82files, PASS/7 negatives, replay без действий.
> Missing-source отказ на том же pin PASS/9 negatives. Полный03 открыт.
> [Точный checkpoint](../text-import-node.md).

> **8 сентября 2026, 21:33 МСК:** typed cancel в группе с зависимостью принят,
> PASS/6 negatives. Общий stop driver расширен; client1015 PASS/1 SKIP.
> Новый driver live ещё не принят. Полный03 открыт.
> [Точный checkpoint](../text-import-node.md).

> **8 сентября 2026, 21:21 МСК:** canonical Save As → node.apply без закрытия и
> final save → reopen → новое выполнение без настройки приняты, два PASS/5 negatives.
> Pin2843807e…448f9e/82files; полный03 открыт: multi-process stop/matrix/Hermes/release.
> [Точная точка продолжения](../text-import-node.md).

> **8 сентября 2026, 21:10 МСК:** единый runtime node.apply с отдельным
> портом принят компонентно, PASS/5 negatives, output3×2, replay без browser.
> Client1009 PASS/1 SKIP. Полный03 открыт: navigation/stop/matrix/Hermes.
> [Точная точка продолжения](../text-import-node.md).

> **8 сентября 2026, 20:58 МСК:** separate lifecycle связан в оболочке
> через node_finish/output_mapping/finishGraph. Tests1000 PASS/1 SKIP.
> Единый live node.apply ещё не принят; полный03 открыт.
> [Точная точка продолжения](../text-import-node.md).

> **8 сентября 2026, 20:53 МСК:** общий typed graph launch принят
> компонентно, PASS/6 negatives, output3×2; client987 PASS/1 SKIP.
> Связка отдельного port Done→launch внутри одного node.apply ещё открыта.
> [Точная точка продолжения](../text-import-node.md).

> **8 сентября 2026, 20:43 МСК:** процесс с зависимостями после reopen
> принят компонентно, PASS/6 negatives, output3×2. Общий graph launch и
> Save As navigation остаются открыты. Полный03 не завершён.
> [Точная точка продолжения](../text-import-node.md).

> **8 сентября 2026, 20:38 МСК:** native-owned выбор процесса с зависимостями
> добавлен, client973 PASS/1 SKIP. Live-проверка не принята: пакет только для
> чтения, запуск не состоялся. Полный03 открыт.
> [Точка продолжения](../text-import-node.md).

> **8 сентября 2026, 20:26 МСК: batch mapping и deactivation приняты компонентно.**
> Batch/exclusion/rename/order/autosync/Done PASS на pin76d5…f444/82files;
> save/reopen output3×2 PASS. Client960 PASS/1 SKIP. Полный03 открыт:
> graph Execute/new-process freshness, remaining matrix и Hermes ещё нужны.
> [Checkpoint](../text-import-node.md).

> **8 сентября 2026, 20:02 МСК: exclusion channel и сохранённый выход.**
> Pin0317f14a…898ae/82 files: common channel/typed Done PASS,9 negatives;
> save/reopen/unchanged operator output3×2 PASS,5 negatives. Client954 PASS/1 SKIP.
> Active-port deactivation и batch integration ещё нужны. Подплан03 открыт.
> [Checkpoint](../text-import-node.md).

> **8 сентября 2026, 19:22 МСК: отдельный мастер порта привязан к узлу.**
> Private opener/native context — live component PASS, повтор без кликов;
> client947 PASS/1 SKIP. Общий runtime gate/journal и exclusion driver ещё нужны.
> [Checkpoint](../text-import-node.md). Подплан03 открыт.

> **8 сентября 2026, 19:07 МСК: чтение группы исключённых полей принято отдельно.**
> Live reader/independent component PASS, client940 PASS/1 SKIP. Для полного
> driver ещё нужны отдельный port-open receipt и native ownership binding;
> прежний wizard_model guard сохранён. [Checkpoint](../text-import-node.md).
> Подплан03 открыт, Hermes frozen FAIL не изменён.

> **8 сентября 2026, 18:27 МСК: existing Close принят.**
> Seed/edit/Close/unchanged Execute3×3 — независимый PASS на pin172a9d84…a590,
> 8 negatives; client937 PASS/1 SKIP. Исправлены lock readiness и read-only
> mixed snapshot. Все процессы закрыты. [Checkpoint](../text-import-node.md).
> Подплан03 открыт; remaining matrix и финальный Hermes ещё необходимы.

> **8 сентября 2026, 18:17 МСК: третий Hermes — frozen FAIL.**
> Повторная настройка после reopen и последняя перезапись не доказывают persistence.
> Уточнён native skill; новый pin7e943d44…5b66, preflight PASS. Mode matrix: все8 source/output PASS. Existing Close проверяется.
> [Точная диагностика и продолжение](../text-import-node.md). Подплан03 открыт.

> **8 сентября 2026, 17:53 МСК: исправлено ожидание MCP перед Hermes.**
> Второй run не получил tools и не принят. Гонка15s/16.5s доказана без модели;
> ожидание180s проверено: tools зарегистрированы через18.07s до agent build.
> [Checkpoint](../text-import-node.md); новая приёмка впереди.

> **8 сентября 2026, 17:44 МСК: source-name binding и полный remote цикл приняты.**
> Запрос Hermes прошёл delivery/import/two saves/reopen/fresh output6×5;
> independent audits PASS, client935 PASS/1 SKIP. Новая Hermes приёмка впереди.
> [Checkpoint](../text-import-node.md); подплан03 открыт.

> **8 сентября 2026, 17:36 МСК: автономный прогон выявил positional field binding.**
> JSON key-order navigation исправлен и воспроизведён remote MCP. Следующий fix —
> привязка source settings по source_name, независимо от порядка перечисления.
> Hermes acceptance FAIL, подплан03 открыт. [Checkpoint](../text-import-node.md).

> **8 сентября 2026, 17:25 МСК: измерения и матрица приёмки.**
> Добавлены независимые измерения phases/calls/tokens, 26 tests PASS. Восемь
> исторических output cases перепроверены. Hermes preflight PASS, run ещё не был.
> [Матрица оставшейся приёмки](../../plans/loginom-dock/03-acceptance-matrix.md); подплан03 открыт.

> **8 сентября 2026, 17:19 МСК: позднее восстановление workflow принято live.**
> Потерянные ответы восстановлены через исходную квитанцию и явный resume,
> без повторного клика; fresh output 3×3, независимые audits PASS/10 negatives.
> Client933 PASS/1 SKIP. Это operator diagnostic; подплан03 и Hermes gate открыты.
> [Точная точка продолжения](../text-import-node.md).

> **8 сентября 2026, 17:09 МСК: полный remote sales цикл принят Codex.**
> Delivery, импорт 6×5, intermediate save, final save/reopen и unchanged reexecute
> подтверждены независимыми component audits; 9 повреждений evidence отвергнуты.
> Это operator-прогон, Hermes не запускался. Подплан03 открыт.
> [Точная точка продолжения](../text-import-node.md).

> **8 сентября 2026, 16:58 МСК: workflow activation принята live; transport исправлен.**
> Client927 PASS/1 SKIP, Python113 PASS. Новый pin ещё без live полного импорта.
> [Checkpoint](../text-import-node.md). Подплан03 открыт.

> **8 сентября 2026, 16:48 МСК: no-effect target refusal исправлен.**
> 75 focused tests PASS; возврат в original workflow ещё не добавлен.
> [Checkpoint](../text-import-node.md). Live/Hermes остаются впереди.

> **8 сентября 2026, 16:44 МСК: real bridge выявил отказ после delivery.**
> Files остаётся активным вместо prepared workflow; target preflight не прошёл.
> [Точный checkpoint](../text-import-node.md). Нужен Codex fix до Hermes.

> **8 сентября 2026, 16:36 МСК: общий аудитор сценария подключён.**
> 50 focused tests PASS; положительный full-chain live replay аудитора ещё нужен.
> [Checkpoint](../text-import-node.md). Полный03 остаётся открытым.

> **8 сентября 2026, 16:30 МСК: public node/save/delivery proofs добавлены.**
> 41 focused tests и historical delivery re-audit PASS. Полный auditor и live
> rehearsal ещё нужны. [Checkpoint](../text-import-node.md).

> **8 сентября 2026, 16:24 МСК: исправлен экспорт новых инструментов.**
> Real prepare binding и persistence/output composition добавлены; 36 tests PASS.
> Полный outer auditor, live rehearsal и Hermes ещё впереди.
> [Checkpoint](../text-import-node.md).

> **8 сентября 2026, 16:19 МСК: подготовлены части полного auditor.**
> Проверки sales goal и двух save receipts: 19 focused tests PASS. Полная связка
> с bridge/persistence/output/model gates и живой rehearsal ещё впереди.
> [Точный checkpoint](../text-import-node.md). Подплан03 открыт.

> **8 сентября 2026, 16:06 МСК: result schema и настоящий candidate bridge готовы.**
> Client919 PASS/1 SKIP; полный live public save/reopen/output и source80 PASS.
> На VPS staged node-apply.1-candidate (без activation), persistence revision2.
> Автономный goal-only Hermes и полный final audit ещё не выполнялись.
> [Точная контрольная точка](../text-import-node.md).

> **8 сентября 2026, 15:44 МСК: live public wire/persistence приняты.**
> Два operator MCP runs на полном pin56996d5e…fc05: final save/reopen/reexecute;
> возврат из другого Files каталога, intermediate save и отдельный QA reopen.
> Source79 files / independent audits PASS. Автономный Hermes через настоящий
> bridge и оставшийся scope ещё не приняты. [Checkpoint](../text-import-node.md).

> **8 сентября 2026, 15:33 МСК: candidate MCP API подключён в source.**
> Node apply/resume/status/wait/cancel/stop и delivery/status/resume доступны в
> executor-replay; схемы и MCP проверки PASS, client911 PASS/1 SKIP.
> Живой public путь, полная persistence и автономная Hermes приёмка ещё впереди.
> [Точная точка продолжения](../text-import-node.md).

> **8 сентября, 15:21 МСК: private delivery resume принят на двух границах.**
> Upload/verified pause → resume → fresh import/output, independent PASS/12 negatives.
> Потеря UI документа оставляет transfer unresolved без повтора (отдельный audit PASS).
> Full pin f34ec440…6b24; client907 PASS/1 SKIP. Подплан03 не завершён.
> [Точная контрольная точка](../text-import-node.md).

> **8 сентября, 15:10 МСК: lost upload/download replies восстановлены без повторов.**
> Full source pin c631c031…d2b0, independent PASS/12 negatives,78 files verified.
> Reject/replace перепроверены. Старые pins не охватывали все новые модули;
> прежние live evidence не доказывают full source binding. Подплан03 не завершён.
> [Точная контрольная точка](../text-import-node.md).

> **8 сентября, 15:01 МСК: private delivery reject/replace приняты.**
> Оба fixed-pin live прошли independent audit и по10 negatives; client895 PASS/1 SKIP.
> Recovery, public contracts, полный persistence/Hermes scope остаются.
> [Точная контрольная точка](../text-import-node.md).

> **8 сентября: integrated delivery → import/output принят independent audit.**
> Fixed pin b35140e0…b960, 8 negative audits; client876 PASS/1 SKIP.
> Полный03, integrated persistence и Hermes остаются открытыми.
> [Точная контрольная точка](../text-import-node.md).

> **8 сентября: source integrated delivery добавлен, live ещё не принят.**
> Client868 PASS/1 SKIP; pending upload требует bounded row reveal перед verify.
> [Точный checkpoint исходной отправки](../text-import-node.md).

> **8 сентября: длительное execution wait принято на generic live diagnostic.**
> Истечение15s окна → продолжение того же процесса → stop25s → cancelled.
> Independent9 negatives; client859 PASS/1 SKIP. Полный03 остаётся in progress.
> [Контрольная точка](../text-import-node.md).

> **8 сентября: runtime stop подключён к ожиданию imports.text.**
> Source tests PASS; live completed race вернул свежий результат без Cancel.
> Independent7 negatives; client857 PASS/1 SKIP. Running import stop и полный03
> ещё не приняты. [Контрольная точка](../text-import-node.md).

> **8 сентября: private execution driver stop принят live journal audit.**
> Один Cancel, same child cancelled, cleanup; replay без новых действий.
> 7 negatives rejected; client854 PASS/1 SKIP. Общий runtime/import stop ещё остаётся.
> [Контрольная точка](../text-import-node.md).

> **8 сентября: typed cancel_process primitive принят live independent audit**
> Один адресный stop того же running child; 9 negatives rejected, client849 PASS/1 SKIP.
> Общий driver/runtime stop, recovery и полный03 ещё не приняты.
> [Контрольная точка](../text-import-node.md).

> **8 сентября: background cancel/resume до и после Execute принят**
> По7 negative audits; большой CSV2500000 rows/sample10 также принят.
> Running/stop не наблюдались; client839 PASS/1 SKIP. Полный03 остаётся.
> [Checkpoint](../text-import-node.md).

> **8 сентября: private async start/status/wait принят на полном import3×3**
> Independent PASS, 7 negatives; client837 PASS/1 SKIP.
> Server stop/long execution/recovery и полный03 остаются.
> [Checkpoint](../text-import-node.md).

> **8 сентября: finish-boundary resume с тем же execution принят**
> Independent output3×3 PASS, 8 negatives; client834 PASS/1 SKIP.
> Требуется unchanged UI epoch; long/unknown recovery и полный03 остаются.
> [Checkpoint](../text-import-node.md).

> **8 сентября: mapped resume66/132 и отказ изменённой Done label приняты**
> независимыми audits (8 и 5 negatives); client833 PASS/1 SKIP.
> Полный03 не завершён; далее finish/execution recovery и remaining scope.
> [Checkpoint](../text-import-node.md).

> **8 сентября: live отказ resume при изменённом Null принят**
> на `1ee86f2b…16063`, 5 negatives; partial outcome сохранён.
> Далее output_mapping continuation; полный03 не завершён.
> [Checkpoint](../text-import-node.md).

> **8 сентября: configure-boundary resume принят независимым live audit**
> на `b5e01bec…e07a2`, 9 negatives; полный recovery и весь03 ещё не приняты.
> [Точка продолжения](../text-import-node.md).

> **8 сентября: работа возобновлена по новому указанию пользователя.**
> Wide66 independent PASS на `19f59302…528a0`: 66 полей/132 значения, 6 negatives.
> Полный подплан не завершён; далее continuation/recovery и остальной declared scope.
> [Актуальная точка продолжения](../text-import-node.md).

> **8 сентября: остановлено по просьбе пользователя. Не продолжать автоматически.**
> Existing mapped patch и mapped persistence/reexecute приняты; wide66 после
> исправления точки клика ещё не принят. [Точка остановки](../text-import-node.md).

> 8 сентября: private node.apply принял configured output names/labels, rename
> cycles, order и autosync. Independent полный source/upload/Execute/output3×3
> PASS `execute-1788851403379`, runtime `f32f9454…fb352`, 15 negatives rejected;
> client826 PASS/1 SKIP, Python171 PASS. Mapping persistence/existing/wide и
> остальной03/Hermes ещё не приняты. [Checkpoint](../text-import-node.md).

# 03. Настройка текстового импорта

Статус: **in progress**. Этапы V1/V2. Начата реализация 7 сентября 2026:
живой путь добавления, настройки формата, output mapping, Execute и быстрого
просмотра исследован через source-runtime MCP. Локальное восстановление строгого
отказа `UI_EPOCH_CHANGED` проверено на picker `UnitPrice/data_kind`.
8 сентября подключён приватный executor lifecycle; настройка широкой схемы из
12 полей без reopen прошла отдельный живой audit. Полный node.apply, mappings,
выполнение, сохранение и самостоятельная приёмка ещё не приняты.
Связанный приватный Done с verified upload, тремя полями и повтором ID прошёл
живой независимый audit `done-1788818542964` (runtime 46c85868…328d5).
Кандидат ограничен UTF-8 и identity mapping; имена, метки и выбор полей
поддержаны, живые независимые Done audits прошли для 3 → 2 и 66 → 65 полей
(runtime `13f4bf84…46c552`).
Приватный Execute без чтения данных прошёл независимый живой audit
`execute-1788824763884` (runtime `8eebe5c3…c01a4f`): новый процесс связан с
GUID узла, повтор ID не обращается к браузеру. Пользовательский mapping ещё не допускается. Ограничение восьмью
полями снято: широкая схема читается адресными страницами с guarded scroll,
живой независимый Done audit на 66 полях прошёл в `done-1788821223647`
(runtime `aeb52b99…73f6`, 228 шагов, две прокрутки).
Связанный private Execute с чтением выхода 0 принят на fixed source runtime
`010f8ca8…35f00`: независимые audits verified bytes/upload → configure → новое
выполнение → полный малый выход прошли для 3 × 3 и 66 × 2. Typed values сохраняют
integer строки и точный real format; Null/empty различаются. Это не готовность
полного подплана: persistence/reopen, остальные режимы/ошибки/recovery и Hermes
ещё не приняты. DateTime/Boolean возвращают явные ограничения display precision.
Дополнительно приняты source live audits Windows-1251/1252, UTF-16 LE/BE
и UTF-8 с нулём строк. Последний runtime `c06054fc…87f7`; 716 client tests
прошли, один пропущен. Выбор кодировки использует штатный picker; гонка
закрытия Filter допускает только ограниченное обновление read-only адреса.
TSV с двумя пропущенными строками, quoted tab и decimal comma также прошёл
independent live audit `execute-1788831312928` (runtime `cfe11dc6…5b46`).
Последние проверки: 717 client PASS, 1 SKIP; 122 Python evidence PASS.
Это частичная приёмка входных форматов; остальные обязательства 03 сохранены.
Close подключён к private handler: точное подтверждение закрытия, discarded
checkpoint, без выполнения/выхода. Новый импорт прошёл независимый Close +
source roundtrip audit `close-1788832782412` (runtime `341914d7…6f36`).
Headerless Execute с переименованием COL1..COL3 прошёл independent output audit
`execute-1788833068233` на последнем runtime `45e6ecaf…8ae2`.
Client 721 PASS, 1 SKIP; Python evidence 125 PASS. Sparse existing changes,
пакетное сохранение/recovery и вся финальная приёмка остаются незавершёнными.
Для existing import дополнительно проверены деактивация и ранняя инициализация
полей; добавлен source-ready guard. Partial updates теперь подключены для existing target.
Изменение метки с сохранностью остальных настроек прошло отдельные independent
draft audit и Done/reopen QA; fixed-pin полный existing node.apply ещё не принят.
Аудитор columns patch отверг восемь искажённых журналов. Source/format patches
требуют дальнейших проверок. Автоматическая деактивация подключена: отдельные
живые independent audits opening с вопросом и без вопроса прошли; это не полная
fixed-pin existing операция сама по себе. Затем полный source прогон
seed Execute → existing partial label → Execute/output 3 × 3 прошёл independent
audit `execute-1788836470480` на runtime `ab249748…7ee9e`. Незаданные параметры
сохранены, execution IDs разные. Wide 66 × 2 также прошёл independent audit
`execute-1788836664324` на том же runtime. Client 736 PASS,
1 SKIP; Python evidence 141 PASS. Полный scope сохранения/recovery/Hermes остаётся.
Связанная композиция seed Execute/read → возврат из Table → existing partial
label → Execute/read → возврат прошла independent fixed-pin audit
`execute-1788838091682` (runtime `6313491f…091e3`, оба выхода 3 × 3).
Поддержаны numbered Table cards с native binding; 20 подмен отвергнуты.
Client 750 PASS, 1 SKIP; Python evidence 146 PASS. Source/format patches,
остальные типы/ошибки/mappings/delivery/persistence/recovery и финальный Hermes
остаются. Это не готовность полного подплана.
Частичная смена encoding/Null-marker при сохранении существующей схемы прошла
independent fixed-pin audit `execute-1788838656571` (runtime `6b538b16…00ea3`):
baseline считывается до изменения разбора, девять подмен отвергнуты.
Client 750 PASS, 1 SKIP; Python evidence 150 PASS. Это не приёмка другого файла,
изменённой схемы/ошибок, persistence/recovery или финального Hermes.
Другой verified файл с прежней схемой прошёл independent audit
`execute-1788839672608`. CSV → TSV с reorder/add Extra также прошёл на текущем
runtime `a8199e55…a6fc140` (`execute-1788840289954`): свойства известных полей
сохранены по имени, новые требуют полного явного задания, прежний порядок выхода
сохранён. Все 8 значений проверены, 12 подмен отвергнуты. Client 753 PASS, 1 SKIP;
Python evidence 152 PASS. Ошибки, другие варианты смены схемы, mappings,
delivery/persistence/recovery и финальный Hermes остаются.
Адресная ошибка источника добавлена в wizard/node.apply: реальный missing-file
отказ после одного Next возвращает `WIZARD_SOURCE_VALIDATION_FAILED`, сохраняет
неопределённость частичных эффектов и не повторяет действие. Живой diagnostic
`source-validation-new-path` подтвердил текст ошибки; это ещё не независимая
негативная приёмка полного node.apply. Два затронутых suite: 252 PASS.
Полный отрицательный node.apply после исчезновения собственного verified fixture
прошёл independent fixed-pin audit `execute-1788841429141` (runtime
`9da71ef9…66e709`). Один Next, source error, без Execute/Done; повтор ID без
браузера. Девять подмен отвергнуты. Это не приёмка recovery/resume.
Boolean/datetime/string 3×3 прошёл independent fixed-pin audit
`execute-1788842368001` (runtime `d29fef96…30c834`): true/false/Null и datetime
с миллисекундами, без присвоения timezone. Десять подмен отвергнуты. Client
763 PASS/1 SKIP, import evidence 109 PASS. Полный scope остаётся.
Single-column format commit подтверждён без reopen через applied UI cache:
1×3 datetime и source из одного real поля (1×2) прошли independent audits
`execute-1788842988302` / `execute-1788843218778`, runtime `9a99b6f1…aab3ed2`.
По девять подмен отвергнуты. Client 773 PASS/1 SKIP, import evidence 111 PASS.
Save/close/reopen точного нового пакета с тем же GUID и новым workflow, проверкой
полного baseline до QA no-op patch и новым Execute/read 3×3 прошли independent
fixed-pin audit `execute-1788843838259` (runtime `a9948e68…f31aa4c`).
16 подмен отвергнуты; исправлено ожидание меню после Close. Client 774 PASS/1 SKIP,
Python evidence 161 PASS. Семантика package.save_as сохранена; промежуточное
сохранение без close/reopen и весь остальной scope 03 остаются незавершёнными.
Отдельный intermediate `package.save_checkpoint` без закрытия реализован в source.
Independent run `execute-1788845074909` (runtime `1624d537…b014cd`) подтвердил
запись → отдельный QA close/open без resave → сохранность baseline → новое Execute/read
3×3; 21 подмена отвергнута. Client 779 PASS/1 SKIP, Python evidence 164 PASS.
Прежний package.save_as сохранён; живые конфликты/повторная запись/recovery и полный
scope подплана остаются. Это не full 03/Hermes/release acceptance.
Добавлены exact-path guards конфликта, подтверждённый cleanup и сохранённые
workflow_continuations после Save As. Live `execute-1788846213706` прошёл
изменение поля → отказ → replace → QA reopen/settings, но полный independent
cycle остался FAIL из-за недоступного process row ниже viewport при финальном
Execute/read. Доработка scoped process reveal остаётся; этот run не принят.
Точный последний client suite и evidence указаны в checkpoint ниже.
[Точный checkpoint и ограничения реализации](../text-import-node.md).
Навигация: [все подпланы](../../plans/loginom-dock/README.md), [основной план](../../plans/2026-09-02-loginom-dock-implementation-plan.md).

Полный save/patch/refuse/replace/QA reopen без resave/Execute-read 3×3 прошёл
independent fixed-pin audit `execute-1788847173172` (runtime `d6e7600d…3ee`);
20 подмен отвергнуты. Scoped process scroll читает только native-bound видимое
окно без claims полноты DOM. Client 789 PASS/1 SKIP, Python evidence 167 PASS.
Это частичная приёмка сохранения; прочие требования и финальный Hermes остаются.

Добавлен native source/target mapping reader и журналирование `readMappings`.
Lower-level live 3-field diagnostic и проверки связей/дублирующих меток прошли;
client 796 PASS/1 SKIP. Это основа для пользовательских mappings, которые пока
не подключены; полный declared scope и independent/Hermes acceptance остаются.

Приватный configured-field ref/resolver и global output editor с native ownership
реализованы; typed live label Apply подтвердил сохранность источника. Client
801 PASS/1 SKIP; это draft diagnostic. Handler mappings и полная приёмка остаются.

Prepared output name/label driver прошёл independent draft audit
`mapping-field-driver-1788849581088`: source identity и остальные поля сохранены,
9 подмен отвергнуты, no-op без gestures. Client805 PASS/1 SKIP, Python168 PASS.
Это не полный mapping handler или persistence/Hermes acceptance.

## Результат и зависимости

После [01](../../plans/loginom-dock/01-open-loginom-draft.md) и [02](../../plans/loginom-dock/02-add-nodes.md) агент передаёт
проверенный файл и параметры импорта. Один node.apply добавляет/находит импорт,
открывает мастер, настраивает, сохраняет, выполняет и возвращает свежую таблицу.
Здесь впервые реализуется и принимается общая оболочка, которую используют 04–10.
Тип «Текстовый файл» поддерживает CSV/TSV с разделителем; Excel исключён.

## Исходная точка и источники

Есть ограниченный [text-import-procedure.mjs](../../../client/lib/text-import-procedure.mjs),
[node-procedure.mjs](../../../client/lib/node-procedure.mjs), UI-примитивы и
независимые проверки импорта. Старый пилот работает с уже открытым мастером,
проверяет до восьми полностью видимых полей и связан с отдельным roundtrip.
Он не доказывает новый полный node.apply или приёмку Sol/low.

Переиспользовать [workspace-ui.mjs](../../../client/lib/workspace-ui.mjs),
[outcome-verification.mjs](../../../client/lib/outcome-verification.mjs),
[observation-pages.mjs](../../../client/lib/observation-pages.mjs),
[execution-journal.mjs](../../../client/lib/execution-journal.mjs).
Проверки: [node_procedure_evidence.py](../../../tools/loginom-acceptance/node_procedure_evidence.py),
[import_settings_evidence.py](../../../tools/loginom-acceptance/import_settings_evidence.py),
[import_roundtrip_evidence.py](../../../tools/loginom-acceptance/import_roundtrip_evidence.py),
[upload_verify.py](../../../tools/loginom-acceptance/upload_verify.py).

Источники через Dock: Help data/integration/import/txt/README.md,
data/workflow/ports/mapping-master.md, data/visualization/preview/quick-view.md;
E2E tests/acceptance/wizards/textimport.ts,
tests/acceptance/wizards/imports/txt/format_settings.ts,
auto_columns_setting.ts, importTxtRefData.ts в той же папке,
bg/helpers/wizard.ts и bg/helpers/workflow/previewTable.ts.
Сверить источник, формат, типы и способы завершения с реальным Loginom.

## Вход и выход

Параметры: точная verified-ссылка на источник, кодировка, заголовок/пропуск строк,
разделитель полей, ограничитель текста, Null-маркер, числовой формат,
имена/метки/типы/вид/использование полей и выходная схема.
Общий контракт задаёт цель, mappings, способ завершения, чтение и бюджеты.
Проверять обязательные значения и неподдержанные режимы до изменения UI.
Нельзя считать совпавший путь подтверждением identity загруженного файла.

Ответ соответствует общему контракту: фазы, node/port refs, execution identity,
схема, число строк, до десяти строк, предупреждения, полнота и ограничения точности.
Широкая схема использует адресные страницы с явной полнотой; не переносить
ограничение пилота «восемь видимых полей» как скрытую границу нового обработчика.

## Общая основа, реализуемая здесь

1. Реализовать согласованную в 02 локальную оболочку node.apply: валидация,
   блокировка, add/find/connect, первое открытие мастера, диспетчер обработчика,
   завершение, выполнение, чтение, журнал и фазовые квитанции.
   Внутри нет модельных вызовов и повторного внешнего запуска executor.
2. Вынести общие драйверы табличных портов: выбранные поля, порядок, исключение,
   переименование, mapping и автосинхронизация в поддержанных режимах.
   Мастер порта может открываться отдельно от мастера узла. Переходы определяются
   наблюдённым UI конкретного типа; не предполагать общую последовательность Next.
   При отдельном выходном мастере: промежуточное «Готово» узла → настройка и
   сохранение порта → выполнение с графа внутри той же node.apply, без reopen
   мастера узла. Запускать только после окончания всех настроек. Промежуточное
   «Готово» не задаёт итоговый execution=not_requested: это статус только явно
   запрошенной операции настройки без запуска.
3. Разделить три исхода: «Закрыть» отменяет черновик; «Готово» сохраняет узел
   без запуска; «Выполнить» сохраняет и запускает. Для Done вернуть
   execution=not_requested, output=not_refreshed. Для Execute дождаться именно
   нового выполнения; закрытие мастера не означает успешную обработку.
4. Реализовать чтение выбранных выходных портов со свежестью, пагинацией и точностью.
   Не путать предпросмотр мастера с выходом выполненного узла. Ноль строк —
   допустимый результат. Для точных real использовать проверенный режим «Таблица».
   Долгое выполнение возвращает operation ID; status/wait не запускают его повторно.
5. Объединить доставку файла в локальную операцию: разрешённый источник, точное
   хранилище, конфликт пути, upload, SHA/size и verified identity. Сохранить
   существующие upload/inspect/verify гарантии внутри операции, сократить внешние вызовы.
6. После принятого узла фиксировать локальный checkpoint. Реализовать отдельное
   промежуточное сохранение после импорта/ветви, а также final save/close/reopen
   точного пакета; существующий package.save_as не менять молча.
   Проверять имя, путь, конфликт и сохранность графа; открытие не запускает узлы.
   Повторное выполнение аналитической задачи вызывается отдельно.
7. Общая отмена/stop/resume сохраняет частичные эффекты, освобождает mouse/clipboard/
   leases, сверяет operation и открытый пакет. При утрате несохранённого черновика
   журнал не заменяет persisted checkpoint. Не повторять неизвестные upload/run/save.

## Собственно обработчик импорта

1. Codex исследует весь живой путь от добавления узла до выхода. Особое внимание:
   источник, переход на формат, предпросмотр, определение типов, редактор поля,
   выходной порт, «Готово» и «Выполнить». Затем сверяет Help/E2E.
2. Настроить источник и формат, дождаться разбора нужного файла и схемы.
   «Определить типы данных» может изменить тип/вид; применять эту операцию
   осознанно, затем выставлять заданные свойства. Смена типа может сбросить вид.
3. Связать каждое поле с наблюдённой схемой; применить настройки и читать
   конкретную изменённую строку. «Изменить» сохраняет строку в черновике,
   но не завершает мастер узла.
4. Настроить выходной mapping общим драйвером; закончить выбранным действием.
   При Execute читать выход без повторного открытия мастера.
   Для существующего импорта сохранять незапрошенные параметры.
5. Зарегистрировать карточку импорта и полный контракт результата; обновить
   verifiers так, чтобы особый QA roundtrip не был обязательным продуктовым шагом.
   Старую операцию и её evidence сохранить с прежней семантикой.

## Явные ожидания и ошибки

Именовать условия: verified-файл, открытый мастер нужного узла, источник применён,
формат разобран, редактор нужного поля, конкретные свойства строки, выходной mapping,
закрытый мастер, новое выполнение завершено, свежий результат, точный файл сохранён.
Использовать отдельные бюджеты настройки/передачи/выполнения, общий deadline,
settle: 0 и guards. Готовое условие завершается сразу без фиксированной паузы.

Разобрать прежний UI_EPOCH_CHANGED до picker UnitPrice/data_kind. До двух локальных
обновлений — только при строгом NOT_APPLIED до жеста, effect_possible=false
и повторном подтверждении того же объекта. После возможного эффекта — сверка
фазы/значения, а не повтор жеста. Частичный успех не даёт общий SUCCEEDED.

## Проверки и критерий готовности

- На независимых малых CSV/TSV проверить разные кодировки/разделители/заголовки,
  пропуск строк, кавычки с разделителем, Null и пустую строку, дроби, типы,
  неверные значения, пустой результат и широкую схему с невидимыми сразу полями.
- Проверить mappings, обновление существующего импорта, сохранность остальных
  параметров, ошибки файла/пути/формата, прерывание и повтор operation ID.
- Отдельный QA подтверждает применение строки, Done/Execute/Close и roundtrip
  мастера. Продуктовый тест подтверждает полный вызов без штатного wizard reopen.
- Независимый audit связывает bytes/SHA файла, upload, узел, execution и полный
  малый выход; затем сохранённый пакет/reopen/reexecute. Кешированный результат
  до изменения настройки не принимается как результат нового запуска.
- Codex сначала завершает отладку через реальный MCP и независимые verifiers.
  Затем один самостоятельный goal-only Hermes Sol/low проверяет полный импорт;
  при неудаче вернуться к диагностике. Замерить фазы/внешние вызовы/токены.

Готовность: общий полный цикл и импорт приняты на фиксированных pins, доказаны
выход, промежуточное сохранение, отдельная финализация и безопасное продолжение.
Это основание для 04–10; не считать старый импортный PASS их приёмкой.
