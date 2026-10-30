# Скользящее окно: частичное исследование LAB-519

2026-10-30, mas3, база `v038@90b0cb816463360f024bbf33857a8861dee1ef10`.
Статус: `discovery_required`; работа остановлена по стоп-условию карточки:
предлагаемая аддитивная регистрация превышает действующий общий бюджет схемы.
Runtime-код, лимит и инструменты приёмки не изменены; CLI не собирался,
модельные прогоны и cold-check не запускались. Это checkpoint, не завершённый этап 0.

## Подтверждено в живом UI

Только `https://app.loginom.ai/app/?testable=true`, worker назначенной пары,
новый собственный черновик `Package1`. Управление через `data-tid`;
внутренний JS Loginom не вызывался и не подменялся.

| Наблюдение | DOM / значение |
|---|---|
| Версия | При штатном закрытии черновика `msgbox;p.h;p.t`: `Loginom 7.4.2` |
| Компонент есть в палитре | `MF;TF-1;ModelForm;colVendors_Компоненты>Трансформация>Скользящее_окно;TreeText` |
| Табличные порты созданного узла | `MF;TF-1;Graph;Скользящее_окно;Input_Data-0` и `Output_Data-0` |
| Первая страница без подключённого источника | `WizrdMCF;TuneDataSourceInputPortWizard`; заголовок `Настройка входных столбцов` |
| Переход Далее без источника | Открыл `WizrdMCF;SlidingWindowWizard`; заголовок `Скользящее окно` |
| Колонки настройки окна | `SlidingWindowWizard;colDisplayName`, `colHistory`, `colForecast` |
| Политика по умолчанию | `SlidingWindowWizard;pedIncompleteRecordsProcessing;ValueControl`, значение input: `Удалять все неполные записи` |
| Выбор политик | `ValueControl;boundlist;Оставлять_неполные_записи`, `Удалять_добавленные_неполные_записи`, `Удалять_все_неполные_записи` |

Префикс страниц мастера: `MF;TF-1;WizrdMCF;`.
Отказа мастера с кнопкой ошибки в проверенной части не наблюдалось.
Наличие одной страницы параметров не доказывает, что весь мастер одностраничный:
входная страница действительно открывалась, выходная и завершение не проверены.

Загружены только подготовленные здесь CSV в собственный каталог
`<personal_directory>/LAB519-discovery/`; существующие пакеты и чужие данные не открывались.

## Не подтверждено

`fulltype`, соответствие component ID нативному типу, все страницы мастера,
ограничения history/horizon, 0/0, отрицательные и пустые значения,
выполнение и train/apply, NULL внутри ряда и на краях, дополнительные записи,
порядок строк и колонок, имена/метки и типы лагов, точность,
разные окна, пустой/короткий вход, перенастройка и смена источника — `not_checked`.
Исторические утверждения подплана не повышены до живых наблюдений.

## Предложение контракта и оценка схемы

Тип `transform.sliding_window`, режим `lag` — из назначения.
`parameter-schema.proposal.json` фиксирует конкретное предложение для измерения,
не является зарегистрированным runtime-контрактом. У каждого поля есть description,
политика задаётся строковым enum. Верхние границы чисел не объявлены:
они требуют оставшейся части исследования. Предел списка 128 — предложение API,
не наблюдённый предел Loginom.

Предлагаемая semantics в `NODE_TYPES`:

> Copies selected field values from previous and following input rows into lag columns.
> Input row order defines time; the node does not sort. Choose an explicit incomplete-row
> policy. This is not smoothing or aggregation; variable bindings are unsupported.

Предлагаемый компактный readback: `incomplete_records`, список
`{field,history,horizon}` и после выполнения список
`{source_field,offset,name,label,type}`; единственный табличный выход — порт 0.
Числа, NULL и порядок должны проверяться по живому выходу до утверждения контракта.

Измерение: `Buffer.byteLength(JSON.stringify(inputSchema))` того же полного
`dock_node_apply`, который проверяет `client/test/node-caption-schema.test.mjs:29`.
В памяти добавлены только тип в `target.type.enum`, режим в `mode.enum` и две
новые записи из `.properties` предложения в `parameters.properties`.
Остальная схема неизменна; `$ref`, рефакторинг и сокращение старых описаний не применялись.

| Вариант | UTF-8 байт |
|---|---:|
| База | 45891 |
| Строгий предел теста | меньше 46000 |
| Доступное приращение | 108 |
| Приращение предложения | 1149 |
| Предложение с базой | 47040 |

Это нижняя оценка для зафиксированного предложения: она не включает новые
условия `allOf`, расширение full-read или повторную вставку type-specific schema.
Даже она не проходит ограничение. Увеличение лимита или переработка общей схемы
выходит за разрешённую аддитивную регистрацию; согласование требуется по разделу
«Разработка» регламента сквада. Другие общие изменения не оценены до конца.

Воспроизведение из корня репозитория (исходники не изменяет):

```sh
node --input-type=module - <<'JS'
import {readFileSync} from 'node:fs';
import {nodeApiTools} from './packages/loginom-runtime/client/lib/node-api.mjs';
const baseline=nodeApiTools.find(t=>t.name==='dock_node_apply').inputSchema;
const candidate=structuredClone(baseline);
candidate.properties.target.properties.type.enum.push('transform.sliding_window');
candidate.properties.mode.enum.push('lag');
Object.assign(candidate.properties.parameters.properties,JSON.parse(readFileSync(
  'docs/node-development/nodes/transform-slidingwindow/parameter-schema.proposal.json'
)).properties);
const bytes=x=>Buffer.byteLength(JSON.stringify(x));
console.log({baseline:bytes(baseline),candidate:bytes(candidate),delta:bytes(candidate)-bytes(baseline)});
JS
```

## Предварительное предложение приёмки

`fixtures/` и `acceptance/data/sales.csv` подготовлены до модельных прогонов.
Для продаж 14 месяцев: Sales = 100,110,…,230, Price = 10,10.25,…,13.25.
При истории Sales=3, горизонте Sales=1 и истории Price=1 арифметическое ожидание
для полных окон — **10 строк** (месяцы 2025-04…2026-01).
Первая: Sales[-3…+1] = 100,110,120,130,140; Price[-1] = 10.5, Price = 10.75.
Последняя: Sales[-3…+1] = 190,200,210,220,230; Price[-1] = 12.75, Price = 13.
Эти числа пока не подтверждены семантикой Loginom и не являются принятым oracle.

Предложение для владельца после окончания discovery: `ordered:true`, порт 0,
точное совпадение лагов и исходных значений, для real `tolerance:{abs:0,rel:0}`
(четверти точно представимы), NULL отдельно от 0; точный порядок и типы колонок
по наблюдению. Метки, не заданные бизнес-заданием, — `label_any:true`.
`task.md`, независимый oracle и `expected.json` ещё не готовы: их нельзя объявить
проверенными до устранения блокера и подтверждения семантики.

Оценка этапа 1 после завершённого этапа 0 и утверждения критериев — 3–4 цикла:
параметры и мастер; readback/выход и перенастройка; живой сценарий и сохранение;
резерв на наблюдённый отказ. Проверка SHA и независимая приёмка — отдельно.
Общая переработка схемы в эту оценку не входит.
