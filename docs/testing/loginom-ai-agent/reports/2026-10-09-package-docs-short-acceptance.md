# Сокращённая приёмка package-docs — 2026-10-09

Текущая граница — решение пользователя и план `94627858a`: десять независимых
CLI-задач по одному запуску, минимум8 PASS с судьёй/структурой/CSV; три заранее
выбранных cold replay; S1–S8; установленный CLI/Desktop и штатное завершение.
Новая baseline/A/B90, статистический compare, полная TUI/recovery матрица и
этап9 отложены. Серверный skill сохраняется. Историческая v9 остаётся INCOMPLETE.

## Финальные сборки и offline-проверки

Оба продукта: чистый source `9695e61e358ac5e6043c08eb56d183faa03d7a28`, версия0.1.17.
Полный CLI TAR.GZ, Desktop DEB/AppImage и source archive сохранены в новых
каталогах вне checkout; manifests/resources проверены. CLI inventory5651,
Desktop static verification4654 ресурсов для каждого артефакта.

| Материал | SHA256 |
| --- | --- |
| CLI TAR.GZ | `822ba2c58dd5ba09bbaa33369400e248f81e710368c4842e6fb093d2bec02acb` |
| CLI manifest | `3d1c461c6760bf768deee50ebf2c9edb0d5faca9f114a5aca80bf428fe4b598d` |
| Desktop release manifest | `48d0e10a5ebd1abaa1860a7b0f133e6601da33ba2a5f38ee2827abf5efe05e66` |
| Desktop AppImage | `d7ca713b2db3124018753e1ba562bd64ac23b15b93cd89ec0ba218f7ad0f6095` |
| Read-back offline-матриц,47 файлов | `dc84c279e601b88f548c70c8f6a9f89d11191cf365c55c2568eca12d1cdb9af9` |

Уже начатые до сокращения плана серии закончены: Ubuntu22/24/26, Debian12/13,
**CLI5/5 PASS, Desktop5/5 PASS**, non-root/network:none. Проверены собственная
установка/запуск, bundled Node/resources и Chromium sandbox; CLI uninstall
сохранил профиль. Все10 контейнеров удалены. Это offline/synthetic проверки,
модель/судья/Loginom в них не вызываются.

На текущем Linux CLI установлен штатным `install.sh` в отдельный HOME;
launcher status — unconfigured, все5651 inventory entries совпали,
chrome-sandbox root:root4755. Пользовательский launcher не заменён.
Первоначальный диагностический checker ошибочно использовал `stat` для symlink;
после перехода к `lstat`, как в штатном manifest verifier, проверка прошла
без изменения установленного payload. Desktop AppImage доставлен в отдельный
каталог; native запуск этой установки подтверждён S2/S4. Выпуск не опубликован.

## Условия новой десятки

Принятый frozen harness `d08be6baf8f5aea53f83c228cd0984c9d2bf0494` неизменен,
проверены658 tracked files, lockfile, judge и verifier/adapter pins.
Перед новым freeze актуальный evals ref был
`7318ec61fef3e026216e62e287ef1328d4f8e912`; judge prompt/schema/code,
near-miss calibration и tasks не отличаются от выбранного frozen SHA.
Новая калибровка и повтор полного неизменённого harness suite не выполнялись;
его сохранённые486 PASS/2 SKIP/0 FAIL и typecheck относятся к этому exact SHA.

Задачи фиксированы в порядке: sales-by-category, abc-pareto-groups,
articles-by-author, campaign-roi-by-channel, customer-activity-segments,
monthly-demand, ab-revenue-per-converter, risky-approved-claims,
slow-supplier-deliveries, trial-dosage-outcomes. Cold фиксирован для sales,
ABC и campaign ROI. Исходный task snapshot/рубрики/oracle сохранены без правок.
У trial прежний первый повтор PASS, второй FAIL/no_artifact; это не скрывается.

Основная модель `openai/gpt-6.1-sol medium`, судья `gpt-6-astra high`, threshold70
и обязательный checklist; исходные effective timeout1800000ms сохранены.
Все live-проверки сериализованы, включая routing, connection setup и cold reader:
параллельный запуск даже собственного клиента мешает общим процессным guards.
Каждый task запускается отдельным процессом `--only ID --repeat 1`, со своими
results/profile/workspace/artifacts. Следующий admission требует terminal
result и подтверждённый cleanup предыдущего. Ручных повторов нет.

Private evidence root: `/home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006`.
Действующие условия: `ab-short-conditions-9695e61e3-v2-20261009/common.json`, SHA256
`67c0f3000502fa8b418e3b42f546a8df4cee650370ab12736d4ce3ebf9390c4f`;
dispatch manifest SHA256
`1ee3b447185442982194ec869f080b170fe20e2e68e21f7c135e4453a6406b08`.
Предыдущие условия сохранены отдельно: до модельной попытки native admission
отказал из-за ошибочно скопированных ранних конфигураций нового own стенда.
Попыток0/модельных и judge calls0,6 management cleanup confirmed. Исправлены
только собственные Users/Components.cfg; штатный native connection check
подтвердил Help ready/browser verified/profile idle до нового dispatch.

