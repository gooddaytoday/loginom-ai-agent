# Возобновлённая приёмка package-docs на OpenAI

Статус: частичная приёмка; bc6 live-матрица завершена с native/infra отказами.
Новый candidate669: Desktop/CLI installed Linux5/5 для каждого; PDF layout и
Desktop native opening4/4 PASS. SUM bc6→cold6693/3 PASS. Полные живые
corpus/TUI/lifecycle/independence/A-B и остальные cold gates остаются открытыми.
Основная модель: `openai/gpt-6.1-sol`, variant `medium`.
Source первоначальных clean candidates: `c50d220c186a1ef0332b15c4a3e9fb1bc7e42efc`.

CLI archive SHA-256:
`cef60cbddcb8ea2794fb43adaf66b212bc448c8256203c24cfd2ccfd1808d852`.
Installed CLI image:
`sha256:70eb479b207cc911035a7ee74cc8226f5d4486f8209eff41f0ee5ef32e01fa55`.
Desktop AppImage SHA-256:
`c6f5ef102f23f19bf18ab55ded3cba4ce4479228b619b8586ee7af12e5b14539`.
Desktop DEB SHA-256:
`111c141f3185a684fc25838fa9011a839d287e32199d1576112fdfb09a014a82`.
Models snapshot:
`e47bd31afb882a62655a5783b4b37fb47bbd7652ab71b1ab0a85cfecfd33aacd`.
Используются сохранённые сборки; текущий SHA документации не приписывается бинарникам.

## Результаты

Исторические результаты ниже привязаны к указанным сборкам. Новая AppImage3ece
не получает автоматически live PASS предыдущей модели/сборки; её проверка
открытия описана в конце отчёта.

| Кейс | Desktop | Standalone CLI run |
| --- | --- | --- |
| `docs-attached-pdf` | 3/3 mechanics, facts, layout PASS; 9 страниц просмотрены | 3/3 mechanics, facts, layout PASS; 6 страниц просмотрены |
| `docs-attached-word` | 3/3 mechanics, facts, layout PASS; 6 страниц просмотрены | 3/3 mechanics, facts, layout PASS; 6 страниц просмотрены |
| `docs-markdown` | 3/3 mechanics, facts PASS; весь Markdown прочитан | 3/3 mechanics, facts PASS; весь Markdown прочитан |

Проверенные PDF сохраняют версию 7.4.0, модуль «Демо», шесть узлов, две
подмодели, глубину три и единственную связь Источник → Калькулятор. `data.lgd`
указан как файловая зависимость. Бизнес-назначение, формулы, Python-код,
целевой узел ссылки и результат выполнения остаются неизвестными.
Прочитана настоящая справка ImportNative (`import/ldf.md`), Calculator и Python.
Нет подмены настроек общими возможностями обработчиков. Все шесть `.lgp`
сохранили исходный SHA; docs не запускал Chromium и не оставил своих процессов.
Каждый PDF имеет отдельный `manual-quality.json` с hashes документа и страниц.
Проверка mechanics сама по себе не заменяет ручную проверку фактов и страниц.

Desktop formats driver завершился exit0, failures пуст. По каждому из девяти
прогонов сохранён отдельный manual-quality receipt; просмотрены 15 страниц
PDF/Word и прочитаны все три Markdown. Для Markdown проверены исходный текст
и структура, визуальный рендер страниц не заявляется. CLI formats driver также завершился exit0: все девять
прогонов приняты по фактам; просмотрены все 12 страниц PDF/Word, прочитаны
три Markdown. По каждому сохранён `manual-quality.json`. Проверка acceptance runner
после возобновления: 8 PASS / 35 assertions, pinned Node24.19.0.

В новом `desktop-openai-routing-c50d220c1-resume` начаты ×3 остальные
11 single-turn кейсов: local path, LGP+PNG, внешний путь, отсутствующий файл,
отсутствие входа, только серверная ссылка и пять default-кейсов. Условия
модели/catalog/candidate сохранены; driver завершился exit143 на external attempt2; причина неизвестна.
Семь завершённых mechanics receipts сохранены, local-path3/3 facts/layout PASS
(шесть страниц просмотрены). Все семь готовых отчётов проверены: local-path3/3, LGP+PNG3/3 и external1/1
facts/layout PASS, просмотрены все 14 страниц. External2/3 не завершены.
Незавершённые случаи не засчитаны; debugger/дочерних процессов не осталось.
Negative-кейсы выполнены отдельно с прежними conditions: missing-file3/3
и no-input3/3 PASS; server-reference2/3 PASS, attempt3 FAIL из-за отсутствия
активации skill. Во всех девяти ответах запрошен локальный `.lgp`, ложной
готовности и браузера нет. Согласованный критерий выбора не снижен.
CLI negative batch прерван exit143; уже начатый own контейнер доведён
до exit0, evidence скопирован, контейнер удалён. Missing-file attempt1
mechanics PASS (CLI exit1 ожидаем при ошибке отсутствующего файла); остальная
матрица не выполнена. Причина прекращения родителя не установлена. Сценарные и
многоходовые кейсы требуют отдельных адаптеров и этим запуском не покрываются.

