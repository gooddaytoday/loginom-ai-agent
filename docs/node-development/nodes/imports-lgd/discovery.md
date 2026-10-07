# LGD: исследование этапа 0

Статус: `blocked`, не `ready_for_development`. Наблюдения 2026-10-07 на
Loginom 7.4.2, исходный SHA `ef84e68a22bd46f3f24549edd829cfb293836703`.
Клиент — Linux x64/Chromium; редакция и ОС сервера не определены.
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
После открытия его мастера свежий preview имел 7 строк. Выход cold-open
был неактивен, новый fresh execution не заявляется. Baseline настройки
не применялись, пакет после просмотра не перезаписывался. Открытие мастера
активного диагностического узла требует отдельной deactivation confirmation.

Обе новые сессии завершены штатно: package_closed=true, logged_out=true,
unsaved_changes_discarded=true, native child exit=0. Диагностические узлы
не сохранены; созданные собственные файлы остаются. Прежние AMBIGUOUS,
UNKNOWN и FAIL не преобразованы в PASS. Таймаут добавления NativeNoChecksum
сверен двумя complete graph reads: дополнительного узла не было; повтор
разрешён только после этой сверки и cleanup, в новой сессии.

## Блокеры и границы W1

Реальный createArtifactStore admission исходных 334 байт принят, но штатный
deliverArtifact на том же runtime дал ARTIFACT_VERIFICATION_UNSUPPORTED,
NOT_APPLIED, effect_possible=false, upload_submitted_or_unknown=false:
server-copy verification поддерживает только CSV/TSV/TXT. Загрузка не
подавалась. Native доставка не заменяет artifact_id/upload_operation_id
и server-copy proof будущего CLI-контракта.

Нужны решение владельца по W1 и отдельное назначение общих изменений:
бинарная доставка LGD с bytes/digest/destination, durable source lineage,
persisted source при cold-open без старых receipts, cold reader для нового
type. До этого полный CLI/model и подходящий cold oracle невозможны на базе.
Общие runtime/config, guards, registry и план не менялись.

Variant, разные имена/метки, DDF, 32-bit, другие compression и управляющие
переменные — NOT_RUN; их нельзя выводить из пяти stock полей. Fixture/byte
audit ниже не проверяет происхождение произвольного JSON readback. Приёмка
первого среза закреплена в `acceptance/contract.md`, а не объявлена пройденной.
