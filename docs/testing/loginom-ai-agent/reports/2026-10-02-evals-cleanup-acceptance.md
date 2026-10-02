# Приёмка безопасного перехода eval-попыток — 2026-10-02

Защита реализована в `evals/` на ветке `evals`; продуктовый runtime и установленный
CLI не изменялись. Полный source gate прошёл. Положительный Linux control
подтвердил переход no_artifact → completed; адресный прогон двух кейсов
подтвердил cleanup при сохранённых no_artifact.
Это приёмка cleanup-контракта, не новый baseline качества.

## Зафиксированная среда

Harness code: `a2bf34b77` (validation lifecycle), после срезов единственного ledger
`6eb8fcd8c`, shutdown/matrix `cf1fc6a0d`, unknown helper `8e676dbce`.
Незавершённые пользовательские изменения в reports сохранены; `-dirty` у run ID
не означает изменение установленного бинарника.

CLI: `/home/kiselev/.local/share/loginom-ai-agent-cli/0.1.17-prod/bin/loginom-ai-agent-cli`,
версия 0.1.17, source `5588651a291c59f53d1c14941d5ba768071a0018`, sourceDirty=false.
Node 24.19.0; Chrome for Testing 153.0.8010.12, revision 1243;
Playwright 1.63.0-alpha-2026-08-31, Playwright MCP 0.0.80.
Модель `openai/gpt-6-sol`, variant `default`. Обычный default budget 900000 мс;
внешние budget/low-liquidity — по 1800000 мс. Судья для адресного run:
codex-cli 0.157.0, `gpt-6-astra/high`; при no_artifact он не вызывается.

| Pin | SHA-256 |
| --- | --- |
| CLI binary | `272d135abc9ee9bb7219c7ee8a498cb048581ee2209d450f869b7caee1fbd873` |
| Source tree | `b812bfb7ab2d4ae9677042863a62f6fe2822d88f4d3f3e7e0ede72dfd69d0410` |
| Resource manifest | `12542127ff87bdb6828355bcbc148e6ed729dc1e4a8f03c68cdbc93a454e6baf` |
| Node | `bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12` |
| Chromium | `8c599d43aec53f2460a31ae2f4af6bd863f8258b34ff519564bc5d4726bfaa1e` |
| Runtime lock | `e05c8ba33f055e321f04760d55eb9e23b00bfe011fe5a68a1118461cc2ae095a` |
| Action manifest | `17764f9a8137b199e4d89d4bdeea1a004778f825d50bfba6b68d64a9f5a588a4` |

Бинарник, Node, Chromium и manifest/lock заново хешированы перед приёмкой;
выбранные установленные файлы совпали с прежними pins до и после обоих итоговых
runs. Выбранный executable каждого CLI и browser binding во всех receipts
сверен с теми же pins. Продукт не пересобирался.

Использован частный профиль
`evals/.profile/subreaper-6bbb4e3b-d31c-4095-a425-08151ecb673b`.
Скопированы только авторизация (0600), текущий cached models.json и permission
config с проверкой одинаковых bytes/hash/read-back. DB, Session и browser profiles
из старого профиля не переносились. Setup/status/models выполнялись тем же
supervisor; финальная readiness подтверждена до control.

## Source gate и отрицательные проверки

Из `evals/`: `bun test` — **228 pass, 0 fail, 990 assertions, 297.87 с**;
`bun typecheck` и `git diff --check` pass. Последняя правка прошла настоящий red →
green тест: child browser в validation, каталог удалён продуктом, binding и
наблюдённый путь остаются в receipt; отсутствие журнала явно отражено в manifest.
Исчезновение обычного runtime до архива остаётся ошибкой.

Реальные child tests покрывают detached/double-fork helpers, новый SID,
потерю argv после binding, неизвестный executable вне browser directory,
чужой browser, birth/executable mismatch, релевантный proc-read failure,
writer replacement и management timeout. Чужие/непроверенные процессы не
сигналятся. CLI exit 0 и timeout сохраняют накопленные Session/events/tokens/cost.

