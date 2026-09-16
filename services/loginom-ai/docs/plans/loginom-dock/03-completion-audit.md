# Подплан 03 — итоговая приёмка

8 сентября 2026, 22:49 МСК. Статус: **implemented / live_verified (source runtime)**.
Область — все требования [подплана 03](03-text-import.md), включая общую основу
node.apply. Поставка первого аналитического выпуска V5 и обработчики 04–10
имеют отдельные критерии; этим аудитом они не принимаются.

## Итоговый кандидат

Полный runtime pin83:
`172d0c6bac5a0dc53685d4ef621a554d603facfef6ca7830d40ce4823bd11dd5`.
Профиль: Loginom7.4.2 / macOS / Chromium / ru; явно выбранные account `user`
и storage `/user/dock-p3`. Видимое окно2044×1035, native viewport.
Каталог `2026.09.08-node-apply.1-candidate`, manifest SHA256
`936ef73d933e85bfd8429b8b0f2b515c543ca415a2b22ba57e108232c54ddf44`.
Candidate остаётся staged; production не переключался.

Самостоятельный Hermes `20260908-222819-2e3cc755`, существующая подписка
`openai-codex / gpt-5.6-sol / low`: **30/30 independent checks PASS**.
Frozen audit SHA256:
`bcddd145fd525cedd1bd74b9185eaec27aae44d8c9f2ee46809b489c975f5317`.
Evidence: `.dock/text-import-v3/hermes-runs/20260908-222819-2e3cc755/`.
Пакет: `/user/dock-p3/packages/Dock-acceptance-20260908-222819-2e3cc755.lgp`.
Оба выхода6×5; после открытия выполнен тот же узел с settings={} и mappings=[].
Настройки/readback, bytes/SHA, mapping, новые execution IDs, два сохранения,
реальная подготовка открытого пакета и полнота public calls проверены отдельно.

После этого исправлен только диагностический verifier восстановления: он теперь
проверяет добавленную фазу workflow, сохраняя старую схему исторических журналов.
Все138 исходников первоначального harness сохранены и проверены по SHA в
`frozen-harness/`. `current-audit-crosscheck.json` подтверждает совпадение всех28
сценарных проверок с frozen verdict, неизменность runtime и исходного harness.
Дополнительные проверки отмены ниже выполнены на том же runtime83.
Предыдущие четыре неуспешные автономные попытки не переписаны и не засчитаны.

## Проверка каждого обязательства

Пути прогонов ниже относятся к `.dock/text-import-v3/`. Компонентные результаты
принадлежат указанным в их отчётах фиксированным исходникам; они не объявляются
повторными прогонами текущего runtime. Новая проекция readback не меняет UI-драйверы.

