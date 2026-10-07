# LGD: исследование этапа 0

Статус: исследование этапа 0 подготовлено к независимой приёмке;
`ready_for_development` не объявляется. Наблюдения 2026-10-07: исходная база
`ef84e68a22bd46f3f24549edd829cfb293836703`, продолжение native cold/property
проверок на `8d5309c668d0b171ae7a788b65b7c60f72071fb4`.
Loginom Enterprise 7.4.2 подтверждён штатным «О программе» под worker account.
Клиент — Linux x64/Chromium. ОС сервера в доступном About UI не показана;
редакция клиента и надпись «64-битная система» файла не доказывают ОС сервера.
Это исследование native UI и контракт будущей приёмки. Полная CLI/model
приёмка и независимая приёмка обработчика — `NOT_RUN`.

## Источник и мастер

Палитра: «Импорт > Loginom Data файл». Runtime component key `imports.lgd`
позволяет штатное создание узла, но обработчика node.apply на базе нет.
Type/mode `imports.lgd` / `native` остаются предложением для этапа 1.
Root мастера — `WizrdMCF;ImportNativePreviewWizard`; наблюдатель видит
заголовок «Импорт из Loginom Data файла», но stage остаётся `unrecognized`.

Поля: `edtFileName`, информационные `edtCompression`, `edtDDFSystem`,
`edtWrittenChecksum`, checkbox `edtUseChecksum`. Проверка checksum по
умолчанию включена. Состояние checkbox берётся из native `check_state`:
DOM input имеет type=button, его JavaScript `.checked` не является настройкой.
После preview следуют соответствие столбцов и описание узла.

Прямое заполнение строки пути недостаточно для доказательства источника:
в прежней попытке corrupt путь откатился к replace, сохранив preview семи
строк. Этот исход остаётся UNKNOWN. В новых диагностических узлах файл
выбран через наблюдённый штатный picker собственного серверного каталога;
прочитаны четыре устойчивых значения пути, checkbox и актуальный node binding.
Picker вернул относительные имена; baseline сохранил абсолютный путь.

## Fixtures и значения

`fixtures/manifest.json` фиксирует реальные размер/SHA256, происхождение
stock файлов, исходные CSV-спецификации и отдельные corrupt-копии. Никакой
новый export handler для их получения не использовался. Скачать через
обычное меню удалось: открытие меню — подготовка, выбор «Скачать» — передача.
До передачи установлен Playwright download observer. В базе штатный
browserDownloadScript отключает showSaveFilePicker перед загрузкой страницы.
Прежнее отсутствие download-события не доказывает конфликт CLI.

Пять полей по порядку: Id/integer/discrete, Text/string/discrete,
Amount/real/continuous, Occurred/datetime/discrete, Active/boolean/discrete.
Имена и метки одинаковы, назначение «Не задано». Полные типизированные
таблицы сверены с отдельной CSV-спецификацией, включая порядок, все ячейки,
NULL, пустую строку, ноль, кириллицу, кавычку/перенос и буквальную формулу.
При чтении использованы точные numeric masks и миллисекундная дата;
формат восстановлен. `source.lgd` — 5 строк; `empty.lgd` — 0 строк с полной
схемой; `replace.lgd` — 7 строк. Повторная настройка того же NativeLGD
с empty, затем replace дала новые 0/7 строк вместо старых пяти.

Информационные поля stock LGD: LZ4, «64-битная система», «Сжатых данных».
Штатный экспорт без checksum создал `no-checksum.lgd`; его импорт с
включённым edtUseChecksum показал «Нет» и прочитал все пять исходных строк.

## Corrupt: что именно доказано

Прежний `corrupt.lgd` — XOR 1 байта 333. Новый native узел действительно
прочитал эту копию с checksum ON и исходными пятью строками. Это **не**
доказательство отказа checksum: байт 333 находится в LZ4 EndMark, за
checksum сжатого блока. Первоначальный `payload_checksum_region=NOT_QUALIFIED`
и прежний UNKNOWN сохранены как результаты своих попыток.

