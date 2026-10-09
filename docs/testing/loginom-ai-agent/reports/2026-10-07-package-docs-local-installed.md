# Локальная приёмка установленного кандидата669

Чистый Linux candidate `669822296615accbd6579c09244dacb24f77a056`, версия0.1.17,
прошёл discovery Desktop вне исходников, шесть native TUI случаев и проверку
сброса docs-профиля при новом запросе после перезапуска CLI. Это локальная
механика: внешняя модель, Help и Loginom не вызывались. Живой выбор skill
на `openai/gpt-6.1-sol/medium` и полная матрица остаются открытыми.

Evidence root:
`/home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006`.
Полные artifact hashes и Linux5/5 для каждого продукта закреплены в
[журнале](../package-docs-implementation.md). Все контроллеры ниже внешние,
создают новый evidence root и не меняют пользовательскую установку.

## Чистый Desktop

`run-desktop-clean-skills-669822296.py` устанавливает новый DEB в собственном
Ubuntu24 контейнере, `network=none`. UID1200, новый пустой HOME/XDG и пустой
workspace; в окружении продукта PATH=/nonexistent. Глобальные Node/Python/Dock
не используются. Настоящий backend `GET /skill` вернул только builtin
`customize-opencode` и два product skills. Для обоих проверены `source: bundled`,
точный установленный путь и digest64. Полные runtime resources и manifest
подтверждены. Electron sandbox включён; приложение закрыто штатно.

`desktop-669822296-clean-skills/result.json`: PASS/exit0,
containerRemoved=true, remaining=[]. Driver SHA256
`a5ff2045af10d1130bb2c6b6f0d6bf1ad79dce4790f7d2fa36abd3bbe9cd2a9c`;
controller SHA256
`08d6aee6c1e888c363bb9378de42a8d257172ff143e27b120222a6127afe5760`.

## Установленный CLI TUI

`run-tui-669822296-installed.py` сначала выполняет публичный install в отдельном
HOME задачи, затем запускает package-local `test/cli/tui/package-docs-pty.py`
через реальную PTY и установленный бинарник. Каждый случай получает новый
профиль, пустой HOME и workspace вне repo. Provider синтетический и явно
вызывает инструменты; это не доказательство автоматического выбора моделью.
Python3.10.12 — только внешний драйвер; PATH продукта=/nonexistent.

| Случай | Результат |
| --- | --- |
| Paste `.LGP` с пробелом/кириллицей | Полный PDF, PASS |
| `@sample.LGP` | Полный PDF, PASS |
| `/package-docs` + paste | Applied grant до первого provider-turn, полный PDF, PASS |
| `/package-docs` + `@` | Applied grant до первого provider-turn, полный PDF, PASS |
| Текстовый внешний путь, allow once/read | Extract, правильный путь в native permission dialog, PASS |
| Тот же вид запроса с отказом доступа | Permission error, чтение не выполнено, PASS |

Все6: exit0, forced=false, writer=false, alive=[], chromiumObserved=[].
Оба product skills обнаружены из установленного каталога; внешних подмен нет.
Docs не рекламирует bash/task/prepare. Источник `.lgp` сохранил SHA256
`4975fd234a275d72f94fcf10adc26b77c361923326eca8a5f24884767d3d3945`.
Публичное uninstall прошло; пользовательский launcher не менялся.

Все четыре PDF прочитаны и просмотрены целиком (по странице): версия7.4.0,
«Демо», один модуль, два узла, depth1, Source→Calculator/data.lgd; подмоделей,
Python, ссылок и производных узлов нет. Бизнес-назначение, формулы и результаты
выполнения обозначены неизвестными. Обрезки/потери текста и пустых страниц нет.
Индивидуальные receipts, тексты и PNG находятся в `manual-review` каждого случая.

| Случай | PDF SHA256 |
| --- | --- |
| paste | `d30e4b7cea799937f6face47832838e1f1be488e7725640dc248b75e389743a4` |
| mention | `b6b9f36021f9df52befd3bb0f2dc66088ed1f95dbeef29e859b734ed2f6d59e7` |
| slash-paste | `6c8ae7351400f0ab604e5cd2613be837985d9fc2c4d46ed07d58202ac4993f23` |
| slash-mention | `76718f0356521901b7e806da9ca1ff3c91b29791673964dac24193fe86a315e6` |

`tui-669822296-installed/result.json`: PASS, installed/uninstalled=true.
Public driver SHA256
`1d0e22e2ca9e1f271cda44846406ce08a414aef3eb562f85449f44350a091be3`;
controller SHA256
`a8c5a72706a3d8ddd750e8f05e48f3a9ceb218b7fc1a732c218222b55c31f21d`.
Предшествующая подготовка test-driver image не получила apt indices/Python;
логи отменённой/неуспешной сборки сохранены. Продукт в них не запускался.
Native тесты выполнены отдельным host-драйвером, без повторов живой модели.

## CLI после перезапуска

`run-cli-scope-restart-669822296.py`: установленный CLI в собственном Ubuntu24,
UID1200, network=none. Публичный `run --command package-docs --file nested.lgp`
применил backend-owned grant до первого provider-turn и выполнил настоящий
extract. В истории сохранён один applied digest64; в docs catalog нет
bash/task/prepare. После штатного завершения другой процесс получил тот же
sessionID и новый обычный пользовательский запрос. Его каталог был `default`:
bash доступен, docs executor/prepare отсутствуют. Старый grant остался в истории,
но не расширил новую задачу. Исходный nested.lgp не изменился.

`cli-669822296-scope-restart/result.json`: PASS/exit0, containerRemoved=true,
processesRemaining=[]. В конечном сохранённом профиле отдельно подтверждено
отсутствие `.writer`; первоначальный native receipt не переписывался.
Driver SHA256
`252e58910a6d040691d524b9dc0d28a88ed6a6c938c5f413361994bdd18c9db2`;
controller SHA256
`48415741c9af230f80bcda1cf330ca88cb72cb829bfce4f32ed3fbd877640955`.

Контролируемые ответы здесь проверяют границу каталога и сохранённые события.
Эти результаты не подменяют живые build→docs, конкурентные переходы,
одновременную браузерную независимость Desktop/CLI, полный lifecycle или A/B.