| Требование | Проверенное свидетельство | Вывод и граница |
|---|---|---|
| Общая основа1: валидация, gate, add/find/connect, первое открытие, dispatcher, фазы | `remote-readback-20260908-222113-70a0533e/operator-components-audit.json`; Hermes30/30; принятый драйвер02; текущие node.apply/runtime tests | Полный локальный вызов; внутри нет модели и второго внешнего executor. Графовый драйвер02 переиспользован |
| Основа2: поля, порядок, исключение, имена, mapping, autosync | Hermes Price/Цена первым; `execute-1788887985822/batch-mapping-audit.json`,8 negatives; `done-1788887237430/port-deactivation-audit.json`,7 negatives | Связи source/target проверяются native identity. Для обязательного выхода imports.text исключение задаётся columns.used=false; unsupported mapping exclusion отвергается до UI |
| Основа2: отдельный мастер порта в одной node.apply | `done-1788891175743/single-apply-audit.json`,5 negatives; `save-continuation-audit.json`,5 negatives | Промежуточный Done→порт→graph Execute→3×2; без повторного открытия мастера узла. Private fixture подтверждает общую основу, не готовность публичного Калькулятора |
| Основа3: Close/Done/Execute | `close-1788881029732/independent-existing-close-audit.json`,8 negative cases; отдельные Done-проверки; текущий Hermes Execute; shell46 PASS | Close отменяет черновик, Done не запускает, Execute связан с новым процессом; readback применённых настроек отсутствует при Close |
| Основа4: свежий выход, пагинация, точность, ноль строк | Hermes6×5; `execute-1788881313848/independent-wide-output-audit.json`:66 полей/132 значения; mode matrix empty; replacement large integers | Полный малый выход, адресное чтение всех страниц UI, integer сохраняется строкой, real — в проверенном полноточном формате. Null и пустая строка различаются |
| Основа4: долгий worker, status/wait без нового запуска | Hermes running/wait/settled; текущие async cancellation runs; node-operation-runner/API tests | ID сохраняется; таймаут наблюдения не завершает worker и не повторяет Execute |
| Основа5: доставка, путь, конфликт, SHA/size | Текущие remote/Hermes delivery audits; `done-1788869311492` reject и `done-1788869368492` replace; `execute-1788869178263` lost replies | Один локальный transfer сохраняет grant/upload/verify identity; путь сам по себе не доказывает байты |
| Основа5/7: явное продолжение доставки и потеря документа | `execute-1788869725278`, `execute-1788869799702` delivery audits; `done-1788869898408/independent-loss-audit.json` | Подтверждённые ответы используются без повторной передачи; утраченный документ отвергается, не восстанавливается из журнала |
| Основа6: локальный checkpoint, intermediate/final save, reopen | Remote222113 и Hermes222819 persistence/public audits; `done-1788891175743/save-continuation-audit.json` | Local checkpoint отделён от серверного файла; после intermediate можно продолжить тот же workflow, final пакет открыт и заново выполнен без перенастройки |
| Основа7: cancel/inspect/resume после настройки | `execute-1788895997843/independent-current-cancel-audit.json` | Полный pin83, тот же node/operation, fresh3×3, readback PASS, status/replay без browser calls |
| Основа7: cancel после запуска, без второго Execute | `execute-1788896235443/independent-current-cancel-audit.json` | Полный pin83; возобновлено ожидание существующего execution, output3×3 и readback PASS |
| Основа7: изменённый черновик не разрешает продолжение | `execute-1788896364214/independent-current-refusal-audit.json`; `execute-1788876971222/workflow-recovery-audit.json` и10 negatives | Изменённый Null-маркер отвергнут до выполнения; поздняя квитанция workflow сверяется с исходной операцией и документом |
| Основа7: настоящий stop и освобождение управления | `process-stop-1788892494212/independent-stop-driver-audit.json`, runtime82,7 negatives; текущие node-operation-runner, node API и runtime stop tests | Общий драйвер остановил уникальный собственный child среди зависимостей одним cancel, upstream остался completed; replay0 новых шагов. Привязка API к этому драйверу проверена отдельно; автономный stop не объявляется частью sales-прогона |
| Обработчик1: UI, Help и E2E до реализации | История [text-import-node](../../loginom-dock/text-import-node.md), native source/MCP observations, закреплённые Help/E2E пути в подплане | Источник, формат, field editor, порт, окончания и Table исследованы в реальном Loginom; mocks не заменяют эти наблюдения |
| Обработчик2: источник/формат/тип/вид | `mode-matrix-20260908-native-skill-fix/reports.json`:8 source/output PASS; текущий Hermes | UTF8, Windows1251/1252, UTF16LE/BE, TSV/decimal comma/skip2, headerless, Boolean/DateTime, empty; live-прогоны закреплены полными pin81 |
| Обработчик3: свойства конкретных полей и новые схемы | `execute-1788893151897/independent-replacement-output-audit.json` и12 negatives; partial existing/Close audits | CSV→TSV, перестановка и новое Extra; незапрошенные свойства сохранены по имени, большие integer точны |
| Обработчик4: mapping, полный вызов, existing preservation | Remote222113 и Hermes222819, обе raw-readback проверки | Mapping проверен до выполнения, обычный путь не открывает мастер повторно. После reopen сохранность проверена пустым patch и новым выходом |
| Обработчик5: карточка/контракт/verifiers/legacy | Candidate `dock_action_describe` и `dock_node_apply`, node-result-schema/types, native skill; клиентские и Python suites | Полный обработчик доступен в source-кандидате, legacy actions сохраняют свои семантики. Допуск production release-set относится к V5 |
| Условия ожидания и ошибки | Semantic condition/epoch suites; `execute-1788892659203/independent-source-error-audit.json`,9 negatives; source/path/format validation tests | Отдельные bounded budgets и guards; missing file даёт принадлежащую узлу ошибку до Execute/Done; недопустимые параметры отвергаются до UI. Возможный эффект не повторяется |
| Неверные данные | `execute-1788893263296/independent-invalid-values-audit.json`,5 negatives | Неверные integer/real литералы дали Null, остальные значения сохранены; это не универсальное исправление данных |
| Независимый аудит и отрицательные проверки | Hermes30/30; remote components PASS;7 live readback negatives; source pin83; Python387 PASS | Все публичные сведения сопоставлены с raw observations/фазами; подмена node, mapping, полей, source, receipt и ложная persistence не принимаются |
| Экономия контекста и измерения | Hermes `evidence.json` efficiency и `timing-summary.json` | 15 public calls,16 model API calls; измерены20 локальных фаз. Между сообщениями задачи236.688с; ходы модели171.214с, включая сеть/оркестрацию, не изолированное время inference |

Индекс27 повторно прочитанных отчётов с SHA256 сохранён в
`.dock/text-import-v3/subplan03-completion-evidence-index.json`. Он связывает
артефакты с этой ручной проверкой требований и не заменяет независимые verifiers.

## Проверки и ограничения

Перед коммитом 9 сентября 2026 повторены полные проверки: client — 1031 PASS,
1 SKIP, 0 FAIL; Python — 387 PASS. Текущий runtime из 83 файлов совпал с pin
успешной приёмки Hermes; SHA256 сохранённого итогового аудита также совпал.
В коммит отобраны исходники, воспроизводимые средства проверки и документация;
приватные конфигурации и результаты прогонов в `.dock/` исключены.

Полный client suite:1029 PASS/1 SKIP; после добавления двух проверок проекции
повторён затронутый shell suite:46 PASS. Полный Python suite после коррекции
workflow verifier:387 PASS. Целевые diff checks прошли. Новых изменений runtime
после успешного Hermes нет; все диагностические процессы завершены.

Токены Hermes: input96430, output3605, total579139, cache_read479104,
reasoning824. Это сообщённые провайдером пересекающиеся счётчики; их не суммировать.

Поддержаны delimited CSV/TSV и явно объявленные режимы/границы валидатора.
Публичный обработчик других аналитических типов этим подпланом не поставляется.
Inclusion ранее исключённого поля через standalone mapping пока не поддержан;
обязательные выходы текстового импорта регулируются used. DateTime не получает
выдуманный timezone, а ограничения представления строк/дат указаны в результате.
Excel исключён по целевому Linux-серверу. Неподдержанные режимы не объявляются
готовыми handlers. Published клиент, production-каталог и V5 этим завершением
не обновлены: **live_verified не означает released**.
