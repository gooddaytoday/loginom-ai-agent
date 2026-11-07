# Калькулятор: JavaScript, промежуточность, кэш и порядок

LAB-990, этап 0, 07.11.2026, mas2, Loginom **7.4.2**, Node **24.19.0**,
Chromium **1246**, sandbox включён, headless. База:
`v040@b1f3b699c5e949de91a21420502f825fe053c499`.
Только `https://app.loginom.ai/app/?testable=true`, новый профиль и собственный
пакет worker пары `01a124e5-1623-7a32-93c7-a3754c7dbdd7`.
Старая пара из первоначального описания заменена назначением владельца.

Это **частичное native-исследование**, не приёмка обработчика. Сборки CLI,
модельных прогонов, CSV/cold и runtime-правок нет. Приёмочное предложение
не утверждено. После трёх одинаковых расхождений численные повторы остановлены
по регламенту сквада; полный опыт с Field/Expr в языке Loginom ещё не выполнен.

## Выбор языка и свойства выражений

`W = MF;TF-1;WizrdMCF`, `C = W;CalcDataWizard`, `P = W;ExprDataEditForm`.
Суффикс вкладки динамический. Все перечисленные элементы наблюдались
по `data-tid`; мышь и клавиатура выполняли обычные UI-жесты. Чтение Ext store
и CodeMirror — только уже загруженное состояние собственного мастера,
без изменения внутренних объектов, вызова вычислителя или перехвата JS Loginom.

| Элемент | Наблюдение | Свидетельство, приложенное к карточке |
|---|---|---|
| `C;btnCalcMode;mn;cmExpression`, `cmJavaScript` | Меню «Выражение» / «JavaScript»; на кнопке классы `bg-TBGCalcMode-cmExpression/cmJavaScript` | `ui.jsonl:10`, `native.jsonl:1–2` |
| Тот же переключатель после выбора другой строки | Язык общий для всего узла; смена не переводит формулы. После смены JavaScript → expression и выбора Amount на кнопке остался expression, тело с return сохранилось | `native.jsonl:6` |
| `P;chbIntermediate;DisplayEl`, `P;chbCached;DisplayEl` | Флаги отдельного выражения; у Helper сохранены `Intermediate=true`, `Cached=true` | `ui.jsonl:11`, `native.jsonl:5,10` |
| `P;edtName`, `edtDisplayName`, `cbxDataType`, `btnApply` | Имя, метка, тип и Apply в том же редакторе; все выражения опыта integer (`DataType=4`) | `ui.jsonl:11–12`, `native.jsonl:7` |
| `C;cmpExpression` | Тело JS с return, без внешней функции. Двойной клик `C;colFieldName_Amount` вставляет `Amount` | `native.jsonl:3–4` |
| `C;btnExprUp` | JsTotal переставлен перед FromExpr. Native ID 5 и 4 сохранены, после завершения операции Index стал 4 и 5 | `native.jsonl:8–10` |
| Порты графа | `Input_Data-0`, `Input_Var-1`, `Output_Data-0`; выбор языка новых портов не добавляет | `ui.jsonl:8,18,22` |

`record_id` Ext store меняется при новом открытии мастера; это не native ID
выражения. Нельзя требовать сохранения Ext internalId между открытиями.
При движении строки нельзя читать результат до исчезновения loading mask:
ранний snapshot после клика ещё содержал старые Index; после Next они обновлены.

## Вход и проверенные обращения JavaScript

[modes.csv](fixtures/modes.csv) — четыре строки, integer-поля
RowID, Quantity, UnitPrice, Amount. Проверенный импорт сохранил NULL Quantity,
ноль и отрицательное число. Сценарные переменные не подключались.

Amount заменяется произведением Quantity и UnitPrice с явным сохранением NULL.
При конфликте имён JavaScript `Amount` читает **исходное поле**,
`this.Expr.Amount` — **выражение**. Это подтверждено полным выходом:

| RowID | Исходное Amount / Bare / FromField | Выходное Amount / FromExpr |
|---|---|---|
| 1 | 100 | 10 |
| 2 | 7 | 0 |
| 3 | −5 | −8 |
| 4 | 9 | NULL |

Попытка `return this.Field.Amount;` в предпросмотре дала NULL и четыре
ошибки собственного `CalcPreviewForm;CodeConsole`: `TypeError: Unable to get
property 'Amount' of undefined or null reference`. Исправление на
`return Amount;` дало исходные значения и пустую консоль.
Не переносить синтаксис Loginom `Field.Amount` в JS как `this.Field.Amount`.

Эти наблюдения **не доказывают** приоритет неуточнённого имени в языке Loginom.
Второе задание с Field./Expr. и его ожидание ниже остаются предложением.

## Расхождение preview и выхода — блокер исследования

Helper: `return Amount + 1;`, исходно промежуточный и кэшируемый.
JsTotal: `return this.Expr.Helper + this.Expr.Helper;`.
Точный математический результат независим от кэширования и порядка выражений.

| Источник | JsTotal, строки 1–4 | Вывод |
|---|---|---|
| Независимая арифметика Python | 202, 16, −8, 20 | Предложенный oracle |
| Предпросмотр после исправления this.Field | 202, 16, −8, 20; ошибок консоли нет | `js-preview-corrected.json:8`, `ui.jsonl:17` |
| Полный выход, Helper intermediate=true/cached=true | NULL, NULL, NULL, NULL | `js-output-initial.json:12`, `ui.jsonl:22` |
| Полный выход, только cached=false | NULL, NULL, NULL, NULL | `js-output-cache-off.json:12`, `ui.jsonl:27` |
| Полный выход, intermediate=false/cached=true | NULL, NULL, NULL, NULL; сам Helper = 101, 8, −4, 10 | `js-helper-output-control.json:12`, `ui.jsonl:28` |

