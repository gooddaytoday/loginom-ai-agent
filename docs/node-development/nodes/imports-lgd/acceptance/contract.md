# LGD: исследование этапа 0 и контракт будущего первого среза

Этап 0 принимается как исследование с честной матрицей ограничений;
успешный модельный импорт до handler не требуется. Native cold read,
различающиеся name/label и used проверены; Variant доступность ограничена
наблюдённым UI. Контракт ниже зафиксирован до обработчика. Stage 1 не назначен; W1 не реализован.
Предложение type/mode — imports.lgd/native. Ни этот комплект, ни native
readback не объявляют ready_for_development или CLI PASS.

1. Допустить оригинальные bytes fixtures через штатный artifact admission;
   проверить SHA256, размер и собственный destination. Handler получает
   artifact_id/upload_operation_id только из завершённой verified delivery.
2. Создать/настроить LGD из source.lgd: все пять полей, имена, метки,
   типы, виды, назначения, порядок и все пять строк сравнить с manifest.
   NULL, empty, zero, literal formula и multiline различаются точно.
   properties-stage0.lgd отдельно проверяет RecordId/«Идентификатор»,
   отсутствие исключённого Active и четыре поля/пять строк по собственной
   schema/values_spec. used=false квалифицирован в mapping, не как флаг файла.
3. На том же узле выбрать empty.lgd (0 строк, полная схема), затем replace.lgd
   (7 строк). Для каждого источника нужен новый verified digest, readback
   реального пути, node/port identity и результат свежего исполнения.
   Предыдущий preview/старое исполнение не подходят.
4. corrupt-block.lgd при checksum ON: подтверждённый источник, исходная
   ошибка checksum, отсутствие принятого успешного результата. Не считать
   пустое соответствие столбцов успехом. Native отказ доказан для preview;
   отказ исполнения с checksum ON не исследован. Этот будущий handler
   контракт не объявляет иной native результат ошибкой продукта. Прежний corrupt.lgd с мутацией
   EndMark исключён из отрицательного checksum case.
5. Checksum OFF на corrupt-block — только отдельная диагностика: ожидается
   изменённая формула =SUM(A0:A2), без утверждения целостности. no-checksum.lgd
   при checkbox ON читается, metadata «Нет» честно отражает отсутствие checksum.
6. Неверный путь/формат: точный отказ, никакого продолжения по старым данным.
   Cancellation не сохраняет незапрошенные настройки. Неподдержанные DDF,
   Variant/32-bit/variables и настройки отклоняются до эффекта, пока не приняты.
   Variant creation недоступен в обследованном редакторе (type disabled);
   чтение Variant файлов NOT_RUN, несовместимость формата не утверждается.
7. Сохранить успешный source/empty/replace результат, закрыть/выйти; открыть
   в новом профиле без восстановления прежних настроек/receipts. Проверить
   persisted source, граф, digest/lineage и новый полный независимый cold read.
8. При UNKNOWN сохранить исходную попытку, не повторять мутацию до независимой
   сверки. PASS требует полный CLI с конфигурацией модели из worker.json,
   подходящий независимый oracle, package_closed=true и logged_out=true.

`oracle.py` — независимый audit byte manifest и всех typed ячеек по исходной
CSV-спецификации. Он не импортирует handler/runtime. Пользователь передаёт
receipt уже квалифицированного штатного чтения; происхождение, source binding,
свежесть исполнения и cleanup проверяются отдельно. Подмена JSON может пройти
этот value audit: поэтому он не заменяет пункт 7 и полный CLI/cold oracle.

```sh
python3 docs/node-development/nodes/imports-lgd/acceptance/oracle.py
python3 docs/node-development/nodes/imports-lgd/acceptance/oracle.py \
  --readback source.lgd:/private/qualified-native-read.json
```

Ожидания manifest и административные данные не передаются модели. До W1
не создаётся запускаемый acceptance fixture с фиктивными input receipts.

## Native cold audit этапа 0

`cold-audit.py` принимает один JSON с неизменёнными либо безопасно
сокращёнными native receipt envelopes baseline/execution/readback/properties/
settings/cleanup. Required поля читаются прямо из наблюдений; binding,
исходные receipts и guard нельзя переписывать. Ожидаемые node-id, port-guid,
source, package и account передаются независимо от наблюдаемого JSON.
Проверяются свежая группа относительно baseline roots, завершение владельца,
все семь строк, все свойства/used/purpose, совпадение output identity,
сохранённые source/checksum и cleanup. Проверка не аутентифицирует JSON,
не доказывает порядок всех внешних UI действий и remote source digest.
Эти границы требуют проверенных опубликованных свидетельств.

## Общий W1: предложение, без правок реализации

Предлагаемый владелец — исполнитель согласованного XLSX W1 в LAB-21.
Расширение общего W1 на LGD и этап 1 требуют отдельного решения владельца.
Все пути client ниже относительно `packages/loginom-runtime/`.

| Общая область | Файлы | Требуемый контракт |
| --- | --- | --- |
| Admission/delivery | `client/lib/artifacts.mjs`, `artifact-delivery.mjs`, `executor.mjs`, `host-artifacts.mjs` | Бинарные bytes/size/SHA256, собственный destination, terminal upload outcome и проверенная server copy без CSV декодирования |
| Bound readback/persistence | `client/lib/node-api.mjs`, `node-procedure.mjs`, `workspace-ui.mjs` | Persisted source proof, node/port identity, свежий read без старых UI receipts |
| Mapping inventory | `client/lib/node-mapping-context.mjs` | Полнота grouped/excluded records и source identity; исследованный LGD wizard пока не поддержан общим reader |
| Acceptance/oracle | `scripts/node-acceptance/cold-check.mjs`, `cold-reader-policy.mjs`, `prepared-source-proof.mjs`, `static-source-proof.mjs`, `source_manifest.py` и их адресные tests | Binary source lineage, cold reader policy, cleanup и отрицательные checks |

LGD адаптации: новые `client/lib/imports-lgd-{node,parameters,procedure,readback}.mjs`
(предлагаемые пути), native source/checksum/metadata и wizard stages; включение
через существующие node-contracts/node-support/node-api регистрации и типы
результатов. Адаптация должна переиспользовать общий artifact delivery и
различать preview отказ, выполнение и UNKNOWN. Нового uploader не создаём.

Порядок: общий контракт отдельными коммитами → независимая приёмка и
закреплённый SHA → после разрешения LGD переиспользование с адресной
регрессией TXT/CSV/XLSX/LGD. Stage 0 не меняет эти файлы, общий runtime/config,
registry readiness или модель. ARTIFACT_VERIFICATION_UNSUPPORTED/NOT_APPLIED
и отсутствие handler фиксируют границу будущей реализации. Полный CLI/model
и handler cold oracle NOT_RUN; native PASS их не заменяет.