Сквозная матрица process/archive/readiness × no_artifact/failed/timeout/completed
проверила реальные исходы fake-CLI/budget: exit 1, прежний результат в summary,
failed environment cleanup, stopped_reason, отсутствие второго dispatch.
Archive failure сохраняет journal и pending recovery. Exit 2/3 и ошибки записи
evidence также проверены. Legacy summaries, rejudge, infra_error и независимые
quality/cleanup counters совместимы; seeded secrets исключены из архива.

## Положительный Linux control

Run `20261002-151442-a2bf34b77-dirty`, exit 0, stopped_reason=null.
Отдельный read-only browser-кейс использует prepare/workspace_observe и явно
завершает работу без сохранения пакета; затем исходный group-sum-qty.
`--skip-judge` применён только к lifecycle control.

| Кейс | Исход | CLI / timeout | Duration | Cleanup |
| --- | --- | --- | --- | --- |
| a-browser-no-artifact | no_artifact | 0 / false | 47297 мс | confirmed |
| group-sum-qty | completed | 0 / false | 231738 мс | confirmed |

Первый prepare сначала вернул error, повторный prepare и workspace_observe
завершились completed; 3 tool calls / 1 error. Это повтор инструмента внутри
той же попытки, не автоматический повтор harness. Второй кейс: 10 calls / 0 errors.
Session IDs: `ses_f02d0f972ffeShxtMLWBZDG7sU` и
`ses_f02d017bbffepkszzWtLHSTSnd`; CLI/launcher birth identities и runtime paths
разные. Audit проверил 6 receipts, 122 наблюдённые identities, 16 proof/archive
файлов: по два пустых process passes, прежние own identities не живы,
archive → readiness → следующий dispatch, manifest/SHA/read-back, отсутствие
секретов и auth/config/argv/environment/browser-profile полей.

Независимая проверка фактического пакета: 3 узла, 2 связи,
импорт → группировка Item/gdSum Qty → экспорт. Oracle вычислен из исходного
sales.csv; реальный CSV содержит две строки **A=15, B=25**. Node_wait receipts
подтверждают три разные completed-исполнения, сопоставленные с тремя node GUIDs
пакета; import 3 rows, group 2 rows. SHA-256 исходного CSV, package.lgp,
Unit.xml и экспортного CSV сохранены в package verification evidence.

## Адресный Linux run

Итоговый run `20261002-153657-a2bf34b77-dirty`, exit 0, stopped_reason=null.
Текущая модель/variant и судья сохранены; summary зафиксировал реальные task
budgets 1800000 мс для обоих кейсов, без timeout override.

| Кейс | Исход | CLI / timeout | Duration | Tools / errors | Cleanup |
| --- | --- | --- | --- | --- | --- |
| budget-variance-by-category | no_artifact | 0 / false | 139975 мс | 15 / 8 | confirmed |
| low-liquidity-companies | no_artifact | 0 / false | 150552 мс | 14 / 7 | confirmed |

Токены input/output/reasoning: budget 42568/1404/305; low-liquidity 65988/767/307.
Расход, сообщённый CLI, 0; это telemetry, не проверка реального биллинга.
Оба no_artifact остались в качестве: total/scored/oracle_checked=2,
completion/score/pass/oracle_pass=0, excluded=0. Cleanup checked=2/errors=0;
infra/harness/judge errors=0. Судья настроен штатно, но без пакета пропускается.
В очищенном execution archive каждого кейса 11 упоминаний AMBIGUOUS.

Session IDs `ses_f02bc980bffegNk9ugL7MozWar` и
`ses_f02ba5588ffeofSrjsqFEbyaTm`; новые CLI/launcher births и runtime paths.
Host audit: 6 receipts, 122 identities, 16 proof/archive files, 4 manifests;
все confirmed, по два пустых passes, SHA/read-back/order/secret checks pass.
Независимые proc-аудиты выполнены в том же host PID namespace
`pid:[4026531836]`, что приёмка; повторный control audit тоже pass.
Отсутствие host PID в sandbox namespace `pid:[4026533336]` не принимается как proof.

