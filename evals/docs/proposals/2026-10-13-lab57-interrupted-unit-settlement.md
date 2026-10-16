Адресное операторское исключение для LAB-57, ожидает отдельного решения владельца. Ничего из перечисленных мутаций не выполнено. Это предложение об архивировании прерванного исполнения, а не готовая команда immutable helper.

Исходное исполнение: task `01a134a1-0f47-782c-8d67-9c843c2d25e3`, Rich, phase `unit`, SHA `49522d83318bac29779e497798becb2f799bc84e`, acquiredAt `2026-10-13T09:49:32.777Z`. Follow-up `01a134d6-c65f-7976-92aa-353b9b6a6770` завершён с BLOCKED; новых pending Rich/Ben нет. Исходный invocation session 74784 недоступен по отчёту execution host. Частичные stdout/stderr сохранены, но terminal exit, supervisor cleanup, typecheck и genuine unit completion отсутствуют.

Привязки для исключения:

- runtime root: `/home/user/.local/share/loginom-evals-runtime`;
- lease: `operations/stand.lease`, device 64512 / inode 12748659;
- owner.json: device 64512 / inode 12748660, SHA256 `a2a6f94ae4f027511cd792b9be597c5b823eaf8c4178b24e1baf68621cb2617b`;
- operation guard: device 64512 / inode 12748661, uid 1000, mode 0700, пустой исходный каталог;
- canonical config SHA256: `58435fbe4aca6ac2e40629800594526a7cec48af3d9306e02fa5b7163be96d71`;
- исходный config file SHA256: `665225947bbb41dfebf49a7a5d8775388d49426d8a173b020d451c9f76e700d7`;
- shared config SHA256: `194bd03649c7fb393959bebe9af60340c8e3ab76425146e32b05fcb1eccc12a2`;
- container: `b030b7bc86873b473f5d77d90132b82d3a4d15e993074929939c099748e3918e`;
- partial unit capture stdout SHA256 `c9e70d704e10ec4fbca35621d3f63acb2b2bf0a94134cbad56a4740e3b9d66f6`, stderr `9baeb6e0a73abd24f86fdbbb1aeac7b80b738269a2cae13e2072a661e1f148b3`.

Private config/lease locators: `roles/rich/agent-work/lab57-autonomy/task-01a134a1-0f47-782c-8d67-9c843c2d25e3/{ops-config.json,stand-lease.json}`. Token сравнивать только внутри execution host; не публиковать. Config digest проверяется по canonical JSON; отличие raw file digest не означает изменение config.

Запрашиваемое решение: разрешить ровно один немодельный операторский settlement/abandon указанного interrupted unit lease. Исходные owner/config/guard/proofs сохраняются; критерии эксперимента, установленный CLI, pinned supplement и runtime не изменяются. Это отдельное исключение, не использование или расширение helper recovery, не разрешение удалять lease по PID.

Предлагаемая процедура после разрешения:

1. На исходном execution host сначала искать только настоящие durable terminal/process/typecheck/completion proofs. Если они найдены, сверить их с исходными bytes/owner/acquiredAt и использовать обычный контракт; отдельно диагностировать retained guard, не удаляя его самовольно.
2. Если proofs действительно утрачены, записать interrupted unit как ERROR/ABANDONED. Повторно проверить отсутствие active/queued worker, точную identity lease/owner/config/guard и capture bytes, manifest supplement/CLI, чистый author SHA. Для settlement нужны два свежих полных process/ancestry/absence наблюдения и полный допуск профилей/storage/container на том же host. Нынешние наблюдения selected process names сами по себе такой допуск не заменяют. Любой неизвестный/недоступный relevant process, живой исходный invocation, writer/pending, symlink, изменившаяся identity или чужой resource запрещает мутацию. Не посылать сигналы чужим процессам, не чистить чужие профили.
3. До адресной мутации создать отдельный private once receipt (wx/0600) с authorization comment, incident `LAB57-interrupted-unit-01a134a1`, original owner/acquiredAt/config/guard identities, source hashes, host/task и fresh settlement proofs. Статус ATTEMPTED_BEFORE_MUTATION; crash/error не восстанавливают once. Не создавать unit/recovery completion или RELEASED receipt.
4. Непосредственно перед мутацией повторить identity/bytes/ownership и отсутствие concurrency. Архивировать ВЕСЬ исходный `operations/stand.lease` атомарным rename в отдельный private `operations/abandoned/LAB57-interrupted-unit-01a134a1/` (0700), сохраняя operation guard и все исходные файлы побайтно. Не переносить в `completed/`, не менять owner/task/acquiredAt и не удалять отдельные файлы. Existing destination, changed identities, race или неполный admission => STOP/BLOCKED.
5. Отдельный settlement receipt должен подтверждать сохранность архива и свежие допуски, называя результат ABANDONED, а исторический cleanup UNKNOWN. Проверить настоящий FREE неизменённым helper. FREE не является native READY. Публично доставить лишь обезличенные hashes/identities/verdict; private token/profiles/DB/env исключить.
6. Только после проверенного settlement и FREE допускается обычное продолжение разрешённого TSV этапа: новый fresh собственный acquire, genuine supervised unit/typecheck с process proofs и штатный release; native preflight должен реально получить READY до scenario/native операций. Старый unit PASS, RELEASED или cleanup confirmed не объявлять. Любой новый отказ диагностировать по прежнему контракту.

Ограничение предлагаемого операторского settlement: один немодельный проход, до 30 минут с начала, и не позже действующего deadline `2026-10-13T15:33:29.538616Z`; доступные tokens учитывать, внешняя billing стоимость неизвестна. Deadline и накопленный учёт не сбрасываются. Reference 1/1/2/1/1/1 из 3, product 0, cold calls/launch/completed 8/7/5, repeats 3/10 (остаток 7), admission 3/3, diagnostic wrapper 1/1, helper recovery 0 сохраняются. Новый model smoke/probe/recovery или budget extension не запрашивается.

Основание необходимости отдельного решения: exact supplement `89b416c257a43a187edef4c40b68f3c9b1fa4d53`, `evals/docs/evaler/operations.md:88`: «Crash, завершённая задача Multica или мёртвый PID не являются разрешением его удалить». В `evals/src/node-eval-ops.ts:603` exclusive guard блокирует unit/release/recover; штатного interrupted-unit abandon нет. Разрешение владельца `01a13471-39bb-7677-a48c-2fb247c3beea` относится к изолированному TSV CLI и не содержит этого операторского исключения.