## Исправление выбора без локального файла: 2530143dd

После server-reference FAIL в Desktop c50d bootstrap требует активации
`package-docs` и для отсутствующего файла, отсутствующего входа или только
серверного пути. Новые clean Desktop/CLI имеют source
`2530143dd70f3b87ac80a0d294d03b9856bd5253`; их manifest, source archive,
ресурсы и installed CLI seed проверены отдельно в журнале реализации.

| Кейс | Desktop | Standalone CLI run |
| --- | --- | --- |
| `docs-missing-file` | 3/3 PASS | 3/3 PASS; exit1 после ошибки отсутствующего файла |
| `docs-no-input` | 3/3 PASS | 3/3 PASS |
| `docs-current-server-package` | 3/3 PASS | 3/3 PASS |

Все 18 финальных ответов полностью прочитаны: агент просит существующий
локальный `.lgp`, честно сообщает отсутствие документа, серверный путь
не использует как локальный вход. Фактическая activation/digest подтверждена
в каждом случае; Chromium0, reports0, remaining processes0. Отдельные
`manual-quality.json` закрепляют SHA результата и условия каждого повтора.
Evidence: `cli-openai-negative-2530143dd` и
`desktop-openai-negative-2530143dd-v2` в общем собственном acceptance root.
Модель и frozen catalog прежние: `openai/gpt-6.1-sol/medium`.

Первый запуск Desktop отказал до модельного хода: добавленный внешний
`strace -f` конфликтовал с внутренним `strace` Electron. Причина воспроизведена
на вложенных strace с `/bin/true` (`PTRACE_TRACEME: Operation not permitted`).
Сохранён `launch-failure.json`; v2 трассирует только родительский процесс,
внутренняя трассировка и продуктовые байты не менялись. Live RED c50d → GREEN
2530143dd для выбора skill закрыт. Полная обязательная матрица остаётся открытой.

## Обычные CLI-запросы и построение на локальном стенде

На CLI253 пять default-кейсов ×3 прошли 15/15 mechanics/semantics PASS:
назначение узла, настройка, справка UI, арифметика без подключения и перевод.
Все ответы прочитаны, активации skills нет; Chromium0, reports0, remaining0.
Evidence `cli-openai-default-2530143dd`, individual manual-quality receipts.

`scenario-create` теперь имеет отдельный CLI adapter с настоящим CSV attachment,
проверкой SUM, выполнения и сохранённого `.lgp`. Секреты идут через private
stdin; публичная preflight-проверка допускает только local endpoint и отдельный
тестовый аккаунт/пакет. Тесты границ и verifier:15 PASS/55 assertions; typecheck PASS.
Live `cli-openai-scenario-create-2530143dd-local`, http://localhost/app/:
попытки1/3 PASS, исходный CSV неизменен, Alpha35/Beta20, GUID и связь
Источник→Группировка проверены по фактическим `.lgp`; attempt2 FAIL из-за
UI_EPOCH_CHANGED при настройке импорта. Grouping/save отсутствуют, модель
честно сообщает отказ. Batch exit1; своих процессов0 во всех попытках.
Холодное повторное выполнение ещё не проверено. 2/3 не закрывают gate.

После отказа старый adapter потерял result.json из-за TypeError. Raw events,
trace/process evidence сохранены; отдельно создан recovered-result.json,
исходный FAIL оставлен. Исправленный driver пишет receipt до assertions,
а verifier выдаёт явную причину отсутствия группировки. TDD не ослабляет oracle.

Два предшествующих сценарных запуска ошибочно использовали saved remote URL
https://app.loginom.ai. Они сохранены как deadline FAIL/NOT_LOCAL_ACCEPTANCE;
результаты не смешиваются с local серией. При обнаружении неверного endpoint
наш parent v2 остановлен, уже начатый container штатно завершён exit0,
скопирован и удалён; попытки2/3 не запускались. Пользовательские настройки
не менялись. Исправление private wrapper и public endpoint guard выполнены
до local series. Полные formats/routing на новой сборке ещё предстоят.

## Воспроизводимость и границы