В source.lgd LZ4 magic начинается с offset 16, FLG=0x50. Сжатый блок —
байты 27..325 включительно, checksum — 326..329, EndMark — 330..333.
Согласно [официальному формату LZ4](https://github.com/lz4/lz4/blob/dev/doc/lz4_Frame_format.md),
block checksum вычисляется xxHash32 от сжатого блока с seed 0.
Независимый libxxhash дал 0x3e65e55a, совпадающий с сохранённой checksum.

`corrupt-block.lgd` меняет ровно байт 320: 0x31 → 0x30; checksum оставлена
неизменной. xxHash32 изменился на 0xae7d2a2a. Независимый LZ4 decoder
распаковывает обе версии до 424 байт; единственный изменённый decoded byte
418 превращает `=SUM(A1:A2)` в `=SUM(A0:A2)`. Это проверка LZ4 frame,
не универсальный независимый parser BGDATA.

При подтверждённом picker-источнике corrupt-block и checksum ON свежий
preview/toast сообщает: «Файл не является Loginom Data файлом / Ошибка
контрольной суммы». Данных нет. Checksum OFF на том же подтверждённом
источнике позволяет выполнить импорт; полный typed read показывает
изменённую формулу. Выключение проверки не восстанавливает целостность.

Отдельная диагностика кнопки ошибки: для checksum preview кнопка btnError
не наблюдалась. Нажатие «Далее» переводит в пустое соответствие столбцов,
а не гарантирует остановку мастера. Выполнение с checksum ON не проводилось.
Поэтому доказан native отказ чтения preview, но контракт будущего handler
обязан явно остановиться при этой ошибке и не принимать пустую схему за успех.

## Отказы, persistence и cleanup

Штатный picker принял собственный отсутствующий `missing-stage0-20261007.lgd`.
После устойчивого readback пути один переход «Далее» показал «Подробнее…»;
кнопка ошибки дала точное сообщение «Файл \"missing-stage0-20261007.lgd\"
не найден». Переход «Всё равно далее» и выполнение не использовались.
В прежней попытке CSV как LGD дал «Файл не является Loginom Data файлом /
Некорректная версия»; отдельная кнопка ошибки этого случая ещё не квалифицирована.

Cold-open в новых профилях подтвердил сохранённый baseline: 8 узлов,
3 связи FixtureInput/Empty/Replace → соответствующие native writers,
NativeLGD с прежним node_id, сохранённый абсолютный replace.lgd и checksum ON.
Раннее открытие мастера показывало семь строк preview при неактивном выходе;
этот ранний результат не объявлялся fresh execution. В продолжении выполнен
новый cold execution до открытия мастера и без configure/восстановления:
execution_id `1791374503336-66r6clbrfqq:159:1`, root 159, group 1, process 1.1.
Launch подтверждён штатным жестом, completion — verified/owner_verified,
cleanup_complete=true. Node `1d86c3ba-a6bf-4239-9a13-883dc5de8fa7`, output 0,
port `58f7e6c3-511e-39d7-8853-036e0a1a7612`, table view
`7ca7c4fc-e1d0-4c0c-94c9-c81c2eb83e28`. Все семь строк/35 ячеек независимо
сверены с replace-values.csv. После чтения проверены все пять имён, меток,
типов, видов, назначений «Не задано» и used=true; output mapping context
подтвердил тот же node/port. Последующий просмотр native source settings
подтвердил сохранённый абсолютный replace.lgd и checksum ON, без применения. Baseline настройки
не применялись, пакет после просмотра не перезаписывался. Открытие мастера
активного диагностического узла требует отдельной deactivation confirmation.

Обе новые сессии завершены штатно: package_closed=true, logged_out=true,
unsaved_changes_discarded=true, native child exit=0. Диагностические узлы
не сохранены; созданные собственные файлы остаются. Прежние AMBIGUOUS,
UNKNOWN и FAIL не преобразованы в PASS. Таймаут добавления NativeNoChecksum
сверен двумя complete graph reads: дополнительного узла не было; повтор
разрешён только после этой сверки и cleanup, в новой сессии.

## Границы будущего W1 и handler

Реальный createArtifactStore admission исходных 334 байт принят, но штатный
deliverArtifact на том же runtime дал ARTIFACT_VERIFICATION_UNSUPPORTED,
NOT_APPLIED, effect_possible=false, upload_submitted_or_unknown=false:
server-copy verification поддерживает только CSV/TSV/TXT. Загрузка не
подавалась. Native доставка не заменяет artifact_id/upload_operation_id
и server-copy proof будущего CLI-контракта.

Эта граница не блокирует приёмку исследования этапа 0: модельный импорт
до реализации handler не требуется. Для будущей реализации нужны решение
владельца по расширению W1 на LGD и отдельное назначение общих изменений:
бинарная доставка LGD с bytes/digest/destination, durable source lineage,
persisted source при cold-open без старых receipts, cold reader для нового
type. До этого полный CLI/model и подходящий cold oracle невозможны на базе.
Общие runtime/config, guards, registry и план не менялись.

Предлагаемый владелец общего W1 — исполнитель согласованного XLSX W1
в LAB-21. Файлы, порядок закрепления SHA и адресная регрессия перечислены
в `acceptance/contract.md`; второй механизм доставки не создаётся.

## Различающиеся свойства и inventory

Отдельный собственный NativeProperties импортировал source.lgd: autosync
выключен, Id штатно переименован в RecordId с меткой «Идентификатор», Active
перенесён кнопкой «Добавить в исключенные» в группу «Исключенные».
Связанные четыре target поля и исключённое Active (used=false, source=null)
подтверждены видимым mapping UI и ограниченным чтением его cached stores
между двумя verified node contexts. Это значение used в native mapping,
не доказательство неизвестного бинарного флага LGD. Legacy readNodeMapping
отказал с mapping_record / mapping_filtered_store для исключённой группы;
guard не исправлялся и не обходился в handler. Будущая адаптация readback
обязана отдельно квалифицировать группировку и полноту.

Полный typed output дал пять строк и четыре поля. Stock writer создал
properties-stage0.lgd: 359 bytes, SHA256
`d12e5ed680c0213be32eccf5b1257f002ccf525a420ec2b1f184d3f2595a8d13`.
После установленного observer открыто меню собственного файла и ровно один
раз выбран «Скачать»; получены реальные bytes. Повторный native picker этого
файла подтвердил источник, checksum ON и source schema из четырёх полей:
RecordId/«Идентификатор», Text, Amount, Occurred. Active отсутствует.
Новое исполнение и все 20 ячеек совпали с properties-values.csv.
Исходный сохранённый baseline не перезаписан; диагностические изменения
отброшены при package_closed/logged_out=true, child exit=0.

В EditColumnDefForm имя/метка доступны, type_label «Целый» и data_kind
disabled. Создание/конверсия Variant через этот редактор —
UNSUPPORTED_IN_OBSERVED_UI; Variant LGD fixture и чтение его подтипов —
NOT_RUN. Это предел обследованного UI, а не запрет Variant в формате.
DDF, 32-bit, другие compression и variables остаются отдельным NOT_RUN
inventory; матрица этапа 2 не расширена.

Добавление нового NativePropertiesFile завершилось AMBIGUOUS timeout.
Две complete graph сверки подтвердили отсутствие дополнительного узла,
диалогов и масок; добавление не повторялось. Для проверки файла использован
существующий собственный диагностический узел с отдельным подтверждённым
источником и явной deactivation confirmation. Ошибка возврата после stock
writer drag сверена фактическим единственным writer/link; drag не повторялся.
Оригинальные AMBIGUOUS/FAIL/UNKNOWN сохранены, не заменены PASS.

`oracle.py` проверяет bytes и все typed значения, `cold-audit.py` отдельно
сопоставляет execution/node/port, свойства, сохранённые source settings и
cleanup квалифицированных native наблюдений. Они не удостоверяют
происхождение произвольного JSON, remote byte lineage или будущий handler.
Полный CLI/model и handler cold oracle остаются NOT_RUN. Исследование,
fixtures/oracle и контракт передаются на независимую проверку именно в
этом объёме; этап 1, registry readiness и общие изменения не назначены.

## Проверки комплекта

Byte/value audit всех семи LGD fixtures и cold semantic crosscheck — PASS.
Десять отрицательных проверок отвергают старое execution, другую node/port
identity, неверный путь/ячейку/метку, purpose/used и неполный cleanup.
`validate.py` — FAIL только по evidence hash text-import-handler и
text-import-parameters. Git object сверка подтвердила, что оба runtime файла
и записанные registry hashes уже расходятся на исходном исследуемом
`8d5309c668d0b171ae7a788b65b7c60f72071fb4`; эта карточка их не меняла.
Это известное ограничение общего validator, не PASS; исправление общего
registry/runtime находится вне этапа 0. Проверка LGD fixtures/oracle отдельно
проходит. Полная CLI/model приёмка и handler cold oracle остаются NOT_RUN.
