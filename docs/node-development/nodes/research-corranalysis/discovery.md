# Корреляционный анализ: этап 0, LAB-520

30.10.2026, Linux x64 / mas3; база `v038@90b0cb816463360f024bbf33857a8861dee1ef10`.
Исследован только `https://app.loginom.ai/app/?testable=true`, worker назначенной
пары `01a124e5-1a1e-7089-a51f-2705f39b0fa2`. Сборка CLI не выполнялась.
Использованы `loginBrowser`, `makeWorkspacePrepareCode` исходного runtime и
обычные действия Playwright по `data-tid`, в новом собственном черновике.

**Стоп этапа 0:** аддитивная регистрация предлагаемой схемы превышает существующий
общий лимит. По условию карточки требуется решение владельца до продолжения.
Это частичное исследование, не `ready_for_development` и не PASS узла.

## Наблюдено в DOM

Loginom **7.4.2**, подтверждено подготовкой workspace и заголовком диалога ошибки.
Компонент присутствует в «Компоненты → Исследование → Корреляционный анализ»:
`MF;TF-1;ModelForm;colVendors_Компоненты>Исследование>Корреляционный_анализ;TreeText`.
Иконка `bg-vendor-icon-corranalysis`. Component ID из назначения —
`component.research.CorrAnalysis`; **native fulltype пока not_checked**.
Совпадение подписи и иконки не доказывает fulltype.

| Поверхность | Наблюдение |
|---|---|
| Табличный вход | `MF;TF-1;Graph;Корреляционный_анализ;Input_Data-0` |
| Табличный выход | `MF;TF-1;Graph;Корреляционный_анализ;Output_Data-0` |
| Начальная страница | `MF;TF-1;WizrdMCF;TuneDataSourceInputPortWizard` — настройка входных столбцов |
| Параметры | `MF;TF-1;WizrdMCF;CorrAnalysisWizard` |
| Выбор полей | `CorrAnalysisWizard;grdColumns`, столбцы `colDisplayName`, `colChkFirstSet`, `colChkSecondSet` |
| Пирсон | `cbCorrTypeLinear`, выбран по умолчанию: родитель имеет `x-form-cb-checked` |
| Остальные флажки | `cbCorrTypeKendall`, `cbCorrTypeExtremum`, `cbCorrTypeSpearmen` — выключены |

Суффикс вкладки `TF-1` не константа обработчика. У флажков ExtJS состояние
следует читать через связанный компонент/класс: `input.checked` здесь ложно
даже для выбранного Пирсона. Строковые значения режимов публичного runtime
не равны внутренним номерам native enum.

Переход без выбранных полей сохранил страницу и показал `WizrdMCF;btnError`.
Его нажатие открыло `msgbox;cnt;cnt;MessagesView` с причиной:
**«Не указаны столбцы для обработки»**. Кнопка перехода стала «Всё равно далее».
Причина прочитана штатно; диалог закрыт, продолжение через отказ не выполнялось.

В отдельном импортном мастере того же черновика прочитан собственный
`pairs.csv`: заголовки RowID/X/Y/Z/W, 8 строк. Это только подготовка исследования;
корреляция не выполнялась. Конечные страницы корреляционного мастера, точные
имена/метки/типы выхода, NULL, константы, пустой вход, порядок пар, Execute,
train/apply, замена источника и cold reopen остаются **not_checked**.

После стопа импортный мастер отменён. Перед выходом проверен единственный
собственный несохранённый пакет и отсутствие выполняемых узлов. Штатный
«Выход → Выйти без сохранения» вернул форму входа; аватар отсутствует.
Контекст браузера закрыт. Сохранённого исследовательского пакета нет.

## Предлагаемый контракт этапа 1 (не утверждён)

Runtime `research.corr_analysis`, режим `pearson`, группа «Исследование»,
табличные вход/выход 0. Только числовые `integer`/`real`; текстовые категории,
ранги, взаимнокорреляция и дополнительные коэффициенты вне среза.

Предлагаемый `NODE_TYPES.semantics`:

> Pearson correlation between every field in first_set and every field in
> second_set. Use exact numeric input field names. Output 0 contains pair
> identities, labels and the coefficient; unlisted fields are ignored. Execute
> calculates the current input without a trained model. Other coefficients
> and text-category encoding are unsupported in this stage.