Acceptance root вне Git:
`/home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006`.
Каталоги `cli-openai-formats-c50d220c1-resume` и
`desktop-openai-formats-c50d220c1-resume` сохраняют corpus/fixtures/drivers,
conditions, model snapshot, tool calls, документы и process evidence.
Public runner: `packages/loginom-host/script/skills-acceptance.ts`.
Параметры: `--cases docs-attached-pdf,docs-attached-word,docs-markdown --repeat 3`
и `--model openai/gpt-6.1-sol --variant medium --models-path <сохранённый snapshot>`.
Авторизация передана приватно через stdin; пользовательские auth/profile не менялись.

PDF проверен системными `/usr/bin/pdftotext` и `/usr/bin/pdftoppm`.
PATH override `pdftoppm` оказался несовместим с host glibc и отказал до рендера;
сохранены исходные результаты, использован совместимый системный executable.
Word рендерится отдельным контейнером без сети, исходный DOCX read-only:
`sha256:8d4553ce9058f138e9092a5a00dc34f162cc96f0e3894b6c09e56ffa0f319034`.
Проверяется неизменность DOCX после рендера. LibreOffice/Python не являются
зависимостями продукта: продуктовые генераторы работают на bundled Node.

Ubuntu22 и Ubuntu26 installed Desktop прошли offline smoke c50d;
Ubuntu26 exit0 подтверждён отдельным `linux-matrix.json`. Ubuntu24 и первый
CLI Ubuntu22 build завершились exit143 во время apt install, до smoke. Причина
не установлена, логи и `matrix-interrupted-20261007-resume.json` сохранены;
images и installed results не получены, PASS не заявляется. Ubuntu24 v2 с process/signal trace завершилась PASS,
exit0: installed non-root offline launch. Native CLI installer на Ubuntu22
также PASS: manifest/source чистые, sandbox root:root/4755, настоящий Chromium,
launcher unconfigured, profile sentinel сохранён, uninstall выполнен.
Первый CLI native запуск смонтировал архив другого UID и получил EACCES на
двух файлах Chromium с mode0600; результат сохранён. V2 распаковал тот же
архив от имени тестового UID1200 и прошёл без изменения artifact.
Evidence: `desktop-c50d220c1-linux-matrix-ubuntu24-v2/linux-matrix.json` и
`cli-c50d220c1-native-installed-v2/evidence/result/result.json`.
Отдельная CLI matrix Ubuntu22/24/26, Debian12/13 использует
существующий `test/cli-install-native.mjs`, сохранённый archive и собственные
images/каталоги: установку UID1200, root:root/4755 sandbox, настоящий Chromium,
uninstall и сохранность profile sentinel. Общий Linux gate пока открыт.

Evals read-only SHA `dfe47cce65c9186aaae8e7d4e0d8de68e09972bb` принят соседней
сессией для изоляции; её baseline smoke на `gpt-6-sol/default` не доказывает
нашу A/B пару. Совместимость product skills остаётся отдельной согласуемой
задачей. Общий harness, near-miss и judge не редактировались. Замороженный
план не перерабатывался повторно. TUI, сценарные переходы, полный корпус20,
вторая модель, A/B и остальные installation gates ещё не приняты.

Новая Linux253 matrix: Desktop Ubuntu22 PASS, CLI Ubuntu22 native FAIL по
исходному180s deadline команды profile-init/status (SIGTERM, пустой вывод).
Отдельные startup/strace diagnostics сохранены; подтверждено чтение artifact
manifest/Chromium до запуска Host, причина задержки ещё исследуется.
Высокая IO pressure наблюдалась, причинность не доказана. Повышенный deadline
диагностики не меняет критерий native smoke и не заменяет исходный FAIL.

## Дополнительная проверка253 и source-only исправление PDF

Desktop default15/15 принят, все ответы прочитаны; вместе с CLI default это
30/30 без активации skills, browser/report/remaining0. Linux253 Desktop
Ubuntu24 и CLI Ubuntu24/26 также прошли штатный установленный smoke.
Ubuntu22 CLI FAIL сохранён: самостоятельная проверка manifest и в Node,
и в Bun превысила180s. Bundle override даёт3/3 public CLI status PASS,
но обходит проверку manifest и остаётся только диагностикой.

На253 приняты Word3/3 через каждый интерфейс (все12 страниц просмотрены),
Markdown3/3 через каждый интерфейс (все тексты прочитаны), local-path3/3
Desktop/CLI и attached-pdf3/3 CLI. Во всех этих кейсах пакет неизменен,
настоящая Help прочитана, Chromium0, remaining0. Positive batches ещё идут.

Desktop attached-pdf: факты3/3 PASS, вёрстка2/3 PASS. В attempt3 последний
пункт статистики оказался один на странице3; исходный PDF и отдельный
`LIVE_DOCS_FACTS_PASS_LAYOUT_FAIL` сохранены. Общий gate не закрывается.
Открытие ссылок из финальных сообщений в native UI не проверено; встречались
href с пробелами. Это отмечено отдельно от содержимого и вёрстки документа.

