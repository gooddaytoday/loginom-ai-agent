# Evaler: оркестрация узловых eval

Контракт v1, 2026-10-07. Один принятый узел — одна подготовленная владельцем карточка проекта «Loginom node evals», назначенная squad «Eval узлов Loginom». Evaler ведёт готовое назначение до независимой приёмки. Пилот — следующая подготовленная карточка; LAB-16 не перезапускается при внедрении.

## Роли, настройки и источники

| Агент | Роль | Checkout |
| --- | --- | --- |
| Evaler | Лидер: допуск, последовательная передача работы, проверка доказательств и статусы | `R/checkouts/evaler/loginom-ai-agent` |
| Rich | Автор: кейсы, независимые ожидаемые значения, reference, код проверки и исправления | `R/checkouts/rich/loginom-ai-agent` |
| Ben | Независимая приёмка frozen SHA; код автора не исправляет | `R/checkouts/ben/loginom-ai-agent` |

`R=/home/user/.local/share/loginom-evals-runtime`, сервер `10.200.13.152`, пользователь службы `user`. Все три агента: Codex runtime `eval-tests`, `gpt-6.1-sol/xhigh`, concurrency=1. Daemon сохраняет общий лимит 1, без auto-update/reload. Squad содержит ровно этих трёх агентов; leader_id указывает на существующего Evaler. Role labels являются описанием roster, а маршрутизация определяется leader_id.

Evaler имеет собственные checkout и `R/roles/evaler/work`, shell/Git, штатный Multica CLI и OpenViking. Его memory adapter получает путь собственного checkout и автоматически выводит Peer; scope — actor, глобальный Peer не задаётся. CLI reference/eval-профили и Playwright MCP принадлежат только Rich/Ben. Generated task CODEX_HOME сохраняется; общая home вместо него не подставляется.

Источники решения: актуальное назначение владельца и применимые AGENTS.md → принятая карточка узла и зафиксированный checkout → текущий runtime runbook и этот контракт → проверенные evidence → исторический OpenViking. При противоречии критериям или общим контрактам Evaler сообщает владельцу точное расхождение. Memory не является состоянием очереди и не подтверждает фактическую готовность. При недоступности memory выполнить установленную read-only диагностику, затем сообщить BLOCKED.

Исходный продуктовый пин: CLI source `904f7f85bf5450cbbfd48360d7dd9c483401face`, `R/cli-904f7f85/bin/loginom-ai-agent-cli`. Принятый до внедрения срез harness — `63a19e902786b1528edaab5878bb079842cad97b`; новые принимаемые изменения фиксируются отдельным SHA. Модели по умолчанию: reference-builder `openai/gpt-6.1-sol/xhigh`, оцениваемый Loginom AI `openai/gpt-6-sol/default`. Назначение другого эксперимента, в том числе аналитического, не меняет эти defaults. Фактические модели каждой попытки подтверждаются по собственной архивной БД с учётом WAL/SHM; приватная БД не публикуется.

Каноническое окружение и способы холодного запуска описаны в [runtime runbook](2026-10-07-eval-tests-runtime.md), [node eval](node-evals.md) и установленном `R/support/COLD-RERUN.md`. Наличие установленных файлов и старых PASS не заменяет допуск нового исполнения.

## Состояние одной карточки

Карточка остаётся назначенной squad; смена assignee может отменить задачи. Evaler не создаёт карточки, дочерние карточки приёмки, autopilot или расписания и не выбирает следующий узел. Полномочие менять status есть только у лидера на карточке, фактически назначенной этому squad. При упоминании на чужой карточке Evaler читает контекст и сообщает ограничение без смены assignee/status.

В первом поручении фиксируются принятый узел/подплан, case IDs, возможности настройки/перенастройки, входы, кодовые обязательные проверки, base SHA, установленный CLI SHA/version, endpoint/container ID, runtime, модели и timeout. Без этих условий модельные действия не начинаются. Новые узлы требуют реализации поддерживающего валидатора и негативных тестов: список поддержанных case IDs определяется `evals/src/node-cases.ts` назначенного checkout, а неизвестный required ID должен давать ERROR.

Текущее состояние хранится в metadata `evaler.state` этой же карточки; проверенная comment/task history подтверждает его. Пишет его только Evaler. Использовать короткий блок `EVALER_STATE` вместе с каждым существенным решением:

