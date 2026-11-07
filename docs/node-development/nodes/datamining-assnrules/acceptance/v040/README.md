# v0.4.0: этап 0, предложение приёмки (LAB-1021)

Docs-only, база `c317bf8999a9fb6825dad12c6c6d0dca80d2c039`, PR #833 → v040.
Решение владельца 07.11: недоступное «Отношение» исключено, исследование
продолжено без сборок CLI. Критерии этапа 1 ещё утверждает владелец.
Ни runtime, ни действующий навык не изменены; 2/3 продукта не заявлены.

Живые наблюдения — только `https://app.loginom.ai/app/?testable=true`,
Loginom 7.4.2, worker назначенной пары. При начале исследования load1=4.13;
при начале новых узлов был ≤12. Пик 22.93 пришёлся на уже идущий просмотр;
численный FAIL продукта на него не списывается. Во втором сеансе потребовалось одно восстановление связи при открытии
общего выхода Разбиения; всего два восстановления с начала карточки.
DOM: `msgbox;cnt;cnt;cmp` — «Обнаружен разрыв связи». В этот момент
load1/load5=18.41/12.10 при 20 ядрах; это не объявлено нагрузочным FAIL. Префикс TID ниже — `MF;TF-1;WizrdMCF;`, если не указан иной.
Снимки/сырые DOM — вложения карточки, не Git. Сохранён собственный пакет
`lab1021-v040-discovery.lgp`; это не cold-check и не native cleanup receipt.

| Режим | Статус / TID / граница наблюдения |
|---|---|
| Корзины | **Наблюдено**: 11 строк train.csv → 4 корзины, Transaction/Item string/discrete. `TuneDataSourceInputPortWizard;colName_Transaction/Item`, `EditTuneColumnDefForm;cbxUsageType`: Транзакция/Элемент. |
| Support/confidence/lift, два следствия | **Наблюдено**: `AssnRulesWizard;pedMinSupport/MinConfidence/MinLift/NItemsMax/NConsequentMax;ValueControl`, значения 50/60/0/3/2 приняты. После Teach — 12 правил, включая A→{B,C}; отображённые поля RuleID, Support, Confidence, Lift, Item_0_A, Item_1_A, Item_0_C, Item_1_C. |
| Lift=1.2 | **Наблюдено на том же узле**: после явного повторного обучения 6 правил, support=.75, confidence=1, lift=4/3 в округлённой таблице. Независимый Fraction-oracle даёт ровно 12 и 6. RuleID перенумеровывается после фильтра, старые IDs не сохранять. |
| Рекомендации, порт 2 | **Наблюдено**: `ViewsForm` → «Применение правил», два результата T4→B (RuleID 1), T4→C (RuleID 3), support=.75/confidence=.75/lift=1. Таблица показывает Transaction, RuleID, Support/Confidence/Lift, по два поля A/C. Видимый порядок не заменяет native schema reader. Выбор между равноценными правилами не установлен. |
| Вспомогательный вход | **Наблюдено**: связь с `Input_Data-1`, `TuneDataSourceInputPortWizard-1`; Item string, Keep boolean. Редактор обоих предлагает Не задано/Транзакция/Элемент. После роли Элемент у Item он появляется в `grdSelectedColumns;headercontainer;Selected_Item`; Keep с ролью Не задано не появляется. Автометка узла добавила второй Item. |
| Фильтры элементов | **Наблюдены контролы**: `cntSelectColumn;cnt;chb;InputEl`, `grdSelectedColumns`, `cntExcludeLargeSupportItems;cnt;chb;InputEl`, `pedMaxSupport;ValueControl` (90), `pedExcludeSingleItems`. Выбор Item и флага «Содержащие выбранные элементы» принят Next/Done. Ограничивающий численный эффект `not_checked`: текущая aux-проба содержит все A/B/C/D и не различает отбор; отдельный selected-items.csv с одним A подготовлен до этапа 1. Keep — не доказанный Boolean-предикат и не whitelist следствий. |
| Holdout без retrain / cold | `not_checked`: текущий численный срез явно обучался на train; сохранённая модель на независимом holdout здесь не применялась. Не переносить доказательство Clustering на этот тип. |
| Native types/NULL/полный порт 0 | `not_checked` для max_items=3: просмотр не различает NULL и пустую строку и не даёт полной числовой точности; расширенная схема наборов/пустой результат требуют штатного reader на этапе 1. |

