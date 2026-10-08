# Возобновлённая CLI669 PDF приёмка

Кейс `docs-attached-pdf` **не принят**: mechanics и facts 3/3 PASS,
layout 2/3 PASS. В третьем PDF заголовок «Модуль 1. Демо» остался в конце
первой страницы, описание началось на второй. Этот FAIL сохраняется;
`summary.json` самого адаптера подтверждает только механику.

Три заранее заданных повтора завершены на `openai/gpt-6.1-sol/medium`,
один models snapshot SHA256
`e47bd31afb882a62655a5783b4b37fb47bbd7652ab71b1ab0a85cfecfd33aacd`.
Source CLI: `669822296615accbd6579c09244dacb24f77a056`, clean0.1.17.
Payload manifest SHA256
`74a70dc771399a7edfe4936b8bb40388c44bd0ebca8dbe1fff64a9e48a7e709f`;
installed image
`sha256:2a24f8bc26b75945f7f87fd9baa1772a2539bf15a4081c0d8ea588128d6fdf46`.
Проверены все 5651 файлов/режимов, совпадение manifest, пустой профиль,
UID1200 и root:root4755 sandbox. Установленный пользовательский CLI не менялся.

Вход — только отслеживаемый synthetic `nested.lgp`, SHA256
`73bca886d6010637becf6cb41ad2fd69ba64269e8251426c4e0a7e7ad2de483c`.
До запуска просмотрены все пять XML: demo, искусственные GUID, отсутствующие
формулы/код; данных пользователя и credentials нет. PDF является выходом.
Первая automatic approval review отклонила действие, предполагая передачу
чувствительного входного PDF. После проверки входа и предоставления его
происхождения та же команда разрешена; обхода отказа или смены payload не было.

## Проверенные результаты

| Повтор | Exit | Страниц | Факты | Вёрстка | SHA256 PDF |
| --- | --- | --- | --- | --- | --- |
| 1 | 0 | 2 | PASS | PASS | `dcd8caf8c6c7126280f940ea825a20dc22dbdaea635230ff3fe6fb2aa1932220` |
| 2 | 0 | 3 | PASS | PASS | `c8b2fb9d80f5498f754538f7ce929905ae13aed4d7aba21f74393a23f44468ab` |
| 3 | 0 | 3 | PASS | FAIL: отдельный заголовок | `3c14407767e227e946befb9e71af188f5d601e810bd4b803a31b0b35ca0afe09` |

Все восемь страниц отрендерены и просмотрены, полный текст каждого документа
прочитан. Статистика соответствует fixture: версия7.4.0, один модуль,
шесть узлов, две подмодели, глубина3 и единственная связь Источник → Калькулятор.
`data.lgd` отмечен как отдельная файловая зависимость. Бизнес-цель, формулы,
код и цель ссылки честно оставлены неизвестными. Нет placeholders или
заявленного выполнения сценария. Успешно прочитана настоящая Help по
Калькулятору/Python/подмодели и импорту Native; общие возможности типа не
подставлены вместо неизвестных настроек конкретного узла.

В каждом повторе подтверждён backend-applied `package-docs` digest
`7d8e8c81a785f20a17be1babd8e297aba3b0ed2e32b892ced903f3c386de2552`.
Исходный `.lgp` неизменён, отчёт создан в собственном workspace.
Help `state=ready`, API key present/password absent, browser failed с
`LOGINOM_LOGIN_UNAVAILABLE`: настоящий key-only Help работает при недоступном
web login. Browser execs0, remaining processes[], контейнеры удалены3/3.
Общий Loginom endpoint и исходные server/client не использовались.

Evidence и отдельные `manual-quality.json` с PDF/text/page hashes:
`/home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006/openai-669-cli-docs-pdf-20261008`.
Системный Poppler выполнил проверку страниц; bundled Poppler был несовместим
с host GLIBC2.38 и не использовался после зафиксированной ошибки запуска.

## Продолжение

Новые live669 остановлены. Точный synthetic Markdown третьей попытки сохранён
как `heading-chain-pagination.report.md` в тестовых fixtures. Для исправления
нужно удерживать цепочку последовательных заголовков вместе с первой строкой
содержимого, а затем собрать новый candidate и повторить затронутую приёмку.
Этот исходный FAIL не переписывать и не приписывать новой сборке её результаты.

