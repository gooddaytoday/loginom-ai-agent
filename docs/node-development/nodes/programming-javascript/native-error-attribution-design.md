# Атрибуция native JavaScript errors для B / G6 / J25

Статус: предложение для root review, **design only**. Основа исходников —
source83 `562f8ffebf8f5c4e1d38eff6c65beddbfd087fbc` плюс frozen source84
(только artifact-discovery и его тест). Подготовка и чтение: 2026-09-27–28.
Ни B, ни calibration этим документом не запускаются. Source84 runtime/tests,
fixtures/manifests и старые документы не меняются.

## 1. Минимальное решение

Разделить два утверждения: «это ошибка данного исполнения данного исходника» и
«ошибка возникла при вычислении конкретного исследуемого выражения». Для первого
достаточны полный owned ErrorDetails, exact source и fresh execution/source seal.
Для второго нужна ещё однозначная связь причины или native позиции с выражением.
Source digest и failed status сами по себе такой связи не создают.

Не вводить универсальную source map как обязательное условие доставки J25.
Сохранять наблюдённый текст/класс/позиции, честно указывая отсутствие или неполноту.
Для B оставить `OWNED_EXECUTION_FAILURE_UNATTRIBUTED`, пока один из двух узких
путей доказательства ниже не пройдёт независимый review. Это предлагаемое уточнение
формулировки §8 named-access, **не уже выданное исключение из её текущего запрета**.

Рассмотренные варианты:

- Любой owned failed объявлять rejection: отвергнут; может ошибиться setup, getter,
  Append/Set или зависимость, а не lookup.
- Всегда требовать line/column: избыточно для доставки диагностики и уникального
  явного sentinel; отсутствие позиции не делает текст ошибки бесполезным.
- Общий owner/source witness плюс отдельный необязательный proof конкретного
  выражения: выбран. Текстовое доказательство допускается лишь при уникальном
  происхождении; координаты — лишь с независимо подтверждённым соответствием.

## 2. Нормативные источники и наблюдённые ограничения

Прочитаны актуальные root-файлы, а не устаревшая копия плана worktree:

- `/home/george/git/loginom-ai-agent/docs/node-development/nodes/programming-javascript/plan.md`:
  G6, строка 196; «Ошибки и восстановление», строки 506–525; J25, строка 698.
  Требуются классифицированный terminal/ambiguous outcome, наблюдённые class/text,
  позиция только от Loginom либо явное отсутствие, digest, owner, redaction/truncation.
- `/home/george/git/loginom-ai-agent/docs/node-development/nodes/programming-javascript/native-named-access-design.md`:
  §5 — восемь фиксированных B sources; §8 — failure/upstream/lifecycle;
  §11 — допущена только A, B/C/D требуют отдельного решения. Ядро A8/B8/C4/D5
  и его hashes не переопределяются настоящим предложением.