После обоих runs: private profile idle, successful lease/registration/writer
отсутствуют; auth bytes неизменны, четыре контрольные/итоговые Session rows
сохранены в DB (readonly SQL check). Исторические failed runtime dirs и их
ранее архивированный journal остаются.

## Долговечные доказательства

Source gate summary, версии/хеши, оба host audits, package verification,
profile durability, sanitized bootstrap receipts, reconciliation и контрольные
задачи/hash inventory сохранены в gitignored
`evals/results/cleanup-native-acceptance-20261002/`.
Фактические `run.json`, `result.json`, `cleanup.json`, archives и summary/report
лежат в двух итоговых run directories выше. Никакие auth/config/browser profile
не включены в execution archives; сырые diagnostic logs не публикуются в git.

- [Source gate](../../../../evals/results/cleanup-native-acceptance-20261002/source-gate.json)
- [Control audit](../../../../evals/results/cleanup-native-acceptance-20261002/final-control-audit.json)
- [Addressed audit](../../../../evals/results/cleanup-native-acceptance-20261002/final-addressed-audit.json)
- [Package verification](../../../../evals/results/cleanup-native-acceptance-20261002/final-package-verification.json)
- [Durable profile check](../../../../evals/results/cleanup-native-acceptance-20261002/profile-durability.json)


## Сохранённые отказы и пределы приёмки

Исторический control `20261002-142112-8e676dbce-dirty` сохранил no_artifact и
completed, но profile-idle после второго кейса отказал: exit 1, failed environment
cleanup, измеренное completed не исчезло. Причина временного owner не установлена.
Default profile guard содержит другого owner (nonce
66789ed1-a3c7-4899-99ba-2580b51a6835); provenance не совпала, guard не удалён.
Для окончательной приёмки профиль изолирован, default настройки/БД не менялись.

Первый private bootstrap выявил отсутствовавшую поддержку validation namespace;
failed guard/proof/runtime оставлены. Control `20261002-150507-a2bf34b77-dirty`
сохранил два failed/provider без Session: новый профиль не содержал cached
каталог gpt-6-sol. После точного переноса текущих catalog/permissions модель
подтверждена без замены model/variant. Последующий readiness однажды не успел
увидеть launch argv и отказал; его own/unknown birth identities затем отсутствовали
в двух свежих passes. Только собственные lease/registration сняты после двух host passes и exact
owner/inode/content checks; failed proof/runtime не удалялись и не переписывались.

Адресный run `20261002-152124-a2bf34b77-dirty` сохранил два no_artifact
с обычными budgets: budget cleanup confirmed, low-liquidity failed из-за 26
новых процессов выбранного Chromium без recorded origin. Они не сигналились;
run exit 1, stopped_reason, качество total/scored/oracle=2 и нулевые оценки
сохранены, infra/harness/judge=0. Первое ручное reconciliation отказало, пока
recorded identity была жива. После естественного завершения все own/unknown
birth identities и exact owner отсутствовали в двух свежих host passes.
До нового recovery acknowledgement own journals сохранены с hashes/read-back
в `low-liquidity-companies/1/manual-reconciliation`. Только свой неизменившийся
lease/registration снят; failed result и runtime оставлены. Этот отказ не
переписан как confirmed и не заменяет положительный итоговый run.

Ранние положительные control/addressed на cf1fc6a0d остаются историческими
доказательствами; итоговая приёмка опирается на a2bf34b77. Дополнительный cold-open
ранее восстановленного QA-файла оказался readonly и отказал до мутации;
причина readonly не установлена. Cold readback не прошёл и не заявляется
доказательством серверного остатка. Временный QA-файл удалён адресно, original
artifact и reader diagnostics сохранены; основной control проверен по исходному
исполнению и фактическому CSV.

Harness lease исключает второй harness на частном Linux profile; произвольный
внешний CLI не участвует в атомарном handoff. Proc proof относится к наблюдаемой
цепочке выбранного launcher; сомнение вызывает stop. Локальное завершение
процессов не доказывает отмену серверной операции или освобождение Loginom
Session. Восстановление AMBIGUOUS в прежней Session остаётся дефектом продукта.
При серверном блокере нужна отдельная адресная очистка/изоляция стенда.
