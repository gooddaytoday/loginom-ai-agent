# JavaScript: проверка рекомендаций ревью

Дата: 2026-09-26. [Исходное ревью](review-recommendations.md) · [исправленный план](plan.md).

Проверены все десять разделов рекомендаций по текущему коду, каноническому
регламенту, историческим e2e/пакетам, первичным внешним источникам и локальным
экспериментам. Исходные правки о целевой версии 7.4.2 сохранены.
Продуктовая база — `a8ad59766dbdb4f2da0b54367a755ce00891dd71`;
HEAD до этой правки — `8489438ba8`. Изменения после базы относятся к документации.

**Граница доказательств:** живой Loginom в этом ревью не запускался.
Ни версия его CodeMirror, ни свойства конкретного ChakraCore, ни текущая
занятость аккаунтов не объявлены установленными. Проверенные требования
к discovery внесены в план; сами live gates остаются открытыми. Для оценки
достоверности рекомендаций достаточно выявить основания/контрпримеры ниже;
это не сертификация будущего handler и не обещание «100%» поведения стенда.

## 1. Профиль движка и oracle — принять с ограничением объёма

- **Принято:** отдельные проверки кириллицы, Ё/ё, trim, strict-mode diagnostics,
  ограниченных Integer coercion cases и всех примеров runtime-редакции v1.
  Нижний регистр нужен существующему бизнес-заданию и `expected.json`.
  Литералы и импортированные строки проверяются отдельно для локализации ошибки.
