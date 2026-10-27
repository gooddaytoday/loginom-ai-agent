# Контракт инструментов приёмки

Что гарантируют `verify-accepted.py` («обновления upstream приняты, а не отброшены») и `catalog-check.py` («каждое расхождение с upstream описано»). Контракт — конечное пространство случаев; каждая клетка таблицы ниже построена генератором [`acceptance_cells.py`](../../scripts/upstream-sync/acceptance_cells.py) как настоящее git-слияние (общая база, коммит форка, коммит upstream, слияние с двумя родителями) и проверена тестом `test_acceptance.py` (его запускает `selftest.sh`). Таблица ниже — вывод генератора (`acceptance_cells.py --markdown`); тест сравнивает её с генератором побайтно, поэтому документ не расходится с проверкой. Вердикт каждой клетки выводит оракул `expect` из трёх версий файла и результата, не глядя на инструмент.

Новый случай не добавляется «точечной правкой»: он либо попадает в существующую клетку, либо становится новой строкой этой таблицы с вердиктом по правилам ниже. Правка инструмента без клетки не принимается.

## Пространство случаев

Единица — файл. Версия файла — режим и содержимое (текст, двоичный, символьная ссылка, указатель подмодуля) либо «нет».

| Ось | Значения |
|---|---|
| Что сделал upstream (база → upstream) | `A` добавил, `D` удалил, `M` изменил содержимое, `M mode` сменил только режим, `M file to symlink` / `M symlink to file` сменил тип, `R` переименовал (`R+edit` — с правкой) |
| Тип файла | `text`, `bin`, `link`, `sub` (для `M` ещё смена режима и типа) |
| Что сделал форк (база → форк) | `none` не менял, `edit` изменил иначе, `same` внёс то же изменение, `delete` удалил, `chmod` сменил режим, `to-symlink` заменил ссылкой, `rename` переместил, `add` добавил тот же путь (`same` — тот же файл, `different` — иной) |
| Что оставило слияние | `up` версия upstream, `fork` версия форка, `base` версия базы, `merge` настоящее объединение, `gone` путь удалён, `empty` пустой файл, `lost-line` потеряна добавленная upstream строка, `dup-lost` потеряна одна из двух одинаковых строк, `removal-kept` осталась строка, которую удалил upstream, `reorder` строки в другом порядке, `extra` лишняя строка в конце, `elsewhere` содержимое лежит по другому пути, `old-kept` у переименованного файла остался старый путь |

Знак `·` в таблице — сочетание не существует (нечего «объединять» у двоичного файла, нет «версии upstream» у удалённого). Копии (`C`) git без `-C` показывает как добавление; подмодули сравниваются как указатель целиком: оба случая — клетки `A` и `M sub`, а не особый режим.

## Правила

Они же — оракул таблицы. «Версия» — режим и содержимое; текст сравнивается после замены имён OPENCODE на имена форка (`apply-identity.py`).

1. **Форк не менял файл** (или внёс то же изменение при `A`/`R`/`D`). Результат обязан быть версией upstream: `M` — равна с точностью до имён (`not-upstream`, если нет); `D` — пути нет (`deleted-kept`); `A` и `R` — файл есть с тем же режимом и типом и содержит все строки (`added-missing`, `added-truncated`, `renamed-missing`, `renamed-truncated`); у переименованного не должно остаться старого пути (`deleted-kept`). Запись владельца снимает только `added-*` и `renamed-truncated`. Лишние строки допустимы (`extra`), порядок не проверяется (`reorder`).
2. **Оба внесли то же изменение в содержимое** (`M`, `same`). Результат обязан быть этой версией; удаление или пустой файл — `merged-deleted` / `merged-emptied` (`--allow-theirs`), иное — `not-upstream`.
3. **Оба изменили файл по-разному, текст.** `merge` — принято. Версия форка целиком — `kept-fork` (`--allow-ours`); версия upstream целиком — `took-theirs`, удаление — `merged-deleted`, пустой файл — `merged-emptied` (`--allow-theirs`). Потерян режим, который сменила одна из сторон, — `mode-lost` (любой файл решений). Потеряна добавленная upstream строка или осталась удалённая им — принято с предупреждением `ok*`; `--strict-lines` делает его отказом.
4. **Оба изменили файл, его нельзя объединить построчно** (двоичный, ссылка, подмодуль, смена типа). Допустима только версия одной из сторон — с записью владельца (`kept-fork`/`took-theirs`); любая иная — `neither-side`.
5. **Upstream удалил файл, форк его менял или переместил.** Решение владельца: файл оставлен — `deleted-kept` (`--allow-ours`), удалён — `deleted-dropped` (`--allow-theirs`). Это поведение, а не предел: молча принять нельзя.
6. **Форк удалил файл, upstream его менял или переименовал.** Решение владельца: пути нет — `fork-deleted` (`--allow-ours`), файл вернулся — `fork-deleted` (`--allow-theirs`). Без записи потеря изменения upstream не принимается.
7. **Оба добавили один путь по-разному.** Как в правилах 3–4, с базой «нет».

