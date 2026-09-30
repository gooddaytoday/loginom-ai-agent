# JavaScript: рабочее исследование на Loginom 7.4.2

Статус на 2026-09-30: **`discovery_required`**. Это сводка прямых наблюдений
фазы 0B [подплана](plan.md), а не допуск публичного обработчика или автономной
CLI-приёмки. Стенд — `http://logi-test-plan.bg.local/app/`, Loginom Enterprise
7.4.2; оператор — Ubuntu, только видимый headed Chromium. ОС **сервера** —
Linux по принадлежащему `Session.Version.IsWindows=false`; дистрибутив и версия
ядра неизвестны. Продуктовая база кампании остаётся
`a8ad59766dbdb4f2da0b54367a755ce00891dd71`; более новая база документации
`3f35c5f232` добавила общее [чтение ошибки мастера](../../workflow/lifecycle.md#отказ-мастера-и-кнопка-ошибки).
Исходные отчёты и журналы находятся в приватной кампании; подтверждённые SHA,
ревизии операторов и границы каждой попытки перечислены в [checkpoint](checkpoint.md).

Исходная сводка обновлена по [acceleration review](acceleration-review.md) на docs
`13a02e8be2` / code `7b8e19bee0`; позже выполнен B-live на code `f8ceebcac9`.
Решение 0B доказывает осуществимость/выбирает контракт; последняя колонка
остаётся проверкой реализации и приёмки. Непроверенные пункты в ней не возвращают
закрытое решение исследования в начало.

Public C run05 на `97098322a1` подтвердил все13 phases, две owned completed
Execute, полные native mappings и owned Views/full typed UI6×4. Независимый
output-only audit подтвердил business oracle1950 и graph preservation.
Исходный run целиком не принят: operator schema требовала отсутствующий native
input `excluded`; original CLEANUP_UNCONFIRMED сохранён, own recovery verified.
Контракт исправлен в `e615f4df7f`; `ed56268a6d` подключил owner-bound Save после
public Code и независимого source-read. Fresh headed Code → Save прошёл
полный независимый audit и ordinary cleanup3/3; independent cold reader
подтвердил source/settings/fresh Execute/read6×4 и cleanup3/3. Fixed C принят
в isolated runtime. D05/source `418abc95c0` прошёл полный independent audit
public declared6×4/metadata/DefaultUsageType/Save и cleanup3/3; собственный
independent cold подтвердил source/settings/new Execute/all6×4 cells и
cleanup3/3. Fixed D принят на том же isolated уровне; E/F и aggregate
gates открыты; evidence/hashes и следующий шаг — в текущей части checkpoint.

| Gate | Непосредственно наблюдено | Решение / точный остаток 0B и следующий тест | Реализация / приёмка (фазы 1–6) |
| --- | --- | --- | --- |
| G1 — узел и редактор | Собственный JS GUID, иконка `bg-vendor-icon-javascript`. Для несоединённого узла fresh headed проход подтвердил страницы `TuneDataSourceInputPortWizard` index0 → `JavaScriptColumnsWizard` index1 → `JavaScriptCodeWizard` index2 → `DoneWizard` index4 с условно пропущенным index3. При уже подключённом input0 первая страница пропускается. CodeMirror 4.11.1, `mode=javascript`, `readOnly=false`, отступ 4, `smartIndent/electricChars=true`; код прочитан целиком и восстановлен после G4 probe. Собственный code controller держит `FEngine`/`FModuleSystem`: native proxy одного сеанса, но разных remote objects и interfaces. Два сохранённых `.lgp` 7.4.2 содержат JS `VendorGuid=28865f89-eea0-4143-b155-291791324a4b` и сериализованный `TBGJavaScriptEngine`. | Открыто: runtime component/FullType и наличие assistant/engine selector. Адресный owned read должен установить их либо обосновать явную замену FullType проверенным identity-контрактом; иконка/XML сами это не закрывают. Условные маршруты перечислить по фактическим страницам, не индексам. | Owned navigation/focus/foreign UI во всех поддержанных путях new/existing; J22 по наблюдению, без вызова помощника. Ещё не покрытые маршруты проверять при их реализации. |
| G2 — моменты исполнения | В обоих режимах `code`/`declared` переходы `Next` и `Done` наблюдены. `Preview` и отдельный `Execute` положительно подтвердили исполнение собственными sentinel/child evidence. | Принято консервативное решение: Next/Done потенциально эффектны, каждый жест one-shot с ACK/receipt; отсутствие sentinel не является отрицательным proof. Done не обещает свежий output. Порядок materialization зависит от G3; probes только ради доказательства отсутствия скрытого исполнения не требуются. | Сначала согласовать JS-specific finish с общим apply: неизвестный internal Verify не превращать в execution_started=false. Журнал/operation/deadline и runtime settlement Next/Done; lost replies, bounded Stop/cancel, диагностика и независимый Execute/read. Возврат клика не равен подтверждённому переходу. |
| G3 — схема и связи | Оба schema mode дали полный результат 6×2. Ручной output mapping с `autosync=false` сохранился; при несовместимой смене исходного поля новый Execute вернул собственную ошибку о пропавшем `PhaseMarker`, связь не переназначилась молча. Пять отдельных двухколоночных проб наблюдали фактические имена/метки до и после записи. На пустой declared-схеме отдельно наблюдены native списки `Вид данных` и `Назначение`; последний связан с `DefaultUsageType`. Собственный picker назначения открывался одним жестом: 7/7 native records соответствовали 7/7 видимым options, включая `4 — Выходное`; список закрыт до Cancel. В отдельном проходе выбор `Выходное` сменил cached value с 0 на 4 и автоматически свернул picker до Cancel. Фиксированный Apply подтвердил в native grid `DefaultUsageType=4` при отдельном `UsageType=0`. Отдельная writer/cold/bytes пара с первой колонкой `ObservedID` типа «Целый» подтвердила `DefaultUsageType=4` после двух Save и нового открытия; XML пакета содержит `DefaultUsageType="utPredicted"`. | C0 live02/source `f2d02cafad` подтвердил empty → materialized4 cached source/target, reciprocal IDs и schema bound physical output0 Table после двух собственных Execute; business6×4 и cleanup3/3 независимо проверены. G3 live01/source `1965b71edd` подтвердил actual GetColumn index/name/display_name/data_type before/after во всех6 строках → complete source/reciprocal targets → bound physical output0 schema пяти полей; отдельный business oracle6×4 и cleanup3/3 независимо PASS. `bridge_verified=true` только у этого fixed code/ASCII case; native bytes=false/gates_closed=[]. Открыто: полный public lifecycle и неподтверждённые name/type/declared случаи. | New/existing, declared/code, смена схемы, manual/required/autosync и сохранность соседнего графа. Фиксированный declared usage не доказывает все типы/назначения. |
| G4 — точность кода | `keyboard.insertText` на реальном CodeMirror передал 849 байт/8 строк и граничные 32768 байт/1024 строки с полным readback; `keyboard.type` изменил контрольный текст и отклонён. Отдельный source97 дважды выполнил принадлежащий узлу полный open/read/Close без нового явного Execute/Done. В G7 последняя редакция прочитана после холодного открытия. Публичный host `dock_node_read kind:source` (`0c513c445a`) проверен headed full/user-v1; managed write/discard (`1e0da9265a`) и Code Next/Done (`7b8e19bee0`) завершились точным source-read. MCP bridge `d17723e59c` проверен с подставленным browser adapter. | Осуществимость принята: insertText + полный readback, UTF-8/LF digest, immutable receipt и отказ при изменении текста redactor. Базовый публичный source-read уже есть; исследовать заново не нужно. Отсутствие явного Execute не обещает отсутствия внутренних эффектов UI. | Public configure/write/read; empty/limits/chunks/Unicode/redaction, повторы после затронувшего изменения, candidate/CLI delivery и cold fidelity. |
| G5 — типы и доступ | Индексированная discovery-матрица имеет наблюдения для всех 30/30 закреплённых snippets; отдельные native/typed пробы показали scalar, NULL/empty/undefined, safe/unsafe int64, Date, именованный доступ и пустой output. | Открыто: сопоставить обязательные business/API/knowledge primitives с probes и перечислить точные неизвестные свойства. Для native/named и D/J24 отделить семантический вопрос, требующий G3 bridge, от непроверенной матрицы реализации. Выход 0B — решение об осуществимости обязательного API/точности, не прохождение всех cases; 30/30 observations его не заменяют. Ранний 6×4 уточняет арифметику/строки/input mappings. | Оставшиеся native/named и D/J24 cases, затем те же typed свойства через handler и независимый oracle; полный J06–J08/J20/J24. Native precision не заменять округлённым preview или 30/30 observations. |
| G6 — ошибки и восстановление | Private `p1-stop-finite-08` (`0328cadfc9`) подтвердил native Stop/terminal cancelled за 6,612 с, отдельный local read cancel и successful same-node 6×4 short rerun с cleanup 3/3; hashes/независимый audit в checkpoint. Public/CLI J13 этим не закрыт. Синтаксический отказ `Next` даёт собственную кнопку ошибки и штатный диалог; синхронный `throw` даёт failed child после отдельного Execute. Исправленный оператор читает причину, закрывает диалог OK и завершает пакет; свежий headed regression проверен на `?.`. | Parse/throw классифицированы в частных путях. Открыто: bounded Stop/cancel и безопасный recovery; до фиксации Execute-контракта конечный цикл ≤60 секунд, owned Stop → terminal → короткий rerun, local cancel отдельно. Неопределённость блокирует затронутый путь. | Ремонт того же узла, сохранность прежнего кода/соседнего графа, lost reply/cancel/Stop и доставка диагностики модели. Позиция только из Loginom. |
| G7 — сохранение | Для `code` и `declared` выполнены отдельные writer/cold пары: последнее S2-состояние открыто в новом профиле, source/settings/schema прочитаны без передачи кода в reader, новый Execute дал полный результат 6×2. После каждого из двух Save native `IsPackageModified=false`. Дополнительный read-only audit скачал точные `.lgp` обоих режимов через штатный `FileDownloader`: ZIP/CRC, GUID узла, decoded `Engine.Code`, mode и объявленные колонки сверены с writer и cold reader. Отдельный фиксированный `usage`-вариант declared-схемы прошёл тот же writer/cold/bytes цикл; первая колонка сохранила `DefaultUsageType=4` в UI, новом сеансе и XML. Все три private byte audits имеют `package_bytes_verified=true` и `dirty_state_verified=true`; девять процессов подтвердили package close/logout/browser close. | Осуществимость обоих режимов принята по private writer/cold/bytes и dirty-state; повторять эти же пакеты ради 0B не нужно. Доказательство ограничено фиксированными случаями 6×2. | Save/cold на public handler с результатом 6×4 в каждом режиме, затем candidate/CLI. `public_handler_verified=false`; частные proofs не равны принятию G7. |

Наблюдения G1 и G4 подробно записаны в [checkpoint](checkpoint.md) (operator15/16,
source97). Для G2/G3 авторитетная сводка — [переходы и эффекты](execution-effects.md),
для имён — [schema telemetry](schema-telemetry-observations.md) и
[D witness audit](native-output-schema-witness-design.md), для G5/J20 —
[engine profile](engine-profile.json), для G7 — [persistence design](persistence-design.md)
и подтверждённые writer/cold записи в checkpoint. Документы с формулировкой
«дизайн» не превращаются в живое доказательство. Неподтверждённый `FullType`,
кодовую source→physical связь или отсутствие эффекта `Next`/`Done`
нельзя восстанавливать из названия узла, браузерной ОС или предполагаемого API.

В headed profile214/source `3a50a79a5c` пустой declared editor показал
`cbxDataKind`: 0 «Неопределенное», 1 «Непрерывный», 2 «Дискретный»; для новой
строковой колонки выбран 2, а само поле выключено. `cbxUsageType` показал
0 «Не задано», 3 «Активное», 4 «Выходное», 6 «Группа», 7 «Показатель»,
8 «Транзакция», 9 «Элемент»; выбран 0. В сохранённом frontend Loginom
7.4.2 `CodeColumnsWizard` показывает `colDefaultUsageType`, а
`EditColumnDefForm.ApplyUsageType` пишет `DefaultUsageType` и использует
`fpDefaultUsageType`. Следовательно, будущий публичный параметр назначения
столбца должен проверяться по `DefaultUsageType`, а не по похожему полю
`UsageType`. Эти варианты наблюдены только для конкретного пустого declared
editor; доступность вариантов для других типов отдельно не проверена. После
`Cancel` локальная коллекция пуста и чиста, но native `totalCount` оставался
равным 1. Оператор принял только эту точную комбинацию квитанции Cancel и
диагностики store; Save и Execute не вызывались. SHA и cleanup — в checkpoint.
Profile216 подтвердил для `cbxUsageType` единственный собственный видимый
trigger `EditColumnDefForm;cbxUsageType;trg_picker` (`rendered=true`,
`repeatClick=false`, `disabled=false`). В отдельных headed попытках 217–219
предусловие открытия выявило ленивое создание DOM picker; все отказали до
клика и закрылись штатно. Source `81179bd1e5` допустил только эту наблюдённую
форму связи поля и store без DOM перед кликом. Profile220 подтвердил один
`usage-picker-open`, все семь собственных видимых вариантов и закрытие списка
до `Cancel` с нулём локальных записей и cleanup 3/3. В profile221 один
`usage-option-select` сменил native cached value 0 → 4; picker закрылся
автоматически, `Cancel` оставил ноль локальных записей, cleanup 3/3. В отдельном profile222 создана колонка `UsageValue` типа «Целый»; после
одного Apply собственная запись grid содержала `DefaultUsageType=4`, а
`UsageType=0`. Там Save и Execute не вызывались. В отдельном `usage`-варианте
двухколоночной declared-схемы (profiles 223–225) writer дважды сохранил пакет,
новый процесс прочитал `DefaultUsageType=4` и выполнил свежий Execute, а
независимый byte-auditor подтвердил `DefaultUsageType="utPredicted"` в сохранённом
`Unit.xml`. Точные SHA и граница доказательства — в [checkpoint](checkpoint.md).

Ограниченный B public configure existing подтверждён в испытательном runtime:
headed `public-node-apply-03`, независимый public source-read, сохранённые
settings/input mapping/связи и cleanup 3/3. `configured_only` относится к
output mapping evidence; публичный Done вернул `output.status=not_refreshed`,
`execution.status=not_requested` и сохранил неизвестность внутренних эффектов
как `execution_started=null`. Точные SHA и границы — в [checkpoint](checkpoint.md).
Ранние private P1 code/base и declared/base 6×4 прошли: полные typed UI
input/output, независимый unchanged oracle, отдельные owned Execute и cleanup
3/3. Это не native byte или public handler evidence. Source `ba46d2ecda`,
точные report/journal/receipt SHA и ограничения — в [checkpoint](checkpoint.md).
Code changed/reordered также прошли с тем же source SHA: полный pinned input,
fresh owned Execute и unchanged independent oracle, cleanup 3/3.
Fixed public C/D writer/Save/independent cold уже приняты в checkpoint.
На source `467da5ab9a` fixed isolated public existing comment edit/Execute/read
для code и declared отдельно прошёл independent audit: full native settings,
input5/output4 mappings/graph, fresh6×4, public source-read и cleanup3/3/process
absence. На `e1fd122320` отдельно приняты все4 public existing freshness
варианта Code/declared × changed/reordered: полный input6×5/output6×4,
сохранённые GUID/settings/graph, новые executions и cleanup независимо проверены.
Это не закрывает всю матрицу schema edits или product candidate/CLI.
Следующий результат E — public types/NULL/precision/0–1–N; P1 Stop/cancel принят
ранее и без затрагивающего изменения не повторяется. Реализация продолжается;
наличие этого кода не закрывает неизвестные G1/G3/G5/G6, а отсутствие CLI не
блокирует выход 0B. `ready_for_development` требует решений по точным вопросам
третьей колонки; окончательное закрытие gates — по четвёртой.

В каждом новом browser-прогоне нужен свежий профиль, один владелец, обычный
headed-режим по последнему указанию пользователя, подтверждённое закрытие
именно своего пакета, logout и browser close. Правила неизвестного эффекта и
памяти сохраняются; новые gates и повторный bootstrap не вводятся.
