# Python: этап 0, LAB-1592

Живое исследование 13.11.2026, `https://app.loginom.ai/app/?testable=true`,
собственный worker пары `412fbafd…`, новые несохранённые черновики. Loginom
**7.4.2** (заголовок системного диалога), ОС сервера Linux. Вход, `new_draft` и
уборка — готовая сборка runtime `origin/v040@497dd093f2` на mas2 (CLI не
собирался, модель не запускалась); жесты — мышью по наблюдённым `data-tid`,
чтение — DOM/Ext без вызова внутренних обработчиков Loginom. Нагрузка mas2 на
стартах 6–15 (на конце запуска 11 — 22; один старт при 30, см. «Ограничения»). Это исследование и
предложение контракта, не PASS.

## Проба выполнения (наблюдено)

Узел Python без входа, «Разрешить формировать выходные столбцы из кода» включено,
«Предпросмотр…» — таблица Key/Value из кода:

| Ключ | Значение |
|---|---|
| `sys.version` | **3.13.5** |
| `sys.executable` | `/usr/bin/python3` |
| разрядность | 64 |
| `platform.platform()` | `Linux-6.8.0-147-generic-x86_64-with-glibc2.41` |
| cwd | `/` |
| `PY_ENV` в окружении процесса | не задан |
| `pandas.__version__` / `numpy.__version__` | **2.2.3** / **2.2.4** |
| `type(OutputTable)` | `ConfigurableOutputTableClass` (флаг вкл.), иначе `OutputTableClass` |

Отказа нет. Ошибка кода — красный traceback в окне предпросмотра и всплывающее
«Ошибка» с тем же текстом, например
`AttributeError: 'OutputTableClass' object has no attribute 'ClearColumns'`
(вызов `ClearColumns` без флага «из кода»). Файл в traceback: `__preview__.py` при
предпросмотре, `__main__.py` при выполнении узла; при выполнении у текста есть
префикс `Python:` и ссылка «Перейти», у узла — значок ⚠.

## Палитра и граф

`{P};ModelForm;colVendors_Компоненты>Программирование>Python;TreeText` (рядом
`…>JavaScript`). Drag на `{P};ModelForm;cmpDiagram` создаёт узел
`{P};Graph;Python`, второй — `{P};Graph;Python@0`; подпись «Python».
`data-fulltype` у SVG узла нет — fulltype не наблюдён.
Управление узлом (`;Vertex`, `;Setting`, `;Launch`, `;Actions`, `;Visualizers`)
появляется только у выделенного узла: клик по узлу → hover `;Vertex` → клик
`;Setting` открывает мастер `{P};WizrdMCF`.

| Порт | Назначение |
|---|---|
| `Input_Data-0` | таблица, необязательна |
| `Input_Var-1` | входные переменные, необязательны (не исследовано) |
| `Input_Add` | добавить входной порт таблицы (не исследовано) |
| `Output_Data-0` | выходная таблица 0 |
| `Output_Add` | добавить выходной порт: клик даёт `Output_Data-1` (наблюдено) |

Связь — drag `Python;Output_Data-0` → `Python@0;Input_Data-0`, tid связи
`{P};Graph;Python|Output_Data-0|Python@0|Input_Data-0`.

## Мастер (`WizrdMCF`, 4 страницы при одном выходе)

1. `TuneDataSourceInputPortWizard` «Настройка входных столбцов»: `grdTargetColumns`
   (Метка/Имя/Вид данных/Назначение), `btnAddMappingColumn` и др.; при связанном
   входе — переключатель `rgViewMode` (`rbTable` «Таблица» / `rbLinks` «Связи»),
   `btnTargetAutoLink`, `btnTargetClearLinks`. Если источник — Python со схемой
   «из кода» и не выполнен, список пуст.
2. `PythonColumnsWizard` «Настройка столбцов выходной таблицы Python» (при двух
   выходах — «…выходных таблиц Python»): `BooleanPropEdit` «Разрешить формировать
   выходные столбцы из кода» (выкл.; клик — `;ValueControl;InputEl`, состояние —
   класс `x-form-cb-checked` у `;ValueControl`), `grdTargetColumns`
   (Метка/Имя/Вид данных/Назначение), `btnAddMappingColumn`…`btnMoveMappingColumnDown`.