`oracle.py` — полный перебор малых корзин, не FP-Growth; точные support/confidence/lift через Fraction. Для max_items=3: 9 правил с одним следствием, 12 с двумя, 6 при lift≥1.2. `task-consequents.md` использует этот пример.
`task-recommendations.md` выделен на `recommend-train.csv`/`recommend-holdout.csv`: только A→B применимо к H1, ожидается H1→B с .75/.75/1. Это **предложение, not_checked**; оно устраняет необходимость выдумывать ранжирование текущих равноценных правил.
`task-filters.md`: `selected-items.csv` содержит только A; предложены 10 правил с A, затем пустой результат после исключения элементов support>90%. Эти эффекты пока предложения, не живой PASS.

Пути этапа 1: `assn-rules-{parameters,context,procedure,node,output,readback}.mjs`. Нужны роли и чтение input 1, выбранные auxiliary-столбцы, ширины Item_1_A/C и Item_2, чтение порта 2, раздельные Teach/apply. Точные RuleID/schema/padding фиксируются до stock expected; не игнорировать их молча.

## Комплект и проверка этапа 1

В `fixtures/v040` — малые собственные CSV; в этом каталоге — задания на языке
пользователя, независимый `oracle.py`, `expected.json`, оценочные карточка
и справка. Oracle/expected/карточки модели **не передаются**; только task и
названные CSV. `expected.json` — предложение, **не stock expected**.
Новые проверяющие механизмы/runner в ветку не добавлены.

```sh
python3 oracle.py > expected.json
python3 oracle.py --check
```

Стандарт этапа 1: тот же existing узел без пересоздания, полные значения/типы/
NULL и все порты, заданный seed и два исполнения, CSV, Save, cold без повторной
настройки, cleanup; 2/3 на одном SHA и независимая проверка. Только real имеют
заранее заданный допуск. Непроверенный native порядок/padding/ID не пропускать.
`live-ui` required-checks здесь **NOT_RUN — «этап 0, без сборки»**,
по решению владельца не блокер. Модельные run-check и сборки не запускались.

## Оценка объёма и модельных бюджетов

**4–5 циклов: длины/lift; auxiliary/filter; рекомендации; saved apply/cold** на этапе 1; фактически 0 циклов runtime.

Общие изменения ожидаются только аддитивные: объявления режимов/параметров
в node-api/node-contracts, readback в node-result-schema и маршрутизация
наблюдения workspace-ui при необходимости. Необходимость менять общий
executor, packages/agent, deadline или общий бюджет не установлена. Любая
такая необходимость — отдельный стоп по регламенту.

Карточка — компактный UTF-8 JSON; pins взяты из штатного catalog, hashes и
cache_key заменены 64 нулями. Это оценка будущего полного контракта, не
объявление реализованной поддержки. Справка — черновик замены reference;
SKILL.md содержит только оглавление.

| Объект | Сейчас, Б | Предложение, Б | Лимит, Б |
|---|---:|---:|---:|
| Карточка datamining.assn_rules | 4172 | 4335 | 12000 |
| Reference навыка | 3327 | 1618 | 6000 |
| Строка оглавления | — | 116 | ~200 |
| Полный SKILL.md | 28178 | 27920 | 40000 |

Штатный model-schema-budget на неизменённом runtime: 51 PASS,
`model_tool_bytes=14539`, `full_input_schema_bytes=64170` (не отправляется
модели, лимита нет). Добавление только g_means/uniform в enum оценивается
в 14559 Б сжатого apply; типовые параметры там заменены открытым object.
Это прогноз, замер будущего runtime повторяется в этапе 1.

Предлагаемая строка оглавления (без перевода строки):

```text
|Правила|`datamining.assn_rules` / fp_growth,apply|[читать](references/nodes/datamining.assn_rules.md)|
```