Коды в таблице: `ok` принято; `ok*` принято с предупреждением (отказ под `--strict-lines`); `KF` kept-fork, `TT` took-theirs, `MD` merged-deleted, `ME` merged-emptied, `NU` not-upstream, `AM` added-missing, `AT` added-truncated, `RM` renamed-missing, `RT` renamed-truncated, `DK` deleted-kept, `DD` deleted-dropped, `FD` fork-deleted, `ML` mode-lost, `NS` neither-side. Суффикс `/o`, `/t`, `/e` — запись владельца, которая снимает вердикт: `--allow-ours`, `--allow-theirs`, любая из двух. Без суффикса запись не помогает. Тест проверяет каждую клетку четырьмя запусками: без записей, с `--strict-lines`, с правильной записью (вердикт снят), с записью не той стороны (вердикт остался).

## Таблица клеток

Первая таблица — `verify-accepted.py`; номер строки — сценарий, столбцы — что оставило слияние. Вторая — `catalog-check.py`: для каждого вида расхождения и места, где оно лежит (в коммите, в индексе, в рабочем дереве), код выхода при описанном / неописанном файле. Файл, который добавил форк, вне охвата: неописанный даёт 0, описанный — 1 (запись без расхождения устарела).

<!-- cells:begin -->
| # | Upstream | File | Fork | up | fork | base | merge | gone | empty | lost-line | dup-lost | removal-kept | reorder | extra | elsewhere | old-kept |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 001 | M | text | none | ok | NU | NU | · | NU | NU | NU | · | · | NU | · | · | · |
| 002 | M | text | edit | TT/t | KF/o | ok* | ok | MD/t | ME/t | ok* | · | · | ok | · | · | · |
| 003 | M | text | same | ok | ok | NU | · | MD/t | ME/t | NU | · | · | NU | · | · | · |
| 004 | M | text | delete | FD/t | FD/o | FD/t | · | FD/o | FD/t | FD/t | · | · | FD/t | · | · | · |
| 005 | M | text | chmod | TT/t | KF/o | ML/e | ok | MD/t | ME/t | ok* | · | · | ok | · | · | · |
| 006 | M | text | to-symlink | TT/t | KF/o | NS | · | MD/t | ME/t | · | · | · | · | · | · | · |
| 007 | M | text | rename | ok | NU | NU | · | NU | NU | NU | · | · | NU | · | · | · |
| 008 | M | text | rename+edit | TT/t | KF/o | ok* | ok | MD/t | ME/t | ok* | · | · | ok | · | · | · |
| 009 | M | text | none, upstream line has an OPENCODE_ name | ok | NU | NU | ok | NU | NU | · | · | · | · | · | · | · |
| 010 | M | text | edit, upstream adds the same line twice | TT/t | KF/o | ok* | ok | MD/t | ME/t | · | ok* | · | · | · | · | · |
| 011 | M | text | edit, upstream removes a line | TT/t | KF/o | ok* | ok | MD/t | ME/t | · | · | ok* | · | · | · | · |
| 012 | M | text | edit, fork already has the line upstream adds | TT/t | KF/o | ok* | ok | MD/t | ME/t | ok* | · | · | ok | · | · | · |
| 013 | M | mode | none | ok | NU | NU | · | NU | NU | · | · | · | NU | · | · | · |
| 014 | M | mode | edit | TT/t | KF/o | ML/e | ok | MD/t | ME/t | · | · | · | ok | · | · | · |
| 015 | M | mode | same | ok | ok | NU | · | MD/t | ME/t | · | · | · | NU | · | · | · |
| 016 | M | mode | delete | FD/t | FD/o | FD/t | · | FD/o | FD/t | · | · | · | FD/t | · | · | · |
| 017 | M | bin | none | ok | NU | NU | · | NU | · | · | · | · | · | · | · | · |
| 018 | M | bin | edit | TT/t | KF/o | NS | · | MD/t | · | · | · | · | · | · | · | · |
| 019 | M | bin | same | ok | ok | NU | · | MD/t | · | · | · | · | · | · | · | · |
| 020 | M | bin | delete | FD/t | FD/o | FD/t | · | FD/o | · | · | · | · | · | · | · | · |
| 021 | M | link | none | ok | NU | NU | · | NU | · | · | · | · | · | · | · | · |
| 022 | M | link | edit | TT/t | KF/o | NS | · | MD/t | · | · | · | · | · | · | · | · |
| 023 | M | link | same | ok | ok | NU | · | MD/t | · | · | · | · | · | · | · | · |
| 024 | M | link | delete | FD/t | FD/o | FD/t | · | FD/o | · | · | · | · | · | · | · | · |
| 025 | M | sub | none | ok | NU | NU | · | NU | · | · | · | · | · | · | · | · |
| 026 | M | sub | edit | TT/t | KF/o | NS | · | MD/t | · | · | · | · | · | · | · | · |
| 027 | M | sub | same | ok | ok | NU | · | MD/t | · | · | · | · | · | · | · | · |
| 028 | M | sub | delete | FD/t | FD/o | FD/t | · | FD/o | · | · | · | · | · | · | · | · |
| 029 | M | file to symlink | none | ok | NU | NU | · | NU | · | · | · | · | · | · | · | · |
| 030 | M | file to symlink | edit | TT/t | KF/o | NS | · | MD/t | · | · | · | · | · | · | · | · |
| 031 | M | file to symlink | same | ok | ok | NU | · | MD/t | · | · | · | · | · | · | · | · |
| 032 | M | file to symlink | delete | FD/t | FD/o | FD/t | · | FD/o | · | · | · | · | · | · | · | · |
| 033 | M | symlink to file | none | ok | NU | NU | · | NU | NU | · | · | · | NU | · | · | · |
| 034 | M | symlink to file | edit | TT/t | KF/o | NS | · | MD/t | ME/t | · | · | · | · | · | · | · |
| 035 | M | symlink to file | same | ok | ok | NU | · | MD/t | ME/t | · | · | · | · | · | · | · |
| 036 | M | symlink to file | delete | FD/t | FD/o | FD/t | · | FD/o | FD/t | · | · | · | FD/t | · | · | · |
| 037 | D | text | none | ok | DK | DK | · | ok | · | · | · | · | · | · | · | · |
| 038 | D | text | edit | DD/t | DK/o | DK/o | · | DD/t | · | · | · | · | · | · | · | · |
| 039 | D | text | delete | ok | ok | DK | · | ok | · | · | · | · | · | · | · | · |
| 040 | D | text | chmod | DD/t | DK/o | DK/o | · | DD/t | · | · | · | · | · | · | · | · |
| 041 | D | text | rename | DD/t | DK/o | DK/o | · | DD/t | · | · | · | · | · | · | · | · |
| 042 | D | bin | none | ok | DK | DK | · | ok | · | · | · | · | · | · | · | · |
| 043 | D | bin | edit | DD/t | DK/o | DK/o | · | DD/t | · | · | · | · | · | · | · | · |
| 044 | D | link | none | ok | DK | DK | · | ok | · | · | · | · | · | · | · | · |
| 045 | D | link | edit | DD/t | DK/o | DK/o | · | DD/t | · | · | · | · | · | · | · | · |
| 046 | D | sub | none | ok | DK | DK | · | ok | · | · | · | · | · | · | · | · |
| 047 | D | sub | edit | DD/t | DK/o | DK/o | · | DD/t | · | · | · | · | · | · | · | · |
| 048 | A | text | none | ok | AM/e | · | · | AM/e | AT/e | AT/e | · | · | ok | ok | ok | · |
| 049 | A | text | same | ok | ok | · | · | AM/e | AT/e | AT/e | · | · | · | ok | ok | · |
| 050 | A | text | different | TT/t | KF/o | · | ok* | MD/t | ME/t | ok* | · | · | ok* | · | MD/t | · |
| 051 | A | text | none, two identical lines | ok | AM/e | · | · | AM/e | AT/e | · | AT/e | · | · | ok | ok | · |
| 052 | A | text | none, executable | ok | AM/e | · | · | AM/e | AT/e | AT/e | · | · | ok | ok | ok | · |
| 053 | A | bin | none | ok | AM/e | · | · | AM/e | · | · | · | · | · | · | ok | · |
| 054 | A | bin | same | ok | ok | · | · | AM/e | · | · | · | · | · | · | ok | · |
| 055 | A | bin | different | TT/t | KF/o | · | · | MD/t | · | · | · | · | · | · | MD/t | · |
| 056 | A | link | none | ok | AM/e | · | · | AM/e | · | · | · | · | · | · | ok | · |
| 057 | A | link | same | ok | ok | · | · | AM/e | · | · | · | · | · | · | ok | · |
| 058 | A | link | different | TT/t | KF/o | · | · | MD/t | · | · | · | · | · | · | MD/t | · |
| 059 | A | sub | none | ok | AM/e | · | · | AM/e | · | · | · | · | · | · | ok | · |
| 060 | A | sub | same | ok | ok | · | · | AM/e | · | · | · | · | · | · | ok | · |
| 061 | A | sub | different | TT/t | KF/o | · | · | MD/t | · | · | · | · | · | · | MD/t | · |
| 062 | R | text | none | ok | DK | · | · | RM | RT/e | · | · | · | ok | ok | ok | DK |
| 063 | R | text | edit | TT/t | KF/o | TT/t | · | MD/t | ME/t | · | · | · | ok | · | MD/t | · |
| 064 | R | text | delete | FD/t | FD/o | FD/t | · | FD/o | FD/t | · | · | · | FD/t | FD/t | FD/t | · |
| 065 | R | text | rename to the same path | ok | DK | · | · | RM | RT/e | · | · | · | ok | ok | ok | DK |
| 066 | R | text | rename elsewhere | ok | ok | · | · | RM | RT/e | · | · | · | ok | ok | · | · |
| 067 | R | text | none | ok | DK | DK | · | RM | RT/e | RT/e | · | · | ok | ok | ok | DK |
| 068 | R | text | edit | TT/t | KF/o | ok* | ok | MD/t | ME/t | ok* | · | · | ok | · | MD/t | · |
| 069 | R | text | delete | FD/t | FD/o | FD/t | · | FD/o | FD/t | FD/t | · | · | FD/t | FD/t | FD/t | · |
| 070 | R | text | rename to the same path | ok | DK | DK | · | RM | RT/e | RT/e | · | · | ok | ok | ok | DK |
| 071 | R | text | rename elsewhere | ok | RT/e | RT/e | · | RM | RT/e | RT/e | · | · | ok | ok | · | · |
| 072 | R | bin | none | ok | DK | · | · | RM | · | · | · | · | · | · | ok | DK |
| 073 | R | bin | delete | FD/t | FD/o | FD/t | · | FD/o | · | · | · | · | · | · | FD/t | · |
| 074 | R | link | none | ok | DK | · | · | RM | · | · | · | · | · | · | ok | DK |
| 075 | R | link | delete | FD/t | FD/o | FD/t | · | FD/o | · | · | · | · | · | · | FD/t | · |

