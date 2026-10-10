## Локальный комплект адресной матрицы

Комплект подготовлен по §3–4 подплана. Исходные 90 golden-случаев и прежние
`expected.json`/`partition-expected.json` сохранены без изменения. Новые ожидания
вычисляются из CSV с проверкой размера, SHA256, заголовков, числа строк и типов.
`fixture-expected.json` содержит полные значения обоих портов: 90 golden-случаев
и 16 отдельных случаев. Oracle использует только Python и прежний независимый
математический oracle из `tools/loginom-acceptance`; обработчики и runtime не импортирует.

Запуск из этого каталога:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 fixture_oracle.py --output fixture-expected.json
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -v test_fixture_oracle
```

Основной `oracle.py --package-path <личный-путь.lgp> --output <каталог-ожиданий>`
также создаёт все три файла ожиданий. Ожидания, oracle и тесты не передаются модели;
для модельного прогона передаются только согласованное бизнес-задание и его CSV.

Входы импортируются как UTF-8, заголовок в первой строке, пропуск 0, разделитель `;`,
ограничитель `"`, Null-маркер `NULL`. Типы и порядок полей заданы manifest, имена и
метки совпадают. Вещественные поля непрерывные, остальные дискретные. Для golden
сохраняются десятичная точка и дата `dd.mm.yyyy HH:MM:SS` с секундами. CSV размещают
в корне личного каталога роли. Header-only импортируется с явными пятью типами;
автоопределение по отсутствующим данным не доказывает схему.

| Требование §3–4 | Вход и ожидания | Локальная проверка | Живая проверка нового SHA |
| --- | --- | --- | --- |
| AND внутри OR | `fixtures/and-or.csv`, `age_income`: RowID 2,3,4,6 / 1,5 | независимое вычисление и отдельная сверка заданных ID | `not_checked` |
| A/a, empty, NULL, literal null, кавычка | `fixtures/strings.csv`, 14 случаев: сравнения и contains с обоими регистрами, NULL, числовые 0/NULL | полные клетки и типы; string NULL ≠ empty ≠ literal null, numeric NULL ≠ 0 | `not_checked` |
| Типизированные операторы | неизменный `data/golden.csv`, 90 прежних случаев | сохранены groups, counts и IDs; добавлены полные ожидаемые строки обоих портов | `not_checked` (исторически 0/90) |
| Пустой выход | golden `all_records`, `no_records` | оба мультимножества и полная схема | `not_checked` |
| Пустой вход | `fixtures/header-only.csv`, `empty_input` | 0/0 при пяти полях на обоих портах | `not_checked` |
| Дубликаты и полное разделение | golden содержит две одинаковые записи Id=6 | потеря одной, добавление и замена строки отвергаются | `not_checked` |
| Узел, порт, исполнение, источник | отдельно закреплённая identity и typed port records | чужие document/workflow/node, GUID порта, старое execution, иной source SHA отвергаются | `not_checked` |
| Полнота/схема/точность | оба полных вывода, positional schema и precision | неполное чтение, фильтр таблицы, неверный count/порядок полей и округление отвергаются | `not_checked` |
| Смена условий, сохранность настроек портов, reopen | основной бизнес-сценарий и отдельный холодный аудит | прежние фазовые ожидания сохранены; локальный oracle не доказывает persistence | `not_checked` |
| Recovery, cleanup, негативные admission-отказы и широкая схема | живые квитанции и адресные runtime-тесты | новый комплект их не подменяет | `not_checked` |

Row_number в прежнем математическом oracle считается с 1; datetime трактуется как
локальное время без timezone. Это предпосылки ожиданий, а не живое подтверждение
семантики текущего Loginom. Исторические холодные 5/5 на `da11e4b54729ddb1599f2fb49b4da325904f2e16`
не переносятся на новый SHA. Ни локальные тесты, ни эта таблица не объявляют PASS узла.

## Независимый аудит полученных портов

```sh
PYTHONDONTWRITEBYTECODE=1 python3 audit.py --case age_income --actual actual-ports.json --binding independently-audited-binding.json
```

`actual-ports.json` — массив двух полных typed port records: `port`, `port_guid`,
`node` (document_id/workflow_id/node_id), `execution_id`, `source_sha256`, `fresh`,
`schema` (name/label/type), `row_count`, `sample_complete`, `filter_enabled`, `sample`.
Клетка содержит `type`, `value`, `is_null`, `precision`; datetime также `timezone`.
Целые передаются точными десятичными строками. Форматы precision совпадают с
прежним независимым контрактом: exact_null, exact_integer, 17_significant_digits,
exact_boolean, millisecond. Порядок строк несущественен; кратность дубликатов существенна.

Binding содержит отдельно проверенные `document_id`, `workflow_id`, `node_id`,
`execution_id`, `source_sha256`, `port_guids` с ключами `"0"`, `"1"`. Его получают
из независимого аудита исходных байтов, привязки нативных портов и свежего исполнения;
копирование этих полей из проверяемого ответа не является доказательством.
`verify_ports` проверяет согласованность с этим якорем и значения, но не удостоверяет
сам факт браузерного исполнения. Локальные тестовые квитанции не являются живыми результатами.

Общая зависимость `matrix-import → read → ModalWindow_BrowseFilter` остаётся в
LAB-67/PR54. Здесь не перенесены её кандидаты и не изменены общие helpers. До нового
живого запуска требуются назначенный Генератором проверенный фикс, чистый опубликованный
SHA, соответствующая сборка и сверка исходной операции/точного профиля/собственных ресурсов.
Исторические AMBIGUOUS, pending и журналы сохраняются; новый operation_id не разрешает retry.