3. `PythonCodeWizard` «Python»: редактор CodeMirror `cmpCodeCM` (шаблон с
   `import builtin_data`, примером pandas в комментарии); `pedUseSeparateProcess`
   «Запускать в отдельном процессе» — **включено и недоступно** (Linux: только
   внешний процесс); `btnPreview` «Предпросмотр…». Ввод кода: клик в редактор,
   Ctrl+A, Backspace, вставка текста — как у JavaScript.
4. `DoneWizard` «Описание узла»: `cbxNodeTitleMode` «Автоматическая метка»,
   `edtDisplayName` «Python», Markdown-комментарий, `cbxLogRowCount`;
   `btnView`, `btnDone`, `btnExecute`.

Навигация `btnNext`/`btnPrev`, `btnClose` → `msgbox;cnt` «Вы действительно хотите
закрыть мастер настройки?» `msgbox;tlb;yes`/`no`. Точки `rgpBottom;radiofield…`
не совпадают с числом страниц (5 точек, 4 страницы) — страницы читать по заголовку
`cardWizardPanel;p.h;p.t`.

Предпросмотр: окно `WizrdMCF;PythonOutputPreviewForm` с сеткой `grdPreview`
(заголовки `normalHeaderCt;<col>`, ячейки `normalHeaderCt;<col>_<row>`, иконка типа
в заголовке) и панелью `pnlOutput` «Вывод» (раскрыть `pnlOutput;p.h;expand-top`;
вкладки «Все» / «stdout» / «stderr», текст `print` виден). Закрыть
`PythonOutputPreviewForm;p.h;close`. Предпросмотр выполняет весь код.

`btnExecute` выполнил узел и его источник (оба выхода зелёные); время выполнения
не измерено.

## Типы, NULL и порядок (наблюдено)

Источник — узел Python со схемой «из кода» (`AddColumn` Id/Amount/Text/Flag/Date/Count
целое/вещественное/строка/логическое/дата-время/целое, метки «<имя> метка»),
4 строки с `None`, `''`, `'я'`, `0.1`; приёмник читает `InputTable`:

- Порядок и имена полей входа совпадают с источником; `DisplayName` сохраняется.
  У полей, созданных кодом без DataKind/UsageType: `Undefined` / `Unspecified`.
- `Get` возвращает `int`, `float`, `str`, `bool`, `datetime.datetime` (без tz) или
  `None`; `IsNull` — True только для `None`; `''` остаётся `''`, `IsNull` False.
- `0.1 * 3` = `0.30000000000000004` — в комплект только точно представимые суммы.
- `to_data_frame(InputTable)`: Id int64, Amount float64, Text object, **Flag float64**,
  Date datetime64[ns], **Count float64** (целое/логическое с пропуском); индекс RangeIndex.
- `to_data_frame(InputTable, True)`: Flag **boolean**, Count **Int64**, прочее то же.
- `prepare_compatible_table(OutputTable, frame, with_index=False)` по default-кадру:
  Integer, Float, String, **Float** (Flag), DateTime, **Float** (Count), Float; по
  nullable-кадру: Integer, Float, String, **Boolean**, DateTime, **Integer**, Float.
  DataKind: числа и дата — Continuous, строка и логическое — Discrete.
- `fill_table` по nullable-кадру: строки с Flag=true (Id 1, 3), NaN Amount →
  пустая ячейка (NULL) в Amount и AmountScaled; дата `02/29/2024, 12:00 AM`; порядок
  полей = порядок столбцов кадра, новый столбец — в конце.

## Объявленная схема и запись pandas (наблюдено, запуск 11)

Источник — Python, кадр с nullable-типами как у `to_data_frame(InputTable, True)`
(Int64, float64 с NaN, object с None, boolean с NA, datetime64 с NaT) →
`prepare_compatible_table` + `fill_table`. Приёмник читает: типы Integer, Float,
String, Boolean, DateTime; **None, NA, NaT и NaN пришли как NULL** (`IsNull` True),
`''` — пустая строка.