```json
{
  "issue_id": "<current issue UUID>",
  "phase": "rich",
  "base_sha": "<full base SHA>",
  "frozen_sha": null,
  "delivery_sha": null,
  "executor": "Rich",
  "review_cycle": 0,
  "reject_count": 0,
  "processed_report_ids": [],
  "last_dispatch": null
}
```

Фазы: `admission`, `rich`, `ben`, `in_review`, `blocked`. Эти названия описывают протокол комментариев, а не новые статусы Multica. Перед отправкой используется один стабильный intent ID; предложенное состояние с ambiguous intent записывается в metadata до routed поручения. Его фактический comment ID, task ID и trigger_outcomes берутся из ответа CLI/readback и сохраняются в metadata после публикации, без второго комментария. На следующем ходе сверить metadata с реально опубликованным поручением и tasks перед report. Private task files служат cache; новое состояние не объявляется подтверждённым по одному локальному файлу.

`script/evaler-handoff.ts <input.json>` — чистый offline gate: возвращает предложенное state/action и не пишет карточку/файлы, не вызывает модель, Multica или валидатор evidence. Его вход состоит из state, одного события dispatch/receipt/report и observed pending_tasks. Подтверждённый evidence receipt передаётся лишь после реальной проверки manifest/SHA/кода/cleanup; необработанные утверждения worker не подставляются как `confirmed`. Выход `dispatch` разрешает один routed mention, `ready_to_dispatch` требует отдельного dispatch шага, `no_action` завершает повторный ход, `blocked` останавливает передачу, `in_review` означает итоговую передачу человеку. Пример и команды — [операторская инструкция](evaler/operations.md).

На каждом пробуждении сначала прочитать карточку и ограниченный roots scan, затем относящиеся к текущему этапу threads. Сопоставить reply parent, автора, issue, этап, SHA и задачу с подтверждённым поручением. Состояние не восстанавливать из одной произвольной последней заметки. Уже обработанный ответ, ACK, старый SHA или дублирующий trigger не запускают работника заново. Незавершённое либо неоднозначное поручение сначала проверяется по существующим comments/tasks.

## Нативная передача и завершение хода

Маршрутизация выполняется одним routed mention реального агента в комментарии этой карточки. Перед использованием проверить актуальный roster. Текущие ID:

- Evaler: `de4ba430-2182-4085-a148-fa4a3fc8a6f5`.
- Rich: `edc52e36-a965-4f93-9118-6fa5640840b4`.
- Ben: `99804e93-d241-45f2-872d-8a1e16ec7f3d`.
- Squad: `1ea03453-9bbb-4229-adb5-2e301896240e`.

Пример Rich: `[@Rich](mention://agent/edc52e36-a965-4f93-9118-6fa5640840b4)`. Обычный текст `@Rich` работу не запускает. В одном ходе Evaler поручает работу ровно одному исполнителю, проверяет ответ и завершает ход; ожидание работника внутри единственного runtime-слота запрещено.

Публикация поручений и результатов:

```sh
multica issue comment add <current-issue-id> \
  --content-file <nonsecret-comment-file> --parent <current-trigger-comment-id> --output json
```

Если assignment-trigger не имеет комментария, `--parent` опускается; существующий parent не подменяется новым root. `queued`, `coalesced`, `deferred` в `trigger_outcomes` означают принятую передачу — повторный комментарий не нужен. `blocked` требует проверки live UUID/runtime/invoke gate; права не расширяются автоматически. После неоднозначного сетевого ответа читать существующие comments/tasks до возможного повтора. Не редактировать или удалять активное поручение: такие изменения могут отменить выполняющуюся задачу; корректировку добавлять в thread.

Rich/Ben публикуют ровно один итоговый обычный комментарий с текущим `--parent`, без `/note` и без routed mentions, затем завершают ход. Итоговый текст в интерфейсе Codex не заменяет комментарий. Такой ответ автоматически будит назначенного лидера; если он ещё работает, Multica доставляет follow-up после завершения. Промежуточные комментарии работников, включая `/note`, запрещены: это сохраняет generated task правило одного доставленного ответа. Прямой Rich↔Ben handoff отсутствует.

