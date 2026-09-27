# JavaScript: результаты исследования, 2026-09-26

[Карточка](README.md) · [исполняемый подплан](plan.md).

Это проверка документов и исходников. Формулировки «найдено в коде»,
«описано в Help», «есть тест» и «подтверждено на живом Loginom» различаются.
Последнего вида доказательств в этом исследовании нет.

## 1. Процесс обучения и примеры других узлов

В [каноническом README](../../README.md) «обучение узлу» определено как
разработка и проверка обработчика интерфейса. Здесь не требуется fine-tuning
LLM, обучение статистической модели или отдельная операция train в Loginom.
Для JavaScript добавляется ещё задача: модель должна правильно писать код
для встроенной среды и получать актуальную схему узла.

Прочитаны [создание подплана](../../workflow/new-node-plan.md),
[шаблон](../../templates/node-plan.md), [single](../../workflow/single-node.md),
[жизненный цикл](../../workflow/lifecycle.md), [CLI-приёмка](../../workflow/acceptance-cli.md),
[назначение](../../templates/assignment.md), [checkpoint](../../templates/checkpoint.md),
правила ресурсов [оркестратора](../../workflow/orchestrator.md) и
[регистрация памяти](../../../../services/loginom-ai/tools/project-memory/CURRENT.md).

Из существующих узлов использованы следующие образцы:

- [Калькулятор](../calculator/plan.md): кодоподобный редактор, подтверждение
  полного текста, отдельный output mapping, сохранение неперечисленных свойств,
  точная проверка дробей/NULL и независимое повторное открытие. Его режим
  `expression` не является JavaScript. Исторический
  [completion audit 04](../../../../services/loginom-ai/docs/plans/loginom-dock/04-completion-audit.md)
  содержит реальные сценарии Close, lost reply, пустого входа и подмен oracle;
  Hermes и прежние runtime pins из него — история.
- [Текстовый импорт](../text-import/plan.md): происхождение входных байтов,
  типизация, отдельная настройка портов и частичные эффекты. Он позволяет
  подготовить независимый табличный вход без ожидания другого нового узла.
- [Объединение](../union/plan.md): будущие дополнительные входы и явное
  сопоставление identities. Этот пример не доказывает поддержку дополнительных
  выходов или переменных JavaScript.
- [Свёртка столбцов](../collapse-columns/plan.md): точные typed-значения,
  ограничения полного чтения и отказ при неподтверждённом происхождении.
  Её специализированный exact reader нельзя объявить универсальным JS reader.
- [Кросс-таблица](../transform-crosstable/plan.md): образец нового обработчика
  со статусом `discovery_required`, динамической схемой и сохранением всех
  прежних readiness-статусов.

Общий маршрут: подготовка → live discovery/разработка → один проход ревью
в той же задаче → один раунд исправлений → immutable candidate → один
занятый слот автономной Sol-приёмки → независимый oracle и cold reopen.
После исправленного FAIL допустим обоснованный новый прогон; исходная попытка
сохраняется. Текст модели «готово», source tests и scripted pipeline не заменяют
аналитический PASS. Слияние и выпуск требуют отдельного назначения.

## 2. Закреплённые источники и локальная среда

- Продукт: `a8ad59766dbdb4f2da0b54367a755ce00891dd71`, ветка `javascript`;
  локальные refs `loginom`/`origin/loginom` совпадают. Версия root — 0.1.17.
- E2E: `/home/george/git/testing/e2e-tests`, ветка `master`,
  `7a41b5adbb9c45dca8d756a8220615554301c2e0`, рабочая копия чистая при чтении.