Последнее предложение о lifecycle — гипотеза до живого Execute; не переносить
в production без проверки. `fixtures/parameter-schema.json` задаёт два массива
технических имён с `description` у каждого поля и элемента. Новый узел требует
оба непустых набора; существующий сохраняет пропущенный набор. Режим — строковый
enum `pearson` в общей схеме, без numeric enum. Все иные режимы отклонять до мутации.

Предлагаемый компактный readback: `mode`, `first_set`, `second_set`,
`coefficients:["pearson"]`, source node/port, текущая схема полей, result port 0
и число пар; runtime identity использовать существующую, новых квитанций не вводить.

Предлагаются точные имена/метки/типы/NULL, точный порядок полей и `output_port:0`;
`ordered:true` только после подтверждения native порядка пар. Кандидат порядка:
поля первого набора в порядке входной схемы, внутри — второго. Допуск только
для коэффициента `real`: `tolerance:{"abs":0.000001}`, без relative tolerance.
NULL не заменять нулём; pairwise deletion и NULL при нулевой дисперсии — пока
гипотезы для адресного опыта, а не закреплённая семантика Loginom.

## Числа независимого oracle

`acceptance/oracle.py` использует точные дроби, затем Decimal sqrt с 50 знаками.
Файлы Loginom и результаты текущего запуска не являются его входами.
Ожидания вычислены до выполнения корреляции. Таблица ниже не задаёт native
порядок и имена выходных столбцов.

| Вход | Пара | Pearson |
|---|---|---:|
| pairs.csv | X/Z, Y/Z | -1 |
| pairs.csv | X/W, Y/W | 0.4774552605594227 |
| update.csv | Y/Z | 1 |
| update.csv | Y/W | -0.4774552605594227 |
| age-pressure.csv, 300 строк | age/blood_pressure | 0.8322856293730624 |

В age-pressure: средние age=43.32, blood_pressure=117.58466666666666;
после итогового округления — `300,43.32,117.584667,0.832286`.
`fixtures/pearson-reference.json` — независимые числа, **не** native expected.json.

## Размер схемы и стоп

В `node-caption-schema.test.mjs` лимит полной и компактной inputSchema —
**меньше 46 000 байт**. База: **45 891**. Добавление type `research.corr_analysis`,
mode `pearson` и двух описанных массивов даёт **46 633**, приращение **742 байта**,
превышение порога на **633 байта**. Это нижняя оценка: дополнительных `allOf`
ограничений она не включает. `NODE_TYPES.semantics`, отдельная схема каталога
и readback в эти байты не входят.

Воспроизводится из корня:

```sh
node docs/node-development/nodes/research-corranalysis/fixtures/schema-size.mjs
node docs/node-development/nodes/research-corranalysis/fixtures/schema-size.mjs --candidate-check
```

Вторая команда возвращает 1 по действующему лимиту; production схема не изменяется.
Базовый `node --test test/node-caption-schema.test.mjs` из client: 3/3 PASS.
Помимо аддитивной регистрации, своего раздела skill и run-check сценария
потребуется решение по общему ограничению размера. Вариант для утверждения:
увеличить порог теста до **47 000**; существующие параметры и описания не сокращать.
Изменение теста и общих контрактов здесь не выполнялось.

W2 уже присутствует в базе: `scripts/node-acceptance/expected-outputs.mjs`
принимает `tolerance` на колонках real, `ordered`, `column_order`, `output_port`.
Повторная реализация W2 не требуется. Другие общие изменения пока не доказаны:
обработчик и полный native output не исследованы до стопа.

## Следующий шаг после решения владельца

Закончить fulltype/мастер/результат/NULL/lifecycle и сохранить точную native схему.
Затем сформировать `acceptance/expected.json` с `ordered`, `output_port` и
`tolerance`, утвердить критерии и перевести подплан в `ready_for_development`.
Предварительная оценка этапа 1: **2–3 цикла** (контракт/мастер; выход/экспорт/cold;
исправление по живому сценарию), после 2–3 успешных native опытов этапа 0.
Модельных прогонов 0, cold-check 0; сборок CLI 0. Это не оценка PASS.
