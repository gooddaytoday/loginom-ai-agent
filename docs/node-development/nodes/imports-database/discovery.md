# Импорт из базы данных (SQLite): этап 0, LAB-1544

Живое исследование 13.11.2026, `https://app.loginom.ai/app/?testable=true`,
собственный worker пары `9627ef23…`, новый несохранённый черновик. About в
технических подробностях ошибки: **Loginom 7.4.2, Enterprise, ОС сервера Linux**.
Runtime и браузер — готовая сборка базы `origin/v040@cb0733a0b7` на mas2
(CLI не собирался); все жесты — по наблюдённым `data-tid`, без вызовов внутренних
обработчиков Loginom. Нагрузка mas2 на старте: load1 ≈ 31 (чужие сборки),
исследование без модели. Это исследование и предложение контракта, не PASS.

Уборка подтверждена: оба подключения удалены штатно, загруженный `.db` удалён
из папки (555 файлов против 556), выход «Выйти без сохранения», форма входа на месте.

## Палитра и граф

`MF;TF-1;ModelForm;colVendors_Компоненты>Импорт>База_данных;TreeText` — есть.
Drag на `ModelForm;cmpDiagram` создал узел `MF;TF-1;Graph;База_данных`
(после настройки подпись и tid стали `…;Graph;People` — по имени таблицы).
`data-fulltype` у SVG узла нет (null), fulltype не подтверждён.

| Порт графа | Назначение |
|---|---|
| `Input_Connection-0` | подключение (обязательно) |
| `Input_Var-1` | управляющие переменные (не исследовано) |
| `Output_Data-0` | таблица — логический выход 0 |
| `Output_Var-1` | переменные статуса (по умолчанию пусто, этап 2) |

Подключение ставится на граф перетаскиванием из панели
`ModelForm;pnlConnections;headercontainer;text_Root>Текущий_модуль>/<папка>/<файл>.db;TreeText`
(узел-ссылка `Graph;↶/<путь>` с портом `Output_Connection-0`), связь — drag
`Output_Connection-0` → `Input_Connection-0`.

## Подключение SQLite

Модуль → «Подключения» (`ListViewForm…title_1`, двойной клик) →
`ConnectionsViewWizard;pnlConnectionsTree;headercontainer;text_Источники_данных>Базы_данных>SQLite;TreeText`
(двойной клик добавляет плитку «Метка:SQLite») → выбрать плитку →
`tbrActions;btnConfigConnection` → мастер `WizardModelConnectionForm;SQLiteUniDACDBConnectionWizard`.

| Поле (`ped…`) | Подпись | По умолчанию |
|---|---|---|
| `pedDatabasePath` | Имя файла (trg_picker открывает `OpenDialogForm` хранилища) | пусто |
| `pedInMemoryDB` | База данных в памяти | выкл |
| `pedLogin`, `pedPassword`, `pedLoginPrompt` | Логин, Пароль, Спрашивать пароль | пусто/выкл |
| `pedUseEncryption`, `pedCreateDBIfNotExists` | Зашифрованная БД; Создавать БД, если не существует | выкл |
| `pedPragmaCacheSize`, `pedPragmaSynchronous`, `pedPragmaJournalMode`, `pedPragmaTempStore` | PRAGMA | 0 / «По умолчанию» |
| `pedNoCaseAsUnicode`, `pedLowUpUnicode`, `pedLikeMode` | Unicode/LIKE | выкл / «Без учёта регистра» |
| `pedSystemTables`, `pedQuotedObjectNames`, `pedWithoutClient`, `pedClearPoolOnDeactivate`, `pedSingleConnectionMode`, `pedBusyTimeout` | прочее | выкл / 0 |

Файл загружен штатным `FileStorageForm;tbrActions input[type=file]` в собственную
папку. Диалог выбора фильтрует «Базы данных SQLite (*.db; *.sdb; *.sqlite; *.db3;
*.s3db; *.sqlite3; *.sl3)» и показывает тип «База данных SQLite». После выбора
`pedDatabasePath` = `/freak-dev4-worker-268734a9/lab1544-people.db`.
`btnTestConnection` → `msgbox;cnt` «Тестирование соединения прошло успешно».
`btnDone` сохранил плитку; автоматическая метка = путь файла
(«Метка:/…/lab1544-people.db», «Адрес:/…/lab1544-people.db»).
Удаление: `btnDeleteConnection` → «Действительно удалить подключение …?»
`msgbox;tlb;yes` «Удалить».

## Мастер узла (`WizrdMCF`, 5 страниц)

1. `DBImportWizard` «Импорт из базы данных»: `edtConnection` (путь, только
   чтение), `btnConnect` «Активировать» → «Активировано»; `rgImportMode`:
   `rbTable` «Выбор таблицы» (по умолчанию) / `rbSQL` «SQL запрос»;
   `pedSilentActivation` «Игнорировать ошибки» (выкл); `pedTimeout` «Тайм-аут
   импорта (с)» (∞); `pedTableName` «Таблица/Представление» (комбобокс +
   переменная). Дерево `pnlDBObjects…text_0>Таблицы>People`,
   `…text_0>Представления>PeopleView`; двойной клик выбирает объект.
   Поля — `grdTableFields` с флажками (все отмечены), `btnExtractAll`
   «Извлекать всё», `btnPreview` «Предпросмотр».
