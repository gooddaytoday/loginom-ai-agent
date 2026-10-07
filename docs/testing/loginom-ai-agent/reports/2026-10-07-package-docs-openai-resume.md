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
| `docs-attached-word` | выполняется; первый отчёт: facts/layout PASS, обе страницы просмотрены | выполняется |
| `docs-markdown` | ожидает предыдущие кейсы | ожидает предыдущие кейсы |

Проверенные PDF сохраняют версию 7.4.0, модуль «Демо», шесть узлов, две
подмодели, глубину три и единственную связь Источник → Калькулятор. `data.lgd`
указан как файловая зависимость. Бизнес-назначение, формулы, Python-код,
целевой узел ссылки и результат выполнения остаются неизвестными.
Прочитана настоящая справка ImportNative (`import/ldf.md`), Calculator и Python.
Нет подмены настроек общими возможностями обработчиков. Все шесть `.lgp`
сохранили исходный SHA; docs не запускал Chromium и не оставил своих процессов.
Каждый PDF имеет отдельный `manual-quality.json` с hashes документа и страниц.
Проверка mechanics сама по себе не заменяет ручную проверку фактов и страниц.

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

Ubuntu22 installed Desktop ранее прошёл offline smoke c50d; Ubuntu24 сейчас
выполняется. Отдельная CLI matrix Ubuntu22/24/26, Debian12/13 использует
существующий `test/cli-install-native.mjs`, сохранённый archive и собственные
images/каталоги: установку UID1200, root:root/4755 sandbox, настоящий Chromium,
uninstall и сохранность profile sentinel. Общий Linux gate пока открыт.

Evals read-only SHA `dfe47cce65c9186aaae8e7d4e0d8de68e09972bb` принят соседней
сессией для изоляции; её baseline smoke на `gpt-6-sol/default` не доказывает
нашу A/B пару. Совместимость product skills остаётся отдельной согласуемой
задачей. Общий harness, near-miss и judge не редактировались. Замороженный
план не перерабатывался повторно. TUI, сценарные переходы, полный корпус20,
вторая модель, A/B и остальные installation gates ещё не приняты.
