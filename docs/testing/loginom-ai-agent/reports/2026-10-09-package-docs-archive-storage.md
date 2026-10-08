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
