# Сглаживание: подплан

Статус: `ready_for_development`. Редакция 2, 2026-10-31, этап 0 — LAB-642.
Component ID: `component.preprocessing.Smoothing`, slug `preprocessing-smoothing`.
Runtime-предложение: `preprocessing.smoothing` / `hodrick_prescott`.
База: `v039@3377e6b164bcf509a050fb1536bae8dbf8bece39`, Linux x64 mas3.
Реализации и приёмки обработчика пока нет. Критерии ниже утверждает владелец
до отдельного назначения этапа 1.

[Исследование](discovery.md) · [приёмочное предложение](acceptance/README.md) ·
[карточка узла](README.md) · [реестр](../../registry.json).

## 0. Границы назначения

Действует регламент сквада из карточки. Только собственная назначенная пара,
https://app.loginom.ai/app/?testable=true, элементы по data-tid.
Модель этапа 1: openai/gpt-6.1-sol, medium, 1800 с. Живые прогоны — run-check,
start+wait в одном foreground-вызове. Oracle и expected модели не передавать.
Merge, релиз и закрытие карточки — вне назначения.

Разрешены аддитивная регистрация типа, собственный обработчик/раздел навыка
и сценарий существующего run-check. Если понадобится изменение packages/agent,
публичного контракта, общих бюджетов/deadline или общего кода сверх разрешённого —
blocked с одним вопросом. Отсутствие компонента, дополнительный режим/критерий
сверх утверждённого среза — также stop. Лимит полной dock_node_apply inputSchema
46000 Б, приращение типа ≤1050 Б. Сжатие под весь состав выпуска — отдельно;
на этапе 0 runtime не регистрируется и CLI не собирается.

## 1. Проверенная основа

На стенде Loginom 7.4.2, палитра Предобработка → Сглаживание.
Мастер SmoothingWizard, один табличный вход и выход, Execute без обучения.
Нативный Engine — TBGCustomModelComponentEngine, параметры полей —
TBGSmoothingDefExtension. VendorGuid=73aad18e-9b22-4667-9feb-94ee1cae948e.
Fulltype подтверждён сериализацией собственного пакета с привязкой к GUID узла.
Полная матрица наблюдений и её ограничения — в discovery.md.

Новый естественный выход: RowID,X,X_S,R,R_S,Tag. При старом сопоставлении
новые поля могут добавиться в конец, при cold reopen autosync=true снова
пересоздаёт порядок. Для заданного стабильного порядка — имеющиеся
mappings.fields и autosync=false, без нового общего механизма.
Тип сглаженных полей — real; исходные типы и NULL сохраняются.
Нелинейный ряд, замена источника, внутренние и краевые NULL сопоставлены
с независимыми рациональными нормальными уравнениями HP.

## 2. Этапы

### Этап 0 — исследование и комплект

[discovery.md](discovery.md), fixtures/manifest.json, acceptance/task.md,
независимый acceptance/oracle.py и expected*.json. Статус плана означает
готовность предложенного среза к разработке после утверждения критериев;
не означает поддержку runtime или PASS приёмки. Модельных прогонов нет.

### Этап 1 — Ходрик–Прескотт

- `preprocessing-smoothing:r01`: выбрать continuous integer/real поля;
  для каждого lambda ИЛИ связанный period; сохранить исходные и добавить real-копии.
- `preprocessing-smoothing:r02`: NULL, порядок строк/полей, точность, повторное
  выполнение того же узла после изменения источника, Save и cold reopen.

Новый узел требует полный список правил; существующий сохраняет пропущенные
настройки. Readback: node/source identity, mode, field, lambda, period,
выбранный редактор, output_port=0, фактические имена/типы результата.
Descriptions каждого поля — parameter-schema.proposal.json;
NODE_TYPES.semantics — discovery.md. Только строковый mode hodrick_prescott.
Не передавать внутренние числовые коды алгоритмов.

Границы UI: Lambda 0.0625…102659800000000, period 2…20000;
по умолчанию Lambda=1600, period=39.7. Неподдержанные типы, wavelets,
неоднозначные lambda+period и внешние привязки отклонять до мутации.
Не вводить train/apply: это обычное преобразование текущего входа.

