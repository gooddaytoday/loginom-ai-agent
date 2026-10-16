# CP1251 cold: visible wizard owner в headless viewport

## Наблюдение и границы вывода

Поставка Rich 01a130b1-248a-7537-b29d-8fc2d9b5c26f, partial
1cdbc18ad6c87e3f6f584cdb7cfa1c52d4eaed8a: все 8 частей/24032683 bytes,
archive b00080ea…d7bda6, manifest ced34517…53a5e9 и 348/348 files проверены.
TXT/CSV cold records содержат owner_context=observed и 7 breadcrumbs;
package label длиной 48, последний путь — node + «Настройка».
CP1251 ref №2: native document/node GUID verified, surface=wizard,
stage=text_import_file, owner_context=unobserved; current_path содержит лишь
5 breadcrumbs до «Сценарий», package label длиной 76. UI journal SHA
0c0a3678ac7c4d53006f9bc8044672b568bdc01c3c1f389d5eeaa15be00969cd.

В exact CLI 5cd74d8 headless browserLaunch задаёт viewport 1280×800.
workspace-ui.mjs:533–600 получает wizard owner из видимых breadcrumb buttons;
там описан toolbar overflow, но разрешённый специальный context касается только
output socket. Недостаточная ширина — проверяемая гипотеза, а не доказанная
root cause. Technical/display node labels различаются ожидаемо (underscore/
space); само это различие не является fingerprint. Не задавать owner flags
вручную и не ослаблять native guards.

## Выбранная узкая проверка

Внутри callback withDiagnosticSession, до workspace prepare, existing page
получает setViewportSize({width:1920,height:1080}); отказ resize также проходит
существующий cleanup. Это только evals reader и его
собственный browser context: CLI, resource/skill/supplement pins и globals
не меняются. Actual owner должен вновь наблюдаться штатным exact runtime;
увеличение viewport не считается proof или cold PASS само по себе.

Файлы: evals/script/text-import-cold/reader.mjs;
соседний provenance.json (adaptation/current reader SHA, source/original SHA
неизменны); существующий public regression в
 evals/test/text-import-cold-reader.test.ts на admitted saved CP1251 ref №2.
Все bytes/graph/GUID/source/native settings/schema/typed/precision/fullness/
fresh execution/one-gesture/cleanup gates остаются прежними.

## TDD и полномочия

RED — сохранённый настоящий отказ CP1251, без нового unchanged wizard click.
GREEN — public reader на bundled Node/exact browser с теми же saved artifact,
events и независимым oracle; текущий native owner/полный cold checker/cleanup
должны пройти. При повторном отказе сохранить новый receipt/capture и
остановиться; не объявлять ошибку уникальной или viewport причиной по факту
изменения SHA. Тесты не подменяют native modules и не проверяют строку кода.

Мониторинг не запускает native GREEN. Evaler назначает Rich только после fresh
active/queued check, собственного независимого review исходной поставки и
resolution/release, и проверки допустимого остатка именно cold/операционных
бюджетов. Если следующий cold не допускается прежним бюджетом, реальный GREEN
остаётся gated; этот план не предоставляет расширение или новый probe/recovery.
Reference budget CP1251 2/3 не означает автоматически новый cold budget.

Постоянное разрешение владельца на harness fixes охватывает browser layout;
повторного approval за саму source compatibility не требуется. Repeat ledger
2/10, residue8, текущая root UNCLASSIFIED/charge deferred сохраняются. Models
Rich/Ben/Evaler прежние; scenario actual openai/gpt-6-luna/high. Исторический
ERROR/cleanup=false сохранён отдельно от позднего safety RELEASED(kind=cold)/FREE.
Полный пилот/Ben/frozen SHA не объявлены; другие карточки ещё ждут dependencies.

Read-only spec review ACCEPT; замечание о размещении resize внутри diagnostic
session учтено. Реальный GREEN ещё не выполнялся.
