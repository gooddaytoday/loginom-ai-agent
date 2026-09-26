# JavaScript: каталог существующих e2e

[Исследование](research.md) · [подплан](plan.md).

Корень источника: `/home/george/git/testing/e2e-tests`, SHA
`7a41b5adbb9c45dca8d756a8220615554301c2e0`, submodule `ci/common`:
`bbdd0ab231f2e0f007d75a2583e0e22c08b2ef85`. Пути и номера строк ниже
относительны этому checkout. Прочитаны тесты, helpers и XML fixtures;
ни один e2e здесь не запускался. `active` означает отсутствие skip в исходнике.

Это исследовательский каталог сценариев, selectors и fixtures. Канонический
[процесс](../../workflow/new-node-plan.md#2-исследовать-до-проектирования)
требует сопоставлять Help/E2E с UI и кодом, но не требует запускать этот
внешний TestCafe suite. В подплане JS он имеет статус `not_run` и не входит
в условия готовности. Нужное покрытие обеспечивается адресными тестами
handler/runtime, live-проверками, независимым oracle и автономным CLI.

## Основной suite

Каталог: `tests/toreview/acceptance/wizards/javascript/`.

| Файл | Active / skip | Проверки и строки |
| --- | --- | --- |
| `js_general.ts` | 5 / 0 | 27 новый узел; 37 без внешних данных; 51 без настройки; 60 без тела с выходным полем; 72 копирование данных |
| `js_module.ts` | 5 / 0 | 21 default Calc; 50 named Calc; 79 CommonJS; 123 ESM; 150 формирование схемы внешним модулем |
| `js_errors.ts` | 6 / 0 | 45 Error; 79 duplicate column; 114 ReferenceError; 156 TypeError; 211 SyntaxError; 250 прочие |
| `js_interface.ts` | 6 / 4 | Active: 123 пустой preview; 138 данные; 156 маленькая таблица без total; 174 total; 194 первые 100; 213 Stop. Skip: 25 сохранение кода при переходах; 54 данные консоли; 74 видимость консоли; 102 assert |
| `js_data_output.ts` | 10 / 5 | Active: 27 запрет AddColumn без флага; 56 транслитерация; 92 AssignColumns; 120 AddColumn; 146 DeleteColumn; 172 ClearColumns; 197 ClearColumns ручных полей; 222 InsertColumn; 244 Set; 268 Get. Skip: 327 names/labels; 353 проблемные имена; 412 типы; 453 DataKind; 504 UsageType |
| `js_data_input.ts` | 0 / 1 | 26 InputVariables; DateTime-часть дополнительно закомментирована на 43 |
| `js_code.ts` | 3 / 0 | 21 rename Ctrl+Q; 46 completion; 76 tooltip |
| **Всего** | **35 / 10** | **45 declarations, 7 fixtures**; `js_helpers.ts` — helper |

В Error suite 28 векторов: 6 общих Error, 1 дубликат, 3 ReferenceError,
4 TypeError, 13 SyntaxError и 1 дополнительный. Проверяются toast и error
panel, между вариантами закрывается preview. Это не проверки rollback,
исправления на том же узле или classified response AI handler.

### Конкретные примеры и ограничения assertions

- `js_general.ts:72`: AllTypesSmall → ручные int/str, цикл по RowCount,
  Append перед Set, ожидается 13 строк. Одно лишь подключение входа или
  создание одноимённого выхода не копирует данные (`51`, `60`). Комментарий
  «без данных» у проверки на строке 87 противоречит фактическому assertion.
- `js_data_output.ts:27`: dynamic flag выключен; AddColumn вызывает TypeError.
  Причину проверять на текущем build, не завязывать контракт на полный
  английский текст ошибки старого Chakra.
- `js_data_output.ts:92/120`: массив AssignColumns и отдельные AddColumn
  проверяют заголовки; это не доказательство типа столбца, заданного строкой.
- `js_data_output.ts:222`: InsertColumn(0) даёт Bool,int,str; `244` проверяет
  три API записи на значениях −3,2,5; `268` читает данные и меняет последнюю
  текущую строку на 23. Индекс записи не передаётся в Set.
- `js_interface.ts:194`: создаёт 3013 строк, preview сообщает 100 и проверяет
  первые 15. Этот total нельзя выдавать за полное число строк узла.
- `js_interface.ts:213`: бесконечный цикл и нажатие Stop; проверка наличия
  маски закомментирована, нет последующего успешного rerun. Для новой
  диагностики использовать ограниченный долгий пример и внешний deadline.
- `js_code.ts:84`: `InputTable.Colunms` — опечатка в tooltip example; код не
  исполняется. Это нельзя копировать в cookbook.
- `js_module.ts:21/50`: Calc Val/Str/Left/Right/Count дают известные примеры;
  проверка вывода ru-RU не заменяет типизированный числовой oracle.
- `js_module.ts:123`: Multi(3.2,6)=19.2, Summ=9.2; `150` создаёт Integer-поле
  с именем `float` и значениями 11,13. Имя поля не определяет тип.
- Skipped InputVariables задаёт str=`a line`, int=−17, float=64.21,
  bool=true, Variant=`123`, читает `.Items.<name>.Value`. Не считать этот
  пример прошедшим тестом или покрытием null/DateTime.

## Дополнительные проверки

| Источник | Что действительно проверяется |
| --- | --- |
| `tests/helpers/wizardPreview_tests.ts:94,107,132,141,150` | Пять активных JS helper tests: typed/null/Variant/emoji, offsets, headers, console |
| `tests/helpers/wizard.ts:479` | Переходы Code → OutputPort → InputPort |
| `tests/helpers/workflow/previewTable.ts:43` | Пустой новый JS |
| `tests/issues/11k/11k5/11612.ts:17` | 13 UsageType completion entries, количество и порядок; не runtime metadata |
| `tests/acceptance/workflow/node_label/workflowAutoLabels.ts:744` | Автоподписи static/dynamic/big-schema |
| `tests/discussions/MR_4628.ts:616` | Метка при дополнительном порте |
| `tests/acceptance/workflow/node_run_finish/run_node_unknown_percent_complet.ts:26` | Один тест и семь RunTests-сценариев с setTimeout 1–30 секунд, вкладками/подмоделями/start-stop; возможны ещё семь remote-вариантов по environment |
| `tests/issues/10k/10k5/10910.ts:42` | Ошибка внутри setTimeout; отличается от проверки rejected Promise |
| `tests/toreview/issues/11k/11k5/11986.ts:16` | Fixture skip: динамический второй вход derived JS после reload; пример InputTables[1] |
| `tests/issues/11k/11k0/11340.ts:14` | Fixture skip: блокировка Run при запуске из мастера |
| `tests/toreview/issues/11k/11k0/11116.ts:28` | Test skip: клонирование исполняемого узла |
| `tests/toreview/issues/09k/09k0/9102.ts:15` | Fixture skip: удаление ссылки на исполняемый пакет |
| `tests/toreview/issues/07k/07k5/7608.ts:28` | Другой пакет закрывается во время JS; Atomics.wait — платформенный gate |
| `tests/toreview/issues/05k/05k5/5854.ts:27`, `09k/09k0/9251.ts:57`, `08k/08k5/8911.ts:20` | Parallel clones/блокировки, derived package и downstream без настроенного порта; изолировать от baseline |

Регрессии JavaScript-режима Калькулятора 5632/8263/8290/9224 относятся
к другому компоненту. Нельзя переносить `this.Var` вместо InputVariables.
Skip не доказывает ни актуальный дефект, ни корректную работу.

## Helpers: использовать как источник, а не готовый executor

`js_helpers.ts:207/216`: подготовка Empty/AllTypesSmallTest; `237`: исторические
страницы InputPort=0, OutputPort=1, Code=2, Description=3; `264`: AddOutputFields;
`283`: SwitchColumnGen проверяет состояние перед переключением.

Существенные ограничения:

- `303` PlaceCursor недоделан: `tryPlace=false`, фактически click по центру;
- `345` Insert вставляет, а не заменяет весь документ; `362` InsertEx добавляет LF;
- `400` ClearAll использует выделение/удаление;
- `415` Check читает видимые DOM pre и проверяет contains;
- `495` preview.Open не подтверждает завершение вычисления;
- `515` CheckEmpty смотрит первую ячейку, `529` CheckColumn — перечисленные
  значения без гарантии отсутствия лишних строк; `564` error — substring.

Проверить на живом target суффиксы:
`JavaScriptColumnsWizard;BooleanPropEdit;ValueControl;DisplayEl`,
`JavaScriptColumnsWizard;btnAddMappingColumn`,
`JavaScriptCodeWizard;cmpCodeCM`, `JavaScriptCodeWizard;btnPreview`,
`JavaScriptOutputPreviewForm;btnStopLoading`,
`JavaScriptOutputPreviewForm;PreviewPanel;cntErrorInfo`.
Это наблюдения исторических тестов, не утверждённые selectors нового handler.

Более новый `bg/helpers/wizards/wizardPreview.ts` содержит JavaScript enum (`22`),
EmbeddedConsole.Show (`59`), CheckLines (`101`), CheckColumn (`453`),
CheckColumns (`496`), CheckTable (`517`), CheckHeaders (`539`), singleton JS (`634`).
Для консоли сверять его `sForms.preview.console`/Panel.Collapsed, а не слепо
копировать старые x-tool classes.

## Данные и сериализация

Реальные fixtures, не LFS pointers:

- `testdata/wizards/javascript/JavaScript.lgp`: Loginom 6.5.6, ru-RU,
  UseBasePackageFileStorage=true, пустой JavaScript и импортеры AllTypesSmall/Golf.
  LGD лежат отдельно; относительные пути требуют сохранения дерева каталогов.
- `testdata/common/lgp/AllTypesSmall.lgp`: версия 6.5.0-alpha+build.40872;
  `testdata/common/lgd/AllTypesSmall.lgd` — 1067 байт, независимого LGD decoder
  здесь не применялось.
- `testdata/common/txt/AllTypesSmall.txt`: UTF-8 CRLF **TSV**, decimal comma,
  дата DD.MM.YYYY, `?` как null marker, 13 строк. Settings импорта обязательны.
  `bg/sets/allTypesSmallSet.ts:11` описывает uni,str,bool,int,float,date,var;
  UI expectations — `tests/toreview/helpers/sets.ts:156,830`.
- `testdata/wizards/javascript/lib/export.js` — ESM, 757 байт;
  `optimization.cut.js` — vendored CommonJS/UMD subset, 4382 байта, не npm.
- `testdata/wizards/programming/ProgrammingLabels.lgp`: реальные XML атрибуты
  `CodeConfigurableColumns="true"`, `Code`, `ColumnDefs`; не `GenerateColumns`.
- `testdata/helpers/WizardPreview.lgp`: 8×7, Integer/Boolean/DateTime/Float/
  String/Variant, NULL и emoji. Значения JavaScript Date в миллисекундах ещё
  не подтверждают timezone/civil semantics текущего сервера.

GUID JS vendor: `28865f89-eea0-4143-b155-291791324a4b`; engine:
`TBGCodeModelComponentEngine`. В XML есть DataSource/Variables inputs и DataSet
output. Проверено чтение 496 LGP ZIP/XML, найдено 134 JS nodes в 45 пакетах,
ошибок чтения не было. Это поиск исходных примеров, не исполнение 134 узлов.

Дополнительные источники: `testdata/common/lgp/Vars.lgp`,
`testdata/wizards/transform/filterdata/FilterData.lgp`,
`testdata/workflow/node/NodeRun.lgp`,
`testdata/workflow/layout/result_check/JSTableCompare.lgp`.
Последний сам сравнивает таблицы средствами JS, содержит coercion и epsilon;
он пригоден как пример API, но не как независимый oracle нового JS handler.
Хеши выбранных assets закреплены в [sources.json](sources.json).

## Необязательная диагностика: среда и ограничения

Условия ниже нужны только при отдельном обоснованном решении использовать
исторический TestCafe для диагностики. Устанавливать зависимости или
восстанавливать этот suite ради выполнения JS-подплана не требуется.

E2E требует **Node16.20.2** по своему AGENTS, Git LFS, `ci/common` и npm deps
в корне/submodule; TestCafe заявлен `^3.6.0`. Локально Node16.20.2 и Google
Chrome есть, Git LFS=3.6.0, но `node_modules` и TestCafe отсутствуют. Нет
`.env`/`.env.local`; target не проверялся. Не путать с Node24 продукта.

`.testcaferc.js` задаёт ru-RU, speed=0.7, selector=20s, assertion=10s,
page-load=25s, test=900s. `gulpfile.ts:153–175` исключает `:toreview` из Main.
`bg/consts/url.ts:182` может проверять remote уже при импорте; FAppUrl способен
содержать учётные данные — не публиковать его. Testdata ожидается в `/testdata/`
или `/data/e2etests/` в зависимости от режима.

`install.sh`, createSymLinks и debug wrappers делают больше установки:
создают/удаляют пути, используют sudo/cleanup, готовят remote directories.
BeforeTest входит в Loginom, AfterTest может закрывать пакеты и удалять tmp;
OpenPackage по умолчанию запускает узлы. Поэтому сначала нужен изолированный
аккаунт/target/storage и проверка lifecycle hooks.

Если такой диагностический запуск понадобится:

1. В собственной рабочей копии e2e явно задать
   `_cu.MyRemoteAppUrl = "http://logi-test-plan.bg.local/app/"`
   в `bg/consts/user_consts.ts:46`. Проверить, что CI и ENV_TEST_LOCAL
   не переопределяют target (`bg/consts/url.ts:112–123,190`). До BeforeTest
   подтвердить effective origin/path без credentials.
2. Согласовать фактического TestCafe-пользователя и пути с выделенными ресурсами.
   `FAppUrl()` использует `users.Default` (`bg/users.ts:11–18`), а testdata и
   temp paths отдельно содержат `user` (`bg/testdata.ts:737–743`,
   `bg/consts/folders.ts:81`). Настройка runtime/CLI profile эти значения не меняет.
   До первого fixture проверить account, fixture root и temp root; локальные
   настройки и секреты не переносить в общий репозиторий или evidence.
3. Выбрать только нужные случаи и составить точную команду под них; использовать
   Node16.20.2 и single concurrency. Не запускать весь `js_*.ts` wildcard:
   активный `js_interface.ts:213–232` содержит `for(;;);` без гарантированного
   Stop после ошибки, а `bg/helpers/main.ts:443` выполняет cleanup условно.
   Исключить этот случай; Stop в основном подплане проверяется конечным
   длительным скриптом. Таймаут TestCafe не доказывает завершения на сервере.
4. Не добавлять `.only` в общий checkout. Сохранить JUnit, фактические
   selected/skip counts, build и результат cleanup. Недоступность такого
   запуска относится к дополнительной диагностике и не блокирует обязательную
   матрицу JS-подплана.

В planning e2e config не изменялся. Source-read, TestCafe PASS, прямой runtime
PASS и автономный CLI PASS — четыре разные категории доказательств.
