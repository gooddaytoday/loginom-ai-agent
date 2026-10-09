# Закрытые архивы на отдельном локальном диске

34 архива закрытых own histories/diagnostics перенесены на отдельный локальный
ext4-диск. Скопировано347045692bytes; SHA256/размер/UID/GID/права/xattrs проверены
до замены исходного файла. Активные profiles/results, CLI/resources, frozen
harness и A/B conditions не переносились и не менялись.

Каталог `/home/kiselev/storage/loginom-skills-archives-20261009` создан этой
задачей:UID1001,mode700; все дочерние каталоги700, файлы600. В исходных путях
архивов остаются абсолютные symlinks на эти проверенные private копии;
lstat mode самой ссылки777, effective permissions файла-цели600.
Это изменение физического расположения архива явно зафиксировано, а не
утверждение, что его inode или тип исходного пути остался прежним.

Evidence private `package-docs-20261006/closed-archive-storage-20261009`:
plan.json,receipt.json/readback.json. Перед каждой заменой проверены отсутствие
process/FD references к архиву, точная исходная inode и неизменность payload,
исходного preservation receipt и подтверждённого result/cleanup. Copy2 и fsync
выполнены до atomic замены файла ссылкой; plan/receipt содержат восстановление
исходного regular-file пути. Старые preservation receipts/restore argv сохранены
без правки и продолжают читать те же gzip bytes через ссылку.

Все34 alias path readback hashes/modes/owners/receipt hashes PASS. Штатный tar
через3 ссылки (v7 history, v7 diagnostics, v5 closed history) завершён0;
число записей совпало с сохранённым inventory. Предыдущий full roundtrip остаётся
применимым к побитово тому же архиву; новые tar listings не выдаются за новый
полный extraction roundtrip. Root free1787121664→2127073280bytes; прирост меньше
размера переноса из-за продолжающихся записей текущего baseline.

Выбор ограничен ab-formal-v5/v7 и ab-smoke-v6/v7 archives с roundtripVerified
и matching confirmed result/environment/process cleanup. Архивов и профиля
v5 failed cleanup попытки13 в этом списке нет; их статус не переписан.
Данные других задач, исходный Loginom и чужие каталоги диска не затронуты.

Для следующих попыток сначала подтвердить cleanup и сохранить history/diagnostics
с full roundtrip стандартными v7 helper. После этого переносить только новые
closed archives с теми же проверками в этот task-owned каталог. Ссылки нельзя
переиспользовать как mutable profile или installed payload. При восстановлении
читать существующие restore argv или сначала вернуть regular archive по receipt.

Второй batch: `closed-archive-storage-20261009/batch-2/{plan,receipt,readback}.json`.
После full roundtrip перенесены ещё12 архивов formal v7 закрытых попыток,
143641070bytes. Matching result/cleanup, отсутствие process/FD references,
SHA256/размер/права/UID/GID/xattrs до и после копирования и readback12 PASS.
Дополнительный `tar-readback.json`: две исходные ссылки читаются штатным tar,
число записей совпадает с исходным inventory. Root free1950679040→2088456192bytes
на момент batch. Итого46 архивов490686762bytes; все targets600, parents700.
Текущие profiles, failed-cleanup попытка13 v5 и A/B conditions не изменялись.

Третий batch: `closed-archive-storage-20261009/batch-3` с отдельными
plan/receipt/readback/tar-readback. Перенесены6 новых confirmed closed архивов
low-liquidity/monthly-demand/NPS,62977633bytes. Matching result/cleanup,
process/FD absence, original inode, SHA256/size/UID/GID/mode/xattrs проверены;
copy2/fsync/atomic links и readback6 PASS. Штатное tar-чтение двух исходных
alias PASS, число записей совпадает с исходным inventory. Исходные preservation
receipts неизменны. Итого52 архива553664395bytes вне root disk;
targets600/parents700. Root free2011873280→2084851712bytes на момент batch;
это наблюдение при продолжающейся записи live baseline, не оценка точного
выигрыша от одного переноса. Current profile, failed-cleanup13 и frozen
resources/harness/common не менялись.