- **Исправлено:** ICU — не единственный путь Unicode case conversion.
  В upstream есть POSIX `ChangeStringLinguisticCase → PAL_towlower` и собственная
  Unicode-таблица, включая 0401→0451 и 0413→0433. Это видно в
  [UnicodeText.cpp](https://raw.githubusercontent.com/chakra-core/ChakraCore/master/lib/Runtime/PlatformAgnostic/Platform/POSIX/UnicodeText.cpp),
  [wchar.cpp](https://raw.githubusercontent.com/chakra-core/ChakraCore/master/pal/src/cruntime/wchar.cpp)
  и [UnicodeData.txt](https://raw.githubusercontent.com/chakra-core/ChakraCore/master/pal/src/locale/UnicodeData.txt).
  Upstream не идентифицирует модифицированный fork Loginom.
- **Отклонено:** автоматически объявлять несовпадение дефектом движка и менять
  expected. Сначала проверить код, ввод, входную таблицу и native output.
  `toLowerCase` имеет Unicode semantics по
  [ECMA-262](https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype.tolowercase).
  Совместимое решение должно сохранять бизнес-ожидание. Изменение scope/задания
  требует отдельного явного решения и новой версии fixtures; прежний FAIL остаётся.
- **Не обязательны для текущего ядра:** Intl, locale formatting/comparison,
  non-ISO Date.parse и полный список новых regex/ES features, пока они не
  используются в v1 knowledge. Non-ISO разбор допускает implementation-specific
  поведение ([Date.parse](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.parse));
  он не проверяет требуемый native/civil datetime roundtrip.
- **Исправлено:** отсутствие global sentinel за несколько запусков не доказывает
  сброс контекста во всём пуле. Код v1 не полагается на сохранённые globals;
  J11 и cold reopen проверяют фактическую свежесть результата.
- Hash профиля принят как происхождение observations; автоматический генератор
  документации и полная ECMAScript conformance не становятся зависимостями.

## 2. Бюджеты — проблема подтверждена, предложенный cap недостаточен

Проверены `client/lib/user-preview-budget.mjs:4–41`,
`packages/agent/src/tool/truncate.ts:14–15,75–109`,
`packages/agent/src/session/tools.ts:585–608` и `session/loginom-result.ts`.

46 000 — целевой размер сокращения ordinary preview. Exact-table flags
(`exact_table`, `read_coverage`, `cell_precision`, `exact_native`) обходят
эту функцию; `require_exact_numbers` сам по себе не освобождает от сокращения.
Backend применяет собственные defaults 50 KiB/2000 строк, переопределяемые
`tool_output`; его ограничение остаётся и для native full output.
Oversized однострочный describe может потерять весь JSON preview, а не только хвост.

Локально вызвана настоящая `previewWireSize({source_text})` на Node 24.19.0.
Исходники — валидные однострочные block comments: `/*` + повторяемое содержимое
до нужного byte cap + `*/`, без CR/NUL. Замеры относятся к этой оболочке:

| Содержимое | Source UTF-8 bytes | Wire bytes |
| --- | ---: | ---: |
| ASCII, 32 KiB | 32768 | 32803 |
| Кавычки/обратные слеши, 32 KiB | 32768 | 131095 |
| Tabs, 32 KiB | 32768 | 98331 |
| Кавычки/обратные слеши, 16 KiB | 16384 | 65559 |
| Tabs, 16 KiB | 16384 | 49179 |

При 16 KiB preview уже может свернуться; cap16/512 как гарантия отклонён.
Для справочника raw=51570, `JSON.stringify(text)`=52763,
`JSON.stringify({knowledge:text})`=52777, double envelope=54192 bytes.
Точное число 52772 из ревью без заданной оболочки не воспроизводится; превышение
default backend cap подтверждено. 14 текущих parameter schemas: 340–3024 bytes
одинарного JSON, 407–3297 wire bytes.

**Внесено:** input cap32 KiB отдельно от reply budget; apply возвращает
наблюдённый digest/размер/совпадение, source читается bounded chunks; общий
budget test включает prepare, multi-type describe, diagnostics и таблицу.
20 000 для JS describe — выбранный проектный предел, не свойство runtime.
`truncated=false` проверяется вместе с отсутствием `readback_summary` и
полнотой строк/source chunks. Отдельная source-ветка `dock_node_read` описана
как TO_IMPLEMENT: прежний output-read требует completed receipt и выполняет узел
заново (`node-read-contract.mjs:29–50`, `node-read-driver.mjs:21–31`).

## 3. Редактор и сериализация — риск подтверждён вне Loginom

Локальная браузерная проба использовала CodeMirror 5.65.18 из bundled Playwright
trace viewer, Node24.19.0, Playwright1.63.0-alpha-2026-08-31, Chromium153.0.8010.12
(revision1243). Создавался отдельный localhost page, JavaScript mode,
`inputStyle=textarea`, `electricChars=true`, autoCloseBrackets false/true.
Владение браузером и cleanup принадлежали пробе; чужой браузер не использовался.
Версии, hashes и компактные результаты — в [evidence](review-evidence.json).

- `keyboard.type` не сохранил точно ни один из 8 случаев: LF становится Enter,
  autoindent меняет пробелы; closebrackets может добавить скобку.
- `insertText` сохранил 6/8: при завершающей `}` electricChars также меняет отступ.
- Кандидат `insertText(source + LF)`, затем Backspace прошёл 14/14, включая
  empty, tabs, trailing spaces, emoji, 32 KiB и 1024 строки. Это эксперимент,
  **не готовый Loginom driver**: на живом UI нужны receipts, focus/owner guards,
  точное промежуточное чтение и обработка неизвестного первого эффекта.

Приняты live G4, измерение максимального ввода и проверка настоящей версии
редактора. Не предписано вслепую менять options или использовать insertText
как гарантированный способ. Простой перенос keyboard.type недостаточно обоснован.

Независимо разобраны 496 исторических `.lgp`: 134 JS Code, из них 133 с LF,
один однострочный; XML содержит entities. Это не доказывает текущий save Loginom.
В J23 digest считается по декодированному UTF-8 canonical source, artifact hash
отдельно; trim/форматирование ради совпадения запрещены. Иной live roundtrip
требует заранее определённого контракта канонизации.

## 4. Worktree — проблема подтверждена, база сохранена по канону

`git cat-file -e a8ad597…:docs/node-development/nodes/programming-javascript/plan.md`
подтверждает отсутствие плана на product base. Два docs-коммита после базы
меняют только `docs/node-development/`.

Внесено разделение `product_base_sha`, `plan_source_sha` и фактического HEAD.
Worktree/регистрация создаются от product base; после допуска переносятся
закреплённые docs-only commits. Это важно ещё и потому, что
`services/loginom-ai/tools/project-memory/prepare_task_memory.py:50`
проверяет точное равенство свежего HEAD и base. «Последний commit» не подменяет
полный закреплённый SHA; незакоммиченные изменения не переносятся автоматически.

## 5. Знания — принять с исправлением доставки и scope

- Принят `client/lib/javascript-knowledge.mjs`: `runtime-pin.mjs:6–21`
  автоматически включает `.mjs`/`.d.ts`. Но `.md` внутри client/lib уже
  копируется в bundle (`stage-resources.ts:104–105`); для него отдельно нужен
  runtime fixed path. Файл только в docs требует доставки. Это разные механизмы.
- Приняты 5–7 правил в `limitations`: `user-results.mjs:205–211` оставляет
  это поле в compact bundle, который приходит при первом prepare
  (`bridge.mjs:269–283`). Его необходимо реально добавить JS-карточке.
  Поле `validated_for` само по себе текущая compact projection не переносит;
  версия должна быть видна в правилах и проверяться actual delivery.
- Приоритет имеют наблюдённая среда и проверенная для неё runtime-редакция.
  Метки «7.4.2» недостаточно без probes. Remote Help доступен без build-фильтра.
- Правила советника адаптированы к наблюдаемому состоянию/handler. Автоматическое
  удаление existing mappings не принято. **Сохранение пакета остаётся в v1**;
  фраза ревью о save «вне v1» слишком широка. Внешние модули/FS/Fetch/Calc и
  desktop paths исключены из v1-примеров, сохранены в исходном справочнике.
- Все примеры именно новой runtime-редакции должны пройти live probes;
  выполнять весь исходный справочник с FS/Fetch ради ядра не требуется.

## 6. Мастер и ошибки — принять проверки, не вымышленные controls

«Правила чат-помощника» в тексте не доказывают наличие встроенного помощника
в мастере. Selector/engine switch в исследованных источниках не установлен.
В G1 внесено наблюдение: если control существует — учесть его влияние и
фиксированный поддержанный режим; помощника не вызывать. Публичный выбор
всех движков автоматически не добавляется.

Исторические ChakraCore messages подтверждены `js_errors.ts:107–208`.
Текущая [справка Loginom](https://help.loginom.ru/userguide/processors/programming/java-script/index.html)
описывает ошибки с позицией кода; точная форма целевого build требует G6.
Приняты наблюдённые класс/текст/позиция, digest, owner/execution, bounded redaction;
нет exact matcher по старому английскому сообщению и нет выдуманной позиции.

## 7. Среда — часть объяснения устарела; найден дополнительный блокер

`testable=true` подтверждён `diagnostics.mjs:55–56` и
`src/connection-check.mjs:17–23`. Исторические адреса/аккаунты не назначают
нынешние ресурсы. Отдельный разрешённый аккаунт нужен по канону; запрет имени
`user` нельзя вывести только из прежних defaults.

**Факт о текущем default в ревью неверен:** `packages/product/src/index.ts:16–17`
задаёт `https://app.loginom.ai`, а не назначенный стенд. Более существенно,
`packages/loginom-host/src/connection/connection-service.ts:61–74,381–383`
при запуске мигрирует сохранённый exact URL стенда на этот default независимо
от username. Существующий `test/connection-migration.test.ts:55–73` прямо
ожидает такое поведение и для CLI (тест в этом ревью прочитан, не запускался).
Поэтому план дополнен проверкой сохранения явно назначенного target при новом
процессе; если миграция срабатывает, CLI-приёмка заблокирована до адресного
исправления различения legacy default и явного назначения. Подмена стенда или
маскирующий URL alias не являются решением.

Принят будущий операторский `packages/loginom-runtime/tools/loginom-acceptance/javascript-live.mjs`.
Сейчас такого файла нет. В соседних образцах устарели browserRoot, macOS profile,
manifests и способы dump; нужна адаптация к current runtime, не только замена
пути. Generic editor deny остаётся. Бесконечные/нагрузочные пробы не добавлены.

## 8. Контракт — отделить новые решения от существующих механизмов

- Import preflight принят **как новая задача реализации**: static Data import
  поддержан, явные unsupported declarations/re-exports/direct loader calls
  отклоняются до мутации. Нужен синтаксический анализ comments/strings/templates
  и module specifiers; regex и переименование ключа этого не обеспечивают.
  Неразбираемый source получает preflight refusal. Косвенные эффекты JS не
  сертифицируются, sandbox не обещана; native parse diagnostics проверяются отдельно.
  Проверяется effective source, включая preserved existing и output reread,
  до graph/configuration effects и повторно перед выполнением; одного pure
  request validator без наблюдения старого кода недостаточно.
- Имена столбцов: `js_data_output.ts:56–75` исторически ожидает Инт→Int.
  Правило текущего code-mode ещё требует G3; нельзя заимствовать его у text import.
- Resume: выбран явный отказ cross-process resume. `node-operation-runner.mjs`
  хранит jobs в process-local Map; новый runner со старым ID в чистой пробе
  возвращает `Unknown node operation`. Snapshot0600 недостаточен для owner,
  checkpoints и deadline. Same-process continuation и crash recovery различаются.
- Bindings: request shape и доступные input identities проверяются до эффекта;
  dynamic outputs — после materialization с учётом уже выполненных эффектов.
- **Обоснование запретом `code` отклонено:** scanner применяется к remote
  `catalog.actions` (`action-catalog.mjs:137–171`), не к node parameter schemas.
  Чистая проба schema.properties.code и candidate describe прошла.
  `source_text` оставлен из-за предметной семантики и существующего import `source`.
- Redactor-регрессии приняты: code/password whole-field rule существует,
  но generic URL/Basic/токен/PRIMARY_KEY rules действуют и на `source_text`.
  Переименование не делает текст byte-safe. Точный execution payload отделён
  от очищенных evidence; публичное чтение сообщает отказ при изменении текста.
  Redaction проверяется на полном source до chunking: actual redactor меняет
  `Basic ordinaryword`, но разрез после `Bas` скрывает шаблон при независимой
  обработке двух частей (подтверждено чистой пробой). Это добавлено в source-read
  регрессию; очистка chunks по отдельности недостаточна.

## 9. Регламент и fixtures — принять без циклических условий

- JS получил существующий prerequisite `dynamic_schema`; общее определение
  `programming_runtime` не изменено (оно используется также Python).
  JS-specific build/ОС/разрешение исполнения определены в 0A.
- Первый review требует PASS обязательных source/direct/live проверок, включая
  J19, а не просто «результат». J01/J21 разделены на source до review и
  candidate после сборки; J18 после review. Иначе возникал цикл зависимости.
- Добавлен `task-declared.md`. Manifest v2 задаёт отдельные пары файлов для
  code/declared, чтобы модель не получала два противоречащих задания.
- 30 минут остаются стандартом канона. Прямые timings полезны, но не доказывают
  время автономной модели. Обязательный дополнительный прогон ради обоснования
  стандартного лимита не добавлен.
- Общие CLI deadline/evidence/cleanup правила сокращены до ссылки;
  предметные проверки JavaScript сохранены.

## 10. Матрица и проверка документов

J20–J26 внесены с оговорками выше: минимальный нужный engine profile;
обе стадии ограничения ответов; условное существование assistant; decoded
source fidelity; реальные names; bounded diagnostics; новый import preflight.
Candidate/CLI доказательства не включены в Goal первого review. Статусы
реализации/интеграции/выпуска и live gates не повышены.
Дополнительный J27 фиксирует обнаруженную проверку сохранения target в CLI.

Дополнительно проверяются hashes источника и fixtures, пары файлов по режимам,
сохранение прежних expected, регламентный `validate.py --render`/`validate.py`,
whitespace и документация в чистом Git-экспорте. Результат — в
[checkpoint](planning-checkpoint.md). TestCafe остаётся необязательным источником.