| Kind of divergence (exit code: described / undescribed) | committed | staged | worktree |
|---|---|---|---|
| edit | 0 / 1 | 0 / 1 | 0 / 1 |
| chmod | 0 / 1 | 0 / 1 | 0 / 1 |
| delete | 0 / 1 | 0 / 1 | 0 / 1 |
| rename | 0 / 1 | 0 / 1 | 0 / 1 |
| rename+edit | 0 / 1 | 0 / 1 | 0 / 1 |
| file to symlink | 0 / 1 | 0 / 1 | 0 / 1 |
| symlink to file | 0 / 1 | 0 / 1 | 0 / 1 |
| retarget symlink | 0 / 1 | 0 / 1 | 0 / 1 |
| edit binary | 0 / 1 | 0 / 1 | 0 / 1 |
| empty the file | 0 / 1 | 0 / 1 | 0 / 1 |
| fork adds a file | 1 / 0 | 1 / 0 | 1 / 0 |
<!-- cells:end -->

## Что гарантирует `--strict-lines` и чего нет

Строчный уровень — эвристика, а не доказательство слияния. Для объединённого файла (правило 3) проверяются строки, которые добавил upstream (разность `-U0` базы и upstream), как мультимножество непустых строк после замены имён: каждая строка должна встречаться в результате не реже, чем её добавил upstream (`dup-lost` — потеря одной из двух одинаковых строк теперь видна). Проверяются и удалённые upstream строки: если форк не менял число копий строки, в результате их не должно быть больше, чем в upstream (`removal-kept`).