Новый собственный локальный стенд использует endpoint `http://127.0.0.1:32769/app/`,
network `loginom-skills-short-20261009`, server ID
`8ef472eed7fd6d6a5cf49ce8dcae115429b20f4cfad6fbb71c33af7f138b8185`.
Нет host mounts; isolated storage marker, Python-disabled config, native proxy
и admission проверены штатным harness. Старый v9 стенд/материалы сохранены,
исходные server/client ID/StartedAt не изменены. Между пользовательскими ходами
server reset не используется.

## Адресная проверка scope и вложений

Из `packages/agent` выполнен один короткий source run:
`bun test test/session/task-scope.test.ts test/util/attachment-preview.test.ts` —
**11 PASS/0 FAIL/40 assertions/2.35s**, без модели/судьи/Loginom/браузера.
Проверены reset на новый user turn, запрет automation внутри docs без нового
запроса, доверенная activation и replay/revert, отказ foreign/malformed history,
точный текст preview и его лимиты. Хэши исходников равны product9695; checkout4257
отличается от product только документами. Повтор понадобился для точной
привязки к source: ранний сохранённый лог не содержал достаточного SHA запуска.
Private receipt SHA256 `5cd6a622efb1f8e5ecc7a1f0d09e4ab0c6781ee46fa6a377c25b99102fe1aeda`.
Все24 файла shutdown RED/GREEN/regression/full-upstream evidence повторно
сверены с ранее сохранённым read-back. Runtime изменение — JS, публичные
TypeScript/IPC не менялись; отдельного runtime typecheck script нет.

## Неизменённый генератор: сохранённые проверки

Сопоставлены полные `skills/package-docs/` и `bin/node` установленного final9695
с полным payload source49: все9 ресурсов совпали по SHA256, включая bundle,
SKILL.md/references/fonts. Ранее установленный49 создал PDF/DOCX/MD с input
unchanged; его result, PDF3-page QA, DOCX XML и MD SHA сохранены, хэши четырёх
QA-файлов повторно проверены. Current Word открытие/все страницы проверены S5.
Это reuse неизменённого генератора, не новый модельный выбор skill.
Private `short-acceptance-9695e61e3-20261009/reused-generator-evidence.json`, SHA256
`92a2308eb93556e01434ea263cc23246352a1a931ccb9ca80f32ae289f3078dd`.
Полная повторная матрица форматов/моделей не выполняется.

## CLI-десятка и cold replay — PASS

**10/10 terminal,9 полных PASS,1 полный FAIL; cold3/3 PASS.** Каждый task
получил единственную модельную попытку в отдельном последовательном процессе.
Все10 имеют judge scored100/checklist, structure PASS, warm CSV oracle PASS
и подтверждённые environment/process cleanup; ручных модельных повторов0.

| Задача | Полный исход | CLI exit | Судья | Структура/CSV | Cold |
| --- | --- | --- | --- | --- | --- |
| sales-by-category | PASS | 0 | 100 | PASS/PASS | PASS |
| abc-pareto-groups | FAIL | 1 | 100 | PASS/PASS | PASS |
| articles-by-author | PASS | 0 | 100 | PASS/PASS | Не выбран |
| campaign-roi-by-channel | PASS | 0 | 100 | PASS/PASS | PASS |
| customer-activity-segments | PASS | 0 | 100 | PASS/PASS | Не выбран |
| monthly-demand | PASS | 0 | 100 | PASS/PASS | Не выбран |
| ab-revenue-per-converter | PASS | 0 | 100 | PASS/PASS | Не выбран |
| risky-approved-claims | PASS | 0 | 100 | PASS/PASS | Не выбран |
| slow-supplier-deliveries | PASS | 0 | 100 | PASS/PASS | Не выбран |
| trial-dosage-outcomes | PASS | 0 | 100 | PASS/PASS | Не выбран |

ABC: первый skill call aborted, CLI exit1/failed/tool/CLI_TOOL_FAILED.
Harness `pass:true` оценивает артефакт; полный исход консервативно FAIL,
в минимум8 CLI PASS он не входит. Risky: имя узла с `>` отклонено как
NOT_APPLIED/effect_possible:false; модель исправила запрос в той же попытке.
Порог выполнен без замены задач и ручных повторов.

Final read-back: private `short-acceptance-9695e61e3-20261009/formal-final.json`,
SHA256 `04ec49980af5d6158f6123549b213f79de770087b635d32d3cca1a550b7ff14a`.
Он связывает все10 gates/results/artifacts и3 cold receipts. Прежний sales gate
не переписан: final receipt добавляет фактический exit0 из result и независимый
cold PASS вместо старых отсутствующих полей. Окончание serial controller0
подтверждено; после десятки новые CLI eval tasks не запускались.

