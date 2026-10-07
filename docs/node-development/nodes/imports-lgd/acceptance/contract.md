# LGD: контракт первого среза, ещё NOT_RUN

Контракт зафиксирован до обработчика. Stage 1 не назначен; W1 не реализован.
Предложение type/mode — imports.lgd/native. Ни этот комплект, ни native
readback не объявляют ready_for_development или CLI PASS.

1. Допустить оригинальные bytes fixtures через штатный artifact admission;
   проверить SHA256, размер и собственный destination. Handler получает
   artifact_id/upload_operation_id только из завершённой verified delivery.
2. Создать/настроить LGD из source.lgd: все пять полей, имена, метки,
   типы, виды, назначения, порядок и все пять строк сравнить с manifest.
   NULL, empty, zero, literal formula и multiline различаются точно.
3. На том же узле выбрать empty.lgd (0 строк, полная схема), затем replace.lgd
   (7 строк). Для каждого источника нужен новый verified digest, readback
   реального пути, node/port identity и результат свежего исполнения.
   Предыдущий preview/старое исполнение не подходят.
4. corrupt-block.lgd при checksum ON: подтверждённый источник, исходная
   ошибка checksum, отсутствие принятого успешного результата. Не считать
   пустое соответствие столбцов успехом. Прежний corrupt.lgd с мутацией
   EndMark исключён из отрицательного checksum case.
5. Checksum OFF на corrupt-block — только отдельная диагностика: ожидается
   изменённая формула =SUM(A0:A2), без утверждения целостности. no-checksum.lgd
   при checkbox ON читается, metadata «Нет» честно отражает отсутствие checksum.
6. Неверный путь/формат: точный отказ, никакого продолжения по старым данным.
   Cancellation не сохраняет незапрошенные настройки. Неподдержанные DDF,
   Variant/32-bit/variables и настройки отклоняются до эффекта, пока не приняты.
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