Не проверяется, и это пределы:

| Предел | Причина | Почему не скрывает потерю изменения upstream |
|---|---|---|
| Порядок и положение строк (`reorder`) | Слияние законно переставляет блоки; сравнивать последовательность — давать отказы на правильных слияниях | Строки на месте; потери нет |
| Строка форка совпадает со строкой, добавленной upstream (`forkline`) | Git сам сливает одинаковые добавления в одну строку | Содержимое есть; строка форка и upstream — одна |
| Строка, число копий которой изменили обе стороны | Изменение числа копий нельзя отнести к одной стороне | **Может оставить удалённую upstream строку без предупреждения.** Предел назван, потому что иначе не выразить; владелец видит такие файлы в строке `merged` отчёта и решает по каталогу |
| Положение добавленного файла (`elsewhere`) | Каталоги форка могут быть перемещены; в результате важно, что байты upstream есть | Побайтово равное содержимое присутствует, режим и тип совпадают |
| Содержимое файла после записи владельца | Запись — решение человека, а не проверка | Запись обязательна и хранится в файле с причиной; молча не принимается |
| Содержимое подмодуля | Объекты подмодуля не в этом репозитории | Указатель сравнивается целиком; иной указатель — `neither-side`/`kept-fork`/`took-theirs` |
| Строки двоичного файла | Нет строк | Двоичный сравнивается побайтово, без объединения |

`catalog-check.py`: охват — файлы, существующие в upstream и отличающиеся в рабочем дереве (изменён, режим, тип, удалён, переименован); добавленные форком файлы вне охвата. Пределы: файлы под `.gitignore` не видны (`git add -A` их не берёт); подмодули учитываются как указатель; проверка считает расхождением любое отличие от `--against`, а не только отличие содержимого.

## Тест процедуры

[`doctest_procedure.py`](../../scripts/upstream-sync/doctest_procedure.py) выполняет блоки с пометкой `doc-test` из [procedure.md](procedure.md) дословно, в одной оболочке, из корня чистого клона, вплоть до `accepted`. Ручной шаг 2 заменяется командой `--resolve`; блок с `<...>` или необязательным `[--флаг]` не проходит. `selftest.sh` запускает его офлайн на синтетическом форке и upstream; журнал реального запуска приложен к отчёту LAB-301. Сборка Desktop и шаги, которым нужны bun 1.3.14, Node 24.19 и Chromium, получают `NOT_RUN` с причиной (`CHECK_SKIP`).
