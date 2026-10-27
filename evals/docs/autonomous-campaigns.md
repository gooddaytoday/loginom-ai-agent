# Автономные eval-кампании: runbook

Текущие правила завершения — [контракт](../../docs/superpowers/specs/2026-09-18-evals-design.md#завершение-автономной-кампании--2026-10-27).
Этот runbook заменяет операционные инструкции старого
[плана 23.10](../../docs/plans/2026-10-23-autonomous-evals-plan.md).
План и датированные evidence остаются историей; незавершённый LAB-170 этим
изменением не закрывается. Локальная проверка кода не подтверждает установку
на runner, применение инструкций Multica или живую приёмку.

## Постановка и запуск

Кампанию назначать прямо EvalOps. Он выбирает свободный совместимый сервер
по unit, процессам и native reservations, затем закрепляет manifest с
исполнителем, pins, ключами измерений, пределами и ID собственных wakeups.
Manifest и server config хранятся в защищённом каталоге вне Git; секреты
остаются в предусмотренном `tokenFile`/env, а не в комментариях или results.

Команды выполнять из `harnessRoot` принятой поставки (`evals/`). Значения
путей и имя экземпляра брать из действующего server config и manifest;
не переносить их из чужой кампании. В примерах переменные указывают на эти
проверенные абсолютные пути, `campaign_id` равен `manifest.id`.

```sh
bun --no-env-file run script/run-campaign.ts --manifest "$campaign_manifest" --server "$campaign_server" --operation reserve
sudo systemctl enable --now "loginom-eval-campaign@$campaign_id.service"
sudo systemctl status "loginom-eval-campaign@$campaign_id.service"
sudo journalctl -u "loginom-eval-campaign@$campaign_id.service" -n 100 --no-pager
```

Используется существующий [systemd template](../ops/loginom-eval-campaign@.service.in),
настроенный на тот же server config и `stateRoot`. Служба ведёт обычные batches
без LLM: учитывает сохранённые результаты и продолжает только missing.
Quality FAIL не повторяется ради PASS; модели, критерии, pins, бюджет и
исходный срок без прогресса сохраняются. Результаты и cleanup — разные факты:
завершённый batch сам по себе не подтверждает освобождение ресурсов.

## Standing и wakeup инструкции EvalOps

- Штатный прогресс ведёт служба. Не запускать агента и не писать snapshot
  после каждого batch. Для новой кампании достаточно существующих событий
  `blocked`, native failure порученной задачи и periodic fallback **7200 с**.
  Нового scheduler или дополнительного `task.failed`-правила нет. Изменение
  уже действующих правил — отдельная операция установки с read-back.
- При пробуждении сначала сверить journal, unit, процессы и running/queued
  repair/review tasks. Pending retry или действующий ремонт не дублировать.
  Если действий нет, periodic завершить штатным check-in без комментария;
  event — пустым ответом без промежуточных сообщений.
- Если доступен следующий разрешённый шаг, выполнить его. Один `repairing=true`
  или неизменный `blocked` не доказывает, что кто-то продолжает ремонт.
  Технический ремонт не меняет срок без прогресса и не разрешает новые
  измерения после terminal outcome.

Для изменяющего ремонта принять владение штатной командой и сохранить его
до проверки. Не править journal вручную и не обходить cleanup guards:

```sh
bun --no-env-file run script/run-campaign.ts --manifest "$campaign_manifest" --server "$campaign_server" --operation repair --repairer EvalOps
# Диагностика и разрешённое исправление; дождаться завершения своего batch.
bun --no-env-file run script/run-campaign.ts --manifest "$campaign_manifest" --server "$campaign_server" --operation resume --repairer EvalOps
```

После reboot при подтверждённой необходимости новой generation между этими
командами используется `--operation prepare-generation --repairer EvalOps`.
Resume повторно проверяет cleanup и preflight; освобождает только matching
owner. Неизвестное владение или активные чужие ресурсы запрещают takeover.

## Итог и обязательный отдельный ответ EvalRunner

После terminal outcome служба публикует итог **до архива** и читает его
обратно. Полный итог требует всех ключей и подтверждённой очистки;
частичный явно указывает пропуски, причину и неподтверждённые ресурсы.
Этот машинный итог одновременно служит единственным адресным поручением:
`manifest.executor` разрешается через `GET /api/agents` нужного workspace,
единственный ID сохраняется в `journal.executorAgentId` до POST.
Неоднозначное назначение требует ремонта, а не выбора первого агента.

Поручение содержит `<!-- eval-handoff:CAMPAIGN -->`, его ID хранится в
`reportCommentId`. Trigger-preview оставляет вызов только назначенного
исполнителя. После read-back итога служба отключает periodic этой кампании;
событийное правило сохраняется для ремонта доставки и финального ответа.

**Инструкция EvalRunner:** прочитать итог и фактическое состояние доставки;
проверить, не опубликован ли уже собственный ответ, и ответить отдельным
комментарием в ветке поручения (`parent_id=reportCommentId`). Указать число
учтённых/недостающих измерений, PASS/FAIL, cleanup, полный/частичный исход
и доставлен ли архив. Добавить отдельной строкой
`<!-- eval-executor-final:CAMPAIGN -->`, подставив точный ID кампании.
Если архив ещё не доставлен, сообщить это; финальный ответ не должен его
ждать. Не повторять измерения и не создавать второе поручение.

Служба принимает ответ только с `author_type=agent`,
`author_id=executorAgentId`, нужным `parent_id` и точным marker; прочитанный
ID сохраняет в `executorResponseCommentId`. Машинный отчёт ответом EvalRunner
не считается. Повторный tick/restart сначала сверяет marker и сохранённые ID;
потерянный HTTP-ответ не разрешает слепую повторную публикацию.

Архив доставляется независимо существующей службой с download/hash-проверкой.
Ошибка загрузки сохраняет готовый итог и запускает повтор только доставки.
`published=true` и `in_review` выставляются после read-back **обоих** фактов:
проверенного архива и отдельного ответа исполнителя. Тогда отключаются
остальные собственные wakeups из manifest; чужие правила не затрагиваются.
Ошибка отключения повторяется идемпотентно, результат не теряется.

Для одного прохода сверки и незавершённой доставки используется та же команда:

```sh
bun --no-env-file run script/run-campaign.ts --manifest "$campaign_manifest" --server "$campaign_server" --once
```

Старый `published=true` остаётся no-op без требования новых полей.
Исторический внешний partial без нового handoff-marker сохраняет старый
terminal path: admission/наблюдение прекращаются без требования архива с
недоступного хоста. Новые snapshot partial используют сохранённые данные,
локальный snapshot-архив и обычное поручение с обязательным ответом.
Возврат хоста усваивает partial, не возобновляет измерения и не объявляет
очистку подтверждённой без проверки.
