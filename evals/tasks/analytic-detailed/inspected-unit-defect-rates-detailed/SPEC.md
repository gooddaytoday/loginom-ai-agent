# Брак изделий вместо количества записей дефектов

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

## Задача и происхождение данных

Одна строка на (supplier_id, production_line) из полного inspections: число проверенных, дефектных и критичных изделий и две доли от всех проверенных изделий. Detailed и business имеют одинаковые входы, общий контракт, rubric, tolerance и oracle; подробная форма раскрывает вычисления.

Данные полностью синтетические, созданы eval author: 6 проверенных изделий и 5 замечаний. Два raw CSV заморожены до ручного gold и независимого oracle. Это не UCI, реальные производственные данные или производный снимок; внешние datasets, готовые пакеты и сторонние лицензии не использованы, лицензия репозитория — MIT. Временного окна и преобразований дат нет.

inspections.csv(unit_id,supplier_id,production_line) — полный реестр с уникальным unit_id. defects.csv(defect_id,unit_id,defect_code,severity) имеет уникальный defect_id; каждый unit_id существует в inspections. Несколько замечаний одного изделия, включая повторный код и severity, допустимы и не создают нового изделия. Ключи — ASCII-строки с учётом регистра; все входные ячейки непустые, без NULL. severity — целое 1/2/3. Входы UTF-8, `;`, заголовок, десятичная точка, двойная кавычка как текстовый ограничитель.

Независимый Python stdlib csv oracle читает оба raw: строит максимальную severity по unit_id, затем обходит полный inspections, суммируя число изделий и признаки max>0/max=3 по supplier/line. Отсутствующий max означает 0. Доли — defective/inspected и critical/inspected без промежуточного округления; вывод ASCII ASC. Полная ручная таблица 3×7 создана независимо до native. Фактический Python runtime/version записан в provenance; готовый native CSV в oracle не используется.

## Фактический native reference

Saved Info.xml задаёт Name=Unit1; граф находится в ZIP member Unit_0/Unit.xml. Наблюдаются 10 native узлов и 9 data links — описание принятого reference, не требования к числу/именам узлов или внутренней композиции. Оба импорта связаны с единственным текстовым экспортом; JavaScript и готовые итоговые значения не подставлены.

1. «Проверенные изделия» и «Замечания» — TBGImportTextFile. Читаются PRIVATE_STORAGE и PRIVATE_STORAGE unit/supplier/line/defect/code имеют dtString/dkDiscrete, severity — dtInteger; UTF-8/`;`/header/decimal-dot/empty-NULL.
2. «Максимальная тяжесть изделия» — TBGGroupDataEngine по unit_id (utGroup/Order0), severity с gdMax; defect_id и defect_code не группировки. Output mapping severity_Max→max_severity (dtInteger). Повтор U01/B/3 не размножает изделия.
3. «Все проверенные с тяжестью» — TBGJoinDataEngine: полный inspections в MainDataSource, агрегат severity в JoinedDataSource, LEFT по unit_id с обеих сторон. SyncThroughColumns сохраняет исходные поля; U03/U05/U06 получают NULL max_severity. LEFT подтверждён actual native readback; отсутствие JoinType в XML само по себе не является доказательством LEFT.
4. «Признаки брака и критичности» — TBGCalcData: dtInteger defective_flag=`IFF(NVLF(max_severity, 0) > 0, 1, 0)`, critical_flag=`IFF(NVLF(max_severity, 0) = 3, 1, 0)`. Отсутствующие замечания дают оба нуля; severity2 не критична.
5. «Итоги по поставщику и линии» — TBGGroupDataEngine по supplier_id/production_line (Order0/1): unit_id с gdCount, defective_flag/critical_flag с gdSum. Output mappings unit_id_Count→inspected_units (dtInteger), defective_flag_Sum→defective_units и critical_flag_Sum→critical_units (на этой стадии dtFloat).
6. «Целые счётчики изделий» — TBGReformColumnsEngine: оба sum-поля преобразованы из dtFloat в dtInteger через TBGReformColumnDefExtension DataType=dtInteger/ChangedInfo=fpDataType. inspected_units уже integer, остальные поля сохранены. Это обеспечивает целый текст счётчиков при экспорте.
7. «Доли от всех проверенных» — TBGCalcData: dtFloat defective_share=`defective_units / inspected_units`, critical_share=`critical_units / inspected_units`. Знаменатель каждой группы положителен; доли в единицах, не процентах, без промежуточного округления.
8. «Поставщик и линия по возрастанию» — TBGSortingEngine, supplier_id затем production_line ASC, LocaleAware=false. Семь одноимённых output mappings; фактический порядок defective_share,critical_share,supplier_id,production_line,inspected_units,defective_units,critical_units допустимо отличается от oracle.
9. «Итоговый CSV» — TBGExportTextFile: ровно один PRIVATE_STORAGE UTF-8, `;`, names header, decimal `.`, qualifier `"`, empty NULL; фактический LF/no BOM. Точные import/export paths сохранены также в provenance.