2. `DBImportFilterWizard` — условия (`FilterDataPanel`: Поле/Оператор/Значение/
   Регистр, `btnAdd`, `btnAddOR`) — этап 2.
3. `ColumnsMappingEngineOutputPortWizard` — выходные поля.
4. `DerivedVariablesMappingEngineOutputPortWizard` — выход переменных, по
   умолчанию пуст и при «Далее» с шага 3 пропускается.
5. `DoneWizard` «Описание узла»: `cbxNodeTitleMode` «Автоматическая метка»,
   `edtDisplayName` = имя таблицы (People), `btnDone`, `btnExecute`.

## Результат таблицы People (наблюдено)

`btnExecute` на последней странице выполнил узел; визуализатор «Таблица»:

| Поле | Тип (значок мастера и таблицы) | Вид данных | Значения строк 1–6 |
|---|---|---|---|
| Id | целый (12) | непрерывный | 1…6 |
| Label | строка (ab) | дискретный | А, А, пусто, пусто, Кириллица, Б |
| Amount | вещественный (9.0) | непрерывный | 10,5; 20; пусто; −5,25; 0; 30 |
| Active | логический (0/1) | дискретный | Истина, Ложь, пусто, Истина, Ложь, Истина |
| Occurred | дата/время (31) | непрерывный | 29.02.2024 12:30:01; 01.03.2024; пусто; 31.12.2023 23:59:59; 15.01.2024 08:05:09; 29.02.2024 12:30:01 |

Порядок полей = порядок столбцов таблицы, имя = метка = имя столбца; строки
пришли в порядке Id. Назначение — «Не задано». Тип выхода следует
**объявленному** типу столбца SQLite (BOOLEAN → логический, DATETIME → дата/время).

**Гипотезы до этапа 1** (визуализатор не различает): NULL и пустая строка в Label
(Id=3 и Id=4 оба пусты) — различие проверит native-чтение cold-check; порядок
строк в режиме таблицы без ORDER BY не гарантирован — `ordered=false`;
PeopleView и режим «SQL запрос» в UI не выполнялись (не хватило бюджета) —
типы выхода SQL-режима предложены по объявленным типам, подтверждаются первым прогоном.

## Проба сети для PostgreSQL

Подключение PostgreSQL (`…Базы_данных>PostgreSQL`, мастер `DBConnectionWizard`):
одно поле `pedDatabasePath` «Строка подключения», `pedLogin`, `pedPassword`,
`edtSSLParams`, `pedConnectionTimeout` «Тайм-аут подключения (с)» = 20,
`pedLockTimeout`, `pedBusyTimeout`. Введено `10.200.13.132:5432/postgres`,
«Тестировать» дважды (без логина и с логином `lab1544probe`, пароль пуст):

> Тестирование соединения — **«Время ожидания ввода логина и пароля для подключения истекло»**,
> КЛАСС ИСКЛЮЧЕНИЯ: EBGException (ответ через ≈60 с; 13.11.2026 06:42 и 06:44).

Это не «отказано в соединении» и не прямой «тайм-аут» соединения. Ответа
сервера PostgreSQL (refused/auth failed) не получено, значит доступность mas
из сервера Loginom **не доказана**; наблюдение больше похоже на недостижимость
(ожидание дольше тайм-аута подключения 20 с). Для решения по PostgreSQL нужна
повторная проба при заведомо слушающем 5432 на mas. Подключение удалено.

## Решения и предложения для этапа 1

- Runtime type `imports.database`, режимы `table` и `sql`; выход — таблица 0.
  Подключение — SQLite текущего модуля по точному пути `.db` (W1 сводится к
  созданию/переиспользованию плитки «Подключения» и связи с портом 0).
- Только чтение: SQL-режим принимает один SELECT, остальное — отказ до жеста.
- Ожидания — `acceptance/expected.json` из `acceptance/oracle.py` (Python
  `sqlite3`, без Loginom): table/view — 6 строк, `ordered=false`; sql
  `SELECT Amount, Id, Label … WHERE Active = 1 ORDER BY Id DESC` — 3 строки
  (Id 6, 4, 1), `ordered=true`; empty `WHERE Id > 100` — 0 строк со схемой.
  Вещественные точно представимы, допуск 0; дата — точно до секунды.
- Карточка типа (`acceptance/type-proposal.json`): 1 726 Б компактно
  (≤ 12 000); строка навыка 136 Б; файл узла `acceptance/imports.database.md` 1 767 Б
  (≤ 6 000); SKILL.md сейчас 33 031 Б → ≈ 33 150 Б (≤ 40 000).
- Общие правки сверх аддитивной регистрации: доставка `.db` (сейчас допуск
  загрузки — CSV/TSV/TXT/XLS/XLSX/LGD, `storage-policy.mjs:33,70`) и шаг создания подключения SQLite по образцу
  `rest-connection.mjs`; сценарий run-check — новый, загрузка `.db` как вложения.