Pagination fixture воспроизводит живой отказ. RED→GREEN: короткий список
статистики остаётся с заголовком, длинные списки сохраняют обычную пагинацию.
Полный source suite генератора50 PASS/193 assertions, Host typecheck PASS;
все3 страницы исправленного PDF просмотрены. Это изменение ещё не входит
в сохранённые сборки253 и требует новой чистой сборки и installed проверки.

Desktop scenario-create253 v3 принят3/3, exit0. Корректное обычное CSV-вложение
использует исходные bytes/text/plain data:, как native UI. Ранее использованные
text/csv и file:-ссылка дали adapter RED; обе серии сохранены отдельно.
Во всех трёх v3 модель выбрала automation, импорт/группировка выполнены,
подтверждены Alpha35/Beta20 и сохранение. По физическим `.lgp` проверены
GUID и прямая связь; холодное выполнение ещё не проверено. remaining0,
ответы полностью прочитаны. Test adapter15 PASS/55, typecheck/Prettier PASS.
CLI positive253 batch также завершён exit0/18 mechanics; QA последних
LGP+PNG и external-path отчётов продолжается, Desktop positive ещё идёт.

## Завершение positive QA253

Обе серии завершились exit0/18 mechanics. LGP+PNG через каждый интерфейс и
Desktop external-path3/3 приняты после просмотра всех18 дополнительных страниц
и чтения финальных ответов. CLI external-path3/3 даёт штатный permission refusal
с `--file` в фактической ошибке, без отчёта. Все33 документа и3 отказа проверены;
один исходный Desktop attached-PDF layout FAIL сохранён. Click verification
ссылок остаётся открытой. Новый чистый CLIbc6 собран/manifest/source PASS;
Desktopbc6 построен, manifest/static DEB/AppImage PASS после установки
закреплённого Electron dependency. Новые артефакты ещё не приняты installed/live.
Linux253: Desktop Ubuntu22/24/26, CLI Ubuntu24/26/Debian12 PASS, Ubuntu22 CLI
исходный180s FAIL; остальные дистрибутивы ещё идут. Desktop/CLI docs-after-build
проверяются отдельными адаптерами в собственной инфраструктуре.

Desktop253 build → docs3/3 принят: один Session ID, физический пакет и его
хэш/граф проверены; оба ответа и все6 PDF-страниц просмотрены. Docs-ход без
нового Chromium/browser calls, remaining0. CLI переход ещё идёт. Source
adapters трёх multi-turn случаев19 PASS/71, typecheck/Prettier PASS; живое
прохождение остальных переходов и cold replay ещё не заявляется.

## 16:07 UTC — самостоятельные adapters и новые кандидаты

Сохранённый CLIbc6 установлен в собственный seed
`sha256:62c79d67f45550e79bf03f944f5e80c0eb641cbb5355dcf5256328351fb5127a`;
архив SHA256 `0f3f8397ce7babfcc66f6f502b5620f85207fc1df69859b1ece892d20c65e056`.
Desktop DEB SHA256 `95f7c9784cbaafc955e74e7715a7a90252f67a2c39e33f336d22afd92a6e79a4`,
AppImage `10a21c24fad06e6a6d5e3d8b934426e9953ac021a5e248cf94333a31df9c4052`.
Оба из clean `bc6e7e1648e211bcf411fbfd86564b950a2aaf75` с tree digest
`928cd84bc77371a00d8136b016f95aadfe72b3b1204b49faa6ec109c67ad4cd7`.
Полный20×3 Desktop/run идёт двумя batches18+2, immutable models snapshot прежний.

CLI253 build→docs3/3 mechanics/facts/layout PASS,6 страниц и6 полных ответов
проверены. Native link click не проверен; attempt2 destination имеет лишние
пробелы, Marked сохраняет их как %20. Ссылка не равна точному output; ограничение
записано в manual-quality.json, исходные events/result не переписаны.

Cold readback одного собственного Desktop253 scenario-create/attempt1 через
установленный runtimebc6 PASS: сохранённый GUID, execution.owner_verified,
точные Alpha35/Beta20, без settings reapply. Пакет SHA83a9e8fc… неизменен,
package close/logout и процессы remaining[] подтверждены. Evidence
`cold-bc6-desktop-scenario-create-253-attempt-1/cold-evidence/result.json`.
Не заявляется cold приёмка остальных пакетов, Linux5 или same-build253.