Образцы: transform.sliding_window для упорядоченного результата,
missing-values для редакторов полей. Собственный драйвер SmoothingWizard;
регистрация и schemas/readback — аддитивно в уже имеющихся точках.
Выходное сопоставление использует существующий контракт mappings.
Необходимости общей правки на этапе 0 не установлено.

### Этап 2 — вейвлеты, отдельное назначение

- `preprocessing-smoothing:r03`: Добеши order 1…10, Койфлеты 1…5,
  CDF 9/7 без порядка, depth 1…10.
- `preprocessing-smoothing:r04`: семь способов продолжения границ,
  линейная интерполяция NULL до преобразования.

UI-инвентарь этого семейства есть в discovery, численная приёмка отсутствует.
Перед реализацией нужны отдельные fixtures, независимый oracle с точной
конвенцией границ и утверждённые критерии. В текущий HP-сценарий не включать.

## 3. Oracle и приёмка для утверждения

Python >=3.9 stdlib fractions.Fraction: точное решение
(W + lambda D2ᵀD2)t = Wx, W=1 для известных значений, 0 для NULL.
Это самостоятельная математика; Loginom/runtime/actual не используются.
Для N≥2 при <2 известных значениях функционал не задаёт единственный тренд;
all-null не выдаётся за численный PASS, отдельно фиксируется native-поведение.

Основной пользовательский сценарий: series.csv → HP для X/R с Lambda=1 →
update.csv в том же импорте → тот же узел → полный CSV и Save.
Финальный выход: 8 строк/6 полей RowID,X,R,Tag,X_S,R_S, output_port=0,
ordered=true, column_order=exact, autosync=false для заданного порядка.
Исходные значения/типы/NULL точны; вычисленные real: abs=1e-8, rel=1e-10.
Незаданные метки — label_any=true. Ожидаемые числа — acceptance/expected.json.
Адресные случаи и воспроизведение — acceptance/README.md и oracle.py --case.

Старые W2/W3 не нужны: база уже поддерживает tolerance, ordered и output_port.
Новые механизмы проверки и receipts не добавлять. Собственные сырые журналы,
пакеты и доказательства происхождения в Git не включать.

## 4. Проверки и точка продолжения