Source-исправление завершено отдельным TDD-циклом: уточнённый regression
проверяет страницу описания и требует на ней заголовок модуля и первую строку.
Он подтверждён RED на прежнем renderer, затем GREEN. Нельзя выбирать страницу
по первому вхождению названия модуля: оно повторяется в списке модулей.
Renderer теперь резервирует цепочку заголовков/полужирных меток и первую строку
содержимого. Полный docs suite: **57 PASS, 0 FAIL, 678 assertions**;
пакетный typecheck PASS. Assertions и deadlines не ослаблены.

Первый source suite внутри exec sandbox дал 17 исходных Node CLI EOF отказов
и отказ нового теста с неоднозначным выбором страницы. Узкий signal collector
получил 3/3 стабильных EOF даже у `Bun.spawn` Node sentinel без продуктового
кода; прямой Node работал. Вне exec sandbox sentinel и исходный builder test
прошли, хэши исходников совпали. Финальный полный docs suite проведён в этой
нативной среде. Конкретный механизм потери async pipes в sandbox не локализован;
коду продукта он не приписывается. Исходные logs/отчёт сохранены.

Собранный standalone executor под pinned Node24.19 с `PATH=/nonexistent`
повторно обработал тот же неизменный synthetic Markdown; все три страницы
результата просмотрены, module heading/description/first line теперь на
странице2, текст сохранён. Source visual QA PASS. Первая команда проверки
правильно получила `PACKAGE_DOCS_REQUIRED_SECTION`: controller скопировал
`.lgp`, а фиксированный текст называл `.LGP`. Контроллеру восстановлено точное
исходное имя, проверки секций сохранены. Это source QA, не новая installed
или live приёмка; следующая сборка и её обязательные проверки ещё требуются.

## Новый установленный candidate 49b1584f2

Исправление зафиксировано в `49b1584f23b4aa47e18b26119389d6f45623fc94`.
CLI, DEB и AppImage собраны из собственного чистого build worktree; manifest,
ресурсы и оба Desktop-артефакта проверены. Версия0.1.17, Bun1.3.14,
Node24.19.0, Chromium1243; публикации не было.

| Артефакт | SHA256 |
| --- | --- |
| CLI tar.gz | `3de2ad8eabb0625dee91076ea02e12c2b09a71f82abdc140adbd80824a661f4f` |
| CLI manifest | `13896844e3ec3c3620d3c082aea2d426c3c64ac0ca10fb86da8bf931c06024f7` |
| Desktop DEB | `799d9008ac2754901bffe68fc019e6bb6ea460729cbb6c6f88ae1ea5a7d83d19` |
| Desktop AppImage | `758f08f3fb223d5554455a52d5a82aa72bf65220dd65c36ed2f3035a84780191` |
| Desktop manifest | `b8463a3a8e2f390fd54ad573f1cc05c17d0673efb2f7c203cd3bdee9f8f040b5` |

Новый установленный CLI: Ubuntu22/24/26 и Debian12/13 **5/5 PASS**, non-root,
network:none, sandbox root:root4755, сохранение профиля и uninstall проверены;
все пять контейнеров удалены. Desktop прошёл ту же offline matrix:
Ubuntu22/24/26 и Debian12/13 **5/5 PASS**, non-root, network:none;
все пять контейнеров удалены. Результаты669 не подставляются за49.

Отдельный установленный CLI через public install обработал тот же точный
Markdown третьей неудачной попытки669. PDF имеет три страницы; все просмотрены,
заголовок модуля, описание и первая строка вместе на странице2, обрезки и
наложения нет. PDF SHA256
`ccd3cc1a94b0c35146097399294fdd4d3be2ba626329d2cc44d68f7f28c9595d`.
Также emit создал DOCX/MD; XML DOCX и Markdown проверены на обязательные
разделы и отсутствие placeholders. Визуальная проверка относится к PDF.
Исходный `.lgp` неизменён; вызовов модели/Loginom0, контейнер удалён.
Evidence: `cli-49b1584f2-installed-pdf/result.json` и `manual-quality/`
в собственном acceptance-каталоге.

Создан установленный seed
`sha256:69458bc04bae35f3313959cb30dee3eec93f449600566e49b77fab515e178e1e`.
Полная проверка5651 hash/mode, manifest bytes, UID1200, root:root4755 PASS.
Дополнительно проверены реальные канонические HOME/.config/com.loginom.aiagent
prod/beta/dev: профилей нет. Первая probe-команда ошибочно ожидала Python в
base image и завершилась до проверки; её log сохранён. Те же критерии
проверены поставляемым Node, продукт и образ после сборки не изменены.

