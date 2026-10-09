# Сохранённые отказы CLI scenario-modify49

Read-only разбор подтвердил, что во всех трёх попытках второй CLI-ход
открывал сохранённый пакет с пометкой «только чтение». Кейс не принят;
точная native причина и владелец writer lock пока не установлены.
Продукт, исходный сервер и текущие A/B условия не менялись.

Источник: private `package-docs-20261006/openai-49-cli-scenario-modify-v2-20261008`.
Результат: `scenario-modify-49-readonly-review-20261009/review.json`;
21 file occurrence проверен по SHA256, включая внутренние execution journals.
Новых model/Loginom/judge calls0. Смешанные журналы второго хода содержат
также сохранённый первый ход; prepared events сопоставлены с исходным
именем journal, чтобы повторную копию первого хода не считать новым prepare.

Первый ход: новый draft, ownership_verified=true. Второй ход:
created_draft=false/ownership_verified=false, другой document_id,
navigation label содержит «только чтение». Это наблюдение UI и runtime state,
а не доказательство принадлежности блокировки конкретному клиенту.
Во всех3 есть UNKNOWN_PREPARED_WORKFLOW при попытке передать existing_workflow
без reference, выданного текущим runtime. Попытки1/3 затем дошли до калькулятора
и получили NODE_APPLY_STOPPED: active source output required; mutation не выполнена.
В3 также REQUEST_REJECTED у node_read из-за отсутствия completed local operation.
Нет доказательства, что устранение любого одного из этих симптомов закроет кейс.

Следующая native проверка после освобождения собственного A/B стенда:
наблюдать штатное закрытие пакета/logout первого CLI-хода и состояние exact own
пакета перед вторым ходом в свежей изолированной acceptance. Не перезапускать
сервер между пользовательскими ходами ради прохождения; не удалять неизвестные
locks и не ослаблять guards ownership/active-source. Исправлять продукт только
после подтверждения причины, через отдельный RED→GREEN и новый candidate.
Дальнейшие изменения кандидата должны учитываться в A/B условиях и приёмке;
текущие frozen бинарники не редактировать на месте.

## Штатное завершение: проверка исходников candidate49

`runtime/client/lib/bridge.mjs` и `runtime/src/managed-entry.mjs` текущего
checkout побитово совпали с сохранённым CLI49; SHA закреплены в private
`scenario-modify-49-shutdown-source-review-20261009/review.json`.
Bridge явно закрывает пакет и выполняет logout только в ветке
`acceptanceCleanupPackage`; supervisor отмечает этот параметр как test-only.
Штатный close закрывает MCP/браузерные транспорты, managed runtime ожидает
закрытия handles, supervisor требует acknowledgement и нормального выхода.

Это отдельные контракты. Успешный процессный close не является receipt
закрытия серверного пакета/logout. Из статического кода также нельзя вывести,
что сервер обязательно удерживает блокировку после закрытия браузера:
фактическое освобождение сессии и writer нужно наблюдать на стенде.
Причина исторического readonly остаётся UNKNOWN; новых native/model/judge
вызовов и изменений продукта0. В следующей native проверке не подставлять
acceptance-only cleanup вместо штатного завершения первого CLI-хода — это
могло бы скрыть исследуемое поведение.

## Минимальная локальная проверка штатного CLI49 close

Новый own пакет `/user/skills-shutdown-lock-d48e-20261009.lgp` создан
из пустого draft, сохранён через `package.save_checkpoint`; испытуемый
installed CLI49 и ресурсы не менялись. Первый CLI завершён штатно, второй
CLI с тем же own profile открывает этот путь. Обоим exit0/guarded=false,
дочерних процессов0. Second prepare содержит native navigation label
«только чтение». Ошибка воспроизвелась без узлов/вычислений/живой модели.

Prepare выставляет `ownership_verified` только для intent `new_draft`.
Поэтому false при `open_package` не является самостоятельным доказательством
readonly; в этой проверке доказательство — фактическая native пометка.
Штатное закрытие server package/logout по-прежнему UNVERIFIED.
ID конкретной retained серверной сессии/исторического writer не прочитан.

Private `cli-normal-shutdown-observation-20261009`, readback12files SHA
`1db17497827532580fd07231a52648dede044e10864b79c69a1a288cfb3898a9`.
Физический пустой `.lgp`5070bytes также сохранён отдельно.
Source CLI binary SHA неизменен; собственный server/client ID и исходные
server/client ID/StartedAt проверены. Server reset, foreign locks, old
raw incomplete v9 profiles и acceptance-only cleanup здесь не применялись.

## Контроль с подтверждённым native закрытием

