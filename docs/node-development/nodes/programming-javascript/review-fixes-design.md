# Исправления JavaScript после ревью — 2026-10-05

## Объём и исходное состояние

Пользователь поручил исправить все девять дефектов ревью `origin/node-javascript`.
Исходный commit: `6f6a66eb62c78ab2e8b10cd1bd7f38bcf931d8d6`.
Canonical история обучения остаётся в `origin/javascript` (`399bb8b5898`).
Рабочая ветка исправлений: `javascript-fixes`; историческая acceptance не
подменяется результатами новых source/fixture проверок.

## Решения

1. **Save без operation_id.** Tracker принимает выданный executor ID, но
   подтверждает только Save, первоначально допущенный через эту bridge-сессию.
   Связываются action key, path и подготовленный document, а не model owner.
2. **Save после inspection.** Реестр первоначальных Save admissions хранит
   последовательность до dispatch. Подтверждённый вложенный `output.outcome`
   принимается только для exact operation ID/action/path/document и resolved
   inspection с подтверждённой cleanup. Более ранний admission не вытесняет
   более поздний подтверждённый Save; повтор не становится новым admission.
3. **Source/context transport.** Pure bounded timeout policy общая для
   managed-entry, supervisor call в HostPort и outer adapter transport.
   Source default300000ms, context600000ms; explicit diagnostic maximum1800000ms.
   Cursor continuation без исходного budget получает верхний транспортный
   предел, но reader сохраняет свой исходный deadline. MCP получает budget+15000ms,
   runtime IPC ещё15000ms, outer transport ещё15000ms с прежним минимумом180000ms.
   Остальные MCP/IPC/transport лимиты105000/120000/180000ms неизменны.
   Это allowances доставки ответа, не продление deadline и не повтор эффекта.
4. **Граф.** JS ownership observers используют тот же bounded предел200 узлов,
   что generic node context/target. Предел проверяется и при capture, и при Close,
   и при output/selection. Чужие владельцы, дубликаты и граф201 по-прежнему запрещены.
5. **Done/Close refusals.** Оба trusted verifier принимают поддержанные finish
   modes, оставляя все owner/digest/settings/graph/ACK guards. Native Code Next
   proof применяется к Done/Execute; schema mismatch до редактирования также Close.
6. **Stale digest.** `stale_digest` публикует closed-read proof только после
   полного source delivery и verified discard, до callback. Verifier допускает
   этот reason при прежних строгих owner/digest/parser/settings guards.
7. **Redaction preflight.** Полная проверка source delivery выполняется в
   `verifySource` до target phase. Отказ до browser work подтверждает отсутствие
   эффекта; реальные поздние adapter/ACK/transport failures остаются неопределёнными.
8. **Declared Apply.** MCP timeout учитывает весь остаток оригинального deadline
   и margin5000ms, совпадая с браузерным settlement. Apply не повторяется.
9. **Views.** Блокирующие capture/settle получают остаток исходного deadline и
   margin5000ms; ownership, one-flight gesture и disposal сохраняются.

Сокращение публичного read budget отвергнуто: оно сохраняло бы другую семантику,
чем согласованный scope. Новая asynchronous read API не нужна: существующий
контракт exact source/context receipts сохраняется без дополнительных model tools.

## Проверки и завершение

Для каждого пункта нужны regression tests настоящих implementation boundaries,
включая негативные проверки foreign proof, старого Save, неизвестной cleanup,
графа201 и истёкшего deadline. Сначала подтвердить прежний FAIL, затем PASS.
После адресных проверок: полный Client набор на Node24.19.0 в отдельных процессах,
изменённые runtime/Host tests, Host `bun typecheck`, provenance verifier и diff check.
Provenance transforms обновляются только для фактически изменённых migrated files.

Live Loginom, новая acceptance campaign, merge, push, выпуск и изменение
установленного клиента не входят в исправления. Новые tests доказывают source
поведение; historical pair13 относится к исходному candidate15.