Объявленные поля приёмника: `btnAddMappingColumn` на странице 2 открывает
`{P};WizrdMCF;EditColumnDefForm` «Добавить столбец»: `edtName` «Имя», `edtDisplayName`
«Метка», `cbxDataType` «Тип данных» (по умолчанию **«Строковый»**), `cbxDataKind`
«Вид данных» («Дискретный»), `cbxUsageType` «Назначение по умолчанию» («Не задано»),
`btnApply` «Добавить», `btnCancel` «Отмена». Шесть полей Id…Date добавлены в порядке
добавления (`grdTargetColumns`: Name, DisplayName, DataType=5, OriginType=1).
Клик по полю ввода `cbxDataType` список типов не открыл — все поля остались
строковыми; выбор типа (через `trg_picker`, как у JavaScript) не наблюдён.

Код `calculation.py` (флаг «из кода» выкл., `type(OutputTable)` =
`OutputTableClass`) выполнился: `Set` по имени в **строковые** поля записал
`'1'`, `'10.5'`, `'31.5'`, `'True'`, `'2024-02-29 00:00:00'` **без ошибки** —
значение молча приводится к типу поля; NULL остаётся NULL, `''` — `''`. Поэтому
обработчик обязан задавать и читать обратно тип каждого объявленного поля.

## Не проверено (`not_checked`)

Входные переменные и `Input_Add`; вкладки нескольких выходов на странице 2;
изменение схемы A/B→B/C без configure; окружения/PY_ENV/venv/контейнеры; модули
и файлы; отмена, тайм-аут запуска, параллельность; сохранение и cold-open пакета;
выбор типа в `cbxDataType` и `Set` в объявленные нестроковые поля; время выполнения; поведение при пустом входе и после первой строки (`AddColumn`).

## Предложение этапа 1

Runtime type `programming.python`, режим `external_process` (наблюдено: отдельный
процесс принудителен). Контракт — [type-proposal.json](acceptance/type-proposal.json),
справка — [programming.python.md](acceptance/programming.python.md), строка
маршрутизации — `acceptance/skill-routing.txt`. Параметры повторяют JavaScript:
`source_text`, `expected_source_sha256`, `schema_mode` (`declared`/`code`),
`columns`; compact readback без текста кода.

Комплект `acceptance/` (oracle и expected до кода; `python3 -I oracle.py --check`):

| Сценарий | Вход модели | Схема | Ожидание |
|---|---|---|---|
| `python-stdlib` | `values.csv`, `calculation.py` | declared: Id, Amount, AmountScaled, Text, Flag, Date | 4 строки по порядку; AmountScaled = Amount×3; NULL Amount → NULL; `''` ≠ NULL |
| `python-pandas` | `values.csv`, `pandas_calculation.py` | code: кадр Id, Amount, Text, Flag, Date + AmountScaled | 3 строки (Flag=true: Id 1, 3, 4) по порядку; NULL Amount, Text, Date сохраняются; типы nullable-пути выше |

Критерии (предложение, утверждает оркестратор): выход узла `output_port 0`,
`ordered: true`, `column_order: exact`, вещественные — допуск `abs 0 / rel 0`
(точно представимые значения), метки — `label_any`, типы и NULL — точно; код в узле
дословно (digest readback = SHA-256 файла); в задаче нет сети, файлов, окружений и
установки пакетов. Модели передаются только `task.md` и `data/`.

## Ограничения исследования

- Уборка черновиков: runtime-уборка `unsavedDraft` отвечает `BLOCKED UNSAVED_CHANGES`
  для изменённого черновика. С запуска 8 выход подтверждён штатно: аватар →
  `MF;AppMenuForm;btnLogOut` → «Сохранить все несохранённые пакеты?» →
  `msgbox;tlb;no` «Выйти без сохранения» → форма входа. Запуски 2–7 закрыли браузер
  без подтверждённого выхода (несохранённые черновики, файлы не создавались).
- Один старт (проход страниц мастера) — при load1 ≈ 30, выше лимита карточки 16.