Cold: независимый native reader использует полный installed9695 candidate,
сохранённые package/input bytes неизменны, настройки не применяются заново,
server reset отсутствует. Свежий CSV oracle PASS, close/logout/remaining0.
Каждый read-back содержит18 public files:

- sales SHA256 `f0ab94e3ce474ca1d844e947396fb80fd77c3f8d808108a97ef83994fac1ba21`;
- ABC SHA256 `108163136fbdfcbf713594758c8f8875aaea45e0d8b4c1a2fd3cbec122540c94`;
- campaign SHA256 `fa9649c4a74465347debd369da6e8ede7e0ba55163757b7ae9c4f47bc08310b0`.

Унаследованные cold-reader49/image поля common — историческая справка;
фактический source9695 записан в current result/read-back. Diagnostic discard
native test reader не выдаётся за обычное поведение продукта: штатный shutdown
проверяется отдельно. Первичные0-attempt admission refusals сохранены:
ошибочные ранние own configs, собственный S4 debugger и последующий helper PID
при параллельном S5 setup. Теперь все live checks строго serial. S4 ports
37937/36905 закрыты, helper PID1440162/1440164 отсутствуют; прежняя failed cleanup
receipt не переписана, точная принадлежность helper не доказана.

После окончания десятки её временный task snapshot281 files и cold helper
архивированы вне `/tmp`, исходные/сохранённые SHA сверены, отсутствие открытых
FD проверено. Удалены только `/tmp/loginom-skills-analytic-source-20261008` и
`/tmp/loginom-cold-control-plan.ts`. Receipt282 files SHA256
`a319249d1ce1f6b0e28c5b045fbaf8694ef61df10ecaa306b4e1f50809397afd`;
исторические условия/common paths не переписаны. Текущие Desktop temp roots
и старые recovery материалы не затронуты.

## Выбор skill и документы — S1–S6 PASS, S7/S8 открыты

S1 installed CLI и S2 native Desktop: **PASS** с реальной gpt-6.1-sol medium,
ответ102, tool calls0/Loginom browser execs0/runtime journals0,remaining0.
S1 writer отсутствует; Desktop собственные каталоги удалены. Read-back S1
`f3b32b4e2508b63a0b16444e6f5ea992b0fba44f398a535c655f6a93ee95c090`,
S2 `9ba065aee0e1959a5486df45f147a0729dfd8fc58afea5e5f29d1bcb74535a7d`.
S3 **PASS**: Help loginom_find completed и содержательный ответ о Калькуляторе,
Loginom endpoint127.0.0.1:9 недоступен, skill activation/browser execs/runtime
journals0,remaining0; read-back
`10ce2e105f4928291a51f024076482405376c15bf2102d9513b1e4d07df005fa`.
S4 **PASS**: native Desktop создал настоящий PDF2 страницы по nested `.lgp`
и PNG с пробелами/кириллицей в пути, в каталоге сессии. Все страницы просмотрены:
1 модуль/6 узлов/2 подмодели/depth3 и связи отражены верно, неизвестные
бизнес-цель/формулы/код указаны явно. Вход unchanged, browser/upload/journals0,
remaining0, фактические inspector/CDP ports закрыты. Read-back
`49aa0ace2989d5efc98eaa0f7b0f6e577b2d3692fa9a138e83938200574429f6`.
S5 **PASS**: installed CLI `--file`/`--dir` создал явный DOCX, он открыт
в bundled LibreOffice в собственном network:none Ubuntu26-контейнере; обе
страницы просмотрены, факты/вход/изоляция/remaining0/writer absent подтверждены.
Host-render ABI failure и первая ошибка cwd сохранены, оба контейнера удалены.
Дополнительное точное имя `lgp_report.docx`, добавленное адаптером сверх
обязательного S5, генератор не поддерживает; модель сообщила фактическое имя.
Произвольное имя файла не считается проверенным. Read-back
`e58da94ce34d8f0e7e5a205619e926eef083ec47e5a826eb9aa1ce97d96dfe55`.
S6 **PASS**: запрос локального `.lgp`, готового отчёта нет, только activation
package-docs; browser/upload/journals0,remaining0/writer absent. Read-back
`e4eb8d888b36967ae8cdf90aed6d2c55a55e270720c2226f184e6766f7474d61`.
Десятка и cold3 приняты. Для итоговой цели ещё нужны S7/S8,
небольшое изменение/execute/save после writable reopen установленного CLI,
одна штатная отмена с процессным наблюдением и итоговая очистка.
Предыдущий scripted normal shutdown/writable reopen нового CLI прошёл;
он подтверждает native lifecycle, но не выбор skill реальной моделью.

Отбор по прошлым успехам ограничивает охват: нет statistical non-inferiority,
полных35 задач, соединений и построения подмоделей. Причина старого long-run
harness hang остаётся UNKNOWN; его результаты не считаются новой приёмкой.