Связи: defects→group max; inspections+group max→LEFT→flags→group supplier/line→integer reform→shares→ASCII sort→sole export. В events все 10 разных native execution завершены SUCCEEDED/completed/cleanup_complete=true; оба импорта включены. GUID/port links согласованы с запросами и saved XML.

## Полный результат и проверенные границы

Ровно 3 строки × 7 колонок. Состав и имена точны; порядок колонок при сверке свободный. Строки supplier_id, затем production_line ASC как ASCII с учётом регистра; тексты точны. Числовой допуск ±0.001. Все 9 счётчиков — целые неотрицательные тексты без дробной части/разделителей тысяч; все 6 долей непусты. Для долей дополнительного минимума знаков после точки нет; промежуточного округления нет, авторская запись не добавляет критерия точности.

```csv
supplier_id;production_line;inspected_units;defective_units;critical_units;defective_share;critical_share
S01;L01;3;2;1;0.666666666666667;0.333333333333333
S01;L02;2;1;0;0.5;0
S02;L01;1;0;0;0;0
```

S01/L01: U01 имеет max3 после трёх замечаний (1/3/3), U02 max2, U03 чистое; 3/2/1 и 2/3,1/3. S01/L02: U04 max1 и U05 чистое; 2/1/0 и 1/2,0. S02/L01: чистое U06 сохраняет группу с 1/0/0 и 0,0. Проверены все 21 именованная ячейка, 9 integer texts, 6 долей и полный порядок; колонко-порядок actual export отличается допустимо.

A1 из разрешённого бюджета3 с технической подсказкой завершён CLI exit0; фактически одна попытка. БД подтвердила openai/gpt-6-sol-fast/xhigh, API model gpt-6-sol. За528s:32tools,27Loginom calls,0tool errors,0memory calls. Actual candidate CLI0.0.0-preview-cache; finalizer выполнил только --version, binarySHA совпал с A1 pin. Запрошен service_tier=priority; response_service_tier=NOT_OBSERVED и speed_comparison=NOT_MEASURED, ускорение не заявляется.

Save SUCCEEDED/save_completed=true/workflow_preserved=true/cleanup_complete=true и modified=false. Исходные reopened=false/persisted_content_verified=false сохранены буквально; arrangement.status=attempted/reason=result_unconfirmed/warning=true. Оба ORIGINAL runtime/knowledge Close: ACKtrue/request_error=null/exit0/signal=null; post-A1 idle writer=null/recovery=[].

Root cold открыл точный сохранённый пакет через «Пакеты → Открыть», без Configure/мастеров/перепривязки/Save. Существующая кнопка «Выполнить все» нажата ровно один раз; per-node cold исполнения не заявляются. Две screenshots показывают 6 и 5 зелёных узлов с одной общей группировкой, вместе все10узлов. После единственной парковки появился новый196B CSV на другом inode с mtime после park; все21cells/9integer/6shares/ASC совпали с manual/oracle, CSV побайтно равен CLI export. Server LGP и2raw SHA+stat неизменны, старый CSV сохранён. Close→«Не сохранять», logout, закрытие собственного ownTab[private]/browser2 и idle writer=null/recovery=[] подтверждены. Независимые actual native и cold SPEC+QUALITY reviews APPROVE; cold не переписывает ограничения исходной Save-операции.

scenario_url в provenance выведен из Authoring endpoint, saved package и Info.xml Name=Unit1; отдельное посещение deep link не утверждается. Private detailed финализирован штатно по original A/.case, original6files/form и original A/.case сохранены. Business использует shared accepted detailed reference с source_task/source_provenance без отдельной B attempt/model/session/CLI.

Четыре near-miss на форму: remarks-instead-units группирует также defect_id, давая S01/L01=5/4/2/.8/.4; dropping-clean-units заменяет подтверждённый LEFT на inner, давая S01/L01=2/2/1/1/.5, S01/L02=1/1/0/1/0 и теряя S02/L01; major-is-critical использует >=2, давая S01/L01 critical2/share2/3 при неизменной формуле доли; shares-as-percent умножает обе доли на100. Их expected_failed фиксируют соответствующее зерно/полную базу/доли/result, для major — только unit-defect-grain/result-table. Все oracle=false; полные CSV пересчитаны из2raw точными изменениями временной копии oracle. Редактируются только calibration copies Unit.xml; GUIDs/links и остальные13payloads/BIN сохраняются. Native/cold исполнение mutants не утверждается.

Positive — genuine reference и oracle. Foreign для полной G05 — штатная следующая выбранная отличная аналитическая задача той же формы; D/B этой пары не negatives друг другу. Fresh public SPEC→QUALITY, judged calibration, sole D/B measurements и окончательная приёмка пары pending; live judge здесь не запускался.
