# Дополнительные агрегаты и типы — LAB-1051

07.11.2026, mas3, Loginom 7.4.2, pinned Chromium 1246.
База `origin/v040@96d09addfcca8619adcc9f55baf04d6cb7643c43` — текущая голова
вместо ожидания #843. На старте #843 и #803 открыты; прежние критерии
Калькулятора и Замены переменных не изменяются. Runtime не менялся, CLI не
собирался. Это ручное исследование UI, не PASS модели или нового обработчика.

## Выбор функций и порты — наблюдено

Только `https://app.loginom.ai/app/?testable=true`, worker назначенной пары.
Создан собственный черновик. Вспомогательный JavaScript-источник объявляет
N/K Integer, S String, B Boolean, D DateTime и V Variant; все пять строк
заданы заранее в [JSON](fixtures/aggregate-types.json). Этот источник
создаёт только вход, агрегирование выполняет настоящий исследуемый узел.

Палитра: `MF;TF-1;ModelForm;colVendors_Компоненты>Переменные>Таблица_в_переменные;TreeText`.
Проверена связь `JavaScript;Output_Data-0` → `Таблица_в_переменные;Input_Data-0`.
При готовом входе сразу открыт `MF;TF-1;WizrdMCF;DataToVariablesWizard`.
Перенос: `colDisplayName_<имя>` → `frmMoveButtons;btnMove0`.
В `colUsedFields_<имя>` две TD с одним tid; открывать double-click
содержательной строки. Диалог — `MF;TF-1;WizrdMCF;FactorEditDialog`.
Состояние checkbox отражает класс `x-form-cb-checked`, недоступность —
`x-item-disabled`; DOM InputEl имеет type=button, его checked не является oracle.

| Индексы `grpFactors;chb[-N]` | Функции в native-порядке |
|---|---|
| 0–4 | sum, count, min, max, avg — прежний срез |
| 5–9 | median, mode, standard_deviation, unique_count, null_count |
| 10–13 | first, last, only, concat («Список») |

| Тип | Доступность в диалоге |
|---|---|
| Integer | Все 14 |
| String | Все, кроме sum/avg/median/standard_deviation |
| Boolean, DateTime, Variant | Как String, но concat отключён |
| Real | В данном сеансе не исследован; поддержка пяти прежних функций не расширяет это наблюдение |

Список выбирается тем же checkbox 13. Появляются доступные
`cntCheckboxes;fs;cbxConcatSeparator`, `cbxConcatWrapper`,
`fc;chkConcatUniqueOnly`, `fc;cbxConcatSort`.
Native defaults: «Запятая (,)», «Без ограничителя строк», unique включён,
«Без сортировки». После `btnApply` сохраняются выбранные функции; после
`WizrdMCF;btnNext` — `DoneWizard`, затем `btnExecute`.
Название узла стало «Табл. в перем.: N, K, S, B, D, V».

Входы/выходы от новых функций не добавляются: один table input 0 и один
`Output_Var-0`. **Выходной таблицы нет.** Double-click исходного variable
порта открывает `MF;TF-1;ModelForm;PreviewWindow;PreviewForm;VariablesForm`.
Прочитан полный `grdValuePreview` store: только Index, Name, DisplayName,
DataType, ValueVariant; Value/$self и RPC не читаются. Форматированный DOM
округляет SD и скрывает миллисекунды, поэтому его текста недостаточно.

## Значения — наблюдено

В порядке выбранных N,K,S,B,D,V получены 47 переменных.
Полный независимый ожидаемый набор —
[expected](acceptance/aggregate-types/expected.json), `discovery_combined`.

| Поле / функции | Результат / тип |
|---|---|
| N median, mode, SD | 4 real; 4 integer; 2.516611478423583 real — sqrt(19/3), выборочное |
| N unique, null, first, last, only, concat | 3; 1; 2; 8; NULL (integer); `2,4,8` string |
| K only (единственная функция) | Имя **K**, метка K\|Единственный, integer 7, хотя строк пять |
| S count, min, max, mode | 5 integer; пустая строка; b; a (string) |
| S unique, null, first, last, only, concat | 3; 1; b; пустая строка; NULL string; `b,a,` string |
| B count, min, max, mode | 5; false; true; false; native Boolean 1 сохранён |
| B unique, null, first, last, only | 2; 1; false; false; NULL boolean |
| D count, min, max, mode | 5; 2026-01-01T00:00:00.456; 2026-01-03T00:00:00.000; 2026-01-01T00:00:00.456 |
| D unique, null, first, last, only | 3; 1; 2026-01-02T03:04:05.123; 2026-01-03T00:00:00.000; NULL datetime |
| V count, min, max, mode | 5 integer; false; x; 2 — последние три имеют **native DataType 6** |
| V unique, null, first, last, only | 3 integer; 1 integer; 2 Variant; 2 Variant; NULL Variant |