Отдельный own пустой пакет `/user/skills-shutdown-control-d48e-20261009.lgp`
создан тем же installed runtime49 через публичный private supervisor.
В этом **диагностическом контроле**, а не product CLI, использован существующий
acceptance-only `acceptanceCleanupPackage`: exact clean package close/logout
SUCCEEDED, discard=false. Новый независимый браузер открыл тот же путь
с native `ReadOnly=false/running=false`, затем exact own view close/logout
SUCCEEDED, discard=false/remaining0. Model/judge calls0; сервер не сбрасывался.

Readback13files SHA
`fcd7dedb0e89a09e99ac472cb5a8d3b9e2896dd6eb844a553e7b86976c1abde0`,
private `native-shutdown-explicit-control-20261009`. Первый запуск driver под
Bun был отклонён до native dispatch: `verifyResources` требует реальную
pinned Node version. Этот PREFLIGHT_REJECTED сохранён отдельно; валидный
контроль выполнен собранным Node driver под установленным Node24.19.0.
Validator и runtime не менялись.

Наблюдения подтверждают различие между процессным завершением и server
package release для минимального сохранённого пакета. Они не доказывают,
что устранение этого различия закроет также active-source/unknown-workflow
ошибки прежних model-driven modify3. Эти кейсы потребуют новой приёмки.

[Справка Loginom](https://help.loginom.ru/userguide/admin/parameters/connection-parameters.html)
описывает удержание сессии после разрыва связи и возможные блокировки при
отключённой проверке соединения. Настройки данного сервера не выводятся из
значений документации по умолчанию. Минимальный дизайн product исправления:
[закрытие чистого сохранённого пакета](../../../superpowers/specs/2026-10-09-clean-saved-package-shutdown.md).

## Защита native tab перед закрытием: Task1 выполнен

TDD: missing tab RED (SUCCEEDED вместо BLOCKED) → GREEN; отдельный
race после server dirty read также RED → GREEN. Exact preparation receipt
теперь связывается с native packageNode и attached tab исходного tabTid;
проверка повторяется после await. Foreign package/tab и смена ID отклоняются
до close/logout. Узкие package-cleanup + bridge suites:23 PASS/0 FAIL, exit0.

Native source-only контроль `native-tab-guard-control-20261009` на installed49
browser: неверный tabId BLOCKED/TAB_IDENTITY_CHANGED, пакет остаётся открыт;
правильный tab затем close/logout SUCCEEDED, discard=false/remaining0.
Model/judge calls0. Readback7 public files SHA
`3aa2fda4d9b1cbb1f0c124af80f8c3a5d9554699155d50dab4e1946e9146c810`;
browser/auth исключены. Новый helper SHA
`bb8183e7e52af8a71c53e439c58b18ddcaacdbd7d468ae48ec1301f694945a1e`.
Это не installed приёмка новой сборки. Дизайн review Approved;
штатный product user-v1 cleanup (Task2) ещё не реализован.

## Штатный user-v1 shutdown: Task2 source выполнен

Product path выбирается из одного подтверждённого save path собственного
bridge. Существующая native процедура проверяет свежий dirty state,
account/document/package/tab identity и quiescence. Full unsettled work,
clipboard uncertainty и leases проверяются до и внутри browser gate.
При native refusal/потере/невалидном ответе browser close продолжается;
при ошибке evidence возвращается BLOCKED/CLEANUP_EVIDENCE_UNCONFIRMED.
Acceptance-only strict refusal сохранён. No-save/multiple paths не вызывают
native cleanup; product не устанавливает acceptanceCleanupPackage.

TDD: product-success RED ENOENT → GREEN; retained unsettled RED SUCCEEDED
→ GREEN; native refusal RED missing returned receipt → GREEN; реальный
package-cleanup.json EISDIR RED rejection → GREEN. Отдельные gate-state,
execution-journal EISDIR, no-save/multiple paths/busy/native-error/malformed
regressions PASS. Lifecycle18/18, native helper22/22, wrapper1 PASS.
Product fixture использует replayBootstrap=false/replayLoginUser=null,
account из workspace preparation. Repeated close idempotent.

Первый полный suite:2563 PASS/1 FAIL/10 SKIP, exit1/190788ms; причина —
ошибочная fixture с включённым test-login без account. Исходный отказ сохранён.
После исправления только fixture полный pinned Node24.19.0 suite:
2574 tests/2564 PASS/10 SKIP/0 FAIL, exit0/192185ms.
Команда из client/: `node --test test/*.test.mjs`. У JS runtime отсутствует
отдельный typecheck script; TypeScript/public IPC не менялись.
Readback24 TDD/test/cleanup files SHA
`0fb80a1aeab9965ebe4754d1e776933af5670e651d328a780deb51c525da4c85`.
Own EISDIR tmp fixture удалена, process refs0/denied3 явно сохранены,
receipt42a0688cfb…; первая проверка отказала из-за self-containing shell command.

Новых model/judge calls0. Installed CLI/Desktop нового snapshot ещё не собраны;
Task3/native writable reopen и полная матрица pending. V9 hang этим не исправлен.
