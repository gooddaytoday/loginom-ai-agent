# Возобновлённая приёмка package-docs на OpenAI

Статус: частичная приёмка; обязательная матрица ещё выполняется.
Основная модель: `openai/gpt-6.1-sol`, variant `medium`.
Source обоих clean candidates: `c50d220c186a1ef0332b15c4a3e9fb1bc7e42efc`.

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
(шесть страниц просмотрены). Остальные четыре отчёта требуют ручной проверки.
Незавершённые случаи не засчитаны; debugger/дочерних процессов не осталось.
Negative-кейсы продолжены отдельным запуском с прежними conditions. Сценарные и
многоходовые кейсы требуют отдельных адаптеров и этим запуском не покрываются.

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

Ubuntu22 installed Desktop ранее прошёл offline smoke c50d. Ubuntu24 и первый
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