Native коды: 1 boolean, 2 datetime, 3 real, 4 integer, 5 string, 6 Variant.
Для нескольких функций наблюдены suffixes Median,Mode,Std,Uniq,Null,First,
Last,Only,Concat; прежние Count,Min,Max сохраняются. Метки `<поле>|<название функции>`.
Integer median возвращает real, mode/first/last/only — integer. Уникальные
считаются без NULL; пустая строка S считается отдельным значением.
Дата указана как civil time с миллисекундами; сериализация JS Date с Z
в диагностике не меняет предметный контракт на timezone-aware.

Ничья Boolean-моды дала false (false/true по два раза). Это одно наблюдение,
не доказательство общего tie-break. Для V различаются boolean/number/string;
числовой **native subtype не установлен**: ValueVariant=2 этого не доказывает.
Не выдавать наблюдённые скаляры за уже принятое точное чтение Variant.

## Причина остановки и оценка реализации

`client/lib/node-output-context.mjs:14` принимает DataType только 1–5.
`client/lib/node-result-schema.mjs:45` также не допускает variable type Variant.
`client/lib/node-port-output.mjs:208` выдаёт для Variant
`precision:unverified` / `variant_display_precision`, а variable reader требует
нулевого числа limitations. Поэтому расширения enum функций недостаточно:
нужны решение по общему W1 precision/subtype контракту, decoder и cold matcher.
Это общая поведенческая правка сверх аддитивной регистрации — стоп назначения;
состояние LAB-1051 blocked. Существующий table Variant reader не доказывает
эквивалентность переменного порта и не предлагается как новый обход.

После решения владельца локальная часть: `variables-datatovar-parameters.mjs`
(маски/матрица функций/типы), `-procedure.mjs` (допустимые наборы и сохранение
default concat settings), `-readback.mjs` (типы/полный набор/список), `-preflight.mjs`
(общая проверка возможностей нового набора), тесты этих production-путей.
`-context.mjs` уже читает 14 бит, шесть типов и Separator/Wrapper/UniqueOnly/
Sort/SortDirection; ему нужна адресная проверка, необходимость правки пока
не установлена. `-node.mjs` — revision только при изменении контракта writer.
Добавятся карточка типа, reference и адресные cases/audit оснастки.
Без Variant ориентир **2 цикла**: numeric functions → scalar types/default
concat, с живым бизнес-прогоном между ними. Variant — ещё **1–2 цикла после
отдельного общего решения**, оценка до исследования exact subtype условная.
В данном docs-PR циклов правки handler: **0**.

## Предложение приёмки и границы

[Комплект](acceptance/aggregate-types/README.md): задачи aggregates / scalar-types /
variant, авторские JSON/CSV, штатный source-only `.lgp`, независимый Python
oracle и expected. Все значения, имена/метки/типы/порядок, real 1e-12;
Save/cold Execute/Close/logout, ≥2/3 + независимые ≥2/3 на том же SHA.
Variant-критерий точности/subtype ещё не утверждён и не заменён сравнением строк.

not_checked: model run-check, cold, source replacement; Real и несколько
числовых полей с новыми функциями; нечётное число значений медианы; all-NULL,
empty, один non-NULL для SD; NULL на границах first/last; общие правила
смешанного Variant и ничьих моды; custom separator/wrapper/unique/sort списка.
Новых callable-режимов не требуется: функции остаются в `aggregate`.

Приватные доказательства доставляются вложением к итоговому комментарию:
`discovery.jsonl:8–18` — мастер/матрица/полный native output,
`:19` — Save; `:22` — source-only Save/download; `:23` — logout.
Сырой журнал в git не включён. Первый вход выполнен без вытеснения аккаунта;
разрывов связи/восстановлений — 0. Один reload сохранённой страницы и повторный
вход при подготовке загрузки fixture, затем logout и закрытие Chromium.
Стартовое наблюдение load1/load5=3.37/2.24 (12 ядер); ручное discovery не
является запуском фазы run-check и не выдаётся за его load gate.
