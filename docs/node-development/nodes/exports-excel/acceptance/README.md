# Приёмочный комплект: предложение владельцу

Это этап 0. `expected.json` описывает файловый sink (`output_port:null`), а не
выходную таблицу stock cold-check. **Не передавать** его текущему run-check.
Общие изменения перечислены в [discovery](../discovery.md). До их разрешения
CLI не собирается и модельные сценарии не запускаются.

Модель получает только `task.md` и `fixtures/cells.csv`; expected, oracle,
parameter-schema и тесты ей не передаются. Fixture: UTF-8, CSV comma, dot decimal,
NULL marker `NULL`. Импорт должен явно задать пять типов и метки из task.md.

Критерии для утверждения:

1. Одна новая книга XLSX, лист «Данные», точный порядок Id/Text/Amount/Occurred/Active,
   пять строк. Заголовки — метки; варианты names/none проверяются отдельными cases.
2. Все 25 значений и типы проверяются независимым reader. NULL и пустая строка
   различимы; false не равен 0; формулоподобная строка не становится формулой.
   Amount abs=1e-9/rel=1e-12, дата abs=1 мс. Остальное — точно.
3. Пустой вход с той же схемой даёт только пять заголовков. Существующий destination
   отвергается; ни overwrite, ни append, ни дополнительные листы не допускаются.
4. Execute доставляет XLSX через `output.file_artifacts`. Done сохраняет настройки
   без исполнения. Сохранить пакет; штатно закрыть пакет и выйти.
5. Cold: открыть сохранённый пакет новым профилем без восстановления настроек,
   сверить граф, источник и сохранённые параметры; проверить свежий XLSX независимым
   oracle. Конкретное подключение sink к stock cold требует решения из discovery;
   PASS только входной таблицы недостаточен. При неизвестном файловом эффекте
   повторное исполнение не разрешено автоматически.

Проверка fixture (Python, без сторонних зависимостей):

```sh
python3 -B docs/node-development/nodes/exports-excel/acceptance/oracle.py
```

Проверка реально скачанного файла после утверждения:

```sh
python3 -B docs/node-development/nodes/exports-excel/acceptance/oracle.py --xlsx /private/path/excel-cells.xlsx
```

Oracle не доказывает доставку, настройки native integer/real или сохранение
пакета. Файл должен иметь заданное имя. Сравнение XML отдельно сохраняет пустую
строку `t=inlineStr` (включая пустой `<c>`) и NULL, который отсутствует либо пуст
с numeric type. Reader допускает shared strings и inline strings, дату serial
с date-style и `t=d`. Лишние ячейки/листы, формулы и Excel error cells отвергаются.

Offline-квалификация oracle независимым writer (только dev-зависимости из
`requirements-test.txt`; запуск из каталога acceptance после их установки):

```sh
python3 -B -m unittest -v test_oracle.py
```

Тесты проверяют корректный полный лист, варианты заголовков и пустой вход,
округление, boolean→number, NULL↔empty, формулу, порядок, лишние ячейки/лист и даты.
Это **не** live-приёмка Loginom.

Размер будущей аддитивной регистрации (из корня, зависимости client установлены):

```sh
node docs/node-development/nodes/exports-excel/acceptance/schema-size.mjs
```

Этот sizing fixture клонирует полную схему в памяти. Runtime не регистрируется.
Начальные требования new/existing проверит handler; общий schema-бюджет не меняется.