Новые adapters поддерживают сценарий изменения и выполнения отдельным ходом;
CSV не прикладывается повторно, точность/тип/сохранение проверяются независимо.
Observer test flaky3/5 на250ms: после explicit capture notification GREEN5/5;
короткая задержка убрана, прежние assertions сохранены. Итоговый regression31 PASS/110 assertions и Host typecheck/Prettier PASS. Linux253 CLI180s FAIL на Ubuntu22 и Debian13
сохранены; первопричина timeout ещё не установлена. Desktop Debian12 PASS,
Debian13 ещё выполняется. Общие evals файлы и соседние ресурсы не изменены.

## Installed bc6: PDF и scenario-modify

Основная модель прежняя `openai/gpt-6.1-sol/medium`, source сборкиbc6e7e164.
Desktop attached-PDF3/3 facts/layout PASS, все8 страниц и полные ответы
прочитаны; блок статистики не разрывается. Chromium0/remaining0/input unchanged.
Нативное открытие ссылки из ответа ещё не проверено.

Desktop modify/attempt1 реально остановился в output_mapping калькулятора,
execution/save не завершены. Attempt2 выполнил20/40/50 и сохранил собственный
пакет, но parser acceptance упал на текстовом footer inspect. Adapter исправлен
RED→GREEN (12 tests/typecheck/Prettier PASS); отдельный offline receipt подтверждает
execution/save/physical GUID/link по прежним messages. Оригинальные FAIL сохранены,
качество не переигрывалось, полный gate не закрыт.

Desktop253 Linux5/5 PASS. CLI253 Ubuntu22/Debian13 timeout случился на archive
manifest до установки; это не доказанный отказ installed launcher. Остальные
три CLI Linux PASS; идёт ровно одна offline-проба, исходные FAIL сохранены.

## Завершение bc6 и новая доставка Desktop3ece

Четыре bc6 batch штатно закончились с исходными receipts, без quality retries.
Desktop/CLI routing18×3 и modify/execute-save2×3 не прошли полный gate:
поздние configured-кейсы получили LOGINOM_KNOWLEDGE_UNAVAILABLE до модели.
Отдельный HTTPS health probe тоже отказал с TLS unexpected EOF/HTTP000.
Это не доказанная модельная ошибка выбора skill. Пока Help недоступен, новые
live/model попытки не запускаются; unconfigured арифметика/перевод завершились.

CLI attached-PDF: все7 страниц, полные тексты и ответы проверены, facts/layout
PASS. Attempt2 оставил готовый отчёт, но превысил native deadline480s:
interrupted=true, wall576135ms, исходный mechanics FAIL сохранён. Готовый PDF
не превращает этот запуск в успешный. Остальные два mechanics PASS.
Desktop local-path3/3: все6 страниц/ответы проверены, PASS. Desktop Word3/3:
все6 страниц/тексты/ответы проверены, facts/layout PASS; Markdown3/3: исходные
тексты и ответы прочитаны, facts PASS без заявления page rendering.

Desktop execute-save3/3 mechanics PASS. Modify2/3 native execution/save
подтвердили20/40/50; исходные adapter footer FAIL не переписаны. Modify1 native
output_mapping FAIL остаётся. CLI modify3/3 открыли пакет read-only и не
завершили нужное изменение; владелец/причина server lock не установлены.
Полный signal report `scenario-modify-signal-20261007-v2/report.md` сверяет
все32 исходных hashes. Recovery/ownership/handler guards не ослаблялись.

Отдельный offline Ubuntu22 CLI253 full-integrity probe PASS167781ms;
первый stdout167441ms, Host стартовал167372ms. IO pressure наблюдалась,
причинность не доказана. Remaining0/forced signals0/container removed.
Это самостоятельная диагностика прежней сборки, исходные180s matrix FAIL
на Ubuntu22/Debian13 сохраняются.

Чистая AppImage3ece19aff SHA256
`c20dcfa21abdb14d33136150d702f764d3d05e3d0f7cdc833ff0d49b69ba934f`
и DEB `d43c710aa7dd62816a21effee22c4556390a893a1c8eb63b455a8fd595a48cf2`
прошли manifest/static verification. Resources digest совпадает с bc6.
Новая UI кнопка у completed package_docs_run emit проверена native replay:
2 PDF, Word, Markdown —4/4 PASS через настоящий open-local-file IPC и окна
Evince/LibreOffice/gedit. Подмена local handler отсутствует; внешний browser
handler изолированного приложения отключён и не вызывался. Раздельные Session
ID/directories, private HOME/runtime, D-Bus внутри Xvfb, Loginom unconfigured,
live model calls0; после закрытия Desktop и просмотрщиков remaining0.
Receipts/screenshots/hashes — `native-document-link-3ece-green-v6/verification.json`.
Source tests3 и regression17/55 assertions/typecheck PASS; эта проверка новой
UI доставки не подменяет живой выбор skill и полную installed/model матрицу.
Старый bc6 RED и промежуточные ошибки private probe сохранены отдельно.
Linux matrix3ece, CLI/TUI и A/B gate остаются самостоятельными проверками.