Четвёртый batch: `closed-archive-storage-20261009/batch-4` с отдельными
plan/receipt/readback/tar-readback. Перенесены6 confirmed closed архивов
risky-approved-claims/sales-by-category/slow-supplier-deliveries,
64989278bytes. Matching result/cleanup и prior full roundtrip проверены;
process/FD references отсутствуют, SHA/size/UID/GID/mode/xattrs совпадают
после copy2/fsync/atomic links и readback6. Штатный tar через две исходные
ссылки PASS:4620/3 entries, совпадает с исходным inventory. Preservation
receipts не изменены. Итого58 архивов618653673bytes на отдельном локальном
диске, targets600/parents700. Root free2005716992→2070642688bytes на момент
batch. Активные профили, failed-cleanup13 v5, результаты, frozen builds,
harness и условия A/B не перемещались и не изменялись.

Пятый batch: `closed-archive-storage-20261009/batch-5` с отдельными
plan/receipt/readback/tar-readback. Перенесены10 confirmed closed архивов
support#1/trial#1/ab-revenue#2/abc#2/articles#2,102296183bytes.
Matching result/cleanup и prior full roundtrip, отсутствие process/FD
references, original inode, SHA/size/UID/GID/mode/xattrs проверены до и после
copy2/fsync/atomic links; readback10 PASS. Штатный tar через две исходные ссылки
PASS:4600/3 entries, совпадает с исходным inventory. Preservation receipts
неизменны. Фактический inventory task-owned storage:68 архивов720949856bytes,
targets600/parents700. Root free2022912000→2120806400bytes на момент batch.
Активный campaign#2, failed-cleanup13 v5, исходные результаты, frozen builds,
harness и условия A/B не перемещались и не изменялись.

Шестой batch: `closed-archive-storage-20261009/batch-6` с отдельными
plan/receipt/readback/tar-readback. Перенесены8 confirmed closed архивов:
оба smoke v9, formal v9 ab-revenue#1 и закрытый formal v7 campaign#2,
77664673bytes. У всех prior full roundtrip, result/cleanup/process-cleanup
confirmed/remaining0×2 и все6 environment stages; hashes receipts и archive,
UID/GID/mode/xattrs/inode и отсутствие доступных process/FD references
повторно проверены. Недоступные `/proc` наблюдения учтены в receipt;
не заявляется аудит чужих недоступных дескрипторов.

Copy2/fsync/atomic links и readback8 PASS. Штатный tar через две исходные
ссылки PASS:3/4506 entries, совпадают с исходным inventory. Receipt SHA256
`b04fa080619f6ae05769e463025ff5a718286fcde962f875e4720d5695038905`;
readback SHA256 `2998a9e685fe8a0cb66bdd1ab1985b7f9defc702c30a24dbde909386e64b250c`.
Итого76 архивов798614529bytes вне root, targets600/parents700; root free
1827414016bytes после batch при продолжающемся formal запуске. Активный
abc#1, failed/incomplete profiles, frozen CLI/harness и условия не изменены.

Седьмой batch: `closed-archive-storage-20261009/batch-7` с отдельными
plan/receipt/readback/tar-readback. Перенесены10 confirmed closed архивов
formal v9 abc/articles/campaign/cohort/customer#1,113483025bytes. Cohort
остаётся semantic FAIL; процессная cleanup confirmed не означает recovery PASS.
Prior full roundtrip, все6 cleanup stages/remaining0×2, hashes result/cleanup/
process-cleanup/preservation, архивов, UID/GID/mode/xattrs/inode и отсутствие
доступных process/FD references проверены до/после copy2/fsync/atomic links.
Недоступные `/proc` наблюдения учтены в receipt, чужие процессы не изменялись.

Readback10 PASS, штатный tar через исходные ссылки PASS:4640/3 entries,
совпадают с preservation inventory. Receipt SHA256
`226c9a4efa7e9f1f4b12d4917dc192d1cbd415cb825863b159c917fbe5b62ac1`;
readback SHA256 `3db8a22a65572e8496273846e835b52edc536626d3a1cf0a0da8471fc4b7cc4a`.
Actual own storage inventory86 archives912097554bytes/targets600 PASS;
parents700. Root free1882009600bytes после batch при live записи. Active
first-last#1, failed-cleanup/incomplete profiles и frozen условия не перемещались.