- Пользователь назначил живой стенд
  [http://logi-test-plan.bg.local/app/](http://logi-test-plan.bg.local/app/)
  и целевой build обучения Loginom 7.4.2. Выбор адреса и build определён;
  сеть, фактический build стенда, ОС сервера и тестовый аккаунт ещё не проверены.
- Пользовательский [справочник](references/js_node_loginom_system_prompt.md):
  984 строки, 51 570 байт, SHA-256
  `c9c2d44d4dc4cf34b8f21a98504cf9f6acfc70cac510c36fe2725e7c0d7c2d16`.
  По уточнению пользователя справочник относится к Loginom 7.4.2.
  При первоначальном исследовании файл находился в корне repo и не отслеживался
  Git. По указанию пользователя перенесён в `references/` этой карточки и
  добавлен в Git без изменения байтов. В worktree от product base он появляется
  только после переноса закреплённых docs-коммитов по 0A; сам перенос не
  включает его в CLI bundle. До реализации подготовить проверенную
  runtime-редакцию, сохранив происхождение исходного файла.
- Shell: Node 20.19.2, Bun 1.3.13. Product pin требует Node 24.19.0;
  `package.json` и CLI builder требуют Bun 1.3.14, причём builder проверяет
  также commit Bun `0d9b296af33f2b851fcbf4df3e9ec89751734ba4`.
- Найден bundled Node в `packages/desktop/resources/loginom/bin/node`:
  версия 24.19.0, SHA-256
  `bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12`
  совпал с [product pin](../../../../packages/product/loginom-release.json).
  Наличие ресурса Desktop не подтверждает весь CLI candidate.
- `loginom-ai-agent-cli` отсутствует в PATH и проверенном стандартном
  `~/.local/bin`; стандартный payload `~/.local/share/loginom-ai-agent-cli`
  отсутствует. Это не глобальный поиск всех возможных нестандартных установок.
- На момент первоначального исследования отсутствовали `.local/node-development`,
  `.local/project-memory/runtime/20260924.1` и стандартный
  `~/.local/state/loginom-ai-agent/node-development/host-resources.json`.
  Аккаунт, изолированный CLI profile, OAuth, Loginom build, доступность
  графической сессии и слот кампании ещё не проверены.
- OpenViking текущей задачи: поиск Experience и точное чтение релевантных
  записей успешно выполнены. Это не допуск будущего worktree и не проверка
  его capture/extraction. Отсутствие локального runtime регистрации не означает
  отказ работающей памяти основного checkout.

[Подготовка от 24 сентября](../../environment-2026-09-24.md) описывает macOS,
другой checkout и конкретный исторический профиль. Её PASS, аккаунт `user`
и пути нельзя переносить на `/home/george`. Механизм CURRENT выводит Peer из
текущего корня: не подставлять macOS URI или глобальный Peer из примеров.

## 3. Текущий runtime и точки расширения

В [реестре](../../registry.json) `component.programming.JavaScript` находится
в backlog, `handler=null`, исторического подплана/приёмки нет. Сводка: 78
компонентов, 14 реализованных, 61 backlog, 3 условных резерва.

Основные проверенные границы:

| Область | Источник в `packages/loginom-runtime/client/lib` | Наблюдение |
| --- | --- | --- |
| Тип и порты | `node-contracts.mjs:7–34` | 14 типов; JS отсутствует. Есть additional inputs, нет симметричного контракта additional outputs. Группа палитры по умолчанию «Трансформация», для JS нужна явная «Программирование». |
| Публичный API | `node-api.mjs`, `node-support.mjs` | Enum типов/режимов, schemas и dispatch должны быть согласованы с handler. Одной карточки недостаточно. |
| Общий цикл | `node-apply.mjs` | `applyNode({request, operation, handlers, drivers, record, signal, stopSignal, now, resume})`; настройка и выходной мастер предшествуют Execute. Применимость такого порядка к JS требует discovery. |
| Модельный интерфейс | `bridge.mjs:269–283`, `user-workflow.mjs`, `user-results.mjs:205–211` | В `user-v1` первый `dock_prepare` выдаёт compact knowledge и локальные instructions, затем reused. Произвольный remote SKILL не становится этим контекстом автоматически. |
| UI | `workspace-ui.mjs:442–448` | Общий UI запрещает JS/script/codeeditor и CodeMirror/Monaco/Ace. Нужен отдельный узловой путь, а не снятие общего запрета. |
| Action catalog | `action-catalog.mjs:90–97` | Запрет script/code/javascript относится к удалённым action definitions; не путать с отдельной схемой узловых параметров. |
| Длина текста | `workspace-ui.mjs:15–31`, `2578–2583` | Текущий путь текста/выражений ограничен 2048 UTF-16 units и 128 LF-строками; полноценный JS требует собственного подтверждённого лимита и полного readback. |
| Journal | `execution-journal.mjs:14–27`, `node-apply.mjs:127–131`, `redact.mjs` | Журнал возвращает очищенную запись; acknowledge сравнивает её hash с исходной. Очистка литералов может нарушить равенство. |
| Источники runtime | `runtime-pin.mjs:4–16` | Автоматически включаются `.mjs`/`.d.ts`; `.md` требует явного включения в fixed paths и bundle. |
| Readback | `node-api.mjs`, `node-output-procedure.mjs`, `node-read-contract.mjs`, `collapse-native-output.mjs` | Sample по умолчанию ограничен; специальное полное чтение Свёртки не гарантирует JS coverage. Для проверки нужны все ячейки и freshness. |

Существующие `TuneDataSourceMappingWizard` и `calculator` работают с другими
предметными задачами. Встроенный JS engine в `.lgp`, видимость компонента
в палитре и поддержка браузерного JavaScript также не доказывают наличие handler.

Нужно разделять три среды исполнения: код handler в Node, browser driver
в Chromium и пользовательский JavaScript на стороне Loginom/ChakraCore.
`builtIn/Data` относится к третьей среде. Нельзя проверять совместимость
пользовательского кода одним `node --check` или запуском в Chromium.

### Подтверждённая проверка очистки

На настоящем `createRedactor()` под pinned Node выполнена локальная проба
с несекретными строками. `OutputTable.Append();` сохранён, а
`const endpoint = "https://example.org";` преобразован в строку с
`https://example.org/`. Это доказательство изменения байтов очисткой,
**не** наблюдавшийся сбой ещё не существующего JS handler. При проектировании
журнала хранить проверяемый digest исходника отдельно от публичного представления;
не исполнять очищенный текст и не отключать redaction.

## 4. Ограничения проведённых проверок

В текущем исследовании выполнены:

- Валидатор документации/реестра до изменений — PASS, 342 исторических файла,
  270 Markdown; исходный внешний ZIP отдельно не проверялся.
- Package-local `node-api`, `capability-registry`, `user-workflow` на Node
  24.19.0 — **24/24 PASS**. Это baseline существующего контракта, без JavaScript.
- Чтение официальной документации и исходников e2e; e2e suite не запускался.
- Проверка Git refs, отсутствия названных локальных prerequisites и hash
  пользовательского справочника.

Живой сервер, мастер, вычисления ChakraCore, независимый cold reopen, установка
CLI и модельная приёмка — **not_checked**. Полная среда находится в фазе
подготовки; это не FAIL продукта. Дальнейшие источники, аудит справочника и
матрица e2e приведены ниже.

## 5. Официальная документация и особенности ChakraCore

Изучены основной раздел JavaScript и связанные страницы API, портов, данных,
настроек сервера и версии 7.3. Все адреса — официальные источники Loginom.
Текущая онлайн-справка не закреплена за целевым build 7.4.2; дату чтения
и версию исполнения нужно хранить раздельно.

| Источники | Вывод для разработки |
| --- | --- |
| [Узел JavaScript](https://help.loginom.ru/userguide/processors/programming/java-script/index.html) | Табличные входы и переменные необязательны; мастер задаёт выход и код. Preview выполняет код и ограничивает показ данных. Синхронные ошибки и Promise rejection наблюдаются по-разному. Linux не поддерживает Atomics.xx. |
| [Входные таблицы](https://help.loginom.ru/userguide/processors/programming/java-script/input-tables.html), [переменные](https://help.loginom.ru/userguide/processors/programming/java-script/input-variables.html) | `Get(row,col)`, `IsNull`, `Columns`, `GetColumn`; входные переменные read-only через `Items`, `Value`, `IsNull`. Отсутствующий порт, пустая таблица и пропуск значения — разные состояния. |
| [Выходные таблицы](https://help.loginom.ru/userguide/processors/programming/java-script/output-tables.html) | `AssignColumns`, `AddColumn`, `InsertColumn`, `DeleteColumn`, `ClearColumns` формируют структуру до первого `Append()`. `Set(col,value)` пишет в текущую строку, а не принимает индекс строки. Методы не добавляют физические порты. |
| [Enum](https://help.loginom.ru/userguide/processors/programming/java-script/enum.html), [глобальные функции](https://help.loginom.ru/userguide/processors/programming/java-script/global-function.html), [API](https://help.loginom.ru/userguide/processors/programming/java-script/api-description.html) | Собственные DataType/DataKind/UsageType, таймеры, Base64, локаль; TypeScript-декларации описывают API, но не разрешают TypeScript в узле. |
| [Внешние модули](https://help.loginom.ru/userguide/processors/programming/java-script/external-modules.html) | Корень — ES6-модуль; ESM и CommonJS имеют разные правила. Относительный путь зависит от сохранённого пакета/импортирующего модуля. `require()` не означает Node/npm. |
| [Функции Калькулятора](https://help.loginom.ru/userguide/processors/programming/java-script/calc-functions.html) | Есть `builtIn/Calc`, включая установленные функции плагинов. IF/IFF и контекстные Data/RowNum/RowCount/DisplayName/CumulativeSum не переносятся таким импортом. В пользовательском справочнике этот модуль пропущен. |
| [Fetch](https://help.loginom.ru/userguide/processors/programming/java-script/fetch-api.html), [FS](https://help.loginom.ru/userguide/processors/programming/java-script/fileapi.html) | Fetch асинхронен, body одноразовый, HTTP error требует проверки статуса; фиксированного timeout нет. FS синхронен и использует собственный FileHandle/ArrayBuffer API. |
| [Консоль](https://help.loginom.ru/userguide/processors/programming/java-script/console.html) | `console.error`/`assert` — диагностика, не самостоятельный oracle успешности. Уровень серверного логирования влияет на доступность сообщений. |
| [Автосинхронизация](https://help.loginom.ru/userguide/workflow/ports/automapping-of-fields.html), [связи полей](https://help.loginom.ru/userguide/workflow/ports/connections-interface.html) | Схема набора из кода, поля порта и связи — разные сущности. Обязательные поля нельзя очищать по общему совету, не проверив существующие настройки. Autosync отличается от простого автосвязывания. |
| [Атрибуты полей](https://help.loginom.ru/userguide/data/datasetfieldfeatures.html), [типы](https://help.loginom.ru/userguide/data/datatype.html) | Name и DisplayName различаются; int64 платформы шире безопасной арифметики Number. Date имеет миллисекунды; Variant требует type tag, а не строкового сравнения. |
| [Расположение файлов](https://help.loginom.ru/userguide/location_user_files.html), [безопасность](https://help.loginom.ru/userguide/admin/parameters/security-parameters.html), [сервер](https://help.loginom.ru/userguide/admin/parameters/server-parameters.html) | Локальный файл агента не становится файлом сервера. Нужны реальные storage permissions, TLS trust и ресурсы целевого Loginom. Лимиты сервера не равны лимиту одного JS-узла. |
| [JavaScript/Python](https://loginom.ru/blog/use-javascript-python), [архитектура](https://loginom.ru/blog/loginom-technique) | Официально описаны ChakraCore, изолированные контексты и пул движков; это не спецификация конкретного fork/build и не обещание worker threads в пользовательском коде. |
| [Релиз 7.3](https://loginom.ru/blog/release-73), [API 7.0](https://help.loginom.ru/7.0/userguide/processors/programming/java-script/api-description.html) | Multi-output и AbortController появились в 7.3; release notes упоминают credentials и проверку сертификатов. API старой версии этого не содержит; современный RequestInit не разъясняет форму credentials. |
| [JavaScript Калькулятора](https://help.loginom.ru/userguide/processors/transformation/calc/javascript.html), [Калькулятор дерева](https://help.loginom.ru/userguide/processors/data-trees/calculator-tree/javascript.html) | Другие контексты исполнения. Их ограничения Promise/CommonJS, доступ к переменным и примеры JSON require не доказывают такой же контракт отдельного JS-узла. |
| [Релиз 6.4.4](https://loginom.ru/blog/release-644) | Исторические исправления памяти ChakraCore — повод проверить ограниченный rerun/stop, не основание объявить текущий сервер дефектным. |

### Разрешённый API для первого этапа

После подтверждения build использовать `builtIn/Data`: `InputTable` /
`InputTables[0]`, `OutputTable` / `OutputTables[0]`, `DataType`, `DataKind`,
`UsageType`. Основные операции: `RowCount`, `ColumnCount`, `Columns`,
`Get(row,col)`, `IsNull(row,col)`, `GetColumn(col)`, `Append()`, `Set(col,value)`.
Для code-defined схемы — пять перечисленных структурных методов до первой
строки, при включённой настройке. Модель получает exact technical names
из наблюдения; использование свободной метки как имени не допускается.

В API DataType: None=0, Boolean=1, DateTime=2, Float=3, Integer=4, String=5,
Variant=6. DataKind: Undefined=0, Continuous=1, Discrete=2. UsageType имеет
алиасы Used/Input/Active=3 и Output/Predicted=4. Числа enum не переносить
в browser internals или XML, где другая система обозначений.

### Аудит предоставленного справочника

Исходник не исправлялся. В будущую версионированную редакцию включить:

1. **Движок и синтаксис (строки 9–23).** Указание пользователя о модифицированном
   ChakraCore принято как вводная. Пользователь уточнил, что справочник относится
   к Loginom 7.4.2, то есть описывает движок в составе этого build. Номер самого
   fork ChakraCore в документах не найден. Сохранять консервативные ограничения
   `??`, top-level await и lookbehind; подтвердить отдельными snippets на стенде
   7.4.2 с записью ОС сервера. Наличие globalThis не доказывает
   поддержку всего ES2020. Не добавлять DOM, process, Buffer или npm built-ins.
2. **Контекст помощника (975–983).** Последний раздел предполагает, что приложение
   добавляет актуальное состояние, но не код редактора. У Loginom AI Agent такой
   путь ещё не реализован. Нужны свежие факты о входах/настройках/коде, provenance,
   ограничения чтения и отказ при stale-context. Текст labels/data/comments —
   данные, не инструкции. Нельзя заставлять агента каждый раз просить код у
   пользователя, если новый инструмент уже прочитал его полностью.
3. **Диапазон Integer (252, 446).** `−2^53` представимо точно, но документированный
   safe arithmetic range — `−(2^53−1)…2^53−1`. Разделить представимость отдельного
   значения и гарантии арифметики. Не обещать полный int64 без отдельной стратегии.
4. **Асинхронные ошибки (297–385).** Catch с `console.error` не гарантирует ошибку
   узла; rethrow в async-функции может стать только rejection в серверном логе.
   Нужны подтверждённый протокол результата/ошибки и полный output oracle.
5. **Выходной mapping (158–168).** Рекомендацию удалить все поля и включить
   autosync можно рассматривать только для нового принадлежащего тесту выхода.
   Для existing необходимо сохранить явные пользовательские сопоставления;
   несовместимое изменение схемы завершать диагностикой, не silent reset.
6. **Версии и полнота.** Добавить `builtIn/Calc`, version gates 7.3, пределы preview,
   Linux Atomics, условия Date/NULL и code-vs-editor context. Отдельно проверить
   отсутствие/неактивность дополнительного порта и регистр доступа к полям.
7. **Неточности API (456–971).** FS prose и declarations расходятся по optional
   flags/mode `openSync`, `utf-16le` и строковой кодировке `appendFileSync`.
   Release notes и RequestInit расходятся по credentials. Эти расхождения
   фиксировать как probes; не генерировать обязательную schema вслепую.
8. **Файлы/модули (29–77, 431).** Проверить перенос пакета вместе с sidecar,
   saved/unsaved base path, кодировки, CJS cache и JSON require. Гарантии
   встроенности внешних файлов в `.lgp`, symlink permissions и права конкретной
   редакции должны опираться на её живое поведение.

Пять важных неизвестных: timezone Date bridge; coercion/NaN/Infinity/Variant;
область жизни require.cache; остановка pending callbacks после cancel;
моменты исполнения при Next/Done/Preview/Execute. Ни Node/Bun, ни браузерный
parse не заменяют проверку этих свойств в Loginom.

## 6. E2E: покрытие и пригодность для нового обработчика

Подробный [каталог e2e](e2e-coverage.md) фиксирует файлы, строки, пропуски,
fixtures и ограничения возможного запуска. Основной набор: **45 declarations,
35 active, 10 skip**, семь fixtures в `tests/toreview/acceptance/wizards/javascript`.
Шесть error tests содержат 28 негативных векторов. Основной Main suite
исключает `:toreview`, поэтому обычное `npm test` не подтверждает их выполнение.

По [каноническому процессу](../../workflow/new-node-plan.md#2-исследовать-до-проектирования)
Help/E2E сопоставляются с живым UI и кодом как источники. Обязательного запуска
внешнего TestCafe suite в регламенте нет. Для JS его выполнение исключено из
условий готовности: нужные сценарии проверяются непосредственно через новый
handler/runtime и независимый oracle, затем автономным CLI. Незапущенный
исторический suite отмечается `not_run` и сам по себе не блокирует эти этапы.

Дополнительно найдены активные helper/console/UsageType/label/run-stop проверки.
В 496 `.lgp` обнаружены 134 JavaScript engine nodes в 45 пакетах; XML использует
`TBGCodeModelComponentEngine`, `Code`, `ColumnDefs`, `CodeConfigurableColumns`.
Это подтверждение сериализации исторических fixtures, не API записи на сервере.

Нельзя использовать как приёмочный oracle: substring-проверку видимых CodeMirror
строк, preview с максимумом 100 строк, округлённое ru-RU представление дробей,
готовый JS-компаратор, успех автодополнения или skipped test. Также нет
подтверждения, что `.lgp` поколения 6.5 работает без изменений на целевом build.

## 7. Что было бы легко упустить

Дополнительная [проверка рекомендаций ревью](review-verification.md) содержит
замеры бюджетов/редактора и исправления предположений. В частности, текущий Host
мигрирует сохранённый exact URL назначенного стенда на новый product default;
приёмка CLI должна доказать сохранение явного target между процессами.

- Обучение включает доставку знаний модели, UI handler и независимый oracle;
  провал любого слоя нельзя исправить только расширением системного prompt.
- Текущий graph adapter явно допускает **7.4.2** (`node-target-browser.mjs:318`);
  это же целевой build обучения и build справочника. Другая версия требует
  отдельного подтверждённого изменения профиля и знаний, даже если её Help
  описывает JavaScript.
- `node-api` читает лишь порты 0/1, а compact default — `[0]`; multiple outputs
  нельзя обещать без расширения общих контрактов. Variables имеют другой вид
  связей и не являются ещё одним табличным портом.
- Code-defined output может возникать во время настройки. Preview или повтор
  настройки способен исполнить программу: future FS/Fetch требуют иной оценки
  частичных эффектов и повторов, чем чистое табличное преобразование.
- Save checkpoint сообщает `persisted_content_verified=false`; даже `save_as`
  не подтверждает полный JS-текст. Нужны чтение сохранённой конфигурации и новое
  исполнение после независимого открытия.
- Для новых knowledge assets нужно проверять не только Git, но resource manifest,
  runtime pin, actual `dock_action_describe` response и доступность в CLI.
- При отдельной диагностике E2E Node16 и продуктовый Node24 должны жить раздельно.
  E2E install/debug wrappers делают записи/cleanup и могут выбирать удалённый
  target при импорте config.
- Управление token/URL literals, Unicode, CRLF, длинными виртуализированными
  документами и одинаковыми labels — часть корректности, не косметика редактора.
- Нужны owner/deadline/operation ID для stop/retry, защита чужих пакетов и
  доказанный cleanup. Сетевой сбой модели не означает дефект ChakraCore.


## Integer coercion: граница документации после empty04

Повторно проверены текущие официальные страницы
[выходных таблиц](https://help.loginom.ru/userguide/processors/programming/java-script/output-tables.html)
и [API](https://help.loginom.ru/userguide/processors/programming/java-script/api-description.html).
Они задают типы аргумента Set и запись в последнюю добавленную строку, но не
определяют преобразование fraction/string/NaN/±Infinity в Integer. Из этой
сигнатуры нельзя вывести округление, усечение, NULL либо исключение.

Локальная runtime-справка требует совместимых типов и запрещает полагаться на
неявное преобразование несовместимых значений. Это правило генерации кода,
а не доказательство поведения встроенного движка. Следующий bounded набор
должен наблюдать каждый случай отдельно, сохранять native output либо точное
подтверждение терминальной ошибки, проверять исходный input/upstream и не
менять существующие exact integer ожидания. Успешный Execute сам по себе
не доказывает значение, записанное Set. Реализация пока не выполнена.
