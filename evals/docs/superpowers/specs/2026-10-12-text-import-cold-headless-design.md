# Cold reader без оконного сервера

LAB-57 доставил cold report 01a1301d-608a-7385-8a14-298f4142e610:
после исправления Node realpath resource verification прошла, затем
loginBrowser вернул LOGINOM_BROWSER_START_FAILED до graph/settings/result.
На runtime нет DISPLAY/Wayland/X11/Xvfb; reader.mjs явно задаёт headless:false.
Точная нижняя причина launch потеряна в runtime catch, поэтому пока не доказана.
Архив 12d9f444…c94fdb, manifest 783354c3…a45cc7 и 305 файлов проверены локально.

Выбран минимальный режим headless:true для независимого cold reader. Штатный
browser launcher exact CLI 5cd74d8 уже принимает этот параметр; native preflight
на этом стенде успешно запускал его без оконного сервера. Это настройка
browser mode harness, а не изменение CLI/runtime, oracle или критериев приёмки.
Альтернативы: условный режим по DISPLAY добавляет лишнюю зависимость от env;
Xvfb меняет общий сервер и требует отдельного управления ресурсами.

Объём: evals/script/text-import-cold/reader.mjs, соседний provenance.json и
необходимый поведенческий regression test. В provenance добавить adaptation
headless:true и пересчитать SHA256 reader; source_sha и original_sha256 сохранить.
Node должен быть именно resources/loginom/bin/node из manifest.
Не обходить pin/realpath/resource verification. Graph/owner/source/GUID/native
settings/typed/NULL/Decimal/fullness/fresh execution и cleanup остаются прежними.
Нет headed fallback, смены models/credentials, подмены READY или cold PASS.

RED — сохранённый реальный отказ public reader и воспроизводимая поведенческая
проверка без DISPLAY на настоящих exact browser/Node resources. Не подменять
native модули моками и не проверять строку исходника вместо поведения.
GREEN — тот же reader доходит до реального native cold пути в headless режиме;
полный cold PASS требует всех существующих proofs, а не успешного launch.
Если необходимых ресурсов локально нет, это ограничение явно фиксируется;
реальный GREEN выполняет назначенный Rich на своём допущенном runtime.

Исполнение через Evaler в существующей авторской серии, после fresh run/resource/
lease/pin checks. Не дублировать active/queued. Предыдущие два cold вызова,
исторические FAIL/unknown и cleanup сохранить; builders/product/model probes
для проверки browser режима не нужны. Diagnostic preflight wrapper 1/1 не
повторяется. Новая несовместимость не расходует repeat budget 2/10 до доказанного
повторения; сценарные бюджеты и actual openai/gpt-6-luna/high остаются прежними.

Постоянная команда владельца на самостоятельное устранение preparation/validator
блокеров и координацию через Evaler уже разрешает эту узкую совместимость;
дополнительное согласование реализации не требуется.

Read-only spec review: замечание о provenance включено в scope; проверяющий
подтвердил сохранение критериев, FAIL и ledger, отделение launch от cold PASS.