## Linux: новые Desktop и CLI, автономная приёмка

Desktop из `3ece19aff72f5d95f88347564bb61566029cae52` и CLI из
`bc6e7e1648e211bcf411fbfd86564b950a2aaf75` прошли Ubuntu 22/24/26,
Debian 12/13: **5/5 PASS каждый**. Это отдельные установленные артефакты,
не перенесённый результат прежней сборки253. App UI — единственное изменение
продукта после bc6; SHA CLI не заменяется SHA последующих doc commits.

Все контейнеры работали с `--network none`, без модели и Loginom endpoint.
Desktop: прежний DEB удалён в собственном контейнере, точный новый DEB
установлен через dpkg; настоящий Electron запущен от tester UID1200.
Проверены полный resources manifest, onboarding/unconfigured, поля настроек
и настоящий headless Chromium с sandbox. CLI: исходный архив распакован
заново, выполнены profile-init/install/installed status/browser/uninstall;
полный manifest, root:root4755 sandbox, сохранение profile sentinel и удаление
launcher подтверждены. Штатный180s срок CLI не увеличивался. Все10 собственных
контейнеров удалены после exit0. Установка и профиль пользователя не менялись.

Evidence root:
`/home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006`.
В `desktop-3ece19aff-linux-matrix-v2/linux-matrix.json` сохранены artifact/source,
пять immutable image IDs, removal и hashes smoke/controller;
в `cli-bc6e7e164-linux-matrix/linux-matrix.json` — соответствующие CLI receipts,
image IDs, manifest и hashes controller/driver. Проверки запускаются private
контроллерами `run-desktop-3ece-linux-offline-v2.py` и
`run-cli-bc6-linux-offline.py` через Python3; это зависимости тестирования,
не установленного приложения. Их SHA256:
`60591b3a99627133019c41adba6ef2b303e8a3baa87add81d57069097b83f5d3` и
`172be20ab213e528a58c4d40b9bdfc68834d4c2d8d3820d6f115db73ded345d8`.
CLI archive SHA256 `0f3f8397ce7babfcc66f6f502b5620f85207fc1df69859b1ece892d20c65e056`;
manifest `afe9348fb5476cc522d685d3e568b0b47d40c142e005b72ffb21f40f41f708b6`.
Desktop artifact hashes приведены выше и совпадают с matrix receipt.

Первоначальный private Desktop builder некорректно передал raw image ID
в Dockerfile FROM: Docker попытался загрузить `docker.io/library/sha256`.
Этот harness FAIL сохранён; зависший собственный controller/Docker client
завершён с проверкой PID/start-time, exit130 (`driver-abort.json`). Исправленный
контроллер использовал `docker run` с immutable image ID и прошёл5/5.
Это ошибка тестового запуска, не Desktop regression. Прежние CLI253 archive
manifest180s FAIL остаются исходными FAIL; новая тихая offline матрица не
доказывает их причину и не объявляет исправление производительности.

CLIbc6 Word3/3: все6 страниц, полные тексты и финальные ответы проверены;
mechanics/facts/layout PASS. Исходные DOCX при QA не изменялись. Markdown3/3:
полные исходные документы и ответы прочитаны, mechanics/facts PASS; рендеринг
страниц и native click не заявляются. Каждый manual-quality содержит hashes,
настоящую Help, неизменный `.lgp`, Chromium0 и remaining0.

Повторный bounded Help health probe вновь завершился TLS unexpected EOF,
exit35/HTTP000 (`help-health-20261007-resume.json`). Новые live/model прогоны
не начинались. Эти автономные и ручные проверки не закрывают этапы6–8 целиком.

## PDF: отделившийся заголовок в сохранённом отчёте

Desktopbc6 `docs-external-unicode-path` проверен3/3: факты/mechanics PASS,
layout2/3. В attempt1 жирная строка «Общая структура:» завершает страницу1,
текст начинается на странице2. Исходный PDF и manual-quality layout FAIL
сохранены; attempts2/3 layout PASS. Все6 страниц/полные тексты/ответы прочитаны,
настоящая Help, вход неизменен, Chromium0/remaining0. Клик старых ссылок не проверялся.