Все три чтения выхода — новые native cached datasets, count=total=4,
новые `$id` записей. Первые два не содержат Helper, третий содержит его:
изменение промежуточности наблюдаемо меняет состав выхода.
В полном выходе `this.Expr.Amount` работает; нельзя объявлять весь this.Expr
неподдержанным. Причина конкретного расхождения JsTotal **не локализована**:
нет доказательства, что виноваты кэш, промежуточность, перестановка,
настройка mapping или движок. Правка обработчика на основании догадки запрещена.

Load1/load5 первого Execute: 2.12/2.36; чтения трёх результатов:
2.03/2.33, 3.04/2.57, 2.88/2.62. Отдельный load на старте второго/третьего
не записан. Зафиксированная нагрузка ниже 20 ядер mas2; это не основание
списывать расхождение на перегрузку. Эти опыты не являются run-check PASS/FAIL
на implementation SHA и не заменяют будущие модельные повторы.

## Persistence, источник отказа обработчика и уборка

Повторное открытие подтвердило JavaScript, все формулы, native ID/порядок,
типы, replace и оба флага Helper (`native.jsonl:10`). Перед открытием активного
узла подтверждена обычная деактивация через `msgbox;tlb;yes`; настройка
«больше не спрашивать» не менялась (`ui.jsonl:25`).

На открытом, готовом JS-мастере вызван неизменённый production
`readCalculatorBrowser` из базы:
`{"verified":false,"reason":"calculator_mode"}`
(`production-reader-refusal.json:3`). Причина в
`client/lib/calculator-context.mjs:45`: допускается только иконка expression.
Кроме того, `calculator-parameters.mjs:4` принимает только name/label/type/
formula/replace, а не запрос intermediate/cached. Текущая перестановка и
сохранение незапрошенных флагов уже реализованы; менять их целиком не нужно.

Сохранён собственный диагностический `lab990-calculator-js-20261107.lgp`.
Финальный пакет содержит **контрольный** вариант Helper intermediate=false,
cached=true; это не пакет предложенной приёмки. Save подтверждает сохранение
открытого графа, а не cold persistence. Затем штатный cleanup подтвердил
`package_closed=true`, `logged_out=true`, `unsaved_changes_discarded=false`,
native inventory 1 → 0. Браузер закрыт (`save.json`, `cleanup.json`).
В Git сырые снимки, журналы и пакет не включаются.

## Предложение реализации и бюджеты

API type/mode остаются `transform.calculator` / `expression`; опциональный
`parameters.syntax` задаёт язык всего узла. Для нового узла пропуск означает
expression, для существующего — сохранить. Это предложение, не действующая
схема. intermediate/cached — optional patch отдельных выражений; для новых
выражений false, для существующих незаданные значения сохраняются.

Ожидаемые файлы: `calculator-context.mjs` (язык и полное чтение),
`calculator-parameters.mjs` (валидация/patch), `calculator-procedure.mjs`
(переключатель и флаги), `calculator-preflight.mjs` (не включать intermediate
в прогноз выхода), `calculator-readback.mjs` и узловые hooks
`calculator-node.mjs`. Последний уже исключает intermediate из output sources.
Общие изменения только additive: `node-api.mjs` — optional поля карточки;
`node-result-schema.mjs` — optional syntax в readback; при необходимости
`workspace-ui.mjs` — точные узловые пункты меню/контролы. Чтение ошибок
preview console уже есть в workspace-ui. Новых модулей, портов, таймаутов,
парсера формул или проверки с собственным движком не предлагается.

После решения по нативному расхождению оценка обработчика — **1–2 цикла**
red→green и живых проверок. Срок устранения неустановленной native причины
в эту оценку не входит. Если выяснится необходимость неаддитивной общей
правки, остановиться с вопросом, не расширять контракт молча.

Замеры базы взяты из предыдущего отчёта LAB-990 без повторного запуска.
JSON измеряется `Buffer.byteLength(JSON.stringify(value),'utf8')`, файлы — UTF-8.

| Объект | База, Б | Текст предложения, Б | Предел, Б |
|---|---:|---:|---:|
| Сжатый dock_node_apply, model_tool_bytes | 14 539 | 14 539, без изменения оболочки | 20 000 |
| Полная внутренняя inputSchema | 63 280 | Не реализована; измерить на этапе 1 | Нет |
| Карточка типа с pins | 4 589 | 5 636 | 12 000 |
| SKILL.md | 39 954 | 39 945 | 40 000 |
| Строка маршрутизации | 143 | 134 | Около 200 |
| references/nodes/transform.calculator.md | 3 905 | 5 145 | 6 000 |

Карточка — [точный текст предложения](fixtures/model/type-card-proposed.json),
с cache_key/хеш-полями из 64 нулей; это не реальные pins и не зарегистрированная
возможность. Сокращённый apply хранит parameters как общий object, поэтому
узловые поля меняют карточку и полную схему, а не текущую compact оболочку.
Прогноз не заменяет `model-schema-budget.test.mjs` на будущем implementation SHA.

SKILL меняется заменой [одной строки](fixtures/model/skill-route.md), а не
добавлением ещё одной; к текущему reference добавляется
[этот абзац](fixtures/model/reference-addition.md). Production skill не изменён.
Приёмочное предложение и оставшееся решение — в разделе 8 [подплана](plan.md).
