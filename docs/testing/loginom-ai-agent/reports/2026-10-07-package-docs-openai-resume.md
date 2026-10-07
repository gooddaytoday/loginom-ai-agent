# Возобновлённая приёмка package-docs на OpenAI

Статус: частичная приёмка; обязательная матрица ещё выполняется.
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