На новом candidate `docs-attached-pdf` **3/3 PASS отдельно в CLI и Desktop**,
OpenAI6.1-sol/medium с прежним models snapshot. Прочитаны полные тексты и
просмотрены все17 страниц: CLI2/3/3, Desktop3/3/3. Правильные факты/статистика,
все уровни вложенности, неизвестные настройки без выдуманного поведения,
явная data.lgd-зависимость; placeholders и ложного объявления выполнения нет.
Механика, факты и layout PASS6/6. Реальный Help read и backend-applied
package-docs подтверждены в каждой попытке; digest CLI2b393882…,
Desktop87a707b7… фиксируются отдельно по verified trees этих артефактов.
Input SHA до/после совпадает6/6, browser execs0, remaining processes[],
CLI containers removed3/3, Desktop roots/temporary removed3/3.
`manual-quality.json`, изображения/текст и отдельный `manual-summary.json`
сохранены в `openai-49-{cli,desktop}-docs-pdf-20261008`.

Оставшаяся docs/default matrix:13 случаев ×3 отдельно через CLI/Desktop,
каталоги `openai-49-{cli,desktop}-routing-20261008`. Оба верхних контроллера
завершились с exit143 до конца набора; общего `summary.json` нет.
Сохранены35/39 результатов CLI и26/39 Desktop. CLI arithmetic/attempt2
штатно завершился внутри контейнера с exit0 и ответом102; evidence восстановлен
из уже остановленного контейнера, remaining[], контейнер удалён. Новых
обращений к модели при восстановлении не было. Недостающие4 CLI и13 Desktop
слотов не считаются успешными. В Desktop node-purpose/attempt3 trace содержит
Electron SIGILL и последующий AppImage SIGPIPE; источник SIGTERM двух верхних
контроллеров не установлен, OOM CLI не зафиксирован. Проверка382 PID/TID
оборванного Desktop не обнаружила живых совпадающих идентичностей.
После свежей повторной проверки identity=0 сохранена безопасная диагностика
в `routing-controller-interruption-20261008`, удалены только два собственных
временных root. Фактический CDP42649 не слушает; Node inspector порт не был
сохранён, собственных процессов не осталось. Receipt явно не утверждает
штатное завершение оборванного Desktop. Исходные Loginom server/client не менялись.
Эти продуктовые прогоны не являются analytic A/B. Общий этап6 ещё открыт.

Отдельный ручной review принял **27 положительных документов**: PDF15,
Word6 и Markdown6. Просмотрены все30 страниц PDF и12 страниц Word,
прочитаны полные тексты. Во всех отчётах правильные данные nested fixture,
data.lgd-зависимость и неизвестные настройки; нет placeholders, выдуманного
выполнения, обрезки, наложения или отдельного заголовка. Word отрендерен
bundled LibreOffice в собственном offline Ubuntu24-контейнере; native
OS-opening этих новых документов ещё не проверено. Каждая попытка содержит
реальный успешный `loginom_read` Help и backend-applied package-docs,
неизменный input SHA, browser execs[] и remaining processes[]. Desktop
external-path3/3 содержит реальные запросы/одобрения permission и корректные PDF.

Также приняты **21 отрицательный docs-случай**: missing/no-input/current-server
×3 каждого интерфейса и CLI external-path×3. Они запрашивают локальный файл
или явно отказывают с подсказкой `--file`, не ищут пакет в браузере и не
создают отчёт. Inner CLI exit1 при missing/external — ожидаемый отказ,
outer container exit0 и очистка подтверждены. Сохранены per-attempt
`manual-quality.json` и отдельные manual positive/negative summaries;
их PASS относится к проверенным случаям, а не всей прерванной матрице.

Недостающие single-turn слоты теперь выполнены отдельно, на том же clean49,
models snapshot и corpus SHA. Aggregate `routing-49-single-turn-summary-20261008`
содержит **84 завершённые попытки:14 случаев ×3 каждого интерфейса**.
В него входят33 положительных отчёта,21 отрицательный docs-случай и30 default
ответов. Automation/docs не активируются для справочного вопроса, арифметики
или перевода; reports/Chromium0, арифметика102, перевод корректен. Ошибочные
дополнительные URL в трёх Desktop-ответах перенаправляются в общий `/userguide/`,
а не на конкретный обработчик; это отдельное зафиксированное ограничение,
не утверждение безупречности ссылок. Содержательные ответы на исходный вопрос
сопоставлены с реальной Help. Неполный исходный Desktop node-purpose3 сохранён.