Восьмой batch: `closed-archive-storage-20261009/batch-8` с отдельными
plan/receipt/readback/tar-readback. Перенесены26 confirmed closed архивов
formal v9: first-last/low-liquidity/monthly/NPS/risky/sales/slow-supplier/
support/trial#1 и ab-revenue/ABC/articles/campaign#2,284346990bytes.
First-last и low-liquidity остаются no_artifact FAIL; подтверждённая
процессная cleanup не означает semantic recovery. У всех до переноса
проверены result/cleanup/process-cleanup SHA,6 cleanup stages,remaining0×2,
prior full roundtrip, preservation receipt/archive SHA,metadata UID/GID/
mode/xattrs/original inode и отсутствие доступных process/FD references.
1268 permission-denied observations сохранены; аудит недоступных чужих
дескрипторов не заявляется.

Copy2/fsync/atomic links/readback26 PASS. Штатный tar через две исходные
ссылки PASS:4585/3 entries, совпадают с preservation inventory.
Receipt SHA256
`5ed2da3371fb24af77b35b52372a403862f5ee4f21c68c334a5c1e5c4537a346`;
readback SHA256
`7d12f98b92ece270fdd6cf6ec146880d01be988dc1f648e3f377f9587df7f033`;
tar-readback SHA256
`d4efb52beeda13c93fd8b5303c1b40e0572d792209d01c7bda6271b8494dc3e4`.
Actual own storage inventory112 archives1196444544bytes/UID1001/targets600
PASS, parents700. Root free1979858944→2254327808bytes на момент batch;
разница наблюдается при продолжающемся live прогоне. Активный cohort#2,
raw failed-cleanup/incomplete profiles, all results/preservation receipts,
frozen binaries/resources/harness/common не перемещались и не изменялись.
Контроллер60189/PID676156 после переноса live/identity matched.

Девятый batch: `closed-archive-storage-20261009/batch-9` с отдельными
plan/receipt/readback/tar-readback. Перенесены24 confirmed closed архива
formal v9 attempts20–31,243054827bytes: cohort/customer/first-last/low-liquidity/
monthly/NPS/risky/sales/slow-supplier/support/trial#2 и ab-revenue#3.
No_artifact outcomes остаются FAIL, semantic recovery ими не доказывается.
До переноса проверены все6 cleanup stages/error null/remaining0×2,
result/cleanup/process-cleanup/preservation/archive SHA, prior full roundtrip,
UID/GID/mode/xattrs/original inode/nlink1. Доступные process/FD references
проверены до/после копирования;1236 permission-denied observations сохранены.
Аудит недоступных чужих дескрипторов не заявляется.

Copy2/fsync/atomic links/readback24 PASS. Tar через две исходные ссылки
PASS:4564/3 entries, совпадают с preservation inventory. Receipt SHA
`3a170dbd1f2abf731557d1c092c2f391472ce76ebea758a30c05076790fc90ad`;
readback SHA `b89c9d0a3d6ba6f2fc531d4269a7b69a56160ee1b5339605d1f89aa77e0862da`;
tar-readback SHA `9b4db0488a868bc4d9d4a7d42e17cb36d0da5927d9fcb7c495aa0b4f98971f70`.
Actual own storage136 archives1439499371bytes/UID1001/targets600 PASS,
parents700. Root free1957564416→2185396224bytes на момент batch; разница
наблюдается при продолжающемся live прогоне. Active ABC#3, raw
failed-cleanup/incomplete profiles, results/preservation receipts, frozen
binaries/resources/harness/common не перемещались. Progress31/common SHA
совпали после переноса, контроллер60189/PID676156 live/identity matched.
Прежние пути — absolute aliases; восстановление source через временную
копию и atomic replace, не копировать поверх ссылки.