По исходному draft выполнен RED→GREEN: PDF layout держит заголовки и отдельные
полностью жирные labels с первой строкой следующего блока. Короткие списки
статистики по-прежнему сохраняются целиком. Regression56 PASS/675 assertions,
160 сочетаний heading/body/page boundary, Host typecheck PASS. Markdown/DOCX
не менялись, прежний Word XML parity проходит. Первая ошибка расширенного
теста была в склейке перенесённого пробела PDF reader; сохранена отдельно.

Public Node executor собран из изменённого source; обе страницы результата
того же draft просмотрены: заголовок и текст вместе, остальная структура
сохранена. Evidence `paragraph-pagination-source-green/render-receipt.json`,
PDF SHA256 `d0991e68c12c115d909289027e2bc08ab3866f4cc9f2f3d733d647f55fc95d6d`.
Первоначальный QA renderer из PATH потребовал отсутствующую GLIBC2.38;
сохранён harness failure, использован `/usr/bin/pdftoppm`. Продуктовый executor
успешен до QA и не использует системный Python/Poppler. Это source-only proof;
артефакты3ece/bc6 не relabelled, новый installed candidate ещё необходим.

## Дополнительная QA сохранённых bc6 прогонов

Все сохранённые положительные docs-кейсы bc6 теперь прочитаны: документы,
полные финальные ответы и каждая PDF/Word страница. Desktop `.lgp`+PNG3/3
PASS (7 страниц); CLI local-path3/3 PASS (7 страниц). CLI `.lgp`+PNG факты/
mechanics3/3, layout2/3 (6 страниц): attempt1 воспроизводит тот же orphan label,
по которому выполнен TDD fix выше. Его FAIL сохранён; final Markdown destination
также имеет лишние пробелы внутри angle brackets, native click не заявляется.
Из PNG не придуманы формулы, Python-код, цель ссылки или результаты выполнения.

Desktopbc6 build→docs3/3 mechanics/facts/layout PASS: все6 PDF-страниц и оба
ответа каждой попытки проверены. Первый ход построил, выполнил и сохранил
SUM35/20; граф/source/grouping GUID и bytes подтверждены package-proof.
Второй ход в том же Session ID документирует точную локальную копию пакета,
читает настоящую Help, не вызывает browser tools/новый Chromium; input unchanged
и remaining0. Отчёты отделяют названия узлов от отсутствующих детальных настроек
группировки и численных результатов. Cold replay этих трёх пакетов не заявляется.

Desktop negative missing/no-input/server3×3: правильный запрос локального `.lgp`,
нет отчёта и ложного объявления готовности; applied docs activation/Chromium0/
remaining0. CLI missing3/3 сохраняет exit1 и честно сообщает об отсутствующем
файле. CLI external-path3/3 — безопасный отказ external_directory с подсказкой
передать `--file`, исходный exit1 сохранён; это не успешная генерация документа.
Обычные арифметика/перевод Desktop/CLI2×3×2 дают корректный ответ без выбора
skill, отчёта или Chromium. Эти27 semantic receipts не закрывают остальные
configured cases, где модель не запускалась из-за Help TLS.

Повторный read-only direct health probe без изменения global proxy/environment
также не получил HTTP: connection refused, exit7/HTTP000. Доступность Help не
подтверждена; новые live/model attempts не запускались.

## 2026-10-07 — установленный кандидат 669822296 и холодные SUM-пакеты

Desktop и standalone CLI построены из одного чистого SHA
`669822296615accbd6579c09244dacb24f77a056`; version0.1.17, Node24.19.0,
Bun1.3.14, Electron42.3.3, Playwright1.63.0-alpha-2026-08-31/MCP0.0.80,
Chromium1243. Сборки не опубликованы, человеческие launcher/profile не менялись.

| Артефакт/manifest | SHA256 |
| --- | --- |
| CLI tar.gz | `79c287c4cc70f8c62fd33353f1cd0699b3d8d870f31234cb6cf05b74cc8fb4b0` |
| CLI manifest | `74a70dc771399a7edfe4936b8bb40388c44bd0ebca8dbe1fff64a9e48a7e709f` |
| Desktop DEB | `ee8efecc6bbd2a23c25444f8db1f3672206c45733c757c92f6912a559481f42d` |
| Desktop AppImage | `49bb5e5b18e71af29037a2c51e5451024e195e8a7f017639de25d29eabdfbded` |
| Desktop release manifest | `fb38b8af638bb9270188ddbe2d6083dd5c18e43951213b33347f9a3b586c32a7` |