Возобновлённый Desktop defaults контроллер также вернул outer143, но все12
result/processes/cleanup и свой summary failures[] уже записаны; root и
temporary удалены12/12, remaining[]. Его верхний exit не переписан на0.
Остальные resume контроллеры exit0. Новый контрольный native AppImage49
действительно открыл по кнопкам два PDF, один Word и один Markdown: **4/4 PASS**,
в своих системных просмотрщиках. Это повторное отображение сохранённых
сообщений только собственной сессии, live model/Help/Loginom calls0;
remaining processes/viewers[]. Evidence `native-document-link-49b1584f2`.

Установленный CLI49 native TUI: **6/6 PASS** — paste/@, обе формы с
`/package-docs`, external-path allow/deny. Synthetic provider, без реального
Help/Loginom/модели. Четыре полных PDF имеют по одной странице; все просмотрены,
факты demo fixture и layout PASS4/4. Вход неизменён, system Node/Python недоступны
для продукта, `.writer` снят, browser/processes0; собственная установка удалена.
Evidence `tui-49b1584f2-installed`. Файловый подпункт этапа6 отмечен выполненным;
общая20-case матрица, сценарные переходы и этапы5–8 остаются открытыми.

Дополнительный установленный CLI49 `--headless` docs-контроль **PASS** на
OpenAI6.1-sol/medium с тем же models snapshot. Прочитан полный текст и
просмотрены обе страницы PDF: факты nested fixture и layout корректны,
input неизменён, реальный Help read и applied docs подтверждены,
Chromium/remaining0, контейнер удалён. Evidence
`openai-49-cli-docs-headless-20261008`; контроль режима записан отдельно от84
обычных routing-попыток и не является analytic A/B.

CLI upgrade49 в Docker дважды остановился до обновления: old bc6 status
вернул unconfigured JSON и `LOGINOM_HOST_CLEANUP_FAILED`, old669 status
получил прежний180s timeout без stdout/stderr. Новый payload в этих попытках
не выполнялся. Signal collector получил FAIL/FAIL/PASS в трёх свежих
old-bc6 профилях: отказ cleanup нестабилен, конкретная причина не установлена.
Все исходные FAIL сохранены, собственные контейнеры удалены, remaining0.
Диагностика с manifest: `upgrade49-signal-20261008`.

Отдельный native Linux CLI upgrade669→49 **PASS** с теми же assertions и
deadline: штатные uninstall/install, сохранение настроек, auth fixture,
пользовательского skill и истории, продолжение той же сессии. `PROFILE_BUSY`
exit3 не изменил owner; новый installed manifest clean49, default не получил
grant. Own launcher/HOME/profile удалены, processesRemaining[]. Synthetic
provider, live model/Help/Loginom calls0. Evidence
`cli-49b1584f2-upgrade-native-from669`; Docker FAIL этим PASS не переписаны.

Desktop DEB upgrade49 **PASS** в offline non-root окружении: реальные dpkg,
публичная история до/после, настройки/auth fixture/user skill сохранены,
installed ASAR и resource manifest совпали с candidate. Обе фазы remaining0,
контейнер удалён, live calls0. Evidence `desktop-49b1584f2-upgrade-v3`.
Первые два запуска остановились до приложения из-за ошибок controller paths;
их FAIL сохранены. Обновление обоих продуктов проверено; одновременная
независимость Desktop/CLI остаётся отдельным открытым подпунктом этапа8.

## Переходы scope и новое построение CLI49

Два synthetic scope-контроллера сохранены с исходным whole `FAIL`.
Проверенные части: `package-docs` действительно выполняет extract;
активация automation в той же задаче отклоняется `LOGINOM_SCOPE_DENIED` без grant.
После restart/new-user и fork/new-user восстановлен `default`, исторический
activation не становится правами нового запроса. Remaining processes0.
Новый `run --command loginom-automation` остановлен до provider с
`LOGINOM_CONFIG_REQUIRED` в намеренно ненастроенном профиле; configured
automation этой проверкой не принято. Live model/Help/Loginom calls0.
Scoped QA и безопасный signal с manifest: `live-followup-49-20261008`.

