# JavaScript: рабочее исследование на Loginom 7.4.2

Статус на 2026-09-29: **`discovery_required`**. Это сводка прямых наблюдений
фазы 0B [подплана](plan.md), а не допуск публичного обработчика или автономной
CLI-приёмки. Стенд — `http://logi-test-plan.bg.local/app/`, Loginom Enterprise
7.4.2; оператор — Ubuntu, только видимый headed Chromium. ОС **сервера** —
Linux по принадлежащему `Session.Version.IsWindows=false`; дистрибутив и версия
ядра неизвестны. Продуктовая база кампании остаётся
`a8ad59766dbdb4f2da0b54367a755ce00891dd71`; более новая база документации
`3f35c5f232` добавила общее [чтение ошибки мастера](../../workflow/lifecycle.md#отказ-мастера-и-кнопка-ошибки).
Исходные отчёты и журналы находятся в приватной кампании; подтверждённые SHA,
ревизии операторов и границы каждой попытки перечислены в [checkpoint](checkpoint.md).

| Gate | Непосредственно наблюдено | Что ещё нужно для решения 0B |
| --- | --- | --- |
| G1 — узел и редактор | Собственный JS GUID, иконка `bg-vendor-icon-javascript`. Для несоединённого узла fresh headed проход подтвердил страницы `TuneDataSourceInputPortWizard` index0 → `JavaScriptColumnsWizard` index1 → `JavaScriptCodeWizard` index2 → `DoneWizard` index4 с условно пропущенным index3. При уже подключённом input0 первая страница пропускается. CodeMirror 4.11.1, `mode=javascript`, `readOnly=false`, отступ 4, `smartIndent/electricChars=true`; код прочитан целиком и восстановлен после G4 probe. Собственный code controller держит `FEngine`/`FModuleSystem`: native proxy одного сеанса, но разных remote objects и interfaces. Два сохранённых `.lgp` 7.4.2 содержат JS `VendorGuid=28865f89-eea0-4143-b155-291791324a4b` и сериализованный `TBGJavaScriptEngine`. | Установить runtime native component/`FullType`, остальные условные маршруты и наличие помощника либо переключателя движка. Два proxy не считать cast одного объекта; XML-тип сохранённого engine и видимый заголовок не заменяют runtime type. |
| G2 — моменты исполнения | В обоих режимах `code`/`declared` переходы `Next` и `Done` наблюдены. `Preview` и отдельный `Execute` положительно подтвердили исполнение собственными sentinel/child evidence. | Эффекты `Next`/`Done` остаются неопределёнными: отсутствие sentinel не доказывает отсутствие исполнения внутри `Verify`. Нужен подтверждённый порядок materialization и консервативный контракт без повтора жеста с неизвестным эффектом. |
| G3 — схема и связи | Оба schema mode дали полный результат 6×2. Ручной output mapping с `autosync=false` сохранился; при несовместимой смене исходного поля новый Execute вернул собственную ошибку о пропавшем `PhaseMarker`, связь не переназначилась молча. Пять отдельных двухколоночных проб наблюдали фактические имена/метки до и после записи. На пустой declared-схеме отдельно наблюдены native списки `Вид данных` и `Назначение`; последний связан с `DefaultUsageType`. Собственный picker назначения открывался одним жестом: 7/7 native records соответствовали 7/7 видимым options, включая `4 — Выходное`; список закрыт до Cancel. В отдельном проходе выбор `Выходное` сменил cached value с 0 на 4 и автоматически свернул picker до Cancel. | Доказать связь code-generated schema с physical output0, переход configured-only → materialized, допустимую смену схемы и полную сохранность двухсторонних связей existing-узла. `bridge_verified=false`; не выводить общий алгоритм нормализации Name из пяти примеров. |
| G4 — точность кода | `keyboard.insertText` на реальном CodeMirror передал 849 байт/8 строк и граничные 32768 байт/1024 строки с полным readback; `keyboard.type` изменил контрольный текст и отклонён. Отдельный source97 дважды выполнил принадлежащий узлу полный open/read/Close без нового явного Execute/Done. В G7 последняя редакция прочитана после холодного открытия. | Связать точный source receipt, UTF-8/LF digest и полную redaction-проверку с публичной записью и source-read. Не считать отсутствие явного Execute доказательством отсутствия любых скрытых серверных эффектов. |
| G5 — типы и доступ | Индексированная discovery-матрица имеет наблюдения для всех 30/30 закреплённых snippets; отдельные native/typed пробы показали scalar, NULL/empty/undefined, safe/unsafe int64, Date, именованный доступ и пустой output. | Завершить заранее закреплённый native roundtrip и одноколоночные D/J24 cases только после доказанной source→physical связи. Typed UI без native bytes не закрывает точность; 30/30 observation не означает G5/J20 PASS. |
| G6 — ошибки и восстановление | Синтаксический отказ `Next` даёт собственную кнопку ошибки и штатный диалог; синхронный `throw` даёт failed child после отдельного Execute. Исправленный оператор читает причину, закрывает диалог OK и завершает пакет; свежий headed regression проверен на `?.`. | Проверить сохранение прежнего кода/соседнего графа при отказах, ремонт того же узла, cancel/Stop/lost reply и доставку диагностики модели. Позицию выдавать только из текста Loginom. |
| G7 — сохранение | Для `code` и `declared` выполнены отдельные writer/cold пары: последнее S2-состояние открыто в новом профиле, source/settings/schema прочитаны без передачи кода в reader, новый Execute дал полный результат 6×2. После каждого из двух Save native `IsPackageModified=false`. Дополнительный read-only audit скачал точные `.lgp` обоих режимов через штатный `FileDownloader`: ZIP/CRC, GUID узла, decoded `Engine.Code`, mode и объявленные колонки сверены с writer и cold reader. У обоих private combined audits `package_bytes_verified=true` и `dirty_state_verified=true`; все шесть процессов подтвердили package close/logout/browser close. | Это доказательство только двух фиксированных private пакетов. `public_handler_verified=false`; полная G7-приёмка handler и CLI остаётся впереди. |

Наблюдения G1 и G4 подробно записаны в [checkpoint](checkpoint.md) (operator15/16,
source97). Для G2/G3 авторитетная сводка — [переходы и эффекты](execution-effects.md),
для имён — [schema telemetry](schema-telemetry-observations.md) и
[D witness audit](native-output-schema-witness-design.md), для G5/J20 —
[engine profile](engine-profile.json), для G7 — [persistence design](persistence-design.md)
и подтверждённые writer/cold записи в checkpoint. Документы с формулировкой
«дизайн» не превращаются в живое доказательство. Неподтверждённый `FullType`,
кодовую source→physical связь или отсутствие эффекта `Next`/`Done`
нельзя восстанавливать из названия узла, браузерной ОС или предполагаемого API.

В headed profile214/source `3a50a79a5c` пустой declared editor показал
`cbxDataKind`: 0 «Неопределенное», 1 «Непрерывный», 2 «Дискретный»; для новой
строковой колонки выбран 2, а само поле выключено. `cbxUsageType` показал
0 «Не задано», 3 «Активное», 4 «Выходное», 6 «Группа», 7 «Показатель»,
8 «Транзакция», 9 «Элемент»; выбран 0. В сохранённом frontend Loginom
7.4.2 `CodeColumnsWizard` показывает `colDefaultUsageType`, а
`EditColumnDefForm.ApplyUsageType` пишет `DefaultUsageType` и использует
`fpDefaultUsageType`. Следовательно, будущий публичный параметр назначения
столбца должен проверяться по `DefaultUsageType`, а не по похожему полю
`UsageType`. Эти варианты наблюдены только для конкретного пустого declared
editor; доступность вариантов для других типов отдельно не проверена. После
`Cancel` локальная коллекция пуста и чиста, но native `totalCount` оставался
равным 1. Оператор принял только эту точную комбинацию квитанции Cancel и
диагностики store; Save и Execute не вызывались. SHA и cleanup — в checkpoint.
Profile216 подтвердил для `cbxUsageType` единственный собственный видимый
trigger `EditColumnDefForm;cbxUsageType;trg_picker` (`rendered=true`,
`repeatClick=false`, `disabled=false`). В отдельных headed попытках 217–219
предусловие открытия выявило ленивое создание DOM picker; все отказали до
клика и закрылись штатно. Source `81179bd1e5` допустил только эту наблюдённую
форму связи поля и store без DOM перед кликом. Profile220 подтвердил один
`usage-picker-open`, все семь собственных видимых вариантов и закрытие списка
до `Cancel` с нулём локальных записей и cleanup 3/3. В profile221 один
`usage-option-select` сменил native cached value 0 → 4; picker закрылся
автоматически, `Cancel` оставил ноль локальных записей, cleanup 3/3. Apply,
Save и Execute не вызывались: сохранение `DefaultUsageType` пока не доказано.

Следующие проверки — установить оставшиеся свойства редактора,
определить безопасный контракт `Next`/`Done`, доказать G3 bridge для generated
schema, закончить G5/G6. После закрепления решений G1–G7 можно перевести фазу в
`ready_for_development` и реализовать публичный контракт, знания, handler и
независимую CLI-приёмку. В каждом новом browser-прогоне нужен свежий профиль,
один владелец, подтверждённое закрытие именно своего пакета, logout и browser close.
