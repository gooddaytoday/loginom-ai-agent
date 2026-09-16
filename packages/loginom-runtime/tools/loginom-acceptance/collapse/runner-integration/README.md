# Collapse runner integration — закрытый допуск

Назначение `node16:acceptance-runner-integration:1:1d6cdc31`.
Изменены только acceptance tooling и экспорт инструментальных ответов.
Handler/source77385e36 и runtime db6d957169c50bcd5cb169db80d744fd846b8ffa4eee683178619c001fb22bab
остались прежними. Это не повторное review и не полная приёмка Node16.

## Выполненная интеграция

`run.py` принимает `--goal collapse-node-complete`. Его preflight выполняется
до auth/config reads, dependency checks и subprocesses, возвращая явный BLOCKED
и все OPEN gates. `--run` отвергается в той же точке. Повторная проверка находится
непосредственно перед потенциальным запуском модели. Никакого switch/JSON receipt,
разрешающего обойти неподдержанный readonly producer, нет.

```sh
python3 tools/loginom-acceptance/run.py --preflight --goal collapse-node-complete --output /tmp/node16-preflight-NEW.json
```

Файл output должен быть новым. Код0 означает, что preflight записан, а не готовность.
Проверять ready=false/status=BLOCKED. Он не использует фиктивный basic-graph/union.
Настоящий --run в этой фазе не выполнялся: отказ проверялся функцией execute с
перехватами авторизации и Popen, которые немедленно провалили бы тест при вызове.

Существующая ветка запуска содержит fixture admission пяти CSV с bytes/SHA,
уникальными именами по run ID и операторскому storage, --input-artifact и исходными
локальными файлами. Goal10cases не менялся; добавлены только конкретные пути/run
identity и названия операций для связи аудита. Frozen template и все fixture hashes
проверяются перед использованием. Сценарий сохраняет negatives, Done/Close/loss,
topology/save/new-session/source-proof, даже когда их live producer ещё отсутствует.

`evidence.export_history(..., retain_raw_tools=True)` включается только Collapse:
к прежним tool metadata добавляется очищенное от известных секретов исходное
содержимое инструментального ответа. Assistant body/reasoning не считываются.
Для остальных целей формат экспорта прежний. Внешний аудитор сверяет raw_content
с тем же разобранным ответом, уникальными call IDs/session/row order и journal.
Это не утверждение, что Hermes state.db сохраняет обе исходные MCP envelope-копии:
байтовый wire budget/transport rehearsal остаётся отдельным candidate gate.

## FULL outer auditor

`collapse_node_acceptance.py RUN_DIR --independent BUNDLE.json` читает request,
evidence и точный scenario из текущего run. Не принимает CASE_PASS или summary
вместо исходных вызовов/ответов/events. Проверяет approved Sol/low, run identity,
source+harness pins, десять полных native cases через независимый case oracle,
public request vs prepared, result vs completed,53loaded functions, binding,
lifecycle и связь byte-verified upload → completed import → native read.

Все десять исходных cases обязательны. Дополнительные обязательные проверки:
no-effect conflict/missing/empty-role, Done/Close без исполнения, original loss
AMBIGUOUS и отсутствие повторного жеста, новые session/document IDs, сохранный
node/port/link graph, save path, пустые reopen parameters/settings/mappings,
полное равенство клеток и readback, readonly server bytes ДО первой записи.
Одно невыполненное условие означает passed/subplan_complete/hermes_acceptance=false.
После будущего model export run.py записывает предварительный collapse-audit.json;
без независимой сессии он обязан быть отрицательным. Финальный аудит запускается
отдельно, когда действительно собраны её исходные свидетельства.

Формат независимого bundle: run_id, origin=independent_codex_session,
evidence={run_id,calls,tools,events}, case_operations (все10keys → реальные IDs),
save_operations, package_paths, graphs (before/after,node/port/link identity,
before_document/after_document,raw_before_ref/raw_after_ref), readonly_sources.
Каждый reopened source проверяется новым import с settings={}, mappings=[];
свёртка — parameters={}, mappings=[]. Сверяются все исходные настройки и данные.
Schema readonly_sources — readonly-source.schema.json. Поля и raw refs — только
интерфейс: нет реализованного/admitted производителя, READONLY_PRODUCER=None.
Формально правильная или подделанная квитанция всегда отклоняется. Аналогично
требуется отдельная привязка native topology/readback и loss evidence bridge;
ни произвольные строки raw refs, ни подготовленные JSON не закрывают эти gates.

Промежуточный gate для loss ожидает реальное наблюдение
collapse_independent_loss_observed с принадлежностью node/operation, native reply
и одинаковым счётчиком до/после отказанного replay/resume. Producer этого события
в модельный runner не добавлен: это OPEN bridge, а не сымитированный успех.
Общие fault-механизмы и observer узла17 не переносились.

## Проверки и ограничения

8 новых unittest (несколько negatives в каждом),13history,2verification export,
4runtime preflight:27 PASS. Дополнительно component replay60cells и6подмен
(cells/events/source SHA/loaded functions/request) отклонены. В component replay
настоящие исторические native данные обёрнуты в СИНТЕТИЧЕСКИЕ пары вызовов только
для тестирования функций; результат явно model_run=false/acceptance=false.
Его нельзя подать как свидетельство текущей модели.

Старый acceptance-kit и correction manifest не переписаны. Поскольку их source
packet закрепляет прежний run.py, старый kit/check.py больше не является проверкой
текущего harness. Это ожидаемая смена версии tooling, не изменение frozen goal
или runtime. Новый harness-pins.json закрепляет текущие файлы, включая транзитивный
native oracle и review-fix pins. Новый check-tooling.py сверяет эти pins, frozen kit
contents и неизменный runtime; не закрывает admission.

OPEN: header-only/empty-ignore/all-null/all-null-ignore, остальные полные live
cases, readonly byte producer, native topology/readback/loss bridge, candidate
stage/readback/rehearsal7.4.2, ресурс6GiB live/10GiB Hermes и coordinator Sol-slot.
На этой фазе остаётся <3GiB: нет новых browser/model/VPS/больших копий.
Кандидат не строился, память/маршрутизация/общий plugin/main не менялись.

Известный точный URI ошибочного memory summary для адресного контроля координатора:
`viking://user/kartamyshev/peers/-Users-kartamyshev-Git-loginom-dock/memories/events/2026/09/13/node_16_acceptance_complete.md`.
Он был выдан actor find в предыдущей подготовке, ошибочно называл приёмку полной.
Вручную память не исправлялась. Подтверждённое состояние: **node16/source77385e36,
kit и runner integration НЕ означают acceptance**, Hermes не запускался.