Новый естественный `scenario-create` через CLI49/OpenAI6.1-sol medium:
**2/3 warm PASS, кейс не принят**. В попытках1/3 исходный CSV admitted,
импорт и связанная группировка SUM дали Alpha35/Beta20; пакет действительно
сохранён, структура и хэши зафиксированы, cleanup/remaining0. Их независимое
cold выполнение пока не выполнено. Попытка2 честно завершилась без готового
пакета: `imports.text/configure`, `NODE_APPLY_STOPPED → UI_EPOCH_CHANGED`.
Child exit0 не заменяет внешний FAIL. Причина совпадает с pre-gesture epoch
проверкой, но внутренний step journal не сохранён: конкретный field/action
и воспроизводимость не установлены. Исходный отказ сохранён; новые модельные
повторы не запускались. Для следующей диагностики нужно сохранить внутренние
receipts до удаления собственного контейнера, не ослабляя runtime guards.
Эти три попытки не входят в84 принятых single-turn и не являются analytic A/B.

## Независимый structural verifier

Все13 scripts существующего loginom-eval-case скопированы в собственный
`analytic-structural-verifier-20261008/scripts` с SHA256 manifest. Отдельный
`offline-verifier.env` направляет CSV-компаратор в frozen9d7 harness и явно
содержит нерабочие offline-only параметры подключения; глобальные настройки
и чужие файлы не менялись. Оффлайн-аудит всех35 сохранённых reference.lgp:
**35/35 PASS** по acceptance.json (типы, связи/пути, входные файлы, запрещённые
литералы) и oracle.csv self-comparison. Это проверка verifier/эталонов,
а не построение продукта, проверка всех параметров или cold replay.
Отчёты каждого кейса и `reference-self-check.json` сохранены.
Живые72–90 попыток выбранного набора и повторное выполнение ещё требуются.

Отдельный планировщик cold replay добавлен в тестовую инфраструктуру Host.
На сохранённом analytic-пакете он проверяет SHA256 пакета и исходных CSV,
принадлежность серверных путей попытке/аккаунту, исходные bindings импорта
и точный GUID/путь единственного CSV-экспорта первого модуля. Для пакета без
такого экспорта возвращает явный отказ. Используется настоящий extractor;
модель не предоставляет план, harness и его judge не менялись.
Десять последовательных TDD-циклов RED→GREEN сохранены. Итоговый suite
planner/acceptance/docs: **84 PASS, 0 FAIL, 767 assertions**, typecheck PASS.
Первый общий запуск без обязательного `LOGINOM_AI_AGENT_TEST_NODE` дал
18 отказов конфигурации; исходный log сохранён, повтор с закреплённым
Node24.19.0 прошёл. Восстановление серверных файлов и повторное выполнение
этим планировщиком ещё не реализованы: он не закрывает cold replay gate.

Дополнительно проверена offline-совместимость planner со всеми35 accepted
analytic reference.lgp: **35/35 PASS**, сохранены точные GUID экспорта,
исходные bindings и хэши файлов. Источник — закреплённый agent-validation
`d5fb8031356ecf17a08c73f5d15a0b2df52af8b6`, planner `a93a9471d`;
evidence `cold-reference-plan-20261008`. Bindings получены из доверенных
эталонных XML, а не receipts испытуемой попытки. Эта проверка не восстанавливает
серверные файлы, не исполняет сценарий и не принимает candidate cold replay.

CSV reader теперь проверяет фактический destination через UI до исполнения,
а parent получает свежий output до logout. На собственном XML-only reference
warm + два cold выполнения **PASS**: исходные bytes восстановлены без применения
настроек, свежесть/CSV oracle/cleanup/remaining0 подтверждены. Девять файлов
только своих контролей сняты с SHA и удалены; контейнеров не осталось.
Первый fixture с заменой только XML и прежним BIN подготовлен неверно и сохранил FAIL;
исходный destination CSV обнаружен и не удалён, прежние bytes неизвестны.
Новый negative guard отклоняет это расхождение до исполнения.
Это приёмка адаптера, не candidate cold/A/B.
[Подробности](2026-10-08-package-docs-cold-adapter.md).

Полная матрица Desktop/CLI/TUI, жизненный цикл, independent clients и A/B
ещё не закрыты. A/B требует доступа к выделенному стенду и выбранных до
первого live smoke12–15 задач; судья, структура и cold replay обязательны.
Этап9/full35 отложены вне текущей цели; серверная публикация сохраняется.