В собственном acceptance root выполнены `run-cli-669822296-linux-offline.py`
и `run-desktop-669822296-linux-offline.py`: CLI5/5 и Desktop5/5 PASS на
Ubuntu22/24/26, Debian12/13. Каждый контейнер работал с network=none,
исполнение от UID1200, реальный Chromium sandbox, полный manifest. Desktop
проверял установленный DEB/Electron/onboarding, CLI — публичные install/status/
browser/uninstall и сохранность profile sentinel. Все десять контейнеров удалены.
Evidence: `cli-669822296-linux-matrix/linux-matrix.json` и
`desktop-669822296-linux-matrix-v2/linux-matrix.json`.
Это установка/локальный runtime; повторная живая модельная матрица не заявляется.

`run-installed-pdf-669822296.py` использовал именно установленный Node и
`skills/package-docs/scripts/package-docs.mjs`, network=none. PDF/DOCX/MD созданы;
исходный nested.lgp сохранил SHA73bca886d. Обе страницы PDF просмотрены целиком:
«Общая структура:» и текст теперь находятся вместе, потери/обрезки текста,
пустых страниц нет. PDF SHA256
`d0991e68c12c115d909289027e2bc08ab3866f4cc9f2f3d733d647f55fc95d6d`.
Evidence: `cli-669822296-installed-pdf/{result,manual-quality}.json`;
это installed GREEN ранее сохранённого label/layout FAIL. Модель/Help/Loginom
не вызывались; факт формирования файла не заменяет проверку выбора skill.

Новая AppImage прошла `run-native-document-669822296.py`: четыре сохранённых
модельных результата bc6 (PDF2, DOCX1, MD1) показаны через штатный backend/UI.
Настоящая кнопка отправляла `open-local-file`; наблюдались реальные окна
Evince/LibreOffice/gedit. Внешний браузер не запускался, owned viewers/processes0.
Evidence: `native-document-link-669822296/verification.json`, UI snapshots,
IPC и PID/start-time; все4 PASS. Новых model/Help/Loginom calls0.

Три собственных Desktop bc6 `docs-after-build` SUM-пакета независимо открыты
новым установленным CLI/runtime669, с новой браузерной сессией на каждый пакет.
Native3/3 PASS: известные GUID/type/label, fresh completed/owner_verified,
два точных значения Alpha35/Beta20, settingsReapplied=false, SHA файла неизменен.
Открытые пакеты закрыты, logout подтверждён, remaining processes0. Это смешанная
проверка warm-model-bc6/cold-runtime669; она не подменяет warm gate новой сборки,
calculator/import cold или полную A/B suite. Исходный сервер/клиент не переключались.

Evidence: `cold-669822296-desktop-docs-after-build-bc6/collection-recovered.json`.
Native driver и uninstall завершились PASS. Host collector сохранил исходный
exit1: каталоги cold-1/2/3 имеют mode0700 и контейнерный UID1200. После завершения
его собственного контейнера отдельный network=none container вернул владельца
только нашему evidence (UID1001), сохранив bytes и ограничения доступа. Проверены
уже записанные native receipts, cleanup и физические before/after SHA. Браузер/
модель не повторялись; collector FAIL не переписан в первоначальный PASS.

Свежий health на 2026-10-07T19:04Z: proxy TLS EOF/exit35 и direct connection
refused/exit7, HTTP000 в обоих случаях. Глобальная среда не менялась, новые
модельные прогоны не начаты. Необязательный вызов private auth wrapper без
аргументов отказал на validation acceptance runner; это не доказательство отказа
OAuth. Полные corpus/TUI/upgrade/A-B и сценарные live gates остаются открытыми.


## 2026-10-07 — проверка обновления установленного payload

Ubuntu24 offline Desktop и CLI669 сохранили настройки, auth fixture, user skill
и историю при замене payload. CLI продолжил прежний sessionID до/после
обновления; второй writer получил PROFILE_BUSY/3. Desktop использовал обычный
постоянный HOME/XDG и public backend/noReply. Оба результата PASS, exit0,
containers removed, own processes0. Продукт и180s deadline не менялись:
resume FAIL v2/v3 вызван открытым stdin внешнего execFile; точный RED3/3 и
EOF GREEN3/3 плюс installed v4 сохранены рядом с исходными FAIL.
[Полные команды, hashes и ограничения](2026-10-07-package-docs-upgrade.md).
Это synthetic/noReply проверка сохранности, без внешних model/Help/Loginom calls;
полную живую матрицу и browser independence она не закрывает.

## 2026-10-07 — отдельная локальная приёмка669 без внешней модели

Чистый установленный Desktop catalog/integrity PASS; installed CLI PTY6/6
и QA всех четырёх PDF PASS, без браузера Loginom. Холодный новый запрос в
прежней CLI сессии сбросил docs→default; старый grant сохранён без применения.
Cleanup/public uninstall подтверждены. Это controlled provider/локальная
механика, не продолжение живой матрицы6.1-sol/medium.
[Hashes и команды](2026-10-07-package-docs-local-installed.md).
