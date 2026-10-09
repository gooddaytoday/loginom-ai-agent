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
