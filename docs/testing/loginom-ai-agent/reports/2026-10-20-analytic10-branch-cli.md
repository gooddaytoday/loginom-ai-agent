# Analytic10 на CLI ветки evals-parallel, 2026-10-20

Техническая приёмка пока **не пройдена**. Первая серия остановлена на двух
попытках; после обнаруженного дефекта writer готовится новая полная серия.
Критерии и фиксированная десятка — в [плане](../../../superpowers/plans/2026-10-20-analytic10-branch-cli.md),
правила — в [контракте](../../../../evals/docs/parallel-users-contract.md).

## Подготовка

Focus password исправлен по TDD в `6548e04d2c`:44 связанных теста и Host
typecheck прошли. Два дополнительных native cancellation tests с ожиданием2с
падают также на исходном коде; это не подтверждение новой регрессии.
Management Loginom явно выбирает headless, сохраняя routing models/providers
(`3a7491b579`, `8f1808e980`). Связанные проверки:104pass/2skip/0fail, typecheck,
независимое ревью. Proc-denial tests пропущены из-за других работающих агентов.

Старая пара acceptance-20261016 после verify1065633c с unknown Chromium
сохранена без изменения броней/receipts. Владелец разрешил новый выделенный стенд.
На новой паре3463cae565ca/d84925713c74 прошли prepare, verify2b8641b9,
строгий cold browser обоих слотов и все4 живых A/B. Перед dispatch:
20.54GiB MemAvailable,2663GiB disk,241M inode; OAuth запас102ч,
две разные local copies, исходный auth-store неизменён. Judge login без модели
проверен через VPN launcher. CPU host maximum100, остальные границы прежние.

## Серия1: Sp38yS

Run: `20261020-072725-a1986c18fd-dirty-Sp38yS`,07:27:25–07:30:54UTC.
Harness `a1986c18fdda1f7fbe858237597fad4f2f8a12f4`;
CLI `8f1808e9804e98136f83eb9495cf0505f0ad9e3d`,
version `0.0.0-evals-parallel-20261020-8f1808e9804e`,prod,
tree `15b69fc3d02ea266ebe734869c4b993af0cb8a4391b077e837b38b4a69b5e861`.
Bun1.3.14/revision0d9b296,Node24.19.0,Chromium1246; payload установлен
в отдельный HOME и проверен verify-cli-candidate. SourceDirty=true:
существующие незакоммиченные документы сохранены, их baseline закреплён private.

Агент `openai/gpt-6.1-sol/medium`, судья `gpt-6-sol/xhigh`;
seed `1eae361e4a4d60271a861c641b3a7151`.
Inputs hash `bae1f3d5e9888d4ffc1d516230f2628ed0e0191f9452fd857605e0a1be30fed2`,
rubric hash `16e3b0a385b9881fd94d2c152fd66f6c8c99da18e65c3fe5925bf351b60c3d7b`.
Восемь часов отсчитываются от первого dispatch07:28:25UTC до15:28:25UTC,
включая следующие серии.

- A:abc-pareto-groups,CLI-chain07:28:27.993–07:30:47.337UTC,interrupted.
- B:articles-by-author,CLI-chain07:28:28.420–07:30:47.337UTC,interrupted.

Перекрытие CLI-цепочек138.917с, максимум2. Оба агента подтвердили
authenticated/READY и свои eval-a/eval-b. У каждого8 step_finish и11 tool calls,
tool errors0. Суммарные заявленные CLI tokens:145526 input,2223 output,32 reasoning.
Reported OAuth cost0 не доказывает бесплатность. Оценок и oracle нет.

В07:30:41.951UTC B сообщил session.status.retry,attempt1:
socket connection was closed unexpectedly. Признаков429/quota в этом событии нет.
Существующий watcher намеренно считает любой retry инфраструктурным инцидентом
и вызвал общий abort. Код summary PROVIDER_LIMIT_OBSERVED не доказывает rate/quota.
У B provider coverage complete, у A unavailable; весь provider/judge gate failed.
Остальные8 задач не получили attempt. Пакетов/verdict/oracle/judge calls нет.

Supervisor подтвердил завершение обеих цепочек, capture_complete=true,unknown=[].
Native saved-package-cleanup у обоих BLOCKED/CLEANUP_OR_OPERATION_UNCONFIRMED,
save_operation_id/package_path=null. По этим данным нельзя свести отказ только
к отсутствию Save: остановка могла произойти на проверке незавершённой операции.
Recovery JSON запрещают archive/admission; cleanupSlotStorage не дошёл до
закрытия серверных сессий. Server и profile a/b retained,judge home released.
Повторное использование, полная изоляция результатов и готовность следующего run
не подтверждены. Неизвестный список storage leftovers не считается пустым.

Ресурсные проверки прошли для измеренного интервала:147проб,0пропусков,
max gap1006.68мс; CPU host peak81.69%,MemAvailable min16.19GiB;
Server peak0.664core/72.72MiB,Studio3.026cores/255.71MiB.
OOM/ENOSPC/license incidents не наблюдались. Collector штатно завершён.
Это не ресурсная приёмка полной десятки.

Post verify вернул exit2/LEASE_FILE_PRIVATE:production cleanup receipts имеют
mode0664,а startup reader требует0600. Дефект исправлен в `4593a1396b`:
management/attempt/prepared writers используют существующий writeLeaseReceipt.
Два теста реального writer→startup reader прошли RED→GREEN;
связанные проверки138pass/2proc-denialskip/0fail,593assertions,typecheck и
независимое ревью прошли. Старые файлы не chmod/не переписаны. Исправление
будущих writers не устраняет recovery этой пары.

Private evidence:
`/home/kiselev/storage/tmp/analytic10-branch-20261020-w6kidhm4/`:
manifest,series1-audit.json,results,build/tests logs и eval_parallel_blockers.md.
Дубли установочных payload удалены после проверки; installed candidates и
данные инцидентов сохранены. Чужой staged root eval_parallel_blockers.md не менялся.

## Продолжение

Новая полная та же десятка выполняется на другом чистом своём стенде после
пересборки CLI с writer fix; результаты серий не объединяются.
Удержанные пары и их recovery/receipts сохраняются до отдельного решения.
Окно остаётся07:28:25–15:28:25UTC; новые pins/gates обязательны.