Evaler фиксирует `squad activity` только для текущей карточки своего leader task. Успешный `no_action` означает немедленное завершение без последующих комментариев. Если запись activity отклонена, короткий fallback-комментарий допустим только при отсутствии уже опубликованного комментария в этом ходе. На action-пути поручение уже содержит объяснение решения. [Первичный контракт Multica](https://github.com/multica-ai/multica/blob/main/server/internal/service/builtin_skills/multica-platform/references/squads.md).

## Авторство, frozen SHA и независимая приёмка

При допуске назначенной карточки Evaler ставит `in_progress`. Rich работает в своём checkout и профилях, сохраняет чужие изменения, выполняет соответствующие unit/typecheck, reference, cold и один fresh node run каждого назначенного кейса. Кейсы создаются в `evals/tasks/node-evals/<id>/`; незаконченные черновики остаются вне загружаемого tasks каталога. Формат task.json и общий механизм судьи не меняются. Тестируемому агенту передаются только задание и текущий входной CSV.

Для авторского reference-builder сохраняется предел разового skill: максимум три попытки подготовки эталона на кейс, с сохранением всех попыток/подсказок и неизменным независимым oracle. Это отдельный авторский бюджет и не разрешает повтор fresh product eval, repeat которого остаётся 1.

`READY_FOR_BEN` включает полный чистый commit SHA, подтверждение доступности SHA в remote без force-push, case IDs, точные команды, versions/CLI SHA, actual model evidence, unit/typecheck, негативные проверки, reference provenance/cold, product verdict, cleanup и доставленное evidence-вложение. Вложение содержит безопасные relative paths, внешний SHA256 и внутренний manifest; секреты, profiles, история и raw operator logs исключаются. Runtime-local путь не считается доставкой.

Evaler проверяет manifest, clean SHA, комплектность и отсутствие инфраструктурного ERROR/unknown cleanup. При подтверждённой очистке недостающее вложение/manifest возвращается Rich для доставки уже созданных материалов того же `delivery_sha`, без нового quality run и без Ben REJECT. Повторная неполная доставка требует владельца. Неизвестная очистка или ERROR блокируют переход сразу. Два счётчика не смешиваются: review_cycle увеличивается при первом принятом receipt передачи Ben, reject_count — только при свежем VERDICT_BEN=REJECT. Принятый receipt нельзя понизить или перепривязать; противоречивый поздний receipt требует readback, сохраняя подтверждённую передачу.

Ben получает exact frozen SHA, prompt и input CSV. До открытия авторских task checklist, SPEC, oracle, reference или результатов он сохраняет собственный воспроизводимый расчёт и его SHA256. Далее в своём detached checkout проверяет полученный SHA, authored evidence и эталоны, выполняет обязательные негативные тесты, cold reference и один свежий прогон каждого кейса. Ben не редактирует принимаемый код, oracle или общий reference; чувствительность проверяет на собственных копиях/fixtures. Изменённый Rich SHA требует новой независимой приёмки.

CrossTable негативные проверки включают неверный агрегат, режим категорий, значение CSV, заменённый узел, пропущенный первый расчёт и отсутствующий артефакт; также сохраняются регрессии доказательства создания и раннего avg до завершения sum/read. Cold reconfigure подтверждает лишь сохранённый avg; историю sum→avg проверяет свежий eval/events validator.

`VERDICT_BEN` содержит `ACCEPT`, `REJECT` или `BLOCKED`, полный SHA, ссылки на независимый расчёт и evidence с manifest, выполненные команды, обязательные проверки, actual models, product verdict и cleanup. Evaler сверяет исходные результаты offline существующими командами, включая `check-node-run.ts`, без модельного запуска и переписывания summary/code-verdict. Полученные ранее измерения сохраняются.

Качество eval (`ACCEPT/REJECT/BLOCKED`) и результат продукта (`PASS/FAIL/ERROR`) учитываются отдельно. Product FAIL с подтверждённой очисткой совместим с ACCEPT качества измерения. Node runner фиксирует `--skip-judge` и repeat=1; generic summary с null pass/oracle и exit 0 не доказывает PASS. Оценку даёт code-verdict. Судья, калибровка, baseline аналитического корпуса и повторы ради PASS в назначение Evaler не входят. Единственный штатный infra retry harness сохраняется с первоначальными и итоговыми evidence; внешнего retry-цикла нет.

После первого REJECT Evaler передаёт Rich точные замечания. После двух последовательных Ben REJECT — `in_review`, `OWNER_ACTION_REQUIRED`, список оставшихся проблем и SHA обоих решений; автоматический цикл прекращается. После ACCEPT и проверки evidence — `in_review`, итог качества, измеренные product результаты и ограничения. `done`, merge и release выполняет человек. Инфраструктурный сбой или неизвестная очистка — `blocked` с конкретной причиной и безопасным checkpoint.

## Общий lease и штатное восстановление

Блокировки отдельных CLI-профилей не защищают общий Loginom. Использовать `script/node-eval-ops.ts` из собственного frozen checkout и установленный несекретный `R/operations/node-eval-ops.json`. Persistent lease вне checkout и профилей связывает issue, task, worker, phase, SHA, endpoint и container ID. Один lease исполнителя охватывает последовательную работу unit→reference→cold→live→cleanup и сохраняется между отдельными инструментальными вызовами, включая Playwright MCP. Evaler не удерживает его, пока работник ждёт единственный runtime-слот.

Допуск и операции помощника приведены в [операторской инструкции](evaler/operations.md). Перед unit fixtures, reference, cold или live исполнитель приобретает lease без ожидания. При занятости сообщает владельца/этап без приватных данных и завершает ход. Мёртвый PID, elapsed time или статус завершения Multica сами по себе не освобождают ресурс. Release требует совпадающего receipt и code evidence, отсутствия собственных/посторонних связанных процессов, профильной очистки/архивирования и чистого выделенного stand. Неуспех сохраняет lease.

Ручной оператор на том же endpoint использует этот же lease. Это координация доверенных исполнителей; штатные проверки внешнего debugger и процессов harness продолжают работать. Unit fixtures и live не запускаются одновременно.

Разрешённое восстановление — read-only диагностика, повтор немодельного допуска и адресный recovery доказанно собственного profile/процессов/файлов по имеющемуся evidence. Evaler поручает его тому же владельцу; helper допускает одну попытку для исходного lease, независимо от переименования incident ID. Никакой передачи lease другому агенту или автоматического steal. Неизвестная принадлежность, неполное evidence или исчерпанная попытка требуют владельца-человека. После SETTLED помощник выдаёт отдельный recovery completion для проверяемого release; исходный product FAIL/ERROR сохраняется, новый quality run автоматически не разрешается.

Изменения CLI/model/credentials/VPN/системной установки/общих контрактов harness/критериев приёмки передаются владельцу. Не запускать старые installer/setup/import-auth или широкое kill/rm по имени. Секреты и полный env не выводятся в git, сообщения, evidence или args.

## Внедрение и проверка

Готовые личные инструкции — [Evaler](evaler/evaler.md), [Rich](evaler/rich.md), [Ben](evaler/ben.md); [squad instructions](evaler/squad.md) получает только лидер. Эти материалы заменяют оперативные правила прежнего Rich-leader/manual handoff, прежние Rich↔Ben mentions, управление статусами Rich и старые runtime paths; historical attachments и результаты сохраняются неизменными. Методика узлового кейса — самостоятельный `loginom-node-eval-case` (runtime `R/support/node-eval-skill-v1.0.3/loginom-node-eval-case/SKILL.md`, исходник `evals/skills/loginom-node-eval-case/SKILL.md`). Исходные node acceptance сохраняются; роль, lease/recovery и handoff определяются этим контрактом. Старый аналитический skill не требуется для node workflow.

До изменения проверить отсутствие active/queued работ на runtime и pending stand cleanup. Изменить существующие агенты/squad без запуска карточек. Readback должен подтвердить ровно 3 members, Evaler leader, runtime/model/xhigh/concurrency и совпадение актуальных инструкций; приватные MCP env не печатать. Operational supplement публикуется как новый immutable архив с manifest, а не перепаковка прежнего support/evidence. LAB-16 остаётся исторической карточкой без перезапуска.

Проверки кода: lease разных профилей, занятой ресурс без ожидания, неверный owner, crash без expiry, неизвестная очистка, однократный recovery, offline check без записи результатов/модельной сессии; затем `bun test` и `bun typecheck` из evals/. Пилот следующей карточки проверяет фактическую цепочку Evaler→Rich→Ben→Evaler, trigger_outcomes, единственный слот, версии/model, независимую приёмку и итог in_review. До пилота статус реализации — «настроено и проверено статически»; полный цикл не объявляется проверенным.

Краткий resumption checkpoint — [evaler/checkpoint.md](evaler/checkpoint.md), максимум 20 строк. После внедрения заполнить только реально подтверждённые SHA, receipts и ограничения; будущий пилот не отмечать как выполненный.