[Help: входные наборы](https://help.loginom.ru/userguide/processors/programming/java-script/input-tables.html)
описывает index/name для Get, GetColumn, IsNull и коллекцию Columns.
[Help: API](https://help.loginom.ru/userguide/processors/programming/java-script/api-description.html)
разделяет Index/Name/DisplayName и метод Get объекта столбца. Это обосновывает
различение lookup и последующих обращений к результату. Эти страницы не являются
калибровкой ErrorDetails/stack coordinates конкретного build. Никакого ожидаемого
текста missing-name rejection из Help здесь не выводится.

### Реальное сохранённое evidence

`C = /home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu`.
Читались report.json и конкретные исходники; private config не читался.

| Файл относительно C | Наблюдение | Что не доказано |
| --- | --- | --- |
| `g2-batch-39/report.json` | Snapshot controls содержит `Error: JS_G2_EXECUTION_SENTINEL_V1` и кадры `<preview>:1:1`; batch `CLEANUP_UNCONFIRMED` | Это preview surface, не mapping native failed child после Execute |
| `g2-batch-49/report.json` | `cases[0].execution_probe.execution.error.message`: sentinel, `<main>:1:1`; group failed; outcome `owner_verified=false`, `gate_passed=false`; batch `FAILED` | Нет достаточной child ownership для semantic rejection |
| `g2-batch-50/report.json` | Первые два cases, code/declared sentinel: child `4.1`/`6.1`, native ModelNode + Show Node, `error_source=native_child_error_details`; sentinel outcome confirmed | Весь batch `CLEANUP_UNCONFIRMED`; нет современной полноты raw ErrorDetails, нет проверки другой строки, import/wrapper или native API frame |
| `engine-probe-01/report.json` | В `probes` sync-throw и native-parse-error имеют `status=not_run` | Список probes не является исполнением parse/sync cases |

В просмотренных `g2-batch-31..55/report.json` и `engine-probe-01..05/report.json`
entries `native-parse-error`/`sync-throw` остаются `not_run`; подтверждённый выше
старый sync sentinel — другой case. **Подтверждённого parse-error исполнения в
этом проверенном наборе нет.** Это ограничение набора просмотренных отчётов,
не утверждение об отсутствии любых других evidence на сервере.

SHA256 прочитанных опорных отчётов:

- batch39: `58b3e96e5f22c15fce7099d05073985c44e4be179eccf193b0f0b8e130383d33`;
- batch49: `67745ff2a5a1e1e918418ed2c90186bd02d590138e11f4db73e218e581161534`;
- batch50: `51bd3a1cbfd8b754eb77511660ac8560eea2d1aaa9ff27614c5173fe6e2484f4`;
- engine01: `33fde39645f04cccdb8b720819f7bf1bc6f13e582d230c81eda2ac5eaa3e97b2`.

Исходник старого sentinel — только `throw new Error("JS_G2_EXECUTION_SENTINEL_V1");`
и LF (`javascript-execution-probes.mjs:16`), digest
`e0ea9794bb7e640ed0918f8bbdb48d4b0ae5b097959d248528a48ba7aa8f8749`.
Наблюдение 1:1 для такой программы не доказывает нулевой offset для B с import,
не устанавливает единицы column и не разрешает заменить `<preview>` на `<main>`.

### Текущее прохождение ошибки

Относительные пути ниже — от `packages/loginom-runtime/`.

1. `client/lib/node-process-context.mjs:73` получает native `ErrorDetails`, но
   передаёт `trim().slice(0,1000)`. Поэтому короткий receipt сам по себе не доказывает
   полноту original string и не отличает длину ровно 1000 от усечения.
2. `client/lib/node-execution-evidence.mjs:64–108` отдельно различает group failure
   и owned child (native ModelNode + Show Node). `NODE_EXECUTION_FAILED` — код
   адаптера, не наблюдённый класс JavaScript exception. Повторный slice не добавляет
   информацию о полноте, structured position сейчас не извлекается.
3. `tools/loginom-acceptance/javascript-native-named-failure.mjs`:
   `verifyNamedFailedExecution` связывает fresh baseline/trial/source;
   `sealJavascriptNamedFailure` читает **raw child.data.ErrorDetails** (строки 68–69),
   требует nonempty, длину ≤1000 и trim equality с receipt. `check` повторно проверяет
   exact raw text и process inventory. Именно этот слой доказывает полноту в пределах
   текущего лимита; его нельзя заменить одним execution.error.message.
4. `verifyNamedFailureOutcome` (около строки 127) после fresh original upstream
   всегда возвращает unattributed, `case_complete=false`,
   `reason=runtime_source_position_mapping_unverified`. Source84 эту политику не менял.
5. `javascript-discovery-probes.mjs`: `javascriptDiscoveryWizardDiagnostic` отделяет
   owned fresh wizard messages от explicit Execute, оставляет execution ambiguous;
   `observeJavascriptDiscovery` доставляет class/position либо null, проверяет
   sync marker через includes, но не выдаёт это за универсальную source attribution.
6. `javascript-native-roundtrip-owner.mjs`, source witness около 188–204:
   exact owned editor doc/read/verify/Done seal. Это источник source identity,
   а не таблица соответствия engine coordinates.

## 3. Общий обязательный witness

Для semantic B failed нужно сохранить прежний полный контракт §8:

- Один закрытый case ID, exact UTF-8 source/SHA, schema mode, Done seal и неизменный
  owned editor/native source; допустим только исходник из утверждённого каталога.
- Fresh launch baseline, root/group/record/process IDs, document/workflow/node;
  ровно один соответствующий native child с terminal failed и проверенным Show Node.
  Group-only, красная иконка, notification или старый child недостаточны.
- Полный raw ErrorDetails ≤1000 текущих JS string code units (это существующий
  `.length`, не новый byte limit), native completeness и повторное равенство raw
  значения. При большей длине semantic proof incomplete; лимит не расширять молча.
- INPUT и свежий original upstream exact, всего 4+4 native cells. OUTPUT остаётся
  `not_read_failed_execution`; не читать частично сформированный выход даже для
  поиска marker. Прежние cookie/request/release/idle/ACK/fsync/cleanup требования.
- Оригинальные deadlines; transport uncertainty, потерянный ACK, чужой owner,
  неполный cleanup остаются incomplete. Никакого повторного Execute или исправления
  источника внутри этой попытки. Новая calibration — отдельный назначенный run.

Для J25 preflight refusal execution ID отсутствует по причине `not_started`;
нельзя синтезировать native exception. Для wizard parse diagnostic нужны свой owner,
exact draft source, stage/effect и новые message IDs. Состояние committed source,
наличие draft, previous-source сохранность и cleanup отражаются отдельно.
Отсутствие explicit Execute не доказывает отсутствие implicit execution Next/Done.

## 4. Когда позиции не нужны, а когда нужны

### A. Достаточно owned full text + exact source

Для доставки J25: после общего ownership/source proof можно сказать «этот owned
child завершился с таким ErrorDetails при таком source digest» и доставить
`position_status=absent`, если полный native канал позиции не содержит.
Это полноценная доставка доступной диагностики, но не автоматическое закрытие всего
G6/J25: отдельно нужны preflight/parse/sync, доставка модели и cleanup.

Для **точного места** без координат допустимы только independently reviewed случаи:

- Уникальный literal sentinel в единственном явном throw закрытого источника;
  raw native error header содержит этот sentinel, а не только цитату source/stack.
  Источник не может скопировать marker через другой throw, catch/rethrow или getter.
  Это доказывает конкретный controlled throw, не правила lookup.
- Native diagnostic сам однозначно называет операцию/аргумент и причину, причём
  происхождение такого формата подтверждено на этой сборке и независимым контролем.
  Полный source содержит ровно одного возможного производителя этого сочетания,
  и источник не конструирует/не переписывает diagnostic. Должен существовать явный
  перечень альтернативных producers и объяснение, почему ни один не подходит.

Второй путь пока **гипотеза**, не готовый parser. Нельзя заранее вписать английскую
или русскую missing-column строку из старых e2e. Одна лишь подстрока `Missing`,
название Get, слово «столбец» или общий TypeError недостаточны. Если native текст
цитирует весь source, наличие уникального operand в этой цитате не доказывает
исполнение. Контроль должен различать источник ошибки, а не просто узнавать фразу.

Для B source содержит `"value"`/`"Missing"` в R, но это само по себе ещё не разрешает
text-only attribution. При неоднозначной диагностике fallback только в unattributed,
а не в fuzzy matcher. Text-only path можно вообще не реализовывать первым патчем.

### B. Требуется position mapping

У всех B lookup стоит на строке 4 (`const result=...;`), а setup на 2–3,
marker evaluation на 5, Append/Set на 6–7. Для GetColumn/Columns строка 5 читает
Index/Name/DisplayName и вызывает `result.Get(1)`: она действительно может бросить.
Успешные A или неизменный upstream не исключают этот competing failure.

Если текст не различает producers, требуется native frame/position, независимо
связанный с **проверенными исходными координатами**. Требования к mapping:

- Сохранить raw module/line/column и все bounded релевантные frames; не брать
  последний `module` frame автоматически и не считать любую строку `at ...` V8.
- Разделять observed coordinates и interpreted source span. `<preview>`, `<main>`,
  parse/wizard и execute/runtime — разные domains до независимого доказательства.
- Привязать calibration к build, runtime/source pins, schema mode, import/source
  форме и типу diagnostic/frame; известный server engine version сохранять только
  если реально наблюдён. «7.4.2» само по себе не универсальная гарантия формата.
- Не вычитать придуманное число wrapper/import строк; не вычислять offset по одному
  уже желаемому B failure. Не преобразовывать UTF-8/UTF-16/Unicode columns по догадке.
  Для текущего ASCII/LF B достаточно line-only mapping, если он однозначно исключает
  соседние statements; column тогда остаётся raw/unmapped и не заявляется проверенным.
- При statement-level span можно утверждать отказ **вычисления R**. Для более узкого
  утверждения «вызванный native Get отверг имя» нужно отличить чтение method property,
  разрешение receiver и сам вызов. Аналогично `InputTable.Columns[key]` содержит
  получение коллекции и индексирование. Один номер строки не доказывает внутреннюю
  причину или общее правило case sensitivity. Формулировка результата ограничена
  точным выражением, если native method identity не наблюдена.

Если есть только общий frame `<main>:1:1`, несколько подходящих frames, неподдержанный
формат, отсутствующая позиция или span включает setup/поздний getter —
`rejection_attributed=false`, `case_complete=false`. Позиция на строке 5 может доказать
ошибку дальнейшей проверки результата, но **не** rejection lookup на строке 4.

## 5. Калибровка: обязательные G6/J25 K1–K2 и условные K3–K5

Только после отдельного root допуска к реализации/запуску. Каждый source заранее
фиксируется байтами/SHA и independently проверяется, один свежий run на probe,
одна explicit execution reservation; никакого изменения B источников/хешей.
Используется текущая назначенная root сборка и обычный owned UI lifecycle.
Node/VM syntax check будущих snippets не будет считаться Loginom evidence.

K1 parse и K2 sync уже обязательны по основному G6/J25; это не новая матрица.
K3 не является безусловным третьим run: он нужен только при реальной потребности
в position mapping, например для атрибуции наблюдённого B failed, когда text-only
proof недостаточен и наблюдённый формат K2 пригоден для проверки координат.
Если такой потребности нет, K3–K5 не запускаются.

| Probe | Назначение | Независимый ожидаемый факт |
| --- | --- | --- |
| K1 parse | Закрытый import/setup + один намеренно незавершённый синтаксический оператор; существующий `engine-native-parse-error` — кандидат, не готовый proof | Отдельный owned parse/wizard/native diagnostic либо честный иной исход; не ожидаемый exact текст/offset |
| K2 sync | B-подобный ASCII/LF prefix, уникальный unconditional literal throw вместо R на строке 4 | Marker имеет единственный source producer; полный owned native error, source и cleanup |
| K3 conditional shifted sync | Только при нужном position mapping и пригодном формате K2: тот же import/setup и throw, добавлена одна LF перед throw, безопасный ASCII отступ изменён; новый pinned marker | Проверка независимого смещения строки 4→5; column лишь наблюдается, не нужен для line-only B |
| K4 conditional native | Только если K2/K3 дают пригодный Execute mapping: один заранее выбранный ошибочный native call на отдельной строке, например Get с заведомо вне диапазона row при известном INPUT | Не предполагается, что API обязан бросить; если есть ошибка, проверить именно native caller frame, а не переносить JS throw stack автоматически |
| K5 conditional competing producer | Только для пути, претендующего на B attribution: closed source возвращает контролируемый объект, последующее чтение getter на строке 5 бросает другой уникальный sentinel | Verifier обязан отвергнуть attribution к R; отдельно показывает корректность выбора frame и границы statement |

K4 не вводит новую принятую семантику row out-of-range: return вместо throw означает
«native-error mapping не калиброван», а не повод перебирать другие API/значения.
K5 предпочтительно выполняется как recorded negative test настоящего verifier;
live нужен только если непроверенную категорию frame требуется подтвердить на runtime.
Верхняя граница — пять
live probes, не матрица API×имена×смещения. Если требуемый путь не доказан в этой
границе, root получает конкретный gap; дополнительные probes не запускаются сами.

Если K2 показывает отсутствие позиций или непригодный формат, K3 не запускать;
если это установлено на условном K3, остановить mapping ветку. K4/K5 не запускать
ради получения желаемого offset. K1/K2 сохраняют своё назначение G6/J25: доставить
`absent` либо `unrecognized`, полный очищенный текст и owner/source.

Решение о допуске outcomes: completed B с допустимыми native markers и всеми прежними
source/input/output/upstream/lifecycle proofs не блокируется отсутствием native-error
mapping. B failed сохраняется `UNRESOLVED`, `case_complete=false` до independently
reviewed доказательства конкретного выражения — по принятому text-only proof либо
пригодному calibrated position mapping. Сам факт выполнения K1/K2 этот статус не меняет.

Отдельный root auditor читает raw native error witness и exact source receipts,
а не только summary нового verifier. Он независимо проверяет bytes/SHA, source
строки, свежесть child/owner, отсутствие OUTPUT RPC, полный upstream, ACK/cleanup.
K2/K3 нельзя сверять expected position с тем же parser, который проверяется:
ожидаемые позиции явного throw считаются из заранее закреплённых source bytes;
реально возвращённые coordinates и расхождения сохраняются без подгонки.
На основании только JS throw frames K4/native-call mapping не объявляется принятым.

## 6. Предлагаемый контракт результата

Новые поля ниже — предложение, не описание уже реализованного API:

- `diagnostic_origin`: preflight / wizard / native_child;
  `error_code` отдельно от `class_observed`; последнее null с причиной, если native
  канал не дал класса. Класс, распознанный из native header, помечается как parsed
  из текста с parser revision; адаптерный NODE_EXECUTION_FAILED не становится Error.
- `native_text_complete`, `native_text_length`, `truncated`, `redacted` и
  `normalization_applied`; raw native proof отдельно от очищенного model-facing текста.
  Usual redactor сохраняется. Если очистка убирает discriminator, delivery отмечает
  это; независимый semantic audit не строится по повреждённому тексту.
- `position_status`: observed / absent / unrecognized / incomplete;
  `position_observed` (raw token/coordinates, если есть), `position_source`,
  `source_span` nullable, `mapping_status`, `calibration_ref` nullable.
  Null после неизвестного усечения — incomplete, не доказанное absent.
- `attribution`: execution_only / exact_expression / controlled_throw;
  `attribution_basis`: none / unique_native_diagnostic / calibrated_position;
  `target_expression_id`, `source_sha256`, полный owner/execution reference,
  machine-readable reason и ссылки на independent evidence.

Больший raw ErrorDetails не публикуется в обход существующего лимита. Для J25 можно
доставить bounded очищенную часть с явным truncation; для B semantic completion
она недостаточна. Нельзя выводить `absent` лишь из того, что adapter раньше не имел
поля position. Если полный текст содержит координаты, но grammar не распознана,
это `unrecognized` с raw текстом, не отсутствие позиции.

## 7. Точки будущего изменения и критерии допуска

Минимальная реализация после review должна быть additive и удерживать прежние guards:

| Место | Предлагаемая роль |
| --- | --- |
| `client/lib/node-process-context.mjs:73` | При необходимости J25 добавить bounded length/truncated provenance до slice; не расширять public text и не менять owner checks |
| `client/lib/node-execution-evidence.mjs:64–108` | Сохранить group/child различие и передать полноту/diagnostic provenance, не классифицировать lookup здесь |
| `tools/loginom-acceptance/javascript-native-named-failure.mjs` | Raw witness остаётся authoritative; отдельный pure attribution verifier принимает его + source + independently pinned calibration; outcome defaults остаются conservative |
| Новый private `javascript-native-error-attribution.mjs` (предложение) | Closed parser/decision по реально наблюдённому формату, без browser effects, eval или произвольного source runner |
| `javascript-discovery-probes.mjs` и `javascript-live.mjs:698` | Раздельные wizard/native diagnostics и явные отсутствующие поля; parse не объявлять по одному probe ID |
| `javascript-engine-probes.mjs`, `javascript-execution-probes.mjs` | Отдельные fixed calibration sources после допуска; старые hashes и B P+R+T не переписывать |
| `javascript-native-named-run.mjs` и failure-driver | Передать отдельный attribution proof в journal/report, проверять immutable source/execution/ACK; никаких OUTPUT чтений на failed |
| `client/lib/execution-journal.mjs`, `redact.mjs` | Использовать существующее безопасное сохранение; proof refs и redaction flags согласовать с реальным persisted read-back |

Не трогать generic completed verifier или старый coercion outcome ради допуска B;
не переименовывать все unattributed failures в rejection. Поле reason уточняется
лишь в новом reviewed verifier, а прежние historical reports не переписываются.

Допуск конкретного B failure требует одновременно общего witness, полного текста,
независимого expression proof, проверенных upstream/idle/ACK/persist/cleanup и
root review verifier. Только тогда можно назначить `CHARACTERIZED_REJECTION`
для exact source expression; `exact_pass` не превращается в положительный PASS,
`g5_complete/public_handler_accepted/cli_accepted` остаются false. Ни один результат
не доказывает общее правило регистра/отсутствующего имени.

Минимальные будущие регрессии: raw1000 vs >1000; truncated/cleaned discriminator;
foreign/stale child/source; group-only; absent и unrecognized positions; известный
throw без mapping; shifted source/calibration mismatch; frame на setup и позднем
getter вместо R; неоднозначные frames/module; подмена proof после ACK; нет OUTPUT
на failed. Тесты исполняют настоящий pure verifier/serialized witness в existing VM,
не эмулируют native exception message от имени Loginom. После допуска реализации —
адресные проверки, нужные общие regressions и независимые bounded root runs.

## 8. Состояние передачи

В этом ходе создан только этот design. Runtime/tests/fixtures/source84 manifests,
исторические dirty docs не изменялись; тесты, browser и commit не запускались.
Внешний Help читался read-only как документация. Source84 root full-client/live
независимы от этого предложения. Attribution B ещё не реализована и не проверена;
parse calibration, native-call coordinates и model-facing J25 delivery остаются
явно открытыми до отдельного назначения.


## 9. Решение координатора после проверки

Предложение принято как проект диагностики, не как реализованный verifier или
live-доказательство. Root сверил четыре опорных report SHA/status, текущие
node-process-context slicing и named-failure raw witness/owner/source guards.
Ссылка на прежний sentinel не закрывает parse/native mapping или cleanup.
Обязательные K1/K2 соответствуют G6/J25; K3–K5 остаются условными в пределах §5.

Следующая реализация может сначала включить фиксированные B cases из
named-access-design с раздельными completed marker observations и owned failed
unattributed outcomes. Нельзя признавать failed semantic rejection без отдельного
доказанного пути. K1/K2 и доставка диагностики остаются обязательной частью полного
плана; отсутствие mapping не является поводом выдумывать позицию или бесконечно
расширять calibration. Реализация и запуск каждой следующей версии назначаются
после source freeze, тестов и отдельного решения координатора.


## 10. Root: источники wizard diagnostic после source87

Это анализ клиентских исходников, не live-наблюдение K1/K2. Private evidence:
`calibration-wizard-source87/source-review-pins.json` и `manifest.json`.

- `JavaScriptCodeWizard.js:125–141`: SetComponentAsync загружает engine.Code,
  затем сохраняет FEngine и FCodeText. FCodeText — исходный снимок этой страницы;
  по одному этому полю нельзя доказать durable/committed конфигурацию узла.
- `JavaScriptCodeWizard.js:250–258`: PageExitAsync сначала присваивает
  FEngine.Code из CodeMirror, задаёт InsecureNetworking=false, затем вызывает
  FEngine.Verify через VerifyAsync. Следовательно, ещё до Done существует эффект
  записи в engine; «Next только читает» неверно. Это не доказательство отдельного
  Execute или отсутствия implicit execution внутри серверного Verify.
- `BaseWizard.js:133–157`: VerifyAsync ловит exception и передаёт HandleException.
  `WizardForm.js:385–413` сохраняет FException (для AbortException — innerException)
  и строит tooltip через GetExceptionMsg. Отсутствие нового DOM message не следует
  приравнивать отсутствию нового native exception без отдельного baseline.
- `Message.js:505–508` вызывает GetExceptionDetailsText(e,5). В полученном
  `BG_Exceptions.js:141–234,266–283` число5 — битовая маска, не лимит длины/глубины.
  Она включает сообщения и inner exceptions, но не отдельные поля класса/stack.
  Aggregate wrapper message может быть пропущен. Текст tooltip является
  представлением exception tree, а не автоматически полным raw diagnostic.
- Raw candidate — принадлежащий текущему wizard объект FException с message/name,
  stack и inner/aggregate exceptions. Перед признанием полноты нужны конкретные
  own-data descriptors, bounded tree/cycle checks, отсутствие getters/remote reads,
  fresh identity относительно baseline, повторная проверка owner/source и явные
  поля truncation/normalization. Host JS stack нельзя объявлять Chakra source span.
- `WizardForm.js:467–478` делегирует CloseWizard в FCallbackClose. CloseResult.Close,
  Cancel и Ok различны; этот файл сам не доказывает rollback/commit. Для безопасной
  проверки committed source требуется найти creator callback и ConfigureCookie
  semantics; наименование Close не является доказательством discard.

HTTP через environment proxy вернул503 для app и scripts, но прямая intranet
проверка DNS10.200.11.224 и `/app/` дала200. Два новых статических скрипта получены
напрямую, без browser/application RPC и без изменения глобальной proxy config.
Это не текущая недоступность Loginom. Browser запусков и calibration attempts
в ходе анализа не было; общий лимит5 не расходовался.


Дополнительная независимая root-проверка callback: retained
`fix47-bg_app_TabForm.js:886–923` содержит DoConfigureNode. Он начинает
BeginOperationEx, создаёт backup delegate и передаёт в Close callback
`cancel = CloseResult !== Ok`. Это доказывает предусмотренный запрос отмены для
Close/Cancel. `fix61-bg_ts_BG_Interfaces.js:228–247` обнуляет local cookie **до**
вызова remote EndOperationExNotify и возвращает его result; следовательно,
cookie=null не доказывает завершённый rollback. Нужны наблюдённое завершение
операции и проверка exact source при повторном открытии того же узла. Эти строки
не являются доказательством уже выполненного Close/rollback на стенде.

Получены referenced Uses.js скрипты mscorlib/SysUtils/rtl.imp; отдельные manifests
в private calibration-wizard-source87. ss.Exception использует _message,
_innerException и _error, тогда как BG AggregateException — FInnerExceptions.
Эти три файла сами по себе не устанавливают тождество ss.Exception и global
Exception; оно дополнительно проверено ниже. Поддержка одной структуры не должна
выдаваться за полноту произвольного native exception.


Root получил referenced `bg/js/bg.mscorlib.js`, SHA
`a5b62e7dff9920b13b02b9affad6995316df6c6ae191fc078648a987950c4550`.
Строки29–103 добавляют prototype accessors и выбирают `ns.Exception=ss.Exception`,
если присутствует get_stack; он определён в полученном mscorlib.js.
Независимый offline Node VM прогон полного retained mscorlib и точного bridge
initialization prefix подтвердил alias и own keys экземпляра:
`_message`, `_innerException`, `_error`. message/name/innerException/stack находятся
на prototype как accessors; `_error` содержит browser stack. Evidence:
`calibration-wizard-source87/root-exception-storage-vm.json` с hashes обоих файлов
и выполненного prefix. Это не запуск Loginom или Chakra.

Промежуточный source88 snapshot с allowlist только message/name/stack и
FInnerExceptions отказал бы реальному этому storage. Root направил замечание в
работающую задачу: поддержать подтверждённый backing storage без вызова getters,
закрепить prototype/method identity и добавить regression на vendor constructors,
а неизвестные структуры по-прежнему явно отвергать. Финальный фикс ещё не принят.

## 11. E/J25: actual Done и technical details — следующий bounded шаг

На 2026-10-01 fixed public Syntax/Throw и J23 long-source persistence уже
приняты. Новый шаг проверяет оставшуюся диагностику; эти результаты не повторяет
и не повышает до полного J25/candidate/CLI.

Read-only HTTP GET actual стенда закрепил пять frontend scripts в private
`e-done-native-source-discovery-01/manifest.json`: DoneWizard/Vendor, WizardForm,
ErrorMsg и DetailPanel. Это primary source evidence, не browser acceptance.
`DoneWizard.PageExitAsync` записывает generated title, Caption, Description и
log row settings; Code/Verify выполняется на Code Next. Invalid display name
сбрасывается на blur, поэтому пустое имя не является доказанным способом отказа
Done. Ошибка после начала CloseWizard также не доказывает owned Done refusal.
Нельзя подставлять FException, ломать RPC или выдумывать Done failure. Его live
proof остаётся открытым, пока естественный воспроизводимый путь не установлен.

`ErrorMsg.FInstance.FMessageBox` владеет native modal, `FDetails` — native
DetailPanel. Штатный `btnDetais` раскрывает `pnlDetail` и заполняет
`cmpDetailText` подробным текстом; это точное spelling в primary source, пока
не наблюдённый DOM tid. Copy/mailto и вызовы этих методов запрещены для пробы.

Выбран следующий operator-only fixed `import-code`: добавить к прежнему saved
C business source один well-formed named import отсутствующего длинного
экспорта из разрешённого `builtIn/Data` (4500 ASCII filler characters). Acorn
module policy допускает supported module path, но не доказывает наличие
экспорта или поведение Chakra. Гипотеза: native Code Next откажет и покажет
длинную диагностику; actual stage/class/truncation записываются как наблюдения,
без заранее назначенного текста/класса/Done claim. Если импорт неожиданно
пройдёт, такой run не повышается до diagnostic PASS.

До единственного штатного error OK этот fixed case сохраняет read-only native
dialog inventory из той же authenticated page: exact captured modal, current
owner/source, bounded controls и own-data native DetailPanel fields. Это
discovery hook без mouse/keyboard/DOM/server mutation и без нового публичного
API. Затем прежний путь обязан закрыть error, discard, независимо прочитать
старый source, выполнить NEW same-node repair и два fresh Execute/full typed
6×4. Save не вызывается. Original30min/operation deadlines не расширяются;
foreign/stale owner, source drift, masks, unknown ACK/reply остаются отказом.

Альтернативы отклонены: повтор короткой optional-chain syntax ничего не
проверяет о truncation; принудительная подстановка native exception не является
естественной ошибкой. Runtime expansion details будет отдельным narrow design
после actual UI inventory, а не догадкой по имени из frontend source.
Перед live: actual source commit/freeze, operator guards и direct serialized
read-only regressions, independent private source/output oracle, assignment
под registry lock и fresh ordinary headed profile. После — original report,
journal hashes, независимый audit и terminal/cleanup/process absence. Никаких
секретов/raw logs в Git; child historical dirty docs и acceleration review
сохраняются отдельно.