Этап 1: red→green на production-ветке, затем required-checks.py list --base
и verify по отчёту. Client — полный набор с pinned Chromium 1246 под nice -n 19;
при изменении оснастки — весь scripts/node-acceptance/tests/*.test.mjs;
при runtime/src — полный bun test в loginom-host по регламенту.
Модельная приёмка: cold PASS, ≥2/3 PASS исполнителя на одном SHA и отдельно
≥2/3 на том же SHA в независимой проверке, корректные Save и cleanup.

Следующий шаг: владелец утверждает HP-scope, oracle, допуски, порядок и порт;
затем отдельная карточка реализации. Оценка — 1–2 цикла разработки + 1 приёмки.
Schema-size и ограничения живой матрицы зафиксированы в discovery.md.

Источник документации: [Loginom Help: Сглаживание](https://help.loginom.ru/userguide/processors/preprocessing/smoothing.html).
Живые наблюдения имеют приоритет над историческим подпланом.

## 5. Реализованный срез v0.4.0

Режимы, ограничения и производственные источники на базе `94551fa4933ba0e23ab442ff47febaa6142d1c01` перечислены в [карточке](README.md) и [реестре](../../registry.json). Более широкий объём выше остаётся планом расширений.

## 6. Точка перепроверки

Прежние задания, oracle и критерии выше сохраняются для своих ревизий. Новая приёмка выполняется по назначению на точном SHA; статическая синхронизация документации не утверждает новые критерии и не переносит прежний PASS. Текущая регистрация и ограничения — в [карточке](README.md).

## 7. LAB-1046: вейвлеты, checkpoint этапа 0

07.11.2026, mas2, Loginom 7.4.2, Node 24.19.0, установленный Chromium 1243;
только `https://app.loginom.ai/app/?testable=true`, worker назначенной пары
`01a124e5-1623-7a32-93c7-a3754c7dbdd7`. Текущая v040 по регламенту:
`9ec18ee987bc16d953f985a173d85e8b08a93020` (назначенная точка afaa1f3).
Runtime/skill не менялись, CLI не собирался, run-check/CSV/cold нет.
**Этап 0 не завершён:** после второго восстановления разорванного сеанса
живое исследование остановлено по условию карточки; это checkpoint для нового назначения.
Пакет закрыт штатно, выход из Loginom и завершение браузера подтверждены.

### Подтверждённый UI

`WizrdMCF;SmoothingWizard;colAlgorithm_X` → boundlist → «Вейвлет-сглаживание».
Три radio в `pedWaveletType;ValueControl`: Добеши, Койфлеты, CDF 9/7.
`edtWaveletOrder;ValueControl` и `edtDecompositionLevel;ValueControl` имеют
UI min=1/max=10. Прочитаны radio-значения всех трёх семейств.
Предел Койфлетов 1…5 и запрет порядка у CDF в предложении — граница допуска,
а не подтверждённая динамическая валидация UI: coiflet=6 пропустил Next до mapping,
вычисление не запускалось, изменённый draft закрыт без сохранения.

`edtEdgeExtension;ValueControl;boundlist` содержит семь пунктов:
симметричное, антисимметричное, нулями, константное, периодическое,
симметричное без крайней точки, антисимметричное без крайней точки.
Отдельный переключатель NULL-интерполяции в осмотренном мастере не обнаружен.
Метод задаётся для каждого numeric/continuous поля, число портов не меняется (1/1).
Выход добавляет real X_S; в естественном порядке — сразу после X.

На смешанном modes.csv db1/depth1/symmetric выполнен без Train:
первые шесть X_S — 1,1,4,4,9,9 (double отклонение ≤1e-15).
При X=NULL в седьмой строке локальный preview-cache содержит NaN для двух последних
X_S. Не установлено, является ли это native nonfinite или представлением NULL
кэшем: точный reader, экспорт и cold для этих ячеек не выполнялись.
Вывод «линейная интерполяция работает» из этого опыта делать нельзя.

### Комплект и оценка

[Матрица/ограничения](acceptance/modes/README.md), [oracle](acceptance/modes/oracle.py),
[схема](acceptance/modes/parameter-schema.proposal.json),
[карточка](acceptance/modes/node-card.proposal.json).
Независимый Fraction/Haar oracle даёт точные средние пар/четвёрок; NULL-case
предлагает сначала восстановить 12 между 10 и 14 и остаётся в карантине.
CDF zero-case — только линейный smoke, не проверка фильтра или boundary-конвенций.
Для db2…10/coif1…5/CDF и всех продолжений нужен недегенеративный filter oracle;
эти численные критерии ещё не подготовлены. Ни один JSON не засчитывается в 2/3 PASS.

Оценка — **2 цикла** после завершения исследования/утверждения: семейства/порядок/
depth/границы и точный readback; численные случаи, NULL и persistence.
Существующие собственные модули packages/loginom-runtime/client/lib:
`smoothing-{parameters,context,procedure,node,output,readback}.mjs`.
Context уже видит Algorithm=1, но отвергает его как smoothing_wavelet_unsupported;
procedure требует algorithm=0 у всех полей, readback жёстко пишет hodrick_prescott.
Нужна аддитивная регистрация mode=wavelet/схемы и собственных control-действий.
Необходимость иной общей правки пока не доказана. Native NULL нельзя обходить
подменой источника или вычислением в Калькуляторе/JavaScript без отдельного решения.

### Общий модельный бюджет трёх предложений

`node --test test/model-schema-budget.test.mjs` в client: 51/51 PASS;
диагностика model_tool_bytes=14539, full_input_schema_bytes=64290.
До установки client-зависимостей команда завершилась ERR_MODULE_NOT_FOUND acorn;
после штатного npm ci --ignore-scripts --omit=dev проверка зелёная.
Измерение proposals — `node docs/node-development/nodes/preprocessing-binning/fixtures/measure-modes.mjs --write`.
Он использует реальные bundled pins/skill и userActionInventory, hash-поля заменяет
64 нулями. Считается компактный JSON UTF-8, не размер отформатированного файла.

| Объект | До | Предложение | Лимит |
|---|---:|---:|---:|
| Модельный tool apply (name+description+inputSchema) | 14539 | 14549 | 20000 |
| Полная inputSchema apply | 64290 | 70397 (+6107) | Без лимита, только замер |
| Основной SKILL.md | 28178 | 28137 | 40000 |
| Строка binning / coarse / smoothing | — | 130 / 151 / 142 | ~200 каждая |
| Файл справки binning / coarse / smoothing | — | 3096 / 3012 / 2376 | 6000 каждый |
| Карточка binning | 3335 | 5608 | 12000 |
| Карточка coarse_classes | 4399 | 5370 | 12000 |
| Карточка smoothing | 3267 | 5438 | 12000 |

Ни один бюджет не является основанием расширять общую схему в этом docs-PR.
SKILL.md остаётся оглавлением #798; PR #803 при подготовке checkpoint ещё OPEN,
поэтому будущие правила находятся в отдельных fixtures/reference.proposal.md.

Все десять expected проходят штатный parseExpectedOutputs; oracle --check для
трёх комплектов воспроизводит JSON. Это проверка документов, не native-приёмка.
После фиксации diff обязательны required-checks.py list --base <база> и verify.


## 8. LAB-1055 checkpoint

07.11.2026, mas3: **blocked после второго разрыва связи**, по лимиту назначения.
Живое исследование остановлено. Оба восстановления выполнены штатно;
второе использовано только для Save/закрытия собственного пакета/logout.
Назначенная база `v040@3ff0d88e486057228eea87935cf5aed11e9f46be` включена
в ветку от открытого #851 (`coverage-binning-modes@266c9a0ab`).
Только docs/fixtures/oracle; runtime/публичный SKILL.md не менялись, CLI не собирался.
Ранее утверждённые назначением случаи повторно не принимались.
[Актуальные задания и статусы](acceptance/modes/README.md), TID и ограничения —
последний раздел [discovery](discovery.md). Предложения не зарегистрированы
в run-check, критерии требуют утверждения владельцем до этапа 1.

Шесть ненулевых опытов: db2 symmetric depth1/2, db2 zero depth1, coif1 symmetric,
CDF9/7 symmetric и reflect depth1. Все исходные значения/типы/порядок и X_S
сопоставлены с независимым filter oracle, max abs ≤2.41e-12 при прежнем
abs=1e-8/rel=1e-10. Для CDF явно зафиксирована фаза нечётных исходных отсчётов,
lifting дополнительно проверен filter-bank расчётом; другие длины не доказаны.
Haar/NULL: две NaN-ячейки preview-cache, конечная интерполяция не наблюдается.
Точный native NULL/nonfinite, CSV/cold, высокие порядки/depth и остальные
продолжения — not_checked по лимиту переподключений. Старый NULL expected
остаётся в карантине; нулевой CDF smoke не заменяет фильтровый критерий.

Оценка — **2 цикла** после утверждения: свои wavelet controls/зависимости и
readback; шесть численных задач, persistence и стандартная приёмка CSV/cold.
Собственные `client/lib/smoothing-{parameters,context,procedure,node,output,
readback}.mjs` в packages/loginom-runtime, адресные тесты. Общая работа —
аддитивные mode/schema/readback, inventory собственного мастера, справка/сценарии;
иной общей необходимости не установлено. NULL нельзя подменять интерполяцией
в источнике/Калькуляторе/JS ради прохождения старого expected.


### Актуальный бюджет LAB-1055

Измерено на включённой базе 3ff0d88; эта таблица заменяет исторические размеры
LAB-1046 выше. UTF-8, компактный JSON настоящего userActionInventory, реальные
bundled pins; hash-поля предложенных карт — 64 нуля.
`node docs/node-development/nodes/preprocessing-binning/fixtures/measure-modes.mjs --write`.
`node --test test/model-schema-budget.test.mjs` из client: **51/51 PASS**.

| Объект | База | С предложениями | Лимит |
|---|---:|---:|---:|
| Модельный apply (name+description+inputSchema) | 14539 | 14549 | 20000 |
| Полная inputSchema apply | 64290 | 70397 | Только измерение |
| Основной SKILL.md | 28670 | 28629 | 40000 |
| Строка binning / coarse / smoothing | — | 130 / 151 / 142 | ~200 каждая |
| Справка binning / coarse / smoothing | — | 3096 / 3601 / 2376 | 6000 каждая |
| Карточка binning | 3335 | 5608 | 12000 |
| Карточка coarse_classes | 4399 | 5668 | 12000 |
| Карточка smoothing | 3267 | 5438 | 12000 |

SKILL.md предложен только как оглавление; правила в отдельных reference.proposal.md.
#803 ещё OPEN на проверенной точке: mode-comment-разметка не требуется.
Размеры не разрешают внедрение схем в этом docs-PR. Новый verifier не предлагается.
