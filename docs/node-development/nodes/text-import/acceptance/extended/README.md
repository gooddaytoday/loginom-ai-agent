# Расширенные возможности imports.text: предложение приёмки

LAB-975, этап 0. Ни один expected не означает PASS runtime. Обработка новых
свойств, регистрация сценариев, перенос в продуктовый skill — после решения
владельца. Модели передаются только задания и исходные файлы; этот каталог,
oracle, карточка проекта и expected ей не передаются.

| Цикл | Задание относительно acceptance/ | Fixtures | Предложенный expected |
|---|---|---|---|
| 1. Автотипы / повторный анализ | task-auto-types.md; task-auto-update.md | fixtures/extended/typed.csv, typed-update.csv | expected-auto-types.json; expected-auto-new.json; expected-auto-update.json |
| 2. Явный список + имя файла | task-multi-file-list.md (существующий) | fixtures/multi-file/sales_2026-01.csv, sales_2026-02.csv | expected-list.json |
| 3. Маска и новый файл после Save | task-multi-file.md (существующий) | те же + returns_2026-01.csv; март добавляется отдельно | expected-mask.json; expected-mask-new-month.json |
| 4. Имя из переменной | task-file-variable-import.md (существующий) | fixtures/file-variable/ | expected-file-variable.json, исходный комплект file-variable/ |
| 5. Variant | task-variant.md | fixtures/extended/variant.csv | expected-variant.json; expected-variant-off.json |
| 6. Авто-/пользовательская метка | task-auto-label.md | fixtures/extended/typed*.csv | expected-auto-label.json; expected-custom-label.json |
| 7. Параллельность | task-parallel.md | fixtures/multi-file/ | expected-parallel.json |
| 8. Пути источников | task-file-info.md | fixtures/multi-file/ | expected-absolute-path.json; expected-relative-path.json |
| Отложено. HTTP/Basic | task-http.md | byte-identical fixtures/extended/typed.csv на контролируемом endpoint | expected-http.json — только тело, транспорт не доказан |

Пути fixtures указаны от каталога узла. Все JSON — обычная форма существующего
expected-outputs; временное package_path={{PACKAGE_PATH}} до регистрации заменяют
на конкретный путь .lgp. В expected-absolute-path.json также подставляют
конкретный разрешённый SOURCE_DIR **до** прогона. Относительный путь здесь
ограничен файлами рядом с пакетом, как в прежнем наблюдении multi-file;
подкаталоги и разные корни не входят в этот expected.

`oracle.py` использует Python csv, datetime и существующие независимые oracles
multi-file/file-variable. Никаких импортов Loginom, чтения DOM или вызовов модели.
Типы — заданная бизнес-семантика синтетических fixtures, а не копия эвристики
Loginom. Полный перечень и SHA исходных байтов — fixtures/extended/manifest.json.

```sh
python3 -B docs/node-development/nodes/text-import/acceptance/extended/oracle.py --check
# Генерация после намеренного изменения fixtures:
python3 -B docs/node-development/nodes/text-import/acceptance/extended/oracle.py --write --check
```

Опционально `--case auto-types --csv <скачанный CSV>` сверяет все значения и
кратности. Для этого CSV: UTF-8, `;`, \N и даты yyyy-mm-dd HH:mm:ss. Порядок строк
не фиксируется. Для списка/маски использовать существующий oracle-multi-file.py;
для переменных — существующий oracle из file-variable/.

Автоопределение не означает «любой формат распознаётся верно». Первичная таблица
сумм зависит от явно выбранной точки; ограничение анализа двумя строками не
доказывает тип хвоста. В автотипах дополнительно проверяются настройки none/new/all,
analysis rows и refresh, полный readback схемы, сохранность ручного Amount в
стадии new, затем переход Amount к real в стадии all. Для none предлагается
только сохранение уже заданных типов при смене источника без явного повторного анализа;
схему новых полей в none этот комплект не угадывает. Native btnRefreshAll
в опыте сбросил Amount string в real даже при «Только новые»; proposed
expected-auto-new требует сохранения/восстановления ручной настройки самим
handler после полного чтения новой структуры. Это предложенный результат,
не уже имеющееся поведение кнопки мастера. Явная btnRefreshData заново
определяет Amount даже при режиме Нет (наблюдение 49→50).

Variant: ожидается native subtype integer 42, string word, real 3.5 и NULL.
CSV проверяет отображённые значения, но не различает число 42 и строку "42".
Точный тип каждой ячейки проверяется существующим bounded native decoder и
stock matcher. Если адресного допуска imports.text к нему нет, это отдельное
аддитивное расширение этапа 1. Новый decoder или механизм верификации здесь
не вводится. В задаче финальная стадия Variant выключен, поэтому cold этой
задачи сравнивается с expected-variant-off.json; стадия Variant включён требует
отдельно сохранённого пакета для полноценного cold native subtype readback.

Каждый положительный цикл: полная таблица/типы/имена/порядок полей/NULL/кратности,
сохранение того же узла и незапрошенных настроек, CSV, Save, чистый профиль,
Execute без восстановления настройки, чтение сохранённых параметров, cleanup.
Не заданные пользователем метки — label_any; у теста автометки заданная метка
узла проверяется отдельно от меток колонок. Стандарт после реализации:
≥2/3 PASS исполнителя и независимые 2/3 на одном SHA. Run-check только штатный
start + wait одной командой; новые имена сценариев пока не зарегистрированы.

FileTime пока **не имеет expected**: необходим независимый эталон серверного
времени, timezone и точности. Не принимать локальный mtime или округлённую
экранную строку за oracle. HTTP ожидает доступный с сервера controlled endpoint
с фиксированным typed.csv, Basic и проверкой неверного пароля. Никто не должен
добавлять обход скачиванием на клиент. Это ограничения стенда/исследования,
не отрицательные успешные прогоны обработчика.
