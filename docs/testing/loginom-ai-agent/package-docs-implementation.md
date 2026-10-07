# Реализация изоляции package-docs

Канонический [план](../../superpowers/plans/2026-10-05-package-docs-isolation.md).
Начало выполнения: 2026-10-06. Все изменения продукта выполняются через TDD.
Отметки в плане означают фактически выполненные задачи; живые проверки не
подменяются исходными тестами или scripted LLM.

## Владение и порядок приёмки

Это направление владеет skills, Desktop, CLI, runtime и своими тестовыми
адаптерами. Соседняя сессия `01a10fce-57bf-7093-bd1d-f2bae8c99772` владеет
harness, near-miss корпусом, общим промптом судьи и их документацией.
Её worktree `calibration-near-miss`, ветка, незавершённые изменения, `.env`,
профили, результаты, launcher и блокировки не изменяются.

Локальная разработка продолжается независимо от калибровки. Живые baseline и
candidate запускаются после её приёмки из отдельного чистого harness worktree
на заново согласованном неизменном SHA. Оба сохранённых комплекта CLI используют
одинаковый harness, судью, модели, параметры и snapshot заданий. Для каждого
прогона нужны отдельные абсолютные каталоги результатов, профиля, workspace и
артефактов; `EVAL_CLI_MODE=binary` и абсолютный `EVAL_CLI_BIN`.
Нужные изменения harness согласуются отдельной задачей без совместного
редактирования. Существующая серверная публикация skill сохраняется до этапа 9.

## Этап 0: baseline

Исходный SHA: `fc3d97dbf695c2ed8dba942feb6fe83591a33944`.
Чистый detached worktree:
`/home/kiselev/.codex/worktrees/package-docs-baseline-20261006/loginom-ai-agent`.
Незавершённые документы сохранены отдельно и не включены в исходники baseline.

Все материалы сохранены в собственном долговременном каталоге
`/home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006/`.
Исходный worktree остаётся чистым после сборки и проверок.

Входы: Bun `1.3.14+0d9b296af`, Node `24.19.0`, Chromium `1243`,
Playwright `1.63.0-alpha-2026-08-31`, MCP `0.0.80`, channel `prod`.
Node distribution скопирован в собственный каталог, Chromium взят из
пользовательской установки CLI `0.1.17-prod` только для чтения.
Desktop содержит Chromium 1246 и не используется как browser input.
Node SHA-256 `bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12`;
Chromium SHA-256 `8c599d43aec53f2460a31ae2f4af6bd863f8258b34ff519564bc5d4726bfaa1e`.

`build-cli.ts` создал полный `baseline-cli/`, архив и checksum; проверка архива
после распаковки прошла. `verify-cli-candidate.ts` подтвердил source identity и
закреплённые входы; `--version` вернул `0.1.17`, `--help` завершился с кодом 0.
Пользовательский launcher и профили не изменялись.

| Материал | SHA-256 |
| --- | --- |
| Source tree | `1080ad2b0f10a36f1991fd5a5c7b2ef19b8350d7e6d69cc5be50f745708cdd17` |
| CLI archive | `e2cb2fcd70c601ee14fc1f494e6c82357922a7f81fbcb9535650294f2a9af049` |
| CLI manifest | `6928473abd91329c4cf557d405f23865eab885176cd6596459c524f5f43c3ff1` |
| Resource manifest | `b991ffc27f8c6be9d3ce70449bbf91dcd50a42cfa46f46664a5ab6a8ed581360` |

`sourceDirty: false`. Полные метаданные находятся в `baseline-verified.json`,
команды/этапы сборки — в `baseline-build.log`.

| Исходные проверки из соответствующих package directories | Результат |
| --- | --- |
| Agent: skill, skill tool, attachment preview | 28 PASS |
| Agent: local package extraction и command attachment context | 3 PASS |
| Host: HostPort | 14 PASS |
| Desktop: electron-builder config и static artifact verifier | 11 PASS, 2 macOS SKIP |
| App: attachments и build-request-parts | 27 PASS |
| Python: исходный package_docs | 7 PASS |

Установка зависимостей в обоих своих worktree: `bun install --frozen-lockfile`,
lockfile не изменился. Логи каждого запуска сохранены рядом с baseline.
В `python-oracles/` сохранены `demo.lgp`, структура JSON, каркас Markdown,
готовые MD/PDF/DOCX и их хэши. Временная первая попытка App с несуществующим
именем теста исправлена запуском фактических двух файлов; ошибку выбора файла
не учитывать как продуктовую регрессию.

Dock: clean `83c52ebb653e6bd7df294d4e24fc5545cb955b14`, полный каталог совпадает
с `services/loginom-ai/skills/loginom-automation/`. Его копия сохранена в
`dock-skill-source/`. Продуктовые инструкции будут перенесены из эффективного
`userWorkflowInstructions` текущего runtime, включая CrossTable; это ещё не
реализовано. Закреплённый runtime использован в сохранённой полной сборке.

Наблюдавшиеся refs (только чтение): calibration-near-miss
`bc24b7baa0d5deae42a7dbc32f7f7012c4acf64a`, clean; agent-validation
`d5fb8031356ecf17a08c73f5d15a0b2df52af8b6`. Перед живой приёмкой перечитать
состояние и пересчитать хэши окончательного snapshot; текущие refs не доказывают
принятую калибровку.

## Этап 1: первые TDD-связки

| Поведение | RED | GREEN |
| --- | --- | --- |
| Bundled skill вне checkout через RuntimeFlags | `Skill.all()` не вернул package-docs | 1 PASS |
| Зарезервированное имя не подменяется проектным `.agents` skill | Вернулся source=config и проектный текст | 2 PASS |
| Неучтённый файл skill запрещён | verifyBundledSkills успешно принял unlisted.mjs | 1 Host PASS |

Логи RED/GREEN находятся в каталоге baseline с префиксом `tdd-`.
Добавлен Node-only Product export `./skills`, базовый общий verifier и trusted
manifest source V1. Первые проверки выполняются на маленьком реальном каталоге
ресурсов без Chromium/Node stub и без изменения `process.env`.
Все исходные skill/tool/attachment-preview проверки вместе с новыми: 30 PASS;
typecheck Agent, Host и Product — PASS. Полная проверка assets/metadata,
классификация источников и их порядок, runtime/staging ещё открыты.

Следующий цикл assets: RED — отсутствующий шрифт из ссылки в references
успешно проходил проверку; GREEN — отклоняется. Общий verifier читает YAML
frontmatter (прямая зависимость `yaml 2.9.1` из существующего lock), проверяет
относительные Markdown-ссылки и `metadata.loginom-generated`.
Первая регрессия: Host 6 PASS / 1 FAIL из-за ошибочного symlink fixture,
который размещал «внешний» файл внутри resources. Fixture исправлен на отдельный
внешний каталог; повторный запуск подтвердил 7 PASS / 0 FAIL.
Проверки: неучтённые/изменённые/отсутствующие файлы, ссылки references,
generated executable, выход за границы skill и symlink escape, независимый
digest двух skills. Host typecheck PASS; Agent bundled discovery 2 PASS.
Lock изменился только добавлением прямой зависимости Host, без обновления версий.

Discovery: RED для realpath — два configured пути одного файла дали три
директории вместо двух (включая bundled). GREEN: 3 PASS после canonical dedup.
RED для provenance — project skill имел source=config. GREEN: 4 PASS после
сохранения источника при scan. Чтение skills теперь последовательное; glob
matches отсортированы. Дополнительные регрессии подтверждают поздний source
для обычного имени и отсутствие fallback при повреждении bundled файла.
Полный выбранный discovery/tool/attachment suite: 34 PASS, Agent typecheck PASS.

Каталог Product: RED — `packages/product/skills/` отсутствовал. GREEN — два
канонических каталога, затем metadata/frontmatter regression: 8 PASS.
`loginom-automation` перенесён из services, `package_docs` из проектного каталога
переименован в `package-docs`. Четыре references automation сохранены по именам
и адаптированы к user-v1; workflow взят из действующего `userWorkflowInstructions`
с CrossTable, проверками результата, отменой и checkpoint. Имена инструментов
согласованы с префиксом `loginom_`; receipt `dock_saved_package_state` не переименован.
Неподдержанные ручные UI/clipboard и action API для узлов/связей исключены.
Descriptions разделяют построение, локальную документацию и обычную справку.
Добавлено постоянное правило в Product AGENTS; ссылка из root AGENTS уже есть.

Проверены 7 исходных Python-тестов после переноса. Python-скрипты пока сохранены
до порта этапа 2; инструкции docs об executor/выходном каталоге обновятся с ним.
Source map переведён на новые destinations с исходными hash/object/ref и явными
source-transforms: 5 перенесённых файлов PASS. Общий source verification выявил
`IMPORTED_HASH_MISMATCH: packages/loginom-runtime/client/lib/bridge.mjs`;
тот же отказ воспроизведён на чистом исходном baseline. Это исходная проблема
attribution manifest, не PASS общего аудита; устранение учитывать при изменениях runtime.

Штатные `bun run generate` (Client) и SDK `script/build.ts` завершились успешно.
Client generated не изменился (другой API); legacy SDK получил только `source`
и `digest` в AppSkillsResponses, SDK typecheck PASS. Generated вручную не редактировался.

## Этап 1: локальный runtime skill и динамический prepare

| Поведение | Наблюдавшийся RED | GREEN |
| --- | --- | --- |
| Локальный skill без Skills API | Старый loader вызвал запрещённый transport | Первый локальный prepare проходит без сетевого skill transport |
| Неучтённый файл запрещён | Отсутствовал ожидаемый reject | Локальный prepare отклоняет unlisted файл |
| Classic/diagnostic resource root | Config не передал root; prepare отказал | Абсолютный private root передаётся в loader |
| Diagnostics без удалённого skill manifest | Один удалённый manifest request вместо нуля | Локальная revision доступна даже при недоступном Dock |
| Managed prepare без повторных инструкций | В ответе отсутствовал source=bundled | Реальный Product bundle, action catalog и динамическая knowledge; instructions отсутствует |

`createSkillLoader` теперь читает только Product resources, проверяет байты и
manifest, закрепляет per-skill revision и отказывает при её смене в том же runtime.
Digest вычисляет один Node-совместимый helper, используемый Host и runtime;
отдельный тест запускает закреплённый Node и сопоставляет digest с Bun/Host.
Удалены remote skill transport и дублирующий `userWorkflowInstructions`;
workflow остаётся в Product references. Classic/diagnostic prepare возвращает
динамический JSON с локальным directory/source/revision. В managed-entry root
передаётся из private startup, в source config — явным параметром/окружением.
Read-only acceptance helper также переведён на локальный bundle.

Fixtures bridge используют настоящий Product skill и реальное чтение/проверку
action catalog; внешние MCP/browser заменены на тестовые границы. User-v1
дополнительно проверен через реальный MCP bridge/transport и action runtime.
Результаты: 83 Node PASS, 32 Agent discovery PASS, 8 Host PASS;
Host `bun typecheck` PASS. Атрибуция 11 изменённых импортированных файлов PASS;
исходные SHA/object сохранены. Логи — `local-skill-runtime-regression.log`,
`shared-skill-*-regression.log`, `shared-skill-host-typecheck.log`, RED — `tdd-local-*`
и `tdd-user-profile-local-skill-red.log` в собственном каталоге baseline.
Nested npm dependencies установлены закреплённым Node/npm, browser download
отключён; package-lock не менялся. Первую ошибку отсутствующего MCP SDK считать
ошибкой окружения, не RED продукта. Полная проверка reference/generated closure
во всех runtime-режимах, staging и отключение publisher остаются открытыми.
Это source-only проверки; installed/live acceptance не выполнялась.

Staging input safety: RED — destination внутри Product skills дошёл до запуска
Node вместо отказа overlap; GREEN — 11 staging tests PASS, Host typecheck PASS.
Канонический Product root включён в lexical/realpath input boundary до удаления
или копирования. Логи `tdd-stage-product-overlap-{red,green}.log` и
`stage-product-overlap-typecheck.log`. Копирование skills и общий inventory ещё открыты.

Полный staging: RED — реальный release staging вернул пустой каталог skills;
GREEN — 12 staging PASS с закреплёнными Node/Chromium и настоящим npm closure.
Копируется весь Product skills до manifest; проверены оба skill, workflow и OFL
по фактическим байтам. Browser input читается из сохранённой установки CLI,
launcher/profile не менялись, Chromium не запускался. Логи
`tdd-stage-product-delivery-{red,green}.log`.
После GREEN выделен общий Node-compatible `resourceInventory`; staging и
fixtures Host/Agent/runtime используют его. Сохранены internal directory links,
canonical escape guard и исключение собственного manifest из inventory.
Agent fixture содержит оба настоящих skills без Node/Chromium: 8 PASS.
Host staging+integrity: 20 PASS; после перевода Host fixtures integrity 8 PASS;
Node client targeted regression 23 PASS; inventory/resources 9 PASS.
Host/Agent typecheck PASS. Логи `stage-shared-inventory-*.log`.
Этот staging доставляет текущие Python assets; generated Node docs bundle будет
добавлен на этапе 2. Установленная приёмка остаётся открытой.

Общий verifier: RED — после удаления обязательного workflow reference и его
manifest entry runtime успешно подготовился. GREEN — Node skill suite 8 PASS;
Host теперь экспортирует тот же Node-compatible verifier, а loader использует
проверенный content и полный reference/generated closure. Canonical containment
проверяется внутри своего skill. Дополнительные font/generated/frontmatter и
межskill symlink regressions: полный client suite 86 PASS. Classic bridge
проверен реальным MCP transport: валидный bundle проходит, неполный отклоняется
(2 дочерних кейса, 1 wrapper PASS). Первую ошибку отсутствующего ArtifactStore
в новой fixture исправили; это дефект fixture, не RED продукта.
Host/Bun и pinned Node выполняют полный общий verifier: 8 PASS; staging 12 PASS;
Agent bundled 8 PASS; Product 5 PASS. Host/Agent/Product typecheck PASS.
В npm closure добавлен только `yaml 2.9.1`, как у Host; прежние 97 пакетов не
изменились. Обновлён только runtime lock hash в release pins:
`1e9c65c695505bcc8e94afdee82b844da93c44bf937fbe4a80afe4a9cb784a93`.
Node/Bun/Playwright/Chromium pins прежние. Source transforms четырёх изменённых
импортированных файлов проверены. Полный аудит дошёл до исходного
`IMPORTED_HASH_MISMATCH: client/lib/browser-geometry.mjs`; его байты совпадают
с baseline (`0b7027db8db0e164659de33423ea122d791a9eabbcbf9691eac2c5eeba7df89f`).
Массового пересчёта атрибуции не было. Логи `shared-verifier-*.log`, RED/GREEN
`tdd-shared-skill-closure-{red,green}.log`; installed/live ещё не выполнялись.

Publisher: RED — audit-hook перехватил попытку чтения admin-файла старым
publish-skill.py. GREEN — 1 PASS: код 2 и PUBLICATION_DISABLED до файлов/сети;
caller admin/archive не изменены, report не создан. Host typecheck PASS.
Скрипт оставлен только отказом; серверная запись и общий Skills API не менялись.
В services docs добавлен актуальный product checkpoint, старые журналы сохранены
и ссылаются на него. Логи `tdd-skill-publisher-{red,green}.log`,
`skill-publisher-host-typecheck.log`. Обновление acceptance audit/evidence и
устранение исходного source-map mismatch остаются отдельными открытыми задачами.

Проверка формата: RED — runtime принимал неизвестное поле frontmatter;
RED — исходная проверка не допускала объявленный generated-файл до staging.
GREEN — единый verifier проверяет допустимые поля, типы и длины; режим source
откладывает только metadata.loginom-generated. Режим installed остаётся строгим,
отсутствующий reference/font не допускается в обоих режимах.
Настоящий ConfigMarkdown.parse и source closure Product: Agent 9 PASS;
Host integrity/publisher 10 PASS; runtime targeted 29 PASS.
Agent/Host typecheck PASS. Логи tdd-skill-frontmatter-fields-red.log,
tdd-skill-generated-source-mode-red.log и skill-format-*.log.
Source transform изменённого skill.test.mjs проверен, исходная атрибуция сохранена.

Bootstrap: RED — real MCP initialize в classic и Hermes не сообщал активацию
automation; native dataset context также направлял в prepare без активации.
GREEN — общий MCP bootstrap classic/diagnostic/user-v1 и Hermes требует
loginom-automation для сценария, исключает Help/diagnostics/package reports.
Backend bootstrap согласован с локальным источником; prepare не обещает выдачу
полного skill. Native context сохраняет прежний приватный механизм ticket.
Runtime targeted 31 PASS; backend MCP system-context 1 PASS, Agent typecheck PASS.
Это source/protocol проверки, не доказательство выбора skill живой моделью
или enforcement профиля (этапы 5–6). RED/GREEN логи tdd-bootstrap-activation-*,
tdd-hermes-bootstrap-*, tdd-input-bootstrap-red.log; regression bootstrap-*.log.
Преобразования изменённых импортированных файлов проверены отдельно.

Свидетельства приёмки: RED — knowledge scope принимал серверный product skill;
RED — session audit отвергал локальную bundled директорию (skill_file_pin).
GREEN — Help/E2E/ai-skills разрешены, product skill URI исключён. Session audit
проверяет каталог resources/skills/loginom-automation, явно закреплённые
request.bundled_resources.path/manifest_sha256 и per-skill JSON-pair digest.
Legacy cache/SKILL.md paths, изменённый manifest и изменённые/лишние bytes
отклоняются. Golden digest получен настоящим bundledSkillInventory в pinned Node;
Python здесь — независимый evidence auditor, не второй runtime verifier.
48 адресных Python тестов PASS, источники восьми изменённых импортированных
файлов проверены. Логи tdd-knowledge-source-*, tdd-session-bundled-skill-*,
local-skill-evidence-regression.log. Legacy producers без bundled_resources
pin отклоняются; живой приёмочный адаптер должен записать pin до model launch.
Общий source audit имеет 35 исходных несовпадений, побайтно совпадающих с baseline:
[реестр](../../migration/package-docs-source-attribution-baseline.md).
Они не исключены из verifier и не скрыты пересчётом; перед live gate требуется
отдельный разбор истории. Изменения Product/публикации записаны отдельно,
исходная атрибуция Dock в source-map сохранена.

Единый root: RED — sidecar наследовал root shell вместо application root;
RED — настоящий standaloneRun с реальным Node Host сохранял подставленный root.
GREEN — Desktop Host и createSidecarEnv используют loginomResources; proxy и
shell не меняют этот root. Standalone передаёт standaloneBundle().resources
до импорта backend. Существующий TUI worker наследует это окружение без нового
механизма передачи. Dev skills.paths мост отсутствует и не добавлен.
Desktop environment tests 15 PASS; реальный CLI startup/status/cleanup 1 PASS;
bundled discovery и Command.get вне checkout 9 PASS (52 assertions): обе команды
имеют source=skill, лишних loginom-scenario/loginom/package_docs нет.
Agent/Desktop typecheck PASS. Логи tdd-{desktop,cli}-resource-root-*,
resource-root-bundled-commands.log и *resource-root*typecheck.log.
При расширении Command fixture сначала не был экспортирован dependency Skill;
исправлена fixture через штатный LayerNode.group, без изменения реализации.
Полный client suite: 2550 PASS, 0 FAIL, 10 SKIP (2560 тестов, 190.9 s);
лог stage1-client-suite.log. Installed/live не проверены.

## Этап 2: Node extraction, первый паритет

RED — новый Node extractor не выполнял extract (PACKAGE_DOCS_EXTRACT_UNSUPPORTED).
GREEN — настоящий ZIP/XML reader выдаёт сохранённый Python structure.v1 для
двух узлов с кириллицей; SHA входного .lgp не меняется. Собранный target=node
модуль проверен поставляемым Node 24.19.0 с минимальным окружением, без Bun/Python.
2 теста PASS, Host typecheck PASS. Логи tdd-node-extract-parity-*,
node-extract-pinned-node.log, node-extract-host-typecheck.log.
При чтении Buffer выявлен offset в Buffer.slice у zip.js: reader получает
собственную Uint8Array. Писатели и product tool пока не подключены; подмодели
ещё отклоняются явно. Notes/views/references и полная вложенная статистика —
следующие TDD-циклы, этап 2 не завершён.
Прямые зависимости Host: @zip.js/zip.js 2.7.62 и @xmldom/xmldom 0.8.15,
обе уже были в bun.lock; изменены только dependency edges Host, не версии closure.
Oracle fixtures перенесены из сохранённого baseline, происхождение указано в README.

Node tree extraction: RED — nested workflow отклонялся как SUBMODEL_UNSUPPORTED.
GREEN — рекурсивные identities/path/depth, links/hierarchy и агрегаты соответствуют
замороженному Python oracle для двух уровней. ZIP case/backslash и deflate
проверены в Bun и в собранном модуле под pinned Node (три oracle fixtures).
Независимые регрессии: за прежним пределом два уровня считаются все 8 узлов,
3 подмодели и 4 workflow-уровня; отсутствующий индексированный Unit.xml даёт
PACKAGE_DOCS_UNIT_MISSING, а не пустой модуль. 6 PASS, Host typecheck PASS.
Логи tdd-node-extract-nested-{red,green}.log и node-extract-tree-regression.log.
Оракулы вариантов получены неизменённым Python исходником baseline fc3d97dbf:
a9e18aa779dc48fe560a5790ba9275bb08f48df0080dd9b02e7d9f8a708c2bff.
Deep/missing-unit expectations независимы от прежнего ограничения Python.
Notes/views/references, skeleton, emit и product tool пока остаются открытыми.

Node notes: RED — annotations отсутствовали, notes=0 вместо 2.
GREEN — собственный текст элемента/атрибуты, порядок и дедупликация совпадают
с Python; вложенные заметки участвуют в полной статистике. 7 PASS, Host typecheck
PASS; четыре oracle fixtures проверены также собранным модулем в pinned Node.
Логи tdd-node-extract-notes-{red,green}.log, node-extract-notes-node-regression.log.
Открыты views/references, skeleton/emit и product tool; этап 2 не завершён.

Node metadata: RED — external_references и view_nodes были пустыми.
GREEN — ссылки сохраняют Name/DisplayName/Path, дубликаты и XML-порядок;
визуализаторы сохраняют GUID/label/engine/service, не меняя статистику workflow.
9 PASS (31 assertions), Host typecheck PASS; шесть oracle fixtures проверены
также в собранном модуле под pinned Node. Логи tdd-node-extract-{references,views}-red.log,
tdd-node-extract-references-green.log и node-extract-metadata-regression.log.
Skeleton/emit и product tool остаются открытыми; этап 2 не завершён.

Node skeleton: RED — renderSkeleton выдавал SKELETON_UNSUPPORTED.
GREEN — русский шаблон, статистика и placeholders совпадают с сохранённым
Python skeleton после нормализации времени. Ещё четыре регрессионных oracle
получены неизменённым baseline render_report_skeleton.py (SHA-256
0bbb539bc8981f0b7eb7ca712ee84873df230a173844b596620186be9d89e0a9).
Подмодели/notes/references/views и реальный bundled Node проверены; 15 PASS
(40 assertions), Host typecheck PASS. Логи tdd-node-skeleton-{red,green}.log,
node-skeleton-regression.log. Writers/tool ещё открыты; требования плана не менялись.

Node Markdown/DOCX writers: RED — EMIT_UNSUPPORTED для MD и DOCX;
отдельный RED — незаполненный PLACEHOLDER_ выпускался как Markdown.
GREEN — MD сохраняет текст и завершающий newline; любой PLACEHOLDER_ запрещён
до рендеринга. Word document.xml совпадает с сохранённым baseline и двумя
новыми frozen-Python oracle (форматирование, вложенный пакет); ZIP содержит
стили и relationships. Источник emit_report.py SHA-256:
098deb4455a5e428c4aab6544bbeaa13dc0c2081525675ee38c61ec3fde70426.
Реальный pinned Node создаёт DOCX без Bun/Python. 21 PASS (47 assertions),
Host typecheck PASS; логи tdd-node-{emit-md,emit-placeholder,docx}-*.

Диагностика тестовой инфраструктуры: в общем файле второй ZIP Bun.build
стабильно падал Unexpected reading file (3/3), обе Node проверки отдельно
проходили 3/3. Файл зависимости существует, простой последовательный build
вне bun:test проходит; внутреннюю причину Bun не считаем установленной.
Одна staged fixture-сборка сохраняет все проверки результата и даёт 3/3
зелёных общих прогонов. Нет изменения версии Bun, retries или ослабления
проверок содержимого. Логи docx-build-signal-*-collector.log,
node-docx-single-bundle-{green,refactor-*}.log. PDF и product tool остаются открытыми.

Node PDF: RED — EMIT_UNSUPPORTED для default PDF; отдельные RED — отсутствие
шрифта давало ENOENT, усечённая head metrics table — Buffer bounds error.
GREEN — собственный PDF writer использует node:zlib, subset TTF с исходными
glyph IDs, Identity-H и ToUnicode. Текст трёх PDF совпадает с frozen-Python
oracle (demo/форматирование/подмодели); общий Node bundle ищет шрифты рядом
с skill через import.meta.url. Subset меньше исходных TTF, полная контрольная
сумма каждого 0xb1b0afba, исходные fonts не меняются. Многостраничный PDF
содержит все 100 абзацев. Placeholders запрещены во всех трёх форматах;
missing/invalid metrics дают отдельные ошибки. 29 PASS (75 assertions),
Host typecheck PASS. Логи tdd-node-pdf-*, node-docs-writers-final.log.
Три образца в собственном acceptance/node-pdf-visual просмотрены после PNG
рендеринга: читаемая кириллица, без обрезаний/наложений. Bundled Poppler
несовместим с glibc стенда; /usr/bin/pdftoppm/pdfinfo/pdftotext успешно проверили
те же Node PDF. Это инструменты визуальной приёмки, не зависимости продукта/CI.
Два writer/parity пункта этапа 2 отмечены; bundle staging и product tool открыты.

Node CLI extract: RED — собранный package-docs.mjs завершался с
PACKAGE_DOCS_CLI_UNSUPPORTED. GREEN — команда extract принимает только явные
--lgp/--directory, пишет атомарный structure.json в session/.work/package-docs/
<stem>-<8 hex realpath>; SHA входа неизменен. Компоненты workspace проверяются
lstat и не проходят через symlink. Скрипт запускается настоящим pinned Node,
с минимальным env и cwd вне checkout. Все Node проверки используют именно
этот единый bundle, а не отдельные тестовые entrypoints. 30 PASS (80 assertions),
Host typecheck PASS; tdd-node-docs-cli-extract-*.log. Skeleton/emit commands,
staging и ограниченный агентский инструмент ещё открыты.

Node CLI skeleton: RED — команда skeleton не поддерживалась; следующий
RED — повторный запрос выдавал ошибку вместо сохранения заполненного черновика.
GREEN — report.md создаётся эксклюзивно в том же workspace; повторный вызов
возвращает существующий обычный файл, не меняя его. Symlink/каталог вместо
черновика отвергается. Команды проверены настоящим pinned Node; 32 PASS
(87 assertions), Host typecheck PASS. Логи tdd-node-docs-cli-skeleton-*,
node-cli-skeleton-regression.log. Emit/staging/product tool остаются открытыми.

Node CLI emit: RED — команда emit отсутствовала; затем отдельные RED —
неполный Markdown выпускался, занятое имя завершалось ошибкой вместо суффикса.
GREEN — fixed CLI читает только свой report.md, проверяет обязательные
заголовки из реальной структуры и placeholders; PDF по умолчанию, сохранены
Word/Markdown aliases и fallback неизвестного формата на PDF. Готовые bytes
создаются во временном файле session directory и публикуются exclusive link;
занятые имена сохраняются, выдаётся -2/-3 и далее. Temp удаляется после выпуска.
Регрессии: кириллица/пробелы/кавычки в путях, все три формата, неизменность
входного SHA, отсутствие final/temp после placeholders/неполного отчёта,
workspace symlink не создаёт ничего снаружи. 38 PASS (125 assertions), Host
typecheck PASS. Логи tdd-node-docs-{cli-emit,emit-sections,emit-collision}-*,
node-cli-publication-regression.log. Staging и агентская авторизация/timeout
ещё открыты; этот CLI не является установленной сборкой продукта.

Node build/staging: RED — отдельный product builder был BUILD_UNSUPPORTED;
RED — полный stageResources не включал package-docs.mjs в manifest.
GREEN — build-package-docs.ts делает target=node bundle и возвращает настоящий
metafile. Staging генерирует его после копирования skill, до inventory;
collect-build-notices сохраняет license graph ZIP/XML, Golos OFL включён
в licenses и THIRD_PARTY_NOTICES. Настоящий resources/bin/node выполняет
skeleton → default PDF из staged skill с минимальным env и без Python.
Отдельный RED выявил отсутствие нового source path в overlap preflight;
GREEN добавляет src/package-docs к lexical/canonical inputs до запуска Node.
Генераторный source SHA/bytes сохранён. 39 pipeline tests PASS (132 assertions),
13 staging tests PASS (47 assertions), Host typecheck PASS. Логи
tdd-docs-{builder,staging,staging-source-guard}-*, docs-staged-node-regression.log.
Node pipeline fixtures строятся тем же product builder в отдельном Bun процессе.
Пункт сборки/staging этапа 2 отмечен; agent tool, permissions и отмена ещё открыты.

Node publication permission boundary: RED — emit отвергал backend-only --output.
GREEN — CLI принимает только точное имя отчёта внутри session directory;
коллизия возвращает PACKAGE_DOCS_OUTPUT_COLLISION, не выбирает другой путь
после разрешения. Параметры модели по-прежнему не содержат output. Без этого
внутреннего аргумента совместимый CLI сохраняет автоматические -2/-3.
Регрессии проверяют внешние/вложенные/посторонние/относительные имена,
неизменность занятого файла и отсутствие final/temp после отказа.
41 PASS (158 assertions), Host typecheck PASS; tdd-docs-fixed-output-*,
docs-fixed-output-regression.log. Полный Host suite после staging: 180 PASS,
6 Windows-only SKIP, 0 FAIL (186 тестов, 947 assertions); stage2-host-suite.log.
Ограниченный агентский tool и permissions ещё не подключены.

Agent tool extract: RED — package_docs_run не выполнял извлечение.
GREEN — отдельное определение Tool использует настоящие Session/Permission,
полную историю user file parts и фиксированный bundled Node argv; никаких
LoginomHost acquire/lease/call. Resource hashes/closure и Node SHA/containment
проверяются перед запуском, окружение минимально, AppProcess владеет отменой.
Отдельные RED/GREEN: явный read deny для вложения, edit deny относительно
корня проекта при вложенном session directory, read deny на symlink-имя,
external_directory deny. Регрессии: plan, путь только от модели, range URL,
повреждённый script до запуска. Fixture использует SessionProjector и реальные
Permission rules; проверки project-relative patterns запускаются в git fixture.
9 PASS (30 assertions), Agent typecheck PASS; tdd-agent-docs-*, agent-docs-extract-final.log.
Инструмент не внесён в общую registry и пока не подключён к SessionTools:
skeleton/emit, проверки lifecycle и TaskScope activation остаются открытыми.

Agent tool skeleton: RED — операция skeleton не поддерживалась.
GREEN — фиксированный Node executor создаёт report.md, а ctx.ask edit включает
оба файла: structure.json и report.md. Реальные правила Permission блокируют
все записи при deny на черновик; повторный skeleton сохраняет заполненный файл.
Сверены oracle JSON и неизменные bytes входного пакета. 12 PASS (42 assertions),
Agent typecheck PASS; tdd-agent-docs-skeleton-*, agent-docs-skeleton-regression.log.
Emit и lifecycle остаются открытыми; SessionTools пока не подключён.

Agent tool emit: RED — операция emit не поддерживалась.
GREEN — backend выбирает свободное имя (включая занятые dangling symlink),
запрашивает read на собственный report.md и edit на точный output/structure.
В Node передаются фиксированные --format/--output; коллизия во время разрешения
возвращает ошибку, не меняет имя. Проверены PDF default, DOCX/MD, сохранение
старого отчёта и исходного пакета, deny на output/черновик, placeholders во
всех форматах, чужие вложения из ctx.messages. Регрессии сортируют readdir,
поскольку порядок файлов не является контрактом. AvailableReport использует
FS service, захваченный при init, без новых сервисов в execute.
19 PASS (73 assertions), Agent typecheck PASS; tdd-agent-docs-emit-*,
agent-docs-emit-final.log. Lifecycle, строгий ответ executor и TaskScope ещё открыты.

Executor contract: отдельные RED/GREEN — отсутствующий generated script,
нулевой exit с плохим JSON, подмена ожидаемого пути, ложное подтверждение
создания отсутствующего файла. GREEN сверяет ответ с backend paths и
существованием обычных файлов без symlink; возвращает только ожидаемые поля.
RequireExecutor выделяет integrity boundary: skill closure, наличие bundle,
Node SHA и realpath containment. Регрессии Node hash/symlink исключают fallback.
Контролируемые внешние Node-программы находятся только в тестовом resource
bundle; Session, Permission, FS и process spawning настоящие. Fixture сохраняет
и восстанавливает точные script/manifest bytes, включая ошибки/отмену в body.
25 PASS (87 assertions), Agent typecheck PASS; tdd-agent-docs-{missing-bundle,
output-json,output-path,output-exists}-*, agent-docs-executor-final.log.
Lifecycle/TaskScope и установленная приёмка остаются открытыми.

Executor lifecycle: RED — уже отменённый запрос всё ещё запрашивал edit.
GREEN — pre-abort проверяется до работы. Настоящие PID прогоны показали,
что AbortSignal и fixed 60-second timeout завершают дочерний Node до возврата
ошибки; финальных файлов нет. Readiness через файл PID и pollWithTimeout,
без sleeps/TestClock. Отдельный probe подтвердил fixed argv, session cwd,
resources/bin/node и только LANG в env, без provider/Loginom credentials.
28 быстрых тестов PASS (96 assertions); один timeout PASS отдельно (4 assertions,
62.86 s). Все 29 выполнены; долгий тест не повторялся без изменений процесса.
Agent typecheck PASS; tdd-agent-docs-preabort-*, agent-docs-{abort-process,
timeout-process,process-environment,lifecycle-regression}.log.
Пункт Node executor этапа 2 отмечен. Read rejection --file hint, SKILL.md,
TaskScope/SessionTools и установленная приёмка ещё открыты.

Package read rejection: RED — стандартный RejectedError не объяснял --file.
GREEN — только отклонённый read/external_directory для входного пакета
получает подсказку CLI --file / Desktop/TUI attachment. Ошибка остаётся
instanceof PermissionV1.RejectedError; policy DeniedError и прочие причины
сохраняются без подмены. Проверка использует настоящие Permission list/reply,
fork/join и опубликованный pending request. 29 быстрых PASS (99 assertions),
Agent typecheck PASS; tdd-agent-docs-read-hint-*, agent-docs-read-hint-final.log.
Process timeout ранее проверен отдельно; код управления процессом не изменён.
Actual standalone rejection/exit marker ещё проверить через SessionTools/run.

SKILL cutover: RED — metadata не объявляла generated Node bundle;
отдельный RED показал четыре Python-файла в Product skill. GREEN —
`package_docs_run` extract/skeleton/emit, session workspace, реальные пути
результата, read/edit permissions, ошибки и отсутствие shell fallback;
generated metadata, относительные ссылки Golos/OFL и полная рекурсия.
Устаревшие четыре Python-файла удалены из поставки; замороженные baseline
oracles сохранены в acceptance и Host fixtures. Installed fixture теперь
собирает настоящий Node bundle до inventory; отдельный source fixture
проверяет ровно разрешённое отсутствие generated файла, verifier не ослаблен.
Catalog 10 PASS (64 assertions), tool 29 быстрых PASS (99 assertions),
полный staging 13 PASS (47 assertions), Agent typecheck PASS. Логи:
tdd-docs-skill-{node,python}-*, docs-skill-{catalog,tool,full-staging}-green.log.
Обнаружен прежний session/prompt.test.ts кейс package_docs с Python/bash:
legacy-docs-prompt-signal.log — ENOENT удалённого project skill. Его новая
проверка через restricted SessionTools относится к этапу 5; полная Agent
suite не объявляется зелёной. Installed/live приёмка ещё не выполнена.
Пункт SKILL.md этапа 2 отмечен; требования плана не переписывались.

Reserved commands: настоящий RED после исправления event-listener fixture —
config-команды вытесняли bundled skills и возвращали устаревшую package_docs.
GREEN фильтрует reserved names до регистрации config/MCP команд, публикует
Session.Error с пользовательской диагностикой и сохраняет обычный precedence.
Реальный stdio MCP подтвердил namespace external:<prompt> и отсутствие подмены;
такой namespace сейчас исключает точную коллизию, guard оставлен на границе
регистрации для config и MCP. Повреждение bundle исключает и skill-, и command-
fallback. Матрица проверила оба имени и obsolete из семи локальных roots
(home/project Claude и Agents, оба config каталога, skills.paths) и настоящего
HTTP skills.urls. 21 локальная диагностика наблюдалась через реальный EventV2.
Catalog 17 PASS (102 assertions), Agent typecheck PASS; tdd-reserved-command-red,
reserved-command-mcp-green, reserved-source-matrix-green.log. Все profiles,
HTTP cache и процесс MCP принадлежат изолированным test fixtures.
Первый пункт reserved policy этапа 3 отмечен; installed/Desktop/TUI ещё открыты.

Linux artifact completeness: CLI и Desktop RED принимали точный manifest без
Product skills. GREEN — общий Host verifyProductSkills поверх той же проверки
2.3, с обязательными именами из Product. Он вызывается в Linux CLI payload
и Desktop resource verifier, которым пользуются оба DEB/AppImage extraction
branches. Проверены отсутствие каталога, missing generated/font при заново
собранных честных manifests и unlisted skill file; код извлечённого артефакта
не исполняется. Fixtures копируют настоящие Product metadata/assets и собирают
Node executor дочерним Bun; общий кэш убран после fixture lifetime failure
между файлами. Installer regression сохраняет чужие launcher/profile и busy guard.
CLI+installer 7 PASS (63 assertions); Desktop config+artifact 12 PASS / 2 native
macOS SKIP (102 assertions), оба typecheck PASS. Full Host 184 PASS / 6 native
Windows SKIP, 978 assertions, 70.14 s. tdd-{cli,desktop}-artifact-skills-*,
{cli,desktop}-artifact-skills-green.log, stage3-host-suite.log.
Новая обязательность applies только к Linux acceptance scope; native критерии
Windows/macOS не расширены. Реальные DEB/AppImage ещё не собирались/не ставились.
Сохранённый baseline повторно прошёл точный старый verifier из чистого frozen
fc3d97dbf worktree: version 0.1.17, sourceDirty false, исходный tree hash;
baseline-original-manifest-recheck.log. Baseline проверяется по своему сохранённому
контракту, candidate — по новому, без изменения обоих payloads.
Product/root AGENTS зафиксировали catalog/generated/integrity/добавление skill;
временного Product skills.paths моста в исходниках нет. Соответствующие пункты
этапа 3 отмечены; installed run/TUI и единый knowledge lifecycle ещё открыты.

Discovery completeness: RED — при честном inventory без automation/SKILL.md
backend всё ещё показывал package-docs из неполного Product каталога.
GREEN — discovery использует тот же verifyProductSkills, что Linux артефакты,
и сообщает о недоступности bundle; ни один reserved skill/slash не появляется.
Fixture восстанавливает точные исходные header/manifest bytes. Catalog и обычные
skill regressions: 35 PASS (155 assertions), Agent typecheck PASS;
tdd-product-discovery-completeness-red, product-discovery-completeness-green.log.
Flags берут единый staged root; CLI_BUNDLE не меняет verifier discovery.
Actual installed run/TUI проверки ещё остаются открытыми.

Knowledge client foundation: первый RED — отдельного клиента не было.
GREEN использует настоящий StreamableHTTPClientTransport с Bearer и
redirect:error, connectRemote/readCatalog, семь Help схем из MCP и общий
catalog digest. Далее отдельные RED/GREEN: typed closed вместо Not connected,
interrupt одного run, close с abort/drain вместо Connection closed, отсутствие
ключа до сети и отказ readiness при неполном Help catalog. Никаких Browser
session/bridge, Playwright или child_process imports: это проверено Node
resolve hook во время настоящего authenticated HTTP MCP read.
Регрессии проверили неизменность route allowlist после внешнего изменения
tools, запрет write/prepare/browser, pre-abort и ownership повторного request ID.
Два настоящих конкурентных requests сохранили второй run при отмене первого.
9 новых wire tests + 5 catalog regressions = 14 PASS, pinned Node 24.19.0;
tdd-knowledge-client-{read,closed,interrupt,close-drain,missing-key,catalog}-*,
knowledge-client-regression.log. Существующие catalog helpers не изменялись.
Это фундамент этапа 4: private knowledge entry/IPC, supervision, Host routing,
startup и UI/CLI settings ещё не интегрированы; Help продукта пока остаётся
в прежнем browser runtime. Пункты этапа 4 не отмечены как выполненные.

Knowledge startup cancellation: RED — отмена во время MCP tools/list не
завершала startup до тестового deadline. GREEN протягивает необязательный
AbortSignal через connectRemote/readCatalog и прекращает попытки подключения
после отмены; поведение существующих callers и однократный transient retry
сохранены. Настоящие HTTP MCP проверки отменяют отдельно initialize и чтение
каталога; 16 PASS вместе с прежними catalog regressions. Полная pinned-Node
client suite: 2561 PASS / 10 SKIP / 0 FAIL, 163.15 s;
tdd-knowledge-startup-abort-red.log, knowledge-startup-regression.log,
stage4-client-suite.log. Для изменённого imported catalog.mjs проверены точные
original object/hash и отдельный transform: targeted verify_sources PASS,
knowledge-catalog-source-verification.log. Исходные 35 attribution mismatches
не скрыты и остаются отдельным открытым gate. Private process/Host routing
ещё не интегрированы; этап 4 остаётся открытым.

Private knowledge entry: отдельные RED/GREEN прошли для local startup ack,
read-only call, interrupt и private validation. IPC start принимает только
protocol/generation/endpoint/apiKey; password-bearing payload и URL с credentials
отклоняются до сети. list наблюдает фоновую readiness и возвращает реальные
схемы/digest; call допускает конкурентные run/request owners. SDK оборачивает
abort reason, поэтому клиент возвращает собственный точный код отмены после
проверки сигнала вместо утечки транспортного сообщения. close отменяет startup
и active calls, ждёт drain и clean exit; потеря IPC owner также дала exit 0
без сигнала. Отдельный Node resolve hook запрещает Playwright, child_process,
browser session/bridge/check во всех entry tests; env пустой, DISPLAY отсутствует.
Ошибки внешнего MCP не раскрывают тестовый секрет; пустой ключ не создаёт HTTP.
9 real-process entry tests + 16 client/catalog regressions = 25 PASS;
tdd-knowledge-entry-{start,call,interrupt,invalid,guards}-*,
knowledge-entry-regression.log. Первый interrupt GREEN выявил SDK wrapping;
исправление проверено до фиксации результата. Host supervision/routing пока
не подключены, полный этап 4 и его checklist остаются открытыми.

Knowledge supervisor: RED — отдельного exported launcher не было. GREEN
superviseKnowledge явно собирает четыре IPC поля, даже если структурно
совместимый caller передал browser connection/resources; пароль, provider key
и PATH не попали в argv/env/payload. Общий внутренний superviseProcess сохраняет
прежние browser/validation handshake budgets, pending request rejection и
close ack + clean exit contract. Проверены wrong generation, отсутствующий
started, абсолютные пути и повторный close. Настоящий knowledge-entry с HTTP MCP
подтвердил startup до разблокировки initialize, реальные schemas/call/Bearer
и clean exit. Supervisor/process/environment: 6 PASS (34 assertions), wire
дополнение 2 PASS (15 assertions), Host typecheck PASS;
tdd-knowledge-supervisor-red.log, knowledge-supervisor-{regression,wire-green,typecheck}.log.
Изменение транспорта проверено browser cleanup/disconnect regressions; никаких
новых dependencies/pins. Browser readiness и HostPort ещё не переключены.

Connection readiness boundary: RED — service выставлял ready после local prepare,
игнорируя незавершённое чтение каталога. GREEN — RuntimeHandle содержит отдельный
optional ready promise; settled ждёт локальное применение, phase ready — Help.
Наблюдатель связан с текущим handle, игнорирует закрытые/заменённые поколения;
cancel/failure восстанавливают фактическую readiness старого handle. Background
ошибка сохраняет credentials/URL и делает recoverable-error; shutdown отменяет
сеть через close вместо ожидания readiness. Четыре проверки используют реальный
Node knowledge-entry, HTTP MCP и durable store. Новое поколение закрывает
ожидающий старый клиент и публикует только собственную готовность.
Host readiness/migration/recovery: 16 PASS (104 assertions); Desktop exports
connection service/store/recovery: 25 PASS (77 assertions); оба typecheck PASS.
tdd-connection-knowledge-readiness-red.log, connection-readiness-{regression,
desktop-regression,host-typecheck,desktop-typecheck}.log. Existing RuntimeHandle
без background promise сохраняет прежний synchronous-ready контракт.
Это изменение общего lifecycle; createLoginomHost ещё использует browser
readiness, его переключение и HostPort routing остаются следующей задачей.

Knowledge IPC cancellation before readiness: RED — interrupt ждал общий startup,
а owner-wide interrupt отвергался как invalid. GREEN — entry хранит собственные
controllers запросов, включая ожидание client promise; request identity и
interrupt validation общие с клиентом. Отмена A до initialize завершает только
A, B продолжает после разблокировки; cancelled call не дошёл до HTTP. Private
owner-wide interrupt отменяет все calls и сохраняет готовый клиент; смешанный
all/run payload отклонён. close отменяет и эти waiters. Entry/client/catalog:
27 PASS, knowledge-interrupt-regression.log, отдельные RED в
tdd-knowledge-{shutdown-interrupt,startup-call-cancel}-red.log.
Этот private all flag используется владельцем Host при shutdown; публичный
HostPort строит только собственный run и игнорирует поданный caller all.

Host switched to knowledge: RED — restored connection запускал запрещённый
browser entry и становился recoverable-error. GREEN — один knowledge child
на поколение, local ACK/settled отдельно от catalog readiness; browser readiness
удалён. Catalog cached на поколении, возвращается clone после той же readiness
promise; независимый list RPC не считается подтверждением lifecycle readiness.
HostPort добавляет canonical prepare из runtime skill module и local diagnostics,
возвращает реальные Help schemas, использует отдельный knowledge даже при
существующем browser runtime. Help/diagnostics обходят mutation journal.
Настоящий HTTP MCP/Node/HostPort тест подтвердил два чата, отмену только своего
run при поданном caller all:true, сохранность второго, отсутствие browser marker
и recovery файлов в strict режиме. Host shutdown interrupt охватывает knowledge.
Ledger/serialization fixtures получили отдельный controlled knowledge child.
Desktop lease tests initially упали на старом fake service; они переведены на
настоящий Host, MessageChannel, supervised Node и held external operation,
с сохранением утверждений о поколении до фактического завершения request.
Full Host: 190 PASS / 7 SKIP / 0 FAIL, 1017 assertions, 68.29 s. Один SKIP —
опциональный staging, выполненный отдельно с pinned inputs: 13 PASS (47 assertions).
Остальные шесть — native Windows. Desktop source loginom: 36 PASS (109 assertions),
оба typecheck PASS. stage4-host-knowledge-suite.log, stage4-knowledge-staging.log,
stage4-desktop-host-{regression,typecheck}.log, host-knowledge-wire-concurrency.log.
Host AGENTS описывает новый lifecycle; Protocol/API схемы не менялись.
Полный этап 4 открыт: acquire ещё требует ready lease, standalone preflight
ещё требует ready до модели и должен стать ленивым перед живыми CLI проверками;
validation/save/browser status и первый разрешённый prepare остаются следующими.
Installed Desktop/CLI и реальный model routing пока не проверены.
Требования плана заморожены по указанию пользователя; повторного применения
документа корректировок не выполнялось.

Private Help preflight: RED — `connection.ready` завершался до готовности
каталога; после добавления ожидания shutdown зависал на management operation
и завершался принудительно через 35 с. GREEN — private request ждёт настоящий
catalog текущего поколения, проверяет его ready state и получает локальную
отмену до drain при shutdown. Actual compiled Node host + HTTP MCP подтверждают
local ACK при заблокированном catalog, сохранение URL и отсутствие browser entry;
close отменяет pending readiness с `LOGINOM_HOST_CLOSED` и завершается exit 0.
Бюджет handshake 180 с сохранён; комментарий и имя старого budget-теста уточнены.
Allowlist дополнен `LOGINOM_CONFIG_REQUIRED` / `LOGINOM_CONNECTION_NOT_READY`.
Node-host/knowledge/connection-readiness: 15 PASS (90 assertions), Host typecheck
PASS; node-help-preflight-{regression,typecheck}.log. RED:
tdd-node-help-preflight-{red,cancel-red}.log. Изменён только private IPC;
публичные Protocol/HttpApi схемы и pins не менялись.
В плане отмечены реализованные knowledge lifecycle, local startup/readiness
и concurrency проверки. Этап 4 целиком остаётся открытым.

Standalone lazy preflight: RED — ordinary запрос завершался с exit 2
`LOGINOM_CONFIG_REQUIRED` до HTTP provider; explicit command после local ACK
ошибочно давал `LOGINOM_CONNECTION_NOT_READY` вместо ожидания Help. GREEN —
ранние hasApiKey/Help readiness checks только у `--command loginom-automation`
(обе формы argv); обычный запрос до выбора профиля доходит до модели.
Strict recovery по-прежнему блокирует до provider с exit 4 и сохраняет запись.
SIGINT во время ожидания Help первоначально зависал до test deadline/exit 137;
теперь отменяет waiter, ждёт подтверждённый Host cleanup и освобождает `.writer`,
exit 130. Actual standalone/Bun → compiled Node Host → real HTTP MCP и внешний
test provider: обычный unconfigured ответ, explicit ready/cancel/unavailable,
обычный ответ при отказе Help, strict recovery; DISPLAY/Wayland отключены,
browser entry запрещён spy marker. Existing early-config/resource-root тест
переведён на explicit automation без потери exit 2/no-DB assertions.
CLI focused regression: 12 PASS (81 assertions), Agent typecheck PASS;
standalone-lazy-preflight-{regression,agent-typecheck}.log. RED:
tdd-standalone-{natural-preflight,explicit-help-preflight,help-preflight-sigint}-red.log.
Agent AGENTS и progress standalone design обновлены. В плане отмечен только
preflight item; lazy exit contract конкретного natural tool отказа ещё открыт
до local run/TaskScope integration. Fake provider доказывает границу preflight,
не автоматическую активацию skill. TUI startup logic не менялась; installed
Desktop/CLI, live routing и полная приёмка этапа 4 остаются открытыми.

Local Host run and lazy lease: RED — unconfigured `acquire` возвращал null;
после отделения run два одновременных acquire одного чата оба принимались.
GREEN — локальная identity резервируется перед await, run создаётся без
connection lease; unconfigured/starting catalog и diagnostics работают без
создания chat runtime и network wait. Настоящие Help schemas появляются только
после готового knowledge catalog; без него возвращаются local descriptors,
схемы не синтезируются. Конкретная внешняя операция получает typed
`LOGINOM_CONFIG_REQUIRED` / `LOGINOM_CONNECTION_NOT_READY` до runtime/journal,
либо один текущий lease, удерживаемый до завершения run/запроса.
Реальный HTTP MCP тест покрывает local run при заблокированном catalog;
pending catalog не блокирует диагностику, browser marker отсутствует.
Настройки могут смениться при local run; первая Help операция закрепляет
поколение, и последующее сохранение ждёт lease release. Старый advisory тест
предполагал lease уже после acquire: он разделён на local/leased варианты,
с настоящей Help операцией перед save в leased случае, остальные assertions
uncertainty/release сохранены. RED дополнительной проверки — adapter metadata
продолжала показывать generation 1 после смены на 2 до первого внешнего вызова.
GREEN — private Host reply header передаёт observed/bound generation, scoped
observer в transport обновляет adapter getter; MCP result body не изменён.
Full Host: 194 PASS / 7 SKIP / 0 FAIL, 1052 assertions, 73.22 s;
stage4-host-local-run-suite.log. Шесть SKIP — native Windows, optional staging
был отдельно выполнен ранее с pinned inputs. Desktop real-Host lease regression:
4 PASS / 16 assertions; standalone actual process regression: 6 PASS / 35;
Host и Agent typecheck PASS. desktop-local-run-lease-regression.log,
standalone-local-run-regression.log, host-local-run-{typecheck,agent-typecheck}.log.
RED: tdd-host-{local-run,local-acquire-race,lazy-generation-metadata}-red.log.
Частный протокол расширен контрольным header, публичный Protocol/HttpApi не менялся.
TaskScope, каталог по профилям, lazy natural-tool exit contract и разрешённый
первый prepare/admission ещё открыты; общий run/scope item пока не отмечен.
Один dangling alias собственного SIGKILL RED fixture удалён после подтверждения
отсутствия target; чужие profiles, worktrees и launcher не менялись.

## 2026-10-06 — Host: отдельная проверка Help и веб-входа

TDD RED → GREEN: рабочий ключ Help больше не блокируется ошибкой веб-входа.
Host проверяет реальный key-only knowledge entry и полный MCP-каталог перед
запуском браузерной проверки. Четыре разрешённых кода веб-ошибок дают отдельный
BrowserStatus `failed` и одноразовый validationId; успешный вход даёт `verified`.
Неверный ключ, недоступный Help и неизвестные/cleanup ошибки не дают save token.
Повторная MCP-проверка удалена из browser managed-entry; секреты и чужие сообщения
не добавлены в View. Общие optional View/Validation совместимы со старыми views.

Статус браузера относится к активному поколению, после restore — `unknown`.
Несохранённый draft и старое поколение его не меняют; явный check неизменённого
подключения и запуск чата обновляют его. View возвращает отдельную копию статуса.
Закрытие Host отменяет ожидающую MCP Help проверку и дожидается её cleanup.
Приёмка отмены уже начавшейся браузерной навигации остаётся открытой.

13 новых Host regression cases через реальные Node/HTTP MCP и контролируемую
внешнюю браузерную границу; новые contract tests — 2 PASS / 13 assertions.
Полный Host: 207 PASS / 7 SKIP / 0 FAIL / 1128 assertions, 78.32 s.
Desktop connection exports: 36 PASS / 109 assertions. Runtime entry/page: 16 PASS;
knowledge client: 11 PASS. Host, Schema и Agent typecheck PASS; diff check PASS.
Логи: host-validation-browser-suite.log, desktop-validation-browser-regression.log,
runtime-validation-browser-regression.log, client-validation-browser-regression.log,
agent-validation-browser-typecheck.log в сохранённом acceptance каталоге.
RED: tdd-host-{browser-warning,validation-key,browser-status,chat-browser-status,
validation-shutdown}-red.log. Изменённые runtime src/knowledge-client не числятся
импортированными файлами source-map; baseline attribution debt не переписан.
Публичные Protocol/HttpApi не используют эти View/Validation и не менялись.
Пункт плана validation/save/status/UI не отмечен: Desktop/CLI отображение
и установленная/живая проверка пока впереди. Требования плана не менялись.

## 2026-10-06 — Desktop/CLI: отображение Help и браузера

TDD RED → GREEN в реальном Solid settings controller: successful Help с
BrowserStatus failed не сообщает об успешном входе и не блокирует Save.
Проверенный draft хранится отдельно от активного View, редактирование сбрасывает
результат. Проверка несохранённых и сохранённых настроек использует новые Help
сообщения, баннер показывает Help и browser отдельно. Save/deferred toast
сохраняет предупреждение из фактически применённого поколения; account mismatch
больше не использует текст «подключение не сохранено». Новые EN/RU ключи через
обычный typed i18n; все 47 существующих LOGINOM_ENGLISH values сохранены точно.

CLI check декодирует Validation, возвращает Help-ready и BrowserStatus отдельно,
не выводит token/credentials. JSON state/code остаются машинным контрактом.
Два новых actual standalone/compiled Node Host процесса с реальным HTTP MCP
проверяют setup/check/status без DISPLAY: хороший ключ + web warning — exit 0,
неверный ключ — exit 1 и отсутствие браузерной проверки. Profile .writer снят,
валидационный Node завершён, chat runtime не создаётся. Оригинальный код
LOGINOM_CONNECTION_VALID сохранён, дополнительные поля разделяют готовность.

Полный App browser suite: 60 PASS / 181 assertions; settings controller — 20
случаев. CLI focused preflight/management: 9 PASS / 63 assertions, 30.70 s.
App/Agent/Desktop typecheck PASS, prettier и diff check PASS. Логи acceptance:
app-help-browser-status-{suite,typecheck}.log, cli-help-browser-status-regression.log,
agent-help-browser-status-typecheck.log, desktop-help-browser-status-typecheck.log;
RED tdd-{app,cli}-help-browser-status-red.log.
Controller/процессные fixtures не доказывают визуальную установленную Desktop
приёмку, CLI TTY мастер или естественную активацию skill; эти gates ещё открыты.
Пункт validation/save/status/UI пока не отмечен до приёмки мастеров.

RU терминология сверена с независимыми корпусами [Firefox preferences](https://raw.githubusercontent.com/mozilla-l10n/firefox-l10n/main/ru/browser/browser/preferences/preferences.ftl)
и [VS Code RU](https://github.com/microsoft/vscode-loc/blob/main/i18n/vscode-language-pack-ru/translations/main.i18n.json)
(полученный content SHA256 50bd007ada2e281483edc7ff37929c1edf96c6ccb17836d72702fe0c3760e25f),
со [справочником Грамоты](https://gramota.ru/biblioteka/spravochniki/pismovnik/kak-pisat-slova-svyazannye-s-internetom)
и [CLDR](https://www.unicode.org/cldr/charts/48/supplemental/language_plural_rules.html).
Новые фразы целиком; числовые формы не добавлены. Microsoft Russian guide найден,
но его PDF retrieval через web tool неуспешен — чтение PDF не заявляется.
Help в RU — «справка»; слова browser/unknown/verified/failed в JSON — кодовые значения.
Требования плана и исходный документ корректировок не менялись.

## 2026-10-06: восстановление TaskScope из истории

Добавлена чистая функция `TaskScope.derive` с существующими брендированными ID.
Она читает переданную полную историю, сортирует сообщения по порядку хранения,
учитывает границу revert, отличает настоящий запрос от synthetic/compaction/replay
и восстанавливает только применённую activation. Pending, незавершённый или
ошибочный tool, обычный skill, malformed digest и чужие части не выдают профиль.
Новый настоящий запрос сбрасывает профиль в default; docs → automation внутри
той же задачи не разрешается. Старые ответы и replay прежней задачи не меняют
новую задачу. Текст запроса не служит выдачей прав.

Публичный prompt и command удаляют зарезервированные activation/pending/replay
поля до `chat.message` и повторно после hook, сохраняя прочие аннотации.
Проверены реальный public prompt, command с controlled provider и локальный
plugin, пытающийся подделать поля. Данные перечитываются через реальные Session
и MessageV2/БД; входные metadata не изменяются.
Overflow compaction теперь сохраняет исходный message ID; file-only replay
получает пустой ignored synthetic marker без изменения публичной схемы.
Fork переназначает ссылки на новые message IDs и сохраняет исходную историю.

TDD RED зафиксирован до исправлений: transition, part binding, public metadata,
fork, compaction и file-only replay; прежние RED default/activation/replay/slash/
revert также сохранены в acceptance-каталоге. Regression history/session/
compaction/revert: 82 PASS / 1 SKIP / 283 assertions; focused prompt/command/
plugin/обычный loop: 6 PASS / 1 SKIP / 24 assertions. SKIP относится к ранее
отключённой V2 projection, не к TaskScope. Agent `bun typecheck` PASS;
форматирование и `git diff --check` PASS. Логи: `task-scope-history-regression.log`,
`task-scope-prompt-regression.log`, `task-scope-agent-typecheck.log` в
`/home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006`.

Это часть этапа 5. Запись доверенной activation при реальном bundled skill,
pending-переходы на границе provider-turn и проверки Host/resolve/execute ещё
не подключены; первый пункт этапа не отмечен. Source tests не доказывают
естественный выбор skill, установленный Desktop/CLI или живую приёмку.
Требования плана и документ корректировок повторно не перерабатывались.

## 2026-10-06: текущая работа существующего runtime

Добавлен приватный `work` запрос managed entry: текущие active/unsettled flags
bridge и отдельный dispatching flag текущего вызова. Семантика завершённого
`call` reply не менялась. Host `workState(generation, chat)` обращается только
к уже существующему владельцу; отсутствие runtime — локальный idle, потерянный
или stale владелец и неверный ответ — отказ. Контрольный запрос ограничен 5 s,
не перезапускает процесс, не создаёт браузер, не вызывает admission и не пишет
в recovery journal. Подключение к pending/apply scopes ещё впереди.

TDD: отсутствие Host метода дало RED; первые дополнительные process fixtures
имели неверно экранированный перевод строки — эта ошибка fixture исправлена
и не считается проверкой продукта. После этого 5 process cases PASS / 24
assertions: local/no child, свежие состояния, malformed, lost и stale.
Actual managed entry проверен отдельно: байты entry и start-input совпадают
с источниками, внешние browser/MCP/bridge boundaries контролируются. Снятие
нового `work` обработчика дало `LOGINOM_REQUEST_INVALID` RED; возврат минимального
обработчика — GREEN. Проверены реальные Node IPC, три live состояния bridge,
незавершённый dispatch, interrupt, исчезновение dispatch и acknowledged exit 0.
Это не реальная браузерная или установленная приёмка.

Полный Host suite: 212 PASS / 7 SKIP / 1152 assertions, 78.30 s (до добавления
отдельного actual-entry теста); focused work+actual-entry: 6 PASS / 33 assertions.
Host/Agent `bun typecheck` PASS; pinned Node syntax и start-input/connection
regression: 22 PASS. `git diff --check` и форматирование PASS.
Логи в собственном acceptance-каталоге: `host-work-state-suite.log`,
`managed-work-state-green.log`, `host-work-state-typecheck.log`,
`agent-work-state-typecheck.log`, `runtime-work-state-regression.log`;
RED: `tdd-host-work-state-red.log`, `tdd-managed-work-entry-red.log`.
Этап 5 не отмечен: HostPort scope, выдача activation и каталоги ещё не соединены.
План и документ корректировок повторно не перерабатывались; evals не изменялись.

## 2026-10-06: происхождение реализации инструмента

`ToolRegistry.all()` присваивает внутренний `Tool.Def.origin` из собственных
builtin/custom коллекций; `tools()` сохраняет его после model-specific schema
и description преобразований. Из plugin definition и `tool.definition` output
это поле не читается. Имя `read` само по себе не подтверждает builtin.
Параметры модели и публичные Protocol/Message схемы не изменены.

TDD RED: настоящий local custom `read`, пытающийся объявить `origin: builtin`,
не отличался от builtin в каталоге. Минимальный GREEN — присвоение registry и
сохранение при сборке каталога. Дополнительно проверены plugin `read` и hook,
пытающийся записать origin в definition output: оба остаются external.
Полные registry + SessionTools regressions: 21 PASS / 50 assertions;
Agent `bun typecheck`, prettier и `git diff --check` PASS. Логи:
`tdd-tool-origin-red.log`, `tool-origin-green.log`, `tool-origin-regression.log`,
`tool-origin-agent-typecheck.log` в собственном acceptance-каталоге.

Это контракт происхождения для следующего шага. Docs allowlist в resolve/
execute и Host scope ещё не подключены; существующая eager admission не
объявляется исправленной. Этап 5 остаётся открытым. Согласованные требования
плана не изменялись, файлы evals и соседний worktree не трогались.

## Приватный Host scope и подготовка исходных вложений

HostPort теперь хранит действующий и pending-профиль на существующем run.
Default/docs не перечисляют браузер и отклоняют его вызовы/admission до lease,
runtime, записи журнала и файлов. Запрос активации сохраняет прежние права;
apply проверяет точное совпадение pending, безопасное текущее work/recovery
состояние и применяет профиль. Docs → automation в той же задаче запрещён.
Новый настоящий task ID начинает default, сохраняя браузер и его работу.
Поэтому даже default → docs повторно проверяет оставшуюся работу старой задачи.
Во время окончательного apply сырой браузерный вызов/admission запрещены.
Adapter сериализует scope, admission и вызовы, не прерывая чужую активную работу
при отмене ещё не начавшегося вызова.

Первый разрешённый prepare создаёт runtime, передаёт исходные byte groups с
настоящими message IDs, подтверждает admission и только затем готовит workspace.
Дедупликация повторно проверяет byte identity; новый runtime получает вложения
снова. Help/diagnostics не используют этот путь, отдельный admit не запускает
runtime, `.lgp` filenames запрещены. Остальные Dock-вызовы требуют известного
каталога подготовленного runtime. Приватный list действительного managed entry
добавляет `prepared` из собственного workspace metadata, перекрывая MCP-поле:
неудачный первый prepare не выдаёт остальные инструменты.

TDD RED → GREEN сохранены для исходного scope, порядка admission, повторной
передачи после замены runtime, отказа prepare, перехода новой default-задачи
при живой работе и гонки apply/сырого browser call. Логи в собственном
acceptance-каталоге: `tdd-host-task-scope-red.log`,
`tdd-prepare-admission-order-red.log`, `tdd-replacement-admission-red.log`,
`tdd-unprepared-catalog-red.log`, `tdd-managed-prepared-catalog-red.log`,
`tdd-new-task-live-work-red.log`, `tdd-scope-application-race-red.log`.

Проверки: полный Host — **224 PASS / 7 SKIP, 0 FAIL**, 1231 assertions;
`task-scope` + actual managed entry + parallel calls — **20 PASS**, 131 assertions;
Agent history/tools/registry — **30 PASS**, 77 assertions. Host и Agent
`bun typecheck`, pinned Node syntax check и `git diff --check` прошли.
Сохранены `host-task-scope-final-suite.log`, `host-scope-application-race-green.log`,
`agent-host-scope-regression.log` и соответствующие final-typecheck логи.
Runtime lock SHA-256 остаётся `1e9c65c695505bcc8e94afdee82b844da93c44bf937fbe4a80afe4a9cb784a93`.

Это source/IPC проверки с настоящим pinned Node, контролируемой внешней
browser/bridge-границей и отдельной проверкой byte-identical managed entry.
Реальные Linux Desktop/CLI и выбор skill моделью ещё не приняты. Следующий шаг —
подключить scopes/activation к provider-turn, ограничить SessionTools resolve/
execute и убрать eager admission; backend пока не создаёт активацию сам.
Общий пункт этапа 5 не отмечен выполненным. Требования плана и документ
корректировок не менялись; evals и соседний worktree не изменялись.

## Backend: ленивый admission и полная исходная история

Убран eager `admit` из `SessionTools.resolve`: каталог не передаёт байты.
Приватные группы исходных вложений идут только вместе со сценарным вызовом;
все семь Help routes и диагностика получают `undefined`. Отказ Host при
передаче становится ошибкой вызова; ошибка каталога сохраняет redacted status.
V1 перечитывает Session и полную историю на границе хода, затем выводит из
этой же истории compacted model window. Общая `TaskScope.visible` граница
учитывает revert и принадлежность частей; ранний CSV сохраняет исходный ID,
даже когда его уже нет в окне модели. Replay, assistant и чужие parts не
авторизуют группы. `.lgp` исключён по расширению, MIME части и MIME data URL.
Task ID захвачен чистой функцией; model args не выбирают admission IDs/пути.

TDD RED → GREEN сохранены: `tdd-backend-lazy-admission-red.log`,
`tdd-backend-package-exclusion-red.log`, `tdd-backend-history-admission-red.log`.
`backend-lazy-admission-history-suite.log`: **128 PASS / 1 SKIP**, 404 assertions
(tools, task scope, compaction, revert-compact, messages pagination).
`backend-history-prompt-regression.log`: **11 PASS**, 56 assertions — actual
loop, local provider, instance context и новое сообщение во время работы.
Agent `bun typecheck`, format/diff checks прошли. Private-call контракт здесь
проверен контролируемым Host adapter; естественный выбор skill и установленная
сборка этим не доказаны. Старый package_docs/Python prompt-тест ещё требует замены.

В плане изменён только completion checkbox eager-admission подзадачи этапа 5;
согласованные требования не перерабатывались. Bundled activation, provider-turn
allowlist и согласованный Host/backend apply — следующий шаг. Этап 5 целиком
не закрыт; Desktop/CLI/live evals остаются открытыми.

## Каталог инструментов по сохранённому профилю

`SessionTools.resolve` выводит task/profile из полной видимой истории и
связывает его с имеющимся Host run до формирования каталога. Профиль захвачен
на весь ход: последующее изменение переданного массива history не меняет
доступные execute closures. Docs принимает только разрешённые ID с builtin
origin; одноимённые custom tools не заменяют read/skill или исполнителя.
`package_docs_run` инициализируется только в docs resolver с реальными
Session/FS/Process сервисами, общей registry запись не добавлена.

Default/docs отбрасывают prepare и браузерные определения даже из слишком
широкого Host-каталога. Automation скрывает task и docs executor. Registry
фильтруется до построения code-mode каталога; docs не запрашивает внешние
MCP tools/resources. Code mode сохраняет verified Host Help. Session.permission
не переписывается. Данные вложений по-прежнему передаются лениво.

TDD RED → GREEN: `tdd-docs-catalog-real-services-red.log`,
`tdd-backend-scope-bind-red.log`, `tdd-docs-code-mode-catalog-red.log`,
`tdd-docs-code-mode-help-red.log`. Финальные исходные проверки в acceptance
каталоге: `docs-profile-catalog-final-suite.log` — **67 PASS**, 246 assertions;
Agent typecheck PASS; `docs-catalog-prompt-regression.log` — **11 PASS**,
56 assertions. Каталог проверен на настоящих
Session/ToolRegistry/Permission, а Host adapter и provider — контролируемые
границы. Сам выбор skill моделью, producer applied activation и Linux
installed acceptance ещё не доказаны. Требования и completion пункты плана
не менялись; общий этап 5 пока открыт.

## Происхождение metadata инструментов

Фактический RED показал две границы подмены: custom tool с ID `skill`
возвращал применённый grant, а обычный инструмент сохранял его в running
metadata. Общая `TaskScope.cleanMetadata` удаляет пять зарезервированных
activation/pending/replay ключей, сохраняя остальные. Она применяется к
public part metadata, ctx.metadata, результату builtin/custom после
`tool.execute.after` и metadata внешнего MCP результата. Отдельная проверка
подтверждает удаление grant, добавленного after-hook; обычная metadata и
исходное время запуска не теряются.

`tdd-tool-grant-metadata-red.log` → `tool-grant-metadata-suite.log`:
**38 PASS**, 146 assertions на настоящих сервисах и контролируемых внешних
границах. Agent typecheck PASS; `tool-metadata-prompt-regression.log`:
**6 PASS**, 21 assertion. Это защита consumer от чужой отметки;
штатный pending/apply producer ещё не подключён. План не перерабатывался,
соседние evals/harness и рабочее дерево калибровки не изменялись.

## Активация bundled skill в V1 provider loop

Builtin `skill` получает приватный callback после проверки origin; custom
реализация с тем же ID его не получает. После разрешения `skill` и успешного
чтения списка ресурсов callback принимает только verified bundled origin,
зарезервированное имя и inventory digest. Host получает pending request
на существующем run, а текущий каталог остаётся прежним.

На следующей границе V1 перечитывает историю, проверяет исходную задачу и
завершённый вызов skill, затем применяет переход Host. Только после успеха
backend записывает `{name, profile, digest}` в activation. Применение и
DB-запись защищены от разрыва отменой; ошибка записи останавливает цикл.
Отказ request становится tool error; отказ apply заменяет завершённую часть
явной ошибкой `LOGINOM_SCOPE_DENIED`, оставляя прежний профиль без grant.

Устаревший package_docs/Python prompt-тест заменён фактическим flow-тестом:
проверенный staged skill → смена каталога следующего хода → реальный pinned
Node executor → структура fixture `.lgp`. Проверены один acquire на цикл,
неизменные session permissions и отсутствие Host call/admit для docs.
Добавлены отдельные проверки отказов request и apply.
`tdd-bundled-provider-boundary-red.log` →
`bundled-boundary-request-apply.log`: **3 PASS**, 48 assertions.
`bundled-activation-prompt-suite.log`: **109 PASS / 1 SKIP**, 472 assertions
(полный prompt файл, profile/tools/task-scope, SkillTool и registry).
Agent typecheck и diff/format checks прошли.

Provider и IPC-ответы Host здесь контролируемые; Session/Skill/ToolRegistry,
проверка bundle и Node executor настоящие. Естественный выбор skill моделью,
Desktop/CLI installed acceptance и парные live evals остаются открытыми.
Следующий шаг — граничные race/revert случаи, slash/run-command producer и
Task bypass guards. Общий этап 5 ещё не выполнен; план не перерабатывался.

## Pending-активация и свежая граница revert

Новый actual-loop RED подтвердил ошибку: между request и следующей границей
source skill part исключалась через Session revert, но backend находил её
в полной истории и применял переход. Apply теперь требует присутствия именно
этой части в `TaskScope.visible` с актуальным revert. Одна сохранённая task ID
не выдаёт права. В этом случае Host apply не вызывается и grant не пишется;
следующее bind прежнего профиля очищает pending на том же run.

`tdd-reverted-pending-activation-red.log` →
`activation-revert-final-boundaries.log`: **4 PASS**, 63 assertions
(успех, request/apply отказы, revert). Более широкие регрессии
`activation-revert-prompt-regression.log`: **87 PASS / 1 SKIP**, 407 assertions
(полный prompt, task scope, revert-compact). Agent typecheck и format/diff
checks прошли. Другие гонки pending/новой задачи/отмены, slash/run-command
producer и Task bypass остаются следующими открытыми проверками.

## Продуктовая slash-команда и исходная сессия

Проверенный bundled skill в `Command` передаёт grant приватным аргументом
внутреннего user-message constructor. Публичная схема prompt/command и SDK
не менялись. После очистки metadata/hook результата backend ставит pending
на текст тела skill. На границе текущей задачи проверяются обычные permissions
`skill`, затем bind/request/apply того же Host run; applied `skill_activation`
записывается только после успеха, перед первым provider turn. Непринятый или
отменённый переход очищает pending. История восстанавливает applied профиль
из существующего формата, без изменения Session.permission и новых таблиц.

TDD также выявил стандартное превращение команды для `general` в subtask:
product `Command.Info` теперь задаёт `subtask: false`. Обе команды выполняются
в исходной сессии; исходный тест подтверждает отсутствие дочерних сессий.
`tdd-bundled-command-activation-red.log` и
`tdd-bundled-command-subtask-red.log` → `bundled-command-failures.log`:
**5 PASS**, 62 assertions (build/general, request/apply/permission отказ).
Положительные случаи включают настоящие bundle verification/Node extract;
provider и Host IPC-ответы контролируемые.

`bundled-command-final-suite.log`: **104 PASS / 1 SKIP**, 537 assertions
(полный prompt, task scope, bundled skills, SkillTool). Agent typecheck и
format/diff checks PASS. Source backend команды работает; установленный CLI,
Desktop/TUI и естественный выбор моделью не приняты. Проверено, что CLI
`run --command` пока теряет собранные `--file` части — это следующий TDD шаг,
вместе с `.lgp` URL/MIME и оставшимися границами задачи. План не перерабатывался.

## Вложения CLI command

Actual subprocess RED подтвердил, что `run --command` завершался успешно,
но содержимое `--file` отсутствовало в provider request. CLI теперь передаёт
собранные части через существующее поле SDK `command.parts`; публичная схема
не менялась. Проверка использует обычную настроенную команду, настоящий CLI,
backend и чтение файла, с контролируемым HTTP provider.

`tdd-command-cli-attachment-red.log` → `command-cli-attachment-suite.log`:
**14 PASS**, 48 assertions (весь CLI run-process файл). Agent typecheck и
format/diff checks PASS. Это source subprocess proof; установленный
`run --command package-docs`, Desktop/TUI и `.lgp` path/MIME ещё не приняты.

## Локальный `.lgp` в CLI и backend

TDD подтвердил `data:text/plain` вместо локального пути при `CLI_ROOT`.
`run --file` теперь сохраняет URL регулярного `.lgp` и MIME
`application/x-loginom-package`, пропуская byte snapshot. Core MIME helper
распознаёт `.lgp` без учёта регистра. Backend нормализует старые file-части
с `text/plain`, а template `@`-упоминания получают тот же MIME. Удалённый
`--attach` сохраняет отдельную семантику передачи клиентских байтов.

Проверки настоящим source CLI охватывают обычный prompt/command,
с/без `CLI_ROOT`, кириллицу и пробелы. История прочитана через CLI `export`:
точный `file:` URL/MIME сохранён, marker байтов отсутствует в provider request.
`tdd-cli-lgp-path-red.log`, `tdd-prompt-lgp-mime-red.log` и
`tdd-prompt-lgp-mention-red.log` фиксируют исходные ошибки.
Первый общий запуск не задал обязательный TEST_NODE и выявил ошибку настройки
нового mention fixture; после исправления fixture и закрепления Node:
`lgp-cli-prompt-final.log` — **94 PASS / 1 SKIP**, 453 assertions.
Agent/Core typecheck и format/diff checks PASS. В плане отмечен только
реализованный пункт CLI path/MIME; installed/TTY/GUI acceptance открыта.

## `.lgp` в TUI: source реализация

Вставка локального `.lgp` теперь проверяет тип файла и добавляет path attachment,
без чтения текста/байтов. Prompt передаёт `file:` URL с MIME пакета;
`@` autocomplete выставляет тот же MIME. Виртуальная метка различает пакет,
PDF и изображения. Existing image/PDF/SVG поведение сохранено.

`tdd-tui-lgp-paste-path-red.log` → `tui-lgp-prompt-regression.log`:
**12 PASS**, 18 assertions (local attachment, part, history). Новый тест
работает с реальным файлом с пробелами/кириллицей; отдельная IO-boundary
проверка запрещает чтение bytes/text. TUI typecheck и format/diff checks PASS.
Это helper/source proof, не действие пользователя в смонтированном UI/PTY.
Полный пункт TUI в плане оставлен открытым до фактической терминальной проверки.

## Публичное редактирование частей и grants

Три последовательных TDD случая закрыли обход через SDK `part.update`:
подделку user metadata, стирание/замену применённого backend grant при
редактировании текста и подделку activation в completed skill tool-state.
Route берёт исходную часть через Session; общий sanitizer удаляет входящие
reserved keys, сохраняет reserved values именно из persisted original и
обычные metadata из запроса. Схема HTTP/SDK не менялась.

`tdd-public-part-grants-red.log`, `tdd-public-part-preserve-grant-red.log`,
`tdd-public-tool-state-grant-red.log` → `public-part-all-metadata-green.log`:
**3 PASS**, 7 assertions; расширен случай сохранения backend tool grant.
Agent typecheck и format/diff checks PASS. Общий regression дал
**110 PASS / 1 SKIP / 4 FAIL**: четыре HTTP/SSE теста успешно выполняют тело
assertions, затем зависают в teardown; 3/3 узких повторов стабильны.
При 30s виден InterruptError после server shutdown deadline 20s.
Это открытая ошибка cleanup тестовой инфраструктуры. Перестановка abort до
iterator.return и дополнительный локальный scope не помогли; эти изменения
удалены. Минимальный HTTP/SSE probe подтверждает: abort и финализаторы
закончены, но NodeHttpServer teardown через 20s возвращает InterruptError.
Гипотеза о неправильном порядке scope опровергнута. Причина установлена и
исправлена отдельной задачей ниже. Полный этап не принят.

## Сохранённая подзадача и продуктовый профиль

TDD выявил обход каталога через persisted subtask: после восстановления
docs-профиля loop создавал дочернюю general-сессию. Теперь перед инициализацией
подзадачи профиль заново выводится из полной истории и revert boundary;
`package-docs` и `loginom-automation` возвращают `LOGINOM_SCOPE_DENIED`.
Дочерняя сессия и provider request не создаются; Session permissions не меняются.

`tdd-persisted-subtask-profile-red.log` → `persisted-subtask-profile-green.log`;
`persisted-subtask-prompt-regression.log`: **78 PASS / 1 SKIP**, 403 assertions,
включая оба профиля и обычные default subtask/cancellation flows.
Agent typecheck и format/diff checks PASS. Это восстановленный backend grant
и контролируемый provider, не доказательство естественного выбора skill.
Общий этап 5 остаётся открыт до остальных переходов и гонок.

## Разрешение чтения пакета после revert и compaction

Два TDD случая показали, что generator принимал отменённый файл и standalone
replay-копию как исходное пользовательское вложение. Теперь он использует
TaskScope.visible с ownership и revert boundary, исключая replay-сообщения
из источников разрешения. Если исходного вложения нет, обычный read permission
запрашивается до executor; отказ не создаёт .work. Видимый original и реальный
Session.fork сохраняют разрешение; явные read/external_directory deny действуют.

tdd-package-docs-reverted-attachment-red.log и
tdd-package-docs-orphaned-replay-red.log фиксируют отсутствие нового read grant.
package-docs-attachment-full-final.log: **44 PASS**, 146 assertions (generator
и TaskScope). После приведения error channel тестового Tool.Context к контракту:
package-docs-original-attachment-matrix-final.log — **10 PASS**, 32 assertions;
Agent typecheck и format/diff checks PASS. Общий этап 5 остаётся открыт.

## HTTP/SSE fixture: адрес клиента и proxy

Классификация: неверный адрес подключения тестового клиента, не регрессия
TaskScope/metadata. NodeHttpServer.layerTest слушает 0.0.0.0; serverFetch
использовал bind-address как destination. При исходном proxy окружении Bun
отправлял этот запрос через proxy; abort клиента оставлял upstream SSE socket
открытым до server shutdown deadline. Точный 0.0.0.0 отсутствует в NO_PROXY.

Read-only transport A/B подтвердил: тот же 0.0.0.0 с NO_PROXY=* только
в отдельном probe и тот же запрос к 127.0.0.1 завершаются за 30–47ms с закрытым
socket. Нативный Node 24.19.0 также корректно закрывает соединение.
Fixture serverFetch теперь направляет локальный SDK на 127.0.0.1.
Proxy окружение, production listener, SSE assertions и SDK не изменялись.
Исторический breaking SHA не установлен; изменения metadata route не являются
причиной — минимальный transport probe обходится без него.

http-signal/transport-{bun,loopback-bun,proxy-bypass-bun,node}.jsonl и
scope-order-probe.log сохраняют diagnosis. httpapi-sdk-loopback-regression.log:
**21 PASS**, 43 assertions; Agent typecheck и format/diff checks PASS.
Список includes все четыре исходных HTTP/SSE teardown failures.

## Буквальные аргументы встроенных slash-команд

TDD выявил выполнение shell expression из аргументов package-docs до отказа
skill permission. Для verified bundled product command shell expansion теперь
пропускается: текст аргументов передаётся модели буквально, без побочного файла.
Обычные configured commands сохраняют существующее выполнение shell template.

tdd-bundled-command-shell-expansion-red.log → bundled-command-shell-green.log.
Проверены docs с разрешением/отказом и automation с отказом, сохранение текста,
отсутствие shell side effect, обычные command/attachment/shell flows.
product-scope-command-regression.log: **132 PASS / 1 SKIP**, 588 assertions
(prompt, TaskScope, SessionTools, registry, весь HTTP SDK).
Agent typecheck и format/diff checks PASS. Installed/live выбор не проверен.

## Новое сообщение на выходе V1 run

TDD подтвердил гонку: сообщение, сохранённое во время Host release предыдущего
run, присоединялось к его результату и не получало provider turn. Prompt теперь
передаёт внутренний ID принятого сообщения; только после успешного join
проверяется принадлежность результата. Нужный повторный проход идёт через
SessionRunState, создавая зарегистрированный runner с новым default-профилем.
Cancellation не вызывает продолжение; V2 queue/HTTP input не добавлены.

Три последовательных RED→GREEN случая: admission во время release,
отмена во время release без возобновления и отменяемость нового прохода.
Последний выявил, что рекурсивный запуск на уже удалённом Runner терял
регистрацию; финальный вариант заново разрешает Runner через SessionRunState.
Host/provider barriers и реальные Session/Runner проверяют эти границы,
без time-based sleep. Восстановленный docs grant берёт digest actual bundle.

tdd-prompt-host-release-{admission,cancel,runner-ownership}-red.log →
prompt-host-release-owned-green.log: **28 PASS**, 80 assertions.
prompt-host-release-full-regression.log: **168 PASS / 1 SKIP**, 720 assertions,
включая Runner, prompt, TaskScope, SessionTools, registry, revert/compaction
и весь HTTP SDK. Agent typecheck и format/diff checks PASS.
Это source/control-provider proof; installed GUI/TTY и живой выбор ещё открыты.

## Промежуточный native CLI candidate для дальнейшей приёмки

Полный Linux x64 CLI из чистого c4dc5bd4c817c62ffea24be8af02a7e359f6dc68
сохранён отдельно: acceptance/package-docs-20261006/candidate-c4dc5bd4c/payload.
Manifest sourceTreeSha256:
279bcd4ea959528feebb6619bbbe508b99993767a1a0a78cf1ab3538dfb72ce6.
TAR.GZ SHA256: 7b034a5c1e67f19514a5ba3803213821c83051f72c1c7da9895f45bb0dca3cae.
Build resource/manifest checks, archive roundtrip, независимый
verify-cli-candidate и checksum PASS; --version/--help PASS.
Начальный общий parent конфликтовал с именем baseline archive: EEXIST сохранил
baseline; повторная сборка выполнена в отдельном parent. Baseline checksum PASS.

Native run --command package-docs --file с кириллицей/пробелами/uppercase LGP,
явным --dir и собственным profile выполнил настоящий bundled extract.
Код 0, .writer отсутствует; весь structure.json совпадает с fixture, кроме
ожидаемого нового package.file_name. Provider catalogs содержат docs executor
и не содержат task/bash/browser prepare. Loginom не настроен; PATH у CLI
/nonexistent, поэтому generator использует поставляемый Node.
Драйвер Python работает снаружи испытуемого процесса как test infrastructure.
docs-smoke-{driver.log,result.json,stdout,stderr,provider.json} и driver script
сохранены в candidate directory. Неподдерживаемый debug skill вернул
CLI_ARGUMENT_INVALID/2; discovery проверен через разрешённый run.

Это распакованный native artifact с controlled provider: не installed
GUI/TTY, не естественный выбор и не final candidate для paired live evals.
Chromium PID observation здесь не выполнен. Дальнейшие product changes требуют
нового candidate; исходный SHA этого комплекта не заменять SHA doc checkpoint.
Рабочее дерево чисто после удаления только собственного smoke output.

## Загрузка комплектных skills без внешнего search executable

Native TUI smoke на c4dc5bd4c выявил cold-cache зависимость загрузки skill
от скачивания ripgrep и системных tar/gzip. Вставленный путь с кириллицей,
пробелом и верхним `.LGP` уже сохранялся как `file:`/Loginom MIME, но skill
не доходил до profile activation. Это не браузерная зависимость: read-only
минимальный probe RipgrepBinary/Ripgrep воспроизвёл ENOENT tar **3/3**;
control с tar+gzip без rg и cached rg с пустым PATH проходят.
Исходники ripgrep совпадают с c4dc5bd4c; новый breaking SHA не установлен.

Для backend-verified source=bundled resource sample теперь использует локальный
filesystem glob без symlink following, исключает SKILL.md и ограничен 10 файлами.
Permission остаётся перед listing, private activation — после него.
External/project skills сохраняют прежний Ripgrep path.

TDD: tdd-bundled-skill-external-search-red.log с недоступным search executable
→ bundled-skill-external-search-green.log. Проверены оба комплектных skills,
ресурсы, permission и activation; source/ordinary skill regression:
**135 PASS / 1 SKIP**, 697 assertions; Agent typecheck PASS.
Логи: bundled-skill-offline-{regression,typecheck}.log и ripgrep-signal/.

Новый внешний Linux PTY driver `agent/test/cli/tui/package-docs-pty.py` принимает
absolute binary, новый artifacts root и paste/mention; использует public CLI
для первичной инициализации профиля, actual shipped Node extractor,
scripted provider, terminal readiness signals, readonly persisted evidence
и наблюдение только своих descendants. Read permission остаётся ask;
PATH пуст и DISPLAY отсутствует только у тестируемого CLI.
Provider прекращает вызовы после одной ошибки skill, вместо бесконечных повторов.
Native acceptance после пересборки ещё не заявлена. Драйвер — тестовый Python,
не зависимость продукта; natural routing/full report/installed Desktop остаются
отдельными воротами.

## Native Linux TUI: локальные package-docs вложения

Полный native candidate из чистого source `49008f7941842dd09e8dacf7a5aeacef5890f361`
сохранён в acceptance `candidate-49008f794/`: executable, resources, licenses,
manifest, tar.gz и sidecar. Source tree SHA256
`8bafc4137a64e5a11fd8f2aad014a049bc1f1c56e5d0cbd9607a585b47c72bb7`;
archive SHA256 `286b0d345f936d041473029a23c49f1f8d2a5f2ac7f94053d2e67d0df2102106`.
Resource/manifest/roundtrip verifiers и независимый verify-cli-candidate PASS.
Node 24.19.0 и browser resources взяты из закреплённых read-only источников;
установленный launcher и чужие профили не менялись.

`pty-paste-observed` и `pty-mention-observed`: **2 PASS** на этом native binary.
Проверены bracketed paste абсолютного `Сценарий PTY.LGP` и реальный autocomplete
`@sample` → Enter → `@sample.LGP`. В обоих случаях history содержит единственную
file-part с абсолютным `file:` URL и `application/x-loginom-package`, а provider
получает synthetic attached path. Actual tool calls — skill(package-docs),
затем package_docs_run(extract); точный structure.json совпал с fixture,
кроме ожидаемого имени скопированного файла. Docs provider catalog исключает
bash/task/prepare. Read permission ask: дополнительного подтверждения для
исходного вложения не потребовалось. PATH=/nonexistent и без DISPLAY.

Оба TUI завершились через штатный Ctrl+D, code 0, без force kill, tool errors,
оставшегося `.writer` или живого наблюдаемого descendant. /proc observer с
периодом polling около 50ms зафиксировал native CLI, shipped Node Host и
shipped Node extractor; Chromium не наблюдался. Последний пустой cmdline
завершённого процесса больше не стирает ранее сохранённый command.
Это периодическое наблюдение, не kernel exec audit. Final driver SHA256:
`3e0a54bb8df36538d13dabc57f95816aa3521fa2f2eb10b28a9c492d171044df`;
terminal/provider/actions/processes/result и hash сохранены рядом с candidate.

Тот же исправленный driver на предыдущем c4dc5bd4c (`pty-paste-red-4`) штатно
вышел и подтвердил исходный skill failure; проверка отсутствующего structure
упала. Ранние попытки driver выявили его собственные ошибки: config нельзя
создавать до public profile initialization; PTY EIO от закрытого renderer
нужно дождаться process exit, поскольку cleanup ещё продолжается.
Эти ошибки driver не объявлены дефектами продукта.

Native picker Desktop оптимизацию передачи только пути пока не получил:
renderer создаёт File из readPickedFile, а main ограничивает выбор/чтение
суммарными **20 MiB**. Backend/App затем передают `.lgp` как file path.
Ограничение сохранено явно; существующие picker tests **8 PASS**, 11 assertions
(desktop-picker-limit-regression.log). Installed Desktop picker ещё не проверен.

Повтор проверки из `packages/agent`, с неизменным испытуемым executable и
новым родительским каталогом результатов для каждого приёмочного запуска:

```bash
skills_native_cli=/absolute/payload/bin/loginom-ai-agent-cli
skills_tui_results=/absolute/new-native-tui-results
mkdir -m 700 "$skills_tui_results"
python3 test/cli/tui/package-docs-pty.py --binary "$skills_native_cli" \
  --artifacts "$skills_tui_results/paste" --attachment paste
python3 test/cli/tui/package-docs-pty.py --binary "$skills_native_cli" \
  --artifacts "$skills_tui_results/mention" --attachment mention
```

Python нужен только внешнему test driver. Эти прогоны проверяют controlled
provider transport/profile/attachment/extraction/exit, не natural model choice,
полный report, установленный CLI или Desktop GUI. Финальный candidate для
paired live evals остаётся открытым; новый SHA test/doc commit не подменяет
sourceCommit сохранённого native binary.

## Lazy standalone connection exit: source contract

TDD actual standalone subprocess подтвердил: после skill(loginom-automation)
prepare возвращал LOGINOM_CONFIG_REQUIRED, но CLI завершался 0. Второй RED
после valid Help и controlled runtime refusal LOGINOM_LOGIN_UNAVAILABLE также
возвращал 0. Логи tdd-lazy-cli-{configuration,browser}-exit-red.log.

Run outcome теперь отдельно учитывает незавершённый connection admission
только loginom_dock_prepare. Configuration failure → LOGINOM_CONFIG_REQUIRED/2;
неготовое подключение и четыре recognized browser failures →
LOGINOM_CONNECTION_NOT_READY/1. Исходный tool error сохраняется, итоговый
canonical run error добавляется в event stream. Подтверждённый successful retry
с теми же аргументами снимает ошибку; pending/isError и unrelated tools — нет.
Permission/cancel/recovery сохраняют приоритет и прежние коды. Обычные
Loginom operation errors и Help не меняют прежнюю outcome-политику.

lazy-cli-exit-regression.log: **22 PASS**, 103 assertions — outcomes + actual
source standalone configuration/Help/browser-refusal, strict recovery,
отмена, ordinary chat и management. lazy-cli-run-command-regression.log:
**26 PASS**, 112 assertions — RunCommand subprocess/attachments/commands,
errors, stdout/json, SIGINT и profile bootstrap/management/cancellation.
Последний добавленный actual HTTP MCP Help refusal + outcome control:
**2 PASS**, 14 assertions (lazy-cli-help-refusal-regression.log). Этот Help
возвращает тот же LOGINOM_CONNECTION_NOT_READY, но обычный ответ «4» выходит 0,
без runtime/browser и оставшегося .writer. Natural LLM choice не проверяется.
Agent final typecheck PASS (lazy-cli-exit-final-typecheck.log).

AGENTS и progress standalone design фиксируют обязательный strict recovery,
ранний Help preflight только explicit automation и lazy connection exit.
Это source-process evidence. Native candidate 49008f794 с успешными PTY
проверками **ещё не содержит эту последнюю правку**: новый native/installed
прогон требует последующей сборки, её SHA не подменяется.

## Обновлённый native candidate: lazy config exit и TUI

Из чистого `05d3d144be2659a2d471e66bae9fd5262314861b` собран полный Linux CLI
`candidate-05d3d144b/`: payload/resources/licenses/manifest/archive/checksum.
Source tree SHA256 `df82150db66789e336f509f27d9621c88116bc24330a970544d22fa7e8a39855`;
archive SHA256 `728378bc75b895be1d570bda2cae911269e971a73cd396d41b6ea4bc11bf7bcb`.
Build integrity/roundtrip, independent verify-cli-candidate и archive checksum
PASS; checksum сохранённого baseline archive также повторно PASS.

Native `native-lazy-final`: actual skill(loginom-automation) → actual
loginom_dock_prepare → LOGINOM_CONFIG_REQUIRED. Exit **2**, единственный
canonical error в JSON stream, без runtime directory и оставшегося .writer.
PATH=/nonexistent, без API key/DISPLAY, controlled local provider, без изменения
resource manifest. Сохранены stdout/stderr/provider/result и внешний Python
probe с hash; Python только в test driver. Транспорт возвращает два обновления
одной completed skill part при записи applied grant: driver сводит их по part ID,
не объявляет двумя вызовами. Первоначальный probe упал только на этом подсчёте;
исходные stdout и result сохранены, final выполнен в новом собственном профиле.

Native `pty-paste` и `pty-mention`: повторно **2 PASS** на этом же candidate
после изменения CLI outcome. Точные file URL/MIME и структура, applied docs
catalog, actual shipped Node extraction, штатный Ctrl+D, code 0, no force kill,
no tool errors, no .writer/живые наблюдаемые children; Chromium не наблюдался.
Process sampling имеет ту же границу, что описана выше, и не является exec audit.
Оба драйвера и hashes сохранены рядом с новым candidate.

Native missing-configuration и documentation/TUI mechanics подтверждены.
Connection/recognized browser failure exit **1** пока проверен source subprocess
и контролируемым runtime; natural activation, full reports, реальный first setup,
installed Desktop/CLI и paired live evals ещё не приняты. Candidate intermediate:
sourceCommit бинарника не подменять следующим doc-only checkpoint SHA.

## Полный docs-конвейер через standalone CLI: source и native

`test/cli/package-docs-pipeline.test.ts` запускает настоящий standalone backend,
private Node host и поставляемый генератор. Управляемый HTTP-провайдер проходит
skill → extract → read structure → skeleton → Help find/read → read draft →
обычный write → emit. Пути берутся из фактических ответов инструментов; модель
заполняет прочитанный скелет, а не подставляет подготовленный готовый документ.
Проверены PDF, DOCX и Markdown, точная структура nested fixture с новым именем,
кириллица/пробелы/uppercase `.LGP`, финальная ссылка, отсутствие placeholders,
сохранение SHA входа и cleanup `.writer`. После skill в каждом catalog запрещены
bash/task/prepare. Browser runtime directory отсутствует. Отдельный `/proc`
монитор в эти новые тесты не добавлен; это не доказательство отсутствия любого
кратковременного exec, наблюдение процессов ранее выполнено в native PTY.

Проверки в `packages/agent`:

```bash
LOGINOM_AI_AGENT_TEST_NODE=/home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006/node-v24.19.0-linux-x64/bin/node bun test test/cli/package-docs-pipeline.test.ts
LOGINOM_AI_AGENT_TEST_NODE=/home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006/node-v24.19.0-linux-x64/bin/node bun test test/cli/standalone-preflight.test.ts test/cli/run-outcome.test.ts
bun typecheck
```

Source: **3 PASS / 60 assertions**; regression shared standalone fixture:
**23 PASS / 111 assertions**; typecheck PASS. Общая fixture вынесена в
`test/fixture/standalone.ts`, повторно используется preflight и pipeline tests;
HOME, XDG и profile принадлежат одному запуску. Native-режим копирует полный
shipped resource tree в собственный временный bundle, меняя только endpoint
на локальный HTTP MCP fixture. Оригинальный candidate не изменяется.
`PATH=/nonexistent`, без DISPLAY и без пропуска permissions; read/edit/skill
явно разрешены в собственном тестовом профиле. Help проходит реальный MCP
транспорт и schema discovery, ответы и выбор инструментов контролируются.

Native-команда из `packages/agent` (каталог артефактов создать новым заранее):

```bash
LOGINOM_AI_AGENT_TEST_CLI_BIN=/home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006/candidate-05d3d144b/payload/bin/loginom-ai-agent-cli LOGINOM_AI_AGENT_TEST_ARTIFACTS=/home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006/candidate-05d3d144b/full-docs-pipeline bun test test/cli/package-docs-pipeline.test.ts
```

Native **3 PASS / 57 assertions** на sourceCommit `05d3d144b`. Сохранены все три
документа, draft/structure, provider requests, действия, MCP calls и CLI events,
driver hashes и artifact manifest. SHA входного nested.lgp:
`73bca886d6010637becf6cb41ad2fd69ba64269e8251426c4e0a7e7ad2de483c`.
Повторный `verifyCliManifest` всего оригинального payload подтвердил его hashes,
modes и source identity после этих прогонов; JSON сохранён рядом с candidate.

Визуально просмотрены обе страницы native PDF и одна страница DOCX, экспортированная
LibreOffice с отдельным собственным профилем. Кириллица и стрелки читаются, текст
не обрезан и не перекрывается; последние две строки статистики PDF продолжаются
на второй странице. PNG/pdfinfo/версии сохранены в `full-docs-pipeline/*/qa`.
Для QA использованы системные Poppler 22.02.0 и LibreOffice 7.3.7.2: bundled
Poppler требует отсутствующую GLIBC_2.38. Эти программы нужны только проверке;
CI читает PDF/ToUnicode и word/document.xml без них. Word ZIP reader получает
копию Uint8Array, учитывая offset pooled Buffer.

Матрица генератора/разрешений/процессов повторена для завершения соответствующего
пункта этапа 2: Host pipeline **41 PASS / 158 assertions**, Agent tool + TaskScope
**44 PASS / 146 assertions**. Проверены плохие вход/шрифт/скелет, plan/read/edit
запреты, коллизии, отсутствие final после ошибки, неизменный вход и реальные
cancel/60-second timeout с завершением Node PID. Логи:
`full-docs-{generator,permission-process}-acceptance.log`.

Добавлена приёмка уже реализованного пути, без изменения продуктового кода.
Начальные ошибки новых fixtures сохранены: ожидание текста, которого провайдер
не написал; endpoint override, удаляемый штатным environment allowlist; Buffer
в ZIP reader. Это ошибки тестовой инфраструктуры, не продуктовые TDD RED.
Source/native полные scripted документы подтверждают механику, но не качество
narrative, выбор реальной моделью, live Help или установленный Desktop/CLI.
Эти выпускные gates остаются открыты. Требования плана не переработаны; отмечены
только выполненные deterministic pipeline и matrix/visual QA пункты.

## Product routing corpus для живой модели

Подготовлен `packages/agent/test/cli/package-docs-routing/cases.json`: 20
естественных русских запросов, 10 docs / 5 scenario / 5 default. Включены локальный
путь, вложение, PDF/Word/Markdown, `.lgp` + PNG, кириллица/пробелы, внешний путь
с permission refusal в run, отсутствующий файл/вход и ссылка только на текущий
серверный пакет. Отдельные setup/followup описывают реальные build → docs,
составной запрос и docs → build новым пользовательским сообщением в том же чате.
Справка, инструкции по настройке и обычный разговор остаются default; arithmetic
выполняется без Loginom key. Slash smoke проверяется отдельно от естественного
выбора. README фиксирует отправку настоящих file parts, собственный server
namespace и сбор доказательств для каждого повтора.

Одноразовая статическая проверка из `packages/agent` подтвердила уникальные IDs,
соотношение 10/5/5, существование всех трёх fixtures, их bytes/hashes, полный
набор bindings и отсутствие slash-команд среди natural prompts. Prettier и
`git diff --check` PASS. JSON отчёт сохранён в собственном acceptance-каталоге:
`product-routing-corpus-verification.json`. SHA-256 cases.json:
`30fc221f1eb848c083600346bce65d63e3aaa4fd7b129b97fdfda0391724155a`.
Это проверка подготовки, **liveRuns: 0**; критерии модели/повторов ещё не приняты.
Пункт подготовки 20 запросов отмечен в плане. Общий evals harness, corpus
near-miss, judge prompt, профили и launcher соседней сессии не изменялись.

## Desktop inventory: служебный placeholder в release payload

На чистом `953608c3d313333e64a09a237dabaf4a3ec172a1` сохранены новые полные
CLI и Desktop candidates в собственных `candidate-953608c3d-{cli,desktop}`.
CLI build/roundtrip и независимый `verify-cli-candidate` PASS; archive SHA256
`c5c78be0ddb1e6172429183cba54b0b88cc654785ddd437635849cd7483a6f89`.
Desktop build/typecheck PASS, packaging tests **12 PASS / 2 macOS SKIP**;
DEB/AppImage packaging и release manifest созданы. Проверка самих артефактов
**FAIL**: manifest требует `skills/package-docs/assets/fixtures/.gitkeep`,
а electron-builder исключает это служебное имя. DEB воспроизводит ошибку
**3/3**, AppImage **1/1**. Сверка всех 4655 записей `linux-unpacked` показала
ровно один отсутствующий файл. Дальнейшие проверки verifier не выполнены.

Классификация: реальная регрессия поставки, без flaky-признаков. Placeholder
внесён `90d8100da` при переносе skill, имеет нулевой размер и не используется
skill/references/тестами. Минимальная правка удаляет его из canonical skill.
Inventory и проверки целостности не ослабляются. Существующий artifact verifier
служит regression gate: выше зафиксирован RED, GREEN требует полной новой
сборки DEB/AppImage из нового чистого SHA. Старые candidates сохранены.

Подготовка локального Electron 42.3.3 выполнена штатным `install.js` в зависимостях
этого worktree с отдельным acceptance-cache; общий cache и соседнее дерево
не изменялись. Root source archive пересоздан из корня репозитория до manifest.
Это подготовка сборки, не установленная или живая приёмка. Логи диагностики:
`desktop-dotfile-signal/`, `desktop-953608c3d-*.log`, `cli-953608c3d-verify.log`.
Product tests после удаления: **5 PASS / 20 assertions**, typecheck PASS.
Host catalog/staging unit tests: **21 PASS / 1 SKIP / 44 assertions**;
full resource staging пропущен без build inputs и будет выполнен новой сборкой.

## Исправленный immutable candidate и CI staging gate

Полные Desktop и CLI candidates собраны из чистого
`8dc7bdccbaffc85b098cd730ce0c3638a197717c` в новых собственных каталогах.
Desktop build/typecheck/packaging PASS; packaging tests **12 PASS / 2 macOS SKIP**.
Финальный release manifest создан после завершения упаковки и содержит три
артефакта: полный root source archive, DEB и AppImage. Оба Desktop artifact
verifiers **PASS**, каждый проверил **4654 resources**. Исходная ошибка `.gitkeep`
исчезла без изменения verifier; native/installed запуск этими отчётами не доказан
(`executableNotRun: true`). Resource manifest SHA256:
`eb08d52b2d8edcba4d3743431e2bb02998182289d7f8e44f305a9f6cc80ebbd8`.
DEB SHA256 `dfe1bf5fa3b4d1625c87ca266e0d0a6c6b877a5e2a4bd28b04a9b8332008fd1a`;
AppImage SHA256 `40434bfbe36cfa2f28977bca8e00c7ea197ee4bb6100ef06c6b16a94882d8e32`.

CLI build/roundtrip и независимый source/manifest verifier PASS. Archive SHA256
`c5045c6de395bf6f2a3130f059319af49ab3e40586fd85f35c4e6cc89c1519c8`,
source tree SHA256 `909f755d183dc7fc895c5733e834fe40b48845d6442092db28af2b3e3c09b32a`.
Native full docs pipeline на этом candidate: **3 PASS / 57 assertions**,
PDF/DOCX/MD сохранены в `candidate-8dc7bdccb-cli/full-docs-pipeline`.
Контролируемые provider/Help, собственный профиль, PATH=/nonexistent;
это проверка механики, не естественного выбора или live Help.

Полный source staging с закреплёнными Node/Chromium inputs: **13 PASS / 47 assertions**.
Дополнительно выявлен пропуск этого gate через CI Turbo: при заданных обоих
inputs дочерний Host получал только Node, результат **12 PASS / 1 SKIP**.
`setup-loginom-inputs` теперь экспортирует `LOGINOM_AI_AGENT_TEST_BROWSERS`,
а Host Turbo task передаёт его тестам. Повтор той же команды через Turbo:
**13 PASS / 0 SKIP / 47 assertions**, включая генерацию PDF поставленным Node.
Product catalog, Node pipeline и Agent deterministic tests уже входят в обычный
workspace test; новая передача inputs закрывает пропущенный full staging.
Prettier/diff-check PASS. GitHub workflow удалённо не запускался.

Логи находятся в собственном acceptance-каталоге: `desktop-8dc7bdccb-*.log`,
`cli-8dc7bdccb-{build-final,verify,pipeline}.log`, `host-8dc7bdccb-full-staging.log`,
`ci-staging-env-{red,green}.log`. Неуспешный первый CLI build требовал создать
родительский каталог destination; повтор выполнен до публикации candidate.
Источник бинарников остаётся `8dc7bdccb`, последующие CI/doc commits его не заменяют.
Требования плана не изменены; отмечены только CI inclusion и подготовка кандидатов.

## Oracle: обычная активация automation перед построением

`oracle-provider` теперь передаёт `skill` без префикса `loginom_`, сохраняя
префикс для Dock-инструментов. Контракт модели записывается, когда каталог
уже содержит `loginom_dock_prepare`: после штатной активации, а не в default.
`runtime-acceptance.ts` для Desktop/CLI и `desktop-cli-independence.ts` первым
инструментом вызывают `skill(loginom-automation)`. Прямой runtime transport
не изображает продуктовую Skill API и сохраняет отдельный сценарий проверки.
Applied grants вручную не создаются, проверка advertised tools остаётся строгой.

Новый HTTP test сначала получил **500** из-за запроса `loginom_skill` при
advertised `skill`; после минимальной правки **3 PASS / 20 assertions**.
Проверены raw skill arguments, следующая prefixed prepare операция и запись
automation contract; старые exchange/exit tests сохранены. Host/Desktop typecheck,
Prettier и diff-check PASS. Логи `oracle-skill-{red,green,final}.log` и
`oracle-skill-{host,desktop}-typecheck.log`. Это приёмка adapter и типов;
живые CSV55/101 через установленные продукты ещё не выполнены и не отмечены.

## Linux cold Desktop: native AppImage и установленный DEB

Actual AppImage `8dc7bdccb` запущен через FUSE на хосте, UID **1001**, Xvfb,
явный `chromiumSandbox: true`, без `--no-sandbox`. Новый
`test/loginom/product-skills-smoke.mjs` использует пустые HOME/workspace/profile
в собственном `/tmp`, настоящий packaged preload/backend `/skill` и проверяет
оба product skills как `source: bundled` с SHA256 digests. Штатный builtin
`customize-opencode` допустим; внешних sources в чистой fixture нет.
Screenshot мастера просмотрен: четыре поля, отдельные состояния справки и
браузера, действия не обрезаны. Native smoke PASS, наблюдались **11 processes**,
remaining **0**, отдельный Loginom Chromium не наблюдался.

В собственной Ubuntu **22.04.5** image
`loginom-package-docs:8dc7bdccb-ubuntu22-20261007` установлен actual DEB через apt.
Image SHA `0886b94433c5d537b3158e9f6e7fd1b1d97ec008fd3181222db7071d44521991`.
Контейнер запускался с **network none**, UID **1200** и штатным init. Поставляемый
Node/Chromium с sandbox выполнил offline page probe, установленный Electron
открыл unconfigured wizard; cold bundled discovery повторён через installed
preload/backend. Оба smoke **PASS**, наблюдались **10 processes**, remaining **0**.
`installed-smoke.mjs` теперь явно включает Electron sandbox, дополнительно
к существующему browser sandbox. Наблюдатель проверяет PID/start-time identity,
сохраняет cmdline и отклоняет `--no-sandbox`; polling **25 ms** не является
полным exec audit и может пропустить очень короткий процесс.

Отдельная installed metadata проверка PASS: dpkg `install ok installed 0.1.17`,
launcher `/usr/bin/loginom-ai-agent` разрешается в `/opt/loginom-ai-agent/loginom-ai-agent`,
desktop Name/Exec присутствуют. Оба `chrome-sandbox` имеют root:root/**4755**.
Installed ASAR совпадает с packaged ASAR, SHA256
`2b2ce7551599ef788495a44072b1cdcacd5f9ac87592563f0d69175060698b26`.
Собственный контейнер удалён после сохранения evidence; пользовательская
установка, launcher, профили и соседняя сессия не изменялись.

Предварительные native runs не засчитываются: сначала fixture ошибочно ожидала
ровно два skills, не учитывая builtin; workspace под реальным HOME также
подхватывал skills родителей. Кроме того, default Playwright Electron launch
добавлял `--no-sandbox`. Финальные runs используют изолированный `/tmp` и явный
sandbox. Native result первоначально называл признак `offlineWizard`; он
означал отсутствие Loginom config, не блокировку сети хоста. В драйвере поле
переименовано в `unconfiguredWizard`; **network none** доказан только контейнером.
Это ошибки нового driver, не продуктовые TDD RED.

Evidence: `candidate-8dc7bdccb-desktop/native-appimage-source-driver/`,
`installed-ubuntu22-evidence/`, `installed-ubuntu22-{metadata,container-state}.json`,
`native-smoke-drivers.sha256`, `desktop-8dc7bdccb-docker-ubuntu22-{build,smoke}.log`.
Подтверждены cold startup/resources/discovery/cleanup; docs/model/Help first setup,
CSV oracle, CLI installation/update и остальные Linux-среды остаются открыты.

## Linux CLI installer: восстановление setuid после chown

Установка исходного immutable CLI `8dc7bdccb` обычным пользователем UID 1200
стабильно отказала **3/3**, exit 1 / `CLI_INSTALL_FAILED`, в независимых собственных
контейнерах с `network none`, без OOM и таймаутов. Signal report и receipts:
`cli-install-signal/run-{1,2,3}.{log,receipt.json}`. Нативный regression driver
`packages/loginom-host/test/cli-install-native.mjs` также получил RED на штатном
`install.sh`; evidence сохранён в `cli-install-native-red-evidence`.
Контейнеры удалены после сохранения результатов.

**Диагноз: code regression**, commit
`d301992c58bd0e375fb1b0866b47daeb5c4e274b`
(`fix(loginom): restore chrome-sandbox mode 4755 and root ownership`). Установщик
делал `sudo chown root:root`, но Linux сбрасывает setuid при смене владельца.
Отдельный kernel probe подтвердил переход user:group/**4755** → root:root/**755**,
а диагностический bundle фактической `installCli` вернул
`CLI_SANDBOX_OWNER_REQUIRED`. Предупреждение sudo о DNS в контейнере без сети
не является причиной: смена владельца состоялась. Обычные source installer/
manifest tests были зелёными (**7 PASS / 63 assertions**), их fixture не содержит
реального sandbox; это объясняет пропуск, но не отменяет ошибку продукта.

`ownLinuxSandbox` теперь последовательно выполняет фиксированные argv
`sudo chown root:root <sandbox>` и `sudo chmod 4755 <sandbox>`, затем проверяет
uid, gid и mode. Проверки manifest и запрет browser `--no-sandbox` сохранены.
В новом собственном prerequisites image разрешены обе команды sudo. Публичная
исправленная `installCli`, собранная в диагностический Node bundle, на полном
неизменённом исходном payload дала GREEN: root:root/**4755**, installed manifest
verified, uninstall PASS. Лог `source-cli-install-green.log`. Это source API
проверка с actual Linux filesystem, **не новый исправленный CLI binary**.
Полный Host suite **226 PASS / 6 SKIP / 1260 assertions**, Host typecheck,
Prettier и diff-check PASS. Логи `cli-install-fix-host-{suite,typecheck}.log`.
Новая immutable сборка проверяется отдельно. Исходный C8 archive не
переписывается и остаётся не прошедшим установку.

Native regression driver проверяет original archive installer, installed launcher
без bundle override, unconfigured status, неизменность manifest, root:root/4755,
поставленный Chromium с sandbox и uninstall с сохранением profile sentinel.
Используется собственный temporary HOME и новый evidence directory; пользовательская
установка и соседний evals worktree не затрагиваются. Driver не доказывает
естественный выбор skill, документацию, обновление истории или live Loginom.

## Исправленный Linux CLI: actual archive installer gate

Новый полный CLI tar.gz собран из чистого
`6c24f8de700aa8a09aaead9a2e2d392fde8d8284`, source tree SHA256
`fbe776b329fe343155ec89deb2033e89a2742915682c3a0e4edf52d65a6feb79`.
Сборка, full manifest verification, archive roundtrip и повторный `sha256sum -c`
PASS. Archive SHA256:
`d50f2789c6f64304af1f5505a126fcaf930312b9095b16a30e102e1d84cadd5e`;
CLI manifest SHA256:
`21614876222fff71599382995e051660af5c753da4de4048f7cbb93f36bc1351`;
resource manifest SHA256:
`22bc431ddc8464f9178af9aaa9e3302bed2bc4e6f844d85dc81bfe6d93f4af52`.
Пины Node/Bun/Chromium/PW и версия 0.1.17 prod сохранены. Исходный C8 и baseline
не изменены; установленный Desktop остаётся проверенным C8, SHA не смешиваются.

В отдельной Ubuntu22 image
`loginom-package-docs:6c24f8de7-cli-20261007` (SHA
`a5d2c58880e72a93378316b3c44e4de0a6c33c94233cde56bd28a45cbe4558c0`)
финальный native installer driver **PASS**, UID 1200, `network none`, init.
Штатный CLI создал собственный profile до установки; install выполнил original
archive entry, launcher без override вернул unconfigured status. Sandbox
root:root/**4755**; Chromium запущен с sandbox именно установленным Node,
`verifyResources` подтвердил привязку его `process.execPath` к этому payload.
Штатный uninstall удалил payload/launcher/receipt, сохранив profile sentinel.
Собственный контейнер удалён после копирования evidence.

Две промежуточные ошибки driver исправлены без изменения продукта: ручное
создание profile обходило его публичную инициализацию и выставляло 0755;
затем runtime verifier правильно отказал `LOGINOM_NODE_PATH_MISMATCH`, когда
его вызвали архивным Node для установленного tree. Эти runs не засчитываются
как полная приёмка. Финальный driver использует публичный `loginom status`
для инициализации и отдельный child установленного Node для browser probe.
Driver hash записан отдельно от source SHA проверяемого binary.
Этот же финальный driver повторно получил RED на неизменённом C8 archive:
profile-init прошёл, original install entry вернул `CLI_INSTALL_FAILED`.
Права sudo в обеих тестовых средах разрешали chown и chmod; архивы не подменялись.
Evidence `cli-install-native-final-driver-red-{evidence,container.json}`.

На том же неизменном CLI candidate полный PDF/DOCX/MD pipeline:
**3 PASS / 57 assertions** с actual compiled CLI, своим контролируемым Help/provider,
private profiles и PATH без глобального Node. Это механика полного результата,
не live Help или natural selection. Evidence:
`candidate-6c24f8de7-cli/{native-install-accepted,full-docs-pipeline}/`,
`native-install-accepted-container.json`, `native-install-driver.sha256`,
логи `cli-6c24f8de7-{build,docker-build,pipeline}.log` и
`cli-install-native-6c24f8de7-accepted.log`.
Обновление/история, CLI run/TUI cold discovery и другие Linux-среды ещё открыты.
В плане отмечен только пункт сборки полных Desktop/CLI artifacts, их manifest,
static Desktop verification и native AppImage/installed launchers. Требования
плана не пересматривались; этап 8 остаётся открытым.

## Первый natural routing smoke: запрос документации без файла

Проверен исходный corpus case `docs-no-input`, без slash-команды и scripted LLM:
«Мне нужна документация по сценарию Loginom. Подготовь ИИ Отчет.»
Основная модель **xiaomi-token-plan-sgp/mimo-v2.5-pro**, variant `default`:
CLI `run` на полном native C6 artifact **3/3 PASS**; packaged Desktop backend
AppImage C8 через настоящий preload/HTTP **3/3 PASS**. Каждый повтор использовал
отдельные HOME/workspace/profile и новый настоящий user message. Настройки
Loginom отсутствовали, Help/API key не добавлялись. Через API Desktop отправлен
реальный prompt; renderer composer/вложения этим smoke не проверены.

Во всех шести случаях модель загрузила `package-docs`, а trusted applied
activation подтверждена фактической историей/CLI tool events. Модель запросила
локальный `.lgp`, не объявляла отчёт готовым; workspace остался без выходных
файлов. Один Desktop repeat дополнительно выполнил локальный glob до skill.
CLI публикует первоначальное и обновлённое событие одного skill call: проверки
свели их по part ID, наличие двух events не считается двумя вызовами модели.
Digests сверены со своим bundled catalog/артефактом, не с другой сборкой:
Desktop `513c84464aeb40bf0bc8bdec4c2ef9e8153de55b78e01697cdccf437638b0270`,
CLI `8bbc36e890d83c367d3b17dd7b5436c9ec5830c105cb5699a8979a330ab7daa2`.
В manifest skill tree отличается только generated `scripts/package-docs.mjs`;
источники этих binary различаются и записаны отдельно. Ошибочное сравнение
Desktop digest с CLI digest в дополнительном verifier исправлено на сверку
с фактическим Desktop catalog; сами runs/артефакты не менялись.

CLI наблюдался через **strace -f -e trace=process**: ноль exec Chromium во всех
трёх повторах, `.writer` снят. Desktop с явным Electron sandbox наблюдался
через `/proc` каждые **25 ms**, **36 processes**, remaining **0**; отдельный
Loginom Chromium и `--no-sandbox` не наблюдались. Polling Desktop не является
полным exec audit. Для будущего CSV oracle `desktop-oracle.mjs` также явно
включает `chromiumSandbox: true`; его actual CSV проход остаётся открытым.

Вторая поддерживаемая модель **xiaomi-token-plan-sgp/mimo-v2.5**, `default`:
один CLI smoke того же запроса **PASS**, applied docs activation, локальные
glob/read пустого workspace, запрос файла, отсутствие output/browser exec и
снятый writer. Это короткий smoke второй модели, не её полная матрица.
Отдельный настоящий CLI arithmetic запрос без Loginom дал **42**, exit 0,
6.989 s, writer released, candidate processes remaining 0. Предварительный
вызов с урезанным окружением без штатных proxy достиг timeout 180 s и не
засчитывается; последующие runs наследуют только нужные явные proxy settings.
Credentials выбранного провайдера скопированы в собственные private profiles,
не сохранены в git или conditions; исходный auth/user profiles не изменялись.

Evidence находится в общем собственном acceptance root:
`live-docs-no-input-6c24f8de7/`, `desktop-live-no-input-8dc7bdccb/`,
`live-docs-no-input-secondary-6c24f8de7/`, `model-proxy-native-6c24f8de7/`.
Сохранены conditions, настоящие messages/events, process traces/observations,
roots и отдельные verification JSON; hashes приёмочных drivers —
`live-routing-smoke-drivers.json`. Snapshot corpus и source/binary pins записаны.
Проверен **один из 20** кейсов основного corpus, остальные запросы, полный
отчёт с live Help, TUI, update и A/B evals не приняты. Этапы 6/7/8 остаются
открытыми; требования плана не пересмотрены и новые ticks здесь не добавлены.

## Первая native настройка Help при недоступном Loginom

Actual установленный CLI C6 в собственном Ubuntu22 container, UID 1200,
штатный launcher и profile: `loginom setup --stdin-json --format json --headless`
с действительным Help key и намеренно недоступным Loginom
`http://127.0.0.1:9/` вернул **exit 0**, `state: ready`, `hasApiKey: true`,
`hasPassword: false`, отдельный
`browser: { state: failed, failure: LOGINOM_LOGIN_UNAVAILABLE }`.
Таким образом, настоящая первая CLI настройка key-only Help сохраняется
при отказе web login; это не контролируемый Help stub. Пароль не передавался.
Эта проверка относится к non-TTY stdin-json; интерактивный TTY мастер,
Desktop мастер и весь этап 4 ещё открыты. Browser validation после Help
разрешена этим setup сценарием, отсутствие Chromium при документации
проверяется отдельно и не выводится из результата setup.

Source CLI credential record прочитан без изменения через публичный codec;
ключ передан только private stdin/IPC и собственному temporary profile.
Сохранены redacted stdout/result, install receipt и container state,
профиль с ключом не экспортировался. Контейнер удалён после проверки;
ключ/пароль отсутствуют в result/logs/git. Унаследованы явные proxy settings,
использован network host; другие profiles, launcher и стенд не изменялись.
Evidence `cli-live-help-setup-stdin-6c24f8de7/` и соответствующий `.log`.
Предварительный adapter запуск без Docker `-i` закрыл stdin и получил
ожидаемый `CLI_SETUP_INVALID`, exit 2; это ошибка driver, не продуктовый отказ.
Его evidence сохранён отдельно, контейнер также удалён. Требования плана
не пересматривались и setup gate всего этапа не отмечался выполненным.

## Настоящий PDF с Help: механика подтверждена, содержание ещё не принято

Установленный CLI C6, собственный Ubuntu22 container и профиль, основная
модель `xiaomi-token-plan-sgp/mimo-v2.5-pro`, `default`: естественный запрос
`docs-attached-pdf` с исходным вложением `Исходный сценарий.LGP` завершился
за **85.878 s**, exit 0. Модель сама активировала `package-docs`, извлекла
структуру, прочитала действительную Help и выпустила PDF через `emit`.
Loginom web target намеренно недоступен (`127.0.0.1:9`); key-only Help готова.
`strace -f -e trace=process` вокруг документирования зафиксировал **0 exec
Chromium**. Вызовов Dock нет, SHA-256 исходного `.lgp` до/после совпадает.
Вывод находится в session workspace, без `--auto` и override ресурсов.

PDF — **45382 bytes**, 2 страницы A4, PDF 1.4. Текст извлечён системным
Poppler; обе страницы отрендерены и просмотрены: кириллица читается, обрезки
и наложений нет. Статистика соответствует fixture: 1 модуль, 6 узлов,
2 подмодели, 1 программный, 1 ссылочный, 1 производный узел, глубина 3.
Это доказательство механики и layout, **не PASS фактического содержания**.
Модель написала «Пакет не имеет внешних зависимостей», хотя сама описала
импорт `data.lgd`. В скелете была такая же ошибочная фраза: пустые
`external_references` означают отсутствие внешних **пакетов**, а не файлов.
Кроме того, текст содержит смешанное «пipelines» и описание общих возможностей
Python/ссылки; качество narrative требует повторной проверки.

Исправление выполнено отдельным TDD-циклом. Actual bundled Node CLI на
`nested.lgp` сначала **RED**: `external_references: []`, `FileName: data.lgd`,
старое общее отрицание зависимостей. Минимальное изменение скелета на
«Ссылки на внешние пакеты отсутствуют» дало **GREEN**. SKILL.md отдельно
разграничивает ссылки на пакеты и зависимости файлов/БД/сервисов/библиотек.
В трёх skeleton golden изменена только эта строка; исходные Python PDF/DOCX
и структуры оставлены для проверки паритета writer. Node pipeline теперь
**42 PASS / 164 assertions**, bundled catalog **19 PASS / 119 assertions**,
Host typecheck **PASS**. Новая immutable сборка и повторный live PDF ещё нужны;
полный report gate не отмечен выполненным.

Evidence: `cli-live-pdf-final-6c24f8de7/{evidence,report.txt,page-1.png,page-2.png}`
в собственном acceptance root. Сохранены реальные tool events, setup outcome,
process trace, результат и original hash. Ключ/профиль не экспортировались;
temporary container удалён. Первые два adapter запуска сохранены отдельно:
`--file` без разделителя `--` поглотил prompt; затем закрытый для UID 1200
каталог driver не позволил начать запуск. Эти отказы произошли до модельного
прогона и не считаются продуктовой регрессией. Изменены только собственные
driver/permissions. План и рабочие деревья evals не менялись.

## Следующий live цикл: скелет не гарантирует правильное описание

CLI из чистого `8791660dbc9677dffc1284bc455291f35dbbee04`, tree
`816902d8b15f47ee449394f87678b02af8609aea25dbccbe76e7ff211752006f`:
полный payload/resources/manifest и архив сохранены в
`candidate-8791660db-cli/`; checksum
`7cdcf94cd733d1d6a57211edba08465f3bcc4e51211d7c6c2a6ba784ad6ced97`.
Archive roundtrip, source verification и `sha256sum -c` **PASS**.
Ошибочный первый build destination поместил архив рядом с baseline; защита
`EEXIST` остановила публикацию, baseline не заменён. Повторный build использует
собственный parent с `payload/`; первый log сохранён с суффиксом `mislocated`.

В первом реальном PDF повторе новой сборки (**118.661 s**, exit 0) скелет уже
правильно говорит про ссылки на пакеты, но narrative снова содержит «Пакет
не имеет внешних зависимостей». Модель выполнила пять успешных Help searches
с `read_content: false`, но не прочитала документ обработчика. Applied digest
`042bbe53c69ad53e2e0b178523e3bcff298fac1b871d76529865faf63a07c8ec`
соответствует этому candidate. Отсутствуют exec Chromium и Dock calls,
исходный `.lgp` неизменен. Сборка не засчитывается как правильный полный отчёт.

Собственный acceptance verifier `verify-live-report-actual.mjs` прочитал
настоящие events/черновик/structure и дал **RED** по двум проверкам: отрицание
файловой зависимости и отсутствие Help `read`. Он проверяет только эти
конкретные отказы fixture и механику; ручную оценку всех фактов/layout не
заменяет. Источники и результаты находятся в acceptance root, общий evals
harness не меняется. Вторая серия продолжает сохраняться отдельно.

Инструкции skill и narrative уточнены в рамках уже согласованных требований:
Help summaries и `.overview.md` не заменяют чтение процедуры; до Help `read`
нельзя писать описание/выпускать отчёт. Перед `emit` нужна сверка со структурой:
пустые настройки не подтверждают формулы/код, отсутствующие порты и связи не
становятся подключёнными, импорт файла исключает отрицание всех зависимостей.
Bundled catalog после изменения **19 PASS / 119 assertions**, diff check **PASS**.
Живая GREEN-проверка потребует следующей immutable сборки; текущий candidate
и его отчёты не исправляются задним числом. Требования плана не пересмотрены.

## Первая GUI и интерактивная TTY настройка Help

Настоящий мастер AppImage Desktop C8, UID 1001, отдельные HOME/profile/workspace,
Electron sandbox включён. Действительный Help key введён через GUI, пароль
пустой, Loginom `http://127.0.0.1:9/` недоступен. Кнопка проверки показывает
«Справка готова к работе» и отдельное предупреждение о веб-приложении;
revision/hasApiKey до сохранения не меняются. Штатное сохранение закрывает
мастер и даёт **ready**, key=true, password=false,
browser=failed/LOGINOM_LOGIN_UNAVAILABLE. После открытия настроек ключ
пустой и замаскирован placeholder; screenshot предупреждения просмотрен.
После полного перезапуска того же собственного профиля Help снова **ready**,
browser=unknown. Наблюдение `/proc` каждые 25 ms: **43 processes, remaining 0**,
`--no-sandbox` отсутствует. Browser validation здесь ожидаемо запускала
Chromium; это не тест отсутствия браузера при документировании.
Собственный профиль с ключом удалён после подтверждённого завершения процессов.
Evidence `desktop-live-help-only-8dc7bdccb/`, отдельные Node/Bun drivers.

Установленный CLI `8791660db` в собственном Ubuntu22 container, UID 1200:
первое `loginom setup --format json --headless` с настоящим PTY последовательно
прошло API-ключ, URL, username, выбор «Пустой пароль» и завершилось **exit 0**,
Help-ready с LOGINOM_LOGIN_UNAVAILABLE. Ключ получен private stdin и введён
через PTY, его отсутствие в terminal output проверено до сохранения log.
Public `loginom status` после перезапуска подтверждает key=true, password=false,
сохранённый URL и username, browser=unknown. Его немедленное **starting**
допустимо: локальный handshake не ждёт фоновый Help catalog. Первый driver
ошибочно требовал ready от этого отдельного status-процесса и дал FAIL;
продуктовый setup уже был успешен. Исправленный driver в новом container дал
**PASS**. Оба evidence сохранены, контейнеры удалены, ключевые профили не
экспортированы. Испытуемый CLI подключён полным новым архивом read-only;
старый binary в prerequisite image не запускался. `@lydell/node-pty`
1.2.0-beta.12 используется только внешним тестовым driver.
Evidence `cli-live-tty-corrected-8791660db/`, исходный adapter отказ —
`cli-live-tty-8791660db/`. Setup gate проверен в GUI/TTY/stdin-json, но весь
этап 4 (включая остальные lazy/cancellation/runtime проверки) ещё открыт.
План не переписывался; это дополнительные доказательства выполнения.

## Нумерация подмоделей в PDF/DOCX

В actual отчёте `8791660db/attempt-1` исходный Markdown содержит пункты
`1. Вложенная модель`, `2. Ещё глубже`, с вложенными bullets и пустой строкой
между ними. PDF отображает оба как `1.`. Ошибка writer: пустая строка очищала
счётчики упорядоченного списка. Тест через публичный `renderReport`, извлечение
PDF text/Word XML сначала **RED**, затем **GREEN** после удаления этого сброса.
Сброс при заголовке, цитате и обычном абзаце сохранён. Эталонные Python
PDF/Word XML не менялись; проверка паритета также проходит.
Полный Node pipeline **43 PASS / 167 assertions**, Host typecheck **PASS**,
diff check **PASS**. Собранный ранее CLI `520d4f53b` этой правки не содержит;
она должна войти в следующий полный candidate.

Серия CLI `8791660db` завершилась **3/3** по механике: exit 0, PDF в session
workspace, `.lgp` неизменен, 0 exec Chromium, контейнеры удалены;
время **118.661 / 136.411 / 101.750 s**. Acceptance verifier отверг все три
по Help B: ни одного успешного чтения документа обработчика. Первый также
отрицает файловые зависимости, второй не упоминает известный `data.lgd`,
третий проходит эти два узких фактографических условия. Это **0/3 принятого
полного отчёта**, не успешная приёмка качества. Во время следующей серии
условия и старые документы сохраняются неизменными.

## Справка B и ручная проверка серии `520d4f53b`

Три installed CLI PDF запуска с усиленными инструкциями skill завершились
**3/3** по механике: exit 0, сохранён PDF, исходный `.lgp` неизменен, ноль
exec Chromium. Время **134.939 / 163.162 / 142.830 s**. Все три действительно
прочитали документы обработчиков через `loginom_read` и упомянули `data.lgd`,
не отрицая все файловые зависимости. Узкий verifier **3/3 PASS**; его SHA256
`62638b226433bf0a6d88f350c6ad0ae7990d8a4874210a78637cc3c22c0683de`.
Driver SHA256 `2887ed675d66d541078c794e7862ec984d3c010cbcbbe1e8d0b191426a789779`.
Source/archive/model/variant закреплены в `cli-live-pdf-520d4f53b/conditions.json`.

Все шесть страниц отрендерены системным Poppler и просмотрены. Кириллица,
поля и переносы читаемы; нумерация 1/1 в прежнем writer остаётся в этих старых
документах. Ручная проверка не заменяется verifier: третий отчёт утверждает
поступление данных и передачу результатов в подмодели с пустыми портами и
связями, а для узла-ссылки описывает фактический источник при пустых настройках.
Во втором тексте вложенная подмодель описана внутри родительской без отдельного
разбора её входа/выхода; первый также содержит общие формулировки о портах.
**Полный report gate не принят**, этап 6 открыт. Исходные результаты не правились.

## Общий source pin `85d3889b8`: упаковка и CLI

Полные Desktop и CLI собраны из чистого
`85d3889b863d6d1de950552b83bb7722ae446825`. Desktop source archive подтверждён
`git get-tar-commit-id`; release manifest содержит sourceDirty=false,
Node 24.19.0, Electron 42.3.3, Electron Node 24.15.0. SHA256:

- DEB `693779584f398ad929c8c0f091ce912df92d2ae4e6e3b9627120f43b56d6ac23`;
- AppImage `62734c4d8c74f55bca87eb9bf3a1a449089a1285fc4e0c2f6fc96612ce6ecaea`;
- source archive `91768d8796214d16642f91509b95c9d437343ed0826d2f9f01b74d9bca606cb1`;
- CLI TAR.GZ `b987801c611f2a4efb1ceb435e7fa263eaa2db55c723f9da1a7277e48fa0170d`;
- CLI source tree `b55976bd8626f563b32c194a7b57347d769659d29036ac0e331eee43521fccdb`.

Desktop DEB/AppImage static checks **PASS**, по **4654** resource files.
Native AppImage cold discovery в отдельном HOME/profile/workspace **PASS**:
оба bundled skills с digests, unconfigured wizard, Electron sandbox;
`/proc` sampling 25 ms, **10 processes, remaining 0**, отдельный Chromium
не наблюдался. Этот исходный smoke ещё не проверял composer `.lgp`.
Первые команды указали ошибочные versioned filenames: hash check/launch отказали
до исполнения продукта. Повтор использует фактические имена из manifest;
первоначальные logs/evidence сохранены, собственные временные roots удалены.
Установленный DEB и GUI вложения этой записью не принимаются.

CLI archive roundtrip/source verification/checksums **PASS**. Native controlled
pipeline создаёт PDF/DOCX/MD: **3 PASS / 57 assertions**, Help find/read,
PATH=/nonexistent, input SHA и cleanup проверены. Первый полный запуск получил
ENOENT только при экспорте evidence после всех 57 бизнес-проверок: artifacts
parent не был создан. Signal collector воспроизвёл PDF отказ **3/3**, контроль
с существующим parent **1/1 PASS**. После создания нового собственного parent
полные три формата проходят; код/тесты не менялись, assertions не ослаблялись.
Диагноз — конфигурация запуска, не продуктовая регрессия и не flakiness.
Evidence `pipeline-signal-85d3889b8/`, `candidate-85d3889b8-cli/full-docs-pipeline/`,
logs `cli-85d3889b8-pipeline{-green,}.log` сохранены отдельно.

Actual native PTY `paste` и `@mention` на CLI85 **2 PASS**: исходные `file:`
части с MIME `application/x-loginom-package`, extraction, exit 0, no forced kill,
writer released, remaining processes 0, Chromium не наблюдался. PATH=/nonexistent;
Python — только внешний driver. Это управляемые mechanics tests, не natural routing.

Один дополнительный installed CLI85 live PDF smoke с той же primary моделью,
fixture и недоступным Loginom — **159.263 s**, exit 0, Help B, известная файловая
зависимость, `.lgp` неизменен, ноль exec Chromium. Обе A4 страницы просмотрены:
нумерация подмоделей теперь **1/2**, кириллица и layout читаемы. Ручная проверка
всё ещё видит неподтверждённые выводы о демонстрационном назначении по пустым
портам и общие возможности узла-ссылки как фактическую настройку. Полный report
quality gate не принят; один smoke не заменяет три повтора и весь corpus.
Evidence `cli-live-pdf-85d3889b8-smoke/`; контейнер штатно удалён, secrets не экспортировались.
Generated docs scripts Desktop/CLI отличаются Bun комментариями путей (разный
build cwd); код после удаления этих комментариев побайтно одинаков. Сверяются
фактические per-artifact digests, а не искусственно одинаковый checksum.

## V2 composer: отсутствующий `.lgp` в фильтре

Actual AppImage85 после закрытия мастера показывает один `input[type=file]`,
accept которого заканчивается `.zsh`. Signal collector: **3/3 stable FAIL**
по требованию выбрать `.lgp`, при неизменных source/artifact/manifest hashes;
GUI assertion одинаков, только третий Xvfb cleanup дал отдельный код оболочки 5.
Приёмочные probe сначала столкнулись с двумя одинаковыми Close buttons и
ошибочно использовали URL navigation вместо Desktop MemoryRouter. Эти adapter
отказы сохранены отдельно; итоговая проверка использует настоящий composer.

Причина — дублирование списка: `session-ui/v2/prompt-input/attachments.ts`
уже принимает `.lgp` и передаёт его native picker, но `index.tsx` задаёт отдельную
старую строку accept. Это не дефект provenance/сборки и не отсутствие MIME поддержки.
Общий существующий список экспортирован и используется также HTML file input;
новых Product зависимостей и параметров UI не добавлено. Native cold smoke
расширен проверкой composer фильтра и screenshot, и дал **RED** на immutable85
с `LOGINOM_PACKAGE_NOT_SELECTABLE`. GREEN предстоит проверить после новой сборки.
Attachment tests **6 PASS / 13 assertions**, App и Session UI typecheck **PASS**,
Prettier для трёх изменённых code/test files **PASS**. Первый Bun filter без `./`
не выбрал tests; засчитан только отдельный повтор с явным path, его log сохранён.
Native picker, фактическое отправленное вложение и диалог чтения ещё открыты.
Evidence `composer-signal-85d3889b8/`, `desktop-85d3889b8-composer-red/`.
План по corrections повторно не перерабатывается; соседний evals не изменялся.

## Installed DEB85: штатная политика sandbox и метаданные

Actual DEB85 установлен `dpkg -i` в собственном Ubuntu 22.04.5 контейнере;
UID приложения 1200, сеть отключена. Nonroot installed smoke **PASS**:
комплектный Node 24.19.0, Chromium с `chromiumSandbox: true`, offline page,
Electron с включённым sandbox и unconfigured wizard. Это не live Loginom.

Первоначальный внешний metadata driver ожидал `root:root 4755` у обоих
sandbox helpers и стабильно отказал **3/3**. Проверка штатного electron-builder
26.15.2 `after-install.tpl` и фактического dpkg postinst установила причину:
Electron helper намеренно получает `0755`, если `unshare --user true` работает,
иначе `4755`. Root и UID1200 в этом контейнере дали status 0. Chromium helper
остаётся `root:root 4755`. Это неверная предпосылка теста, не регрессия installer;
chmod, упаковка и код продукта не менялись. Исходные отказавшие evidence сохранены.

Новый отдельный metadata driver проверяет namespace probe, точную политику
postinst, owner/group/mode каждого helper и точный launcher/menu Exec: **PASS**.
Installed ASAR SHA256 `2b2ce7551599ef788495a44072b1cdcacd5f9ac87592563f0d69175060698b26`
и resource manifest `f243b311f39abfdeb408521805549d700a1b0de437460227b7bce7c9345b10d8`
совпадают с immutable85 payload. Dpkg: `install ok installed 0.1.17`.
Evidence: `desktop-85d3889b8-ubuntu22-{smoke,metadata-userns-green}.log`,
`installed-metadata-signal-85d3889b8/`, `installed-metadata-85d3889b8-userns.mjs`.
Последний process inventory не содержит процессов продукта; контейнер удалён.
Это замена собственного старого DEB той же версии в тестовом контейнере,
не приёмка миграции пользовательской истории или N→N+1.

## V2 composer GREEN: полный source pin `aeef6c2c3`

Desktop и CLI собраны из чистого `aeef6c2c313dc8ed638430fd1dcf964119d7dd98`.
Desktop source archive подтверждён `git get-tar-commit-id`, оба release manifests
фиксируют sourceDirty=false. Node/Electron pins сохранены. SHA256:

- DEB `ca30c45cd4f7615c40bcc328d4e1f3dd84e43e70a4d564a8fb57783f488d2f89`;
- AppImage `cddacfa11b99df10ccb7c7fc8d63958832c30ceb0e0a9afc98e1a7a57f81c141`;
- Desktop source archive `356b671c25d3dcae9c7d174eba0fb75b931a95abdcc2ee77e8a73320ef7e2042`;
- CLI TAR.GZ `1a25e10b36fda79f2a2d987ed8a90f27beab415483093b35721d078ac8ff9002`;
- CLI source tree `08f724f82b6b92fc1379683ad186f97d6bddf6611142315e364b135baf760d20`.

DEB/AppImage static checks **PASS**, по **4654 resources**. CLI archive roundtrip,
manifest/source checks и `sha256sum -c` **PASS**. Первый CLI запуск указал payload
на уровень выше: guard отказал с EEXIST при публикации архива фиксированной версии;
старый архив не перезаписан. Повтор использует новый отдельный parent и `payload/`.
Оба logs сохранены; это конфигурация запуска, код продукта не менялся.

Canonical native cold smoke на новой AppImage **GREEN**: два bundled skills,
unconfigured wizard, accept `.lgp` в настоящем V2 composer. Screenshot просмотрен,
Electron sandbox включён, `/proc` sampling 25 ms: **13 processes, remaining 0**,
отдельный Loginom Chromium не наблюдался. Собственный root удалён после аудита.
Evidence: `candidate-aeef6c2c3-{desktop,cli}/`, `desktop-aeef6c2c3-composer-green/`.
Это завершает RED→GREEN исправления фильтра из `aeef6c2c3`; продуктовый код не
меняется ради дальнейших проверок прав чтения.

## Native Desktop: оригинальное вложение и отказ чтения

`test/loginom/package-docs-permissions.mjs` выполняет два сценария через реальный
AppImage GUI composer и permission dock в отдельном HOME/profile/workspace.
Session fixture создаётся публичным API; маршрут задаётся через собственный
persisted Desktop MemoryRouter. Модель/provider управляемые, поэтому это
permissions/admission mechanics, не доказательство natural skill selection.

**2 PASS** на AppImageaeef. Текстовый путь к внешнему `.LGP` вызывает
`external_directory`; кнопка «Запретить» оставляет `package_docs_run` в error,
без `.work` и отчёта. Агент штатно прекращает provider loop при отказе.
Прежний внешний driver ошибочно ожидал следующую финальную фразу и получил
timeout; исходный отказ сохранён. Новый тест ожидает settled error инструмента.

Вложение добавлено через настоящий HTML file input с `.lgp` в accept;
`setInputFiles` не проверяет OS dialog. Отправленный запрос и original user history
содержат MIME `application/x-loginom-package` и исходный `file:` URL.
Read/external permissions в ask; повторный запрос не появляется, комплектный
Node извлекает `package_docs.structure.v1` внутри session directory. SHA256 `.lgp`
в обоих случаях неизменен. Screenshots просмотрены. Sampling 25 ms:
**22 processes, remaining 0**, Loginom Chromium не наблюдался, `--no-sandbox`
отсутствует; оба собственных временных roots удалены. Prettier/diff check **PASS**.
Evidence: `desktop-aeef6c2c3-gui-permissions-canonical/`; предшествующая внешняя
проверка `desktop-gui-package-docs-permissions-aeef6c2c3-v3/` также 2 PASS.
Следующий отдельный цикл дополнил native тест `text-allow`: **3 PASS**
на том же AppImageaeef. Два последовательных запроса действительно относятся
к `external_directory` и `read`; в каждом GUI нажато «Разрешить один раз».
После чтения pending permissions отсутствуют, структура находится внутри session
directory, original file parts у текстового пути отсутствуют. Screenshot второго
диалога просмотрен. Evidence: `desktop-aeef6c2c3-gui-text-allow/`.
Явные read/edit deny, TUI permission dialog и plan сохраняют отдельные
незавершённые native критерии. Этап 2 пока не отмечается.

## Native Desktop: явные read/edit deny и синхронизация driver

Canonical GUI driver дополнен двумя отдельными циклами: original `.LGP`
вложен, но `read: deny` либо `edit: deny` по-прежнему запрещает extraction.
Первый цикл **4 PASS**, второй итоговый **5 PASS** на immutable AppImageaeef.
У обоих deny сохраняется original file part, `permissionDenied: true`,
`.work` отсутствует, SHA256 исходника неизменен; pending permissions отсутствуют.
В окончательном полном прогоне **56 observed processes, remaining 0**,
Loginom Chromium не наблюдался, sandbox не отключён. Evidence:
`desktop-aeef6c2c3-gui-read-deny-ready/`, `desktop-aeef6c2c3-gui-agent-ready/`.

Прежнее неверное ожидание финальной фразы после GUI reject подтвердилось
**STABLE FAIL 3/3**: ровно два provider requests, третий отсутствует,
каждый root удалён, live owned processes 0. Это штатное прекращение loop,
а не ошибка продукта; report `gui-deny-signal-85d3889b8/report.md`.

Отдельный ранний Send дал отсутствие POST и текста у provider. Signal collector
повторил предыдущий committed driver **3/3 PASS** на том же artifact;
с исходным отказом это **FLAKY**, точная причина не доказана. Screenshot раннего
restored-view без модели сам по себе причины не устанавливает. Одно ожидание
видимого Test Model было недостаточно: следующий отказ произошёл на пятом case
до POST. Driver теперь ждёт завершения renderer GET agent catalog после reload
и видимого Test Model. После этой синхронизации полный suite 5 PASS; отдельная
серия signal collector **STABLE PASS 5/5**, **9.812 / 10.014 / 9.812 / 9.612 /
9.813 s**, два provider requests и normal cleanup каждый раз. Все исходные
отказы/копии/hashes сохранены, retries и произвольные sleeps не добавлялись.
Reports: `gui-submit-signal-aeef6c2c3/`, `gui-submit-ready-signal-aeef6c2c3/`.

Native TUI внешнего текстового пути действительно показывает permission
`Access external directory`; Esc отклоняет его, файловые parts и outputs
отсутствуют. Первый driver ожидал невидимый в свёрнутом UI текст ошибки и
был принудительно остановлен; второй неправильно считал накопленный ANSI
transcript текущим кадром и также не послал exit. Эти отказы сохранены.
Драйвер, ожидающий persisted settled error в read-only evidence, штатно завершил
TUI через Ctrl+D: **exit 0, forced false, writer released, remaining 0**,
Chromium не наблюдался. Это дополнительный persisted oracle: у standalone нет
export команды, оно не подменяет UI-решение об отказе. Все profiles/HOME собственные.
Промежуточный adapter с ошибочным database path остановлен вручную; он не принят.
Evidence: `cli-aeef6c2c3-tui-text-deny-settled-correct/`.

Native text-allow TUI прошёл обе permissions и extraction с normal exit 0,
но новая проверка подписи read permission **RED**: title `Read` без пути,
`Path:` отсутствует. Сам файл/структура и cleanup корректны; production TUI
пока не исправлен, повторный signal выполняется отдельно. Evidence:
`cli-aeef6c2c3-tui-text-allow-read-path/`. План по corrections не перерабатывался.

## Standalone run: согласие на вход и стандартный plan

`test/cli/package-docs-permissions.test.ts` проверяет публичный CLI в чистом
HOME/profile и PATH=/nonexistent с управляемым provider. Без `--file` текстовый
путь автоматически отклоняется: tool error содержит подсказку `--file`,
`permissionDenied: true`, exit 1 и `CLI_PERMISSION_REJECTED`. Original пакет
не изменён, `.work` отсутствует, writer released. Стандартный `--agent plan`
с оригинальным `--file` также не получает право писать вне plans directory.

Source **2 PASS / 24 assertions**, compiled CLIaeef **2 PASS / 22 assertions**,
Agent typecheck **PASS**. Evidence `cli-aeef6c2c3-permissions-green/`, logs
`cli-permissions-source-contract-green.log`, `cli-aeef6c2c3-permissions-green.log`.
Выбор skill управляемый; natural selection и process sampling этим тестом
не доказываются. Native PTY/GUI sampling приведены отдельно.

Исходные ошибочные предпосылки нового теста сохранены в logs: отказ run даёт
exit 1 по существующему контракту, а не 0; явный глобальный `edit: allow`
переопределяет обычные defaults Agent, поэтому тест plan не задаёт этот override.
User/CLI rejection останавливает provider loop (два requests), configured deny
возвращается модели (три requests). Это действующие разные ветви processor;
код permissions/Agent/run outcome ради теста не менялся. Новая проверка защищает
применение стандартных запретов, не вводит отдельную политику переопределения Agent.

TUI read-path RED подтверждён collector **STABLE FAIL 3/3**, **10.013 / 10.012 /
10.213 s**: все три CLI exit 0, extraction выполнен, writer released,
осталась только ошибка подписи запроса. Report `tui-read-path-signal-aeef6c2c3/`.

## TUI: путь пакета в запросе разрешения на чтение

Канонический `test/cli/tui/package-docs-pty.py --text-permission allow`
повторил RED на immutable CLIaeef: extraction успешен, exit 0, forced false,
writer released, remaining 0, исходный SHA не изменён, но `Path:` в read dialog
отсутствует. Evidence `cli-aeef6c2c3-tui-read-path-canonical-red/` и одноимённый log.
Предыдущая отдельная серия collector установила стабильность отказа 3/3.

Причина в `packages/tui/src/routes/session/permission.tsx`: read dialog использовал
только `input.filePath`, которого у `package_docs_run` нет. Backend уже передаёт
реальный путь в `request.metadata.filepath`. Добавлен этот fallback с сохранением
приоритета `filePath` обычного инструмента read. Новые PTY режимы используют
собственные HOME/XDG/profile, показывают внешний путь и нажимают реальные
Allow once / Esc. Отказ сверяется с read-only persisted settled state перед
Ctrl+D, поскольку standalone не имеет public export; выбор пользователя делает UI.
В обоих положительных вариантах вложений сохранена проверка полного parity
структуры, дополнительно проверяется неизменность SHA входа.

TUI typecheck **PASS**. Полный исходный TUI suite пока **188 PASS / 1 SKIP /
9 FAIL**, log `tui-read-path-source-tests.log`: четыре theme tests используют
отсутствующий `DEFAULT_THEMES.opencode`, один tree test ожидает старое имя
`opencode/src`, четыре snapshots отличаются переносами длинной branded строки.
Их signal/history проверяются отдельно; snapshots автоматически не обновлялись.
Native GREEN для изменения permission renderer требует нового чистого CLI
candidate; до этого read-path gate остаётся открытым. Требования плана не менялись.

## TUI: устаревшие фикстуры после переименования продукта

Signal collector повторил три проблемных файла **STABLE FAIL 3/3**:
каждый запуск **38 PASS / 9 FAIL**, 3.354 / 3.948 / 2.066 s, изолированные
HOME/XDG, исходные hashes неизменны. Report `tui-source-signal-36f7cdf82/report.md`.
Read-only history связывает значения со старым identity commit `d848db933`:
ключ темы уже `loginom-ai-agent`, пути уже `packages/agent`, а ожидания остались
прежними; текстовые замены в snapshots не пересчитали переносы при width=72.
Это диагноз устаревших тестов. Старые SHA не запускались, поэтому этот commit
не объявляется экспериментально установленным первым падающим SHA.

Исправлены только fixtures: реальный ключ темы и ожидаемый `agent/src`.
По одному циклу RED→GREEN: theme **8 PASS / 15 assertions**, tree **22 PASS /
66 assertions**. В четырёх snapshots вручную сверены три строки длинного Grep
вместо двух; остальные четыре записи в итоговом diff побайтно сохранены.
Фильтрованный Bun update временно убрал неисполненные записи; полный запуск
восстановил их с прежним содержимым. Поэтому после проверки diff выполнен
ещё один полный запуск без update: **197 PASS / 1 SKIP / 0 FAIL**, все
**8 snapshots сравнивались**, **476 assertions**, TUI typecheck **PASS**.
Log `tui-source-identity-full-snapshots-green.log`. Skip существующего tree
render test сохранён. Renderer/темы/дерево продукта ради тестов не менялись.

## Этап 2: native permission GREEN и три формата

Полный чистый CLI candidate `938b2cf679e1b2783368883ca51848343c13c7a2`
сохранён в `candidate-938b2cf67-cli/`: build, manifest/source verification,
archive roundtrip и `sha256sum -c` **PASS**, `sourceDirty: false`.
Archive SHA-256 `cd6b83d2c068ad24208464f446add6126c0395fe74e1c426da38bf7c941b2e88`;
source tree `ec27914098b98a39e04b0b81a50079bb3f770ced228d074f824a0944cae40b03`.
Pins остались прежними: Bun 1.3.14, Node 24.19.0, Chromium 1243.
Это новый CLI source pin; Desktop остаётся aeef, совпадение их исходников
не заявляется. Последующий commit 7746d5920 меняет только TUI tests и журнал.

Канонический PTY driver на CLI938 дал **4 PASS**: внешний text path Allow once,
его Esc reject, bracketed paste Unicode `.LGP` и `@sample.LGP`. Read-path
**REDaeef→GREEN938**, в диалоге видны `Read` и `Path:` с именем исходного пакета.
У каждого прогона отдельные чистые HOME/XDG/profile, PATH=/nonexistent;
exit 0, forced false, writer released, remaining processes 0, Loginom Chromium
не наблюдался, SHA входа сохранён. Положительные cases сравнили всю структуру
с fixture; reject не создал file parts и `.work`. Logs/evidence:
`cli-938b2cf67-tui-{read-path,text-deny,paste,mention}-green`.

Actual compiled CLI pipeline/permissions **5 PASS / 79 assertions**:
PDF, DOCX, MD через контролируемый Help/provider, text-path auto-reject
с `--file` hint и обычный plan edit deny. Действительный bundled Node работает
при отсутствии Node/Python в PATH; вход неизменён, guard освобождён,
готовые файлы проверены по тексту PDF и DOCX XML. Evidence/log
`cli-938b2cf67-pipeline-permissions-green/`. Эти проверки управляют вызовами
модели и не доказывают natural activation или качество живого полного отчёта.

Вместе с ранее принятыми Node parity/emit/error/cancel тестами и пятью native
Desktop GUI permission cases закрыт критерий этапа 2. В плане изменены только
его отметка завершения и checkbox авторизации чтения. Этапы 3–9 открыты;
полный живой отчёт и A/B evals остаются отдельными условиями приёмки.

## PTY: изоляция ancestor discovery и синхронизация read pane

Чистый HOME сам по себе не изолирует workspace внутри `/home/kiselev`:
discovery вне git ищет `.agents` вверх до `/`. Первые PTY прогоны из собственного
acceptance directory находили также пользовательские ancestor skills.
Их permission/input/structure результаты сохраняются, но это не доказательство
чистого каталога skills. Новое утверждение «только builtin и два bundled skills»
дало RED в `cli-938b2cf67-tui-ancestor-discovery-red/` при успешном extraction.

Driver теперь создаёт workspace в отдельном `TemporaryDirectory` под `/tmp`,
HOME/XDG/profile остаются собственными. `roots.json` фиксирует фактический путь;
до удаления workspace копируется в evidence. Первый paste **GREEN** проверил
ровно `customize-opencode`, `loginom-automation`, `package-docs`; оба Product
пути ведут в immutable CLI938. Затем isolated mention и Esc reject **PASS**,
temp roots удалены, guard released, remaining processes 0.

Isolated text-allow первоначально завис на guard `Permission required` и был
принудительно остановлен: native exit 1, writer сохранился; этот запуск не принят.
Signal **FLAKY**: три точных повтора дали PASS / PASS / FAIL, 10.081 / 9.836 /
92.375 s. Read-only cursor replay доказал полноценный экранный heading и путь;
его differential terminal writes после stripping ANSI дают `Permssion required`.
Это ошибка синхронизации adapter, а не отсутствие read permission в продукте.
Report `tui-isolated-read-pane-signal-938b2cf67/report.md`.

Read guard теперь ждёт `Read `, `Path: ` и имя конкретного входного пакета;
финальное утверждение actual path сохранено. Новая отдельная серия **STABLE
PASS 5/5**, 9.383 / 10.058 / 10.078 / 9.621 / 10.064 s, без retries/sleeps:
exit 0, forced false, guard false, expected structure, четыре requests,
ровно три skills, SHA входа неизменён, remaining 0, temp workspace удалён.
Evidence `tui-isolated-read-pane-ready-signal-938b2cf67/`. Driver/binary/Node/
manifest hashes серии неизменны. Новые source changes не участвовали в binary938.

## CLI discovery: публичный каталог, команды и повреждённый bundle

Новый `test/cli/bundled-skills.test.ts` запускает public standalone CLI с
контролируемым provider в изначально пустом workspace под `/tmp`, вне git,
с отдельными HOME/XDG/profile. Проверяет каталог, фактические пути skills,
последнюю applied activation/digest и ограничения следующего provider turn.
Первый вариант ошибочно проверял первый completed tool event: он ещё предшествует
применению pending-профиля. Тест использует последний public `tool_use` event,
сохраняя строгое требование к applied metadata; продукт ради этой предпосылки
не менялся. Evidence раннего отказа `cli-938b2cf67-discovery-clean.log`.

Native CLI938 **3 PASS / 47 assertions**: штатный resource resolver без
`CLI_BUNDLE`, reserved collisions и `run --command package-docs` при попытке
config-command подмены. Проверены `.claude`/`.agents` в проекте и HOME,
config skills и явно заданные paths, obsolete имя, обычный later-source winner
и realpath alias. Both Product paths/digest принадлежат нужному bundle;
UNTRUSTED content отсутствует. Evidence `cli-938b2cf67-discovery-installed-command/`.
Другой native modified-bundle case доказал отказ регистрации и отсутствие
fallback даже при наличии всех локальных копий, exit 1 / CLI_TOOL_FAILED.

В этом отказе обнаружен пробел diagnostics: public tool error говорил только
«Skill not found», глобальная diagnostic в выводе run отсутствовала. Новое
assertion о reinstall hint дало **RED** на CLI938, log/evidence
`cli-938b2cf67-discovery-reinstall-red/`. Existing `Skill.NotFoundError` теперь
добавляет инструкцию проверить resource path или переустановить приложение
только для двух canonical Product names. Обычные неизвестные skills сохраняют
прежний текст; новый error type/Protocol и повторный verifier не создавались.
Это подсказка при попытке загрузить недоступный skill, не доказательство
показа всех глобальных discovery warnings в интерфейсах.

Source **28 PASS / 233 assertions**, Agent typecheck **PASS**: семь CLI cases
(clean/reserved/command/modified/missing/unlisted/wrong-root), 19 bundled tests
и два skill tool tests. Corruption checks используют собственный dev-override
bundle: override не разрешает локальную подмену. Wrong root отвергнут до модели,
writer released; остальные bad cases не применили docs scope и вернули явный
отказ с reinstall hint. Logs `cli-discovery-matrix-source-green.log`,
`agent-discovery-matrix-typecheck.log`. Native семь cases с новой подсказкой
потребуют отдельной чистой сборки; пока Source GREEN не объявляется Native GREEN.
Выбор модели управляемый. Этап 3 в целом и live routing остаются открытыми.

## Native CLI `a8912ccbd`: ресурсный каталог и отказ целостности

Полная новая сборка CLI, archive roundtrip, `verify-cli-candidate.ts` и checksum
**PASS**. Source commit `a8912ccbd05f5b290ebeec83f99b32c38a9908cd`,
source tree SHA-256 `3315ed85296b755a832fcbdd5ef5bcd5dad0714e6851e0daae828597ce547139`,
`sourceDirty: false`. Архив SHA-256
`73df7c25893034a7198d20086756536b61fa80dfe7e083015cb7756f08b79b4e`;
сохранён в `candidate-a8912ccbd-cli/`, старые candidates не заменялись.
Pins: prod 0.1.17, Bun 1.3.14, Node 24.19.0, Playwright
1.63.0-alpha-2026-08-31, MCP 0.0.80, Chromium 1243. Logs
`cli-a8912ccbd-build.log`, `cli-a8912ccbd-verified.json`.

Native discovery matrix **7 PASS / 94 assertions**: empty `/tmp` workspace
вне git, собственные HOME/XDG/profile, PATH без системных executable; clean case
использует штатный resolver без CLI_BUNDLE. Остальные cases проверяют reserved
skill/config-command copies, ordinary source precedence/realpath alias, modified,
missing и unlisted файлы в отдельной копии bundle, явный неверный root.
Повреждения не дают fallback; canonical skill errors теперь содержат reinstall
hint. Wrong root отклонён до модели. Все profiles освобождены. Evidence
`cli-a8912ccbd-discovery-created-green/` и одноимённый `.log`.
Первый запуск `cli-a8912ccbd-discovery-green.log` дал 7 failures на сохранении
evidence: я не создал родительский каталог ARTIFACTS. Это ошибка команды проверки;
она исправлена созданием нового каталога, продукт и assertions не ослаблялись.

Native pipeline/permissions **5 PASS / 79 assertions**: PDF/DOCX/MD с
контролируемыми provider/Help, text-path auto-reject и standard plan edit-deny.
Входные SHA неизменны, writer released; evidence
`cli-a8912ccbd-pipeline-permissions-green/`. Это проверка реального конвейера
со scripted provider, а не natural routing/качества свободно написанного отчёта.
Процессная выборка этими TS tests не выполняется.

Адресация `run` подтверждена этой сборкой, TUI — ранее CLI938 с чистым HOME и
ровно тремя ожидаемыми skills. Отмечена только эта подзадача этапа 3.
Весь этап ещё не закрыт: расширенный diagnostic assertion дал native RED
`cli-a8912ccbd-diagnostic-red.log`: reserved-command выполнилась правильно,
но stderr пуст и предупреждение пользователю не показано. Source/global event
сам по себе не считается проверкой пользовательского вывода.

## CLI: глобальные diagnostics остаются предупреждениями

Diagnosis: missing integration/code bug. Global `session.error` от discovery
уже публикуется без sessionID, но старый CLI consumer принимал только событие
текущей Session. `git blame` связывает этот фильтр с `61150f6391`; это происхождение
строки, не экспериментально установленный breaking commit. Bisect не выполнялся:
причина непосредственно видна в consumer и воспроизведена новым public test.

Native `a8912ccbd` **STABLE 3/3 FAIL**: каждый испытуемый CLI завершился с exit 0,
stderr 0 bytes, двумя provider requests и семью public events; runner exit 1
только на diagnostic assertion. CLI/Node/manifests и driver inputs hashes серии
не менялись. Собственные fixtures удалены, owned live 0. Report/evidence
`cli-global-diagnostic-signal-a8912ccbd/report.md`.

`run` теперь печатает global diagnostics как предупреждения в stderr и
продолжает цикл. Ошибка другой Session игнорируется, текущей Session сохраняет
прежний fatal путь; новые JSON event/schema/error type не вводились. Проверки
stderr добавлены для всех canonical/obsolete reserved имён и config-команд;
bad bundle требует видимую reinstall diagnostic, помимо tool error.

Source **28 PASS / 254 assertions** (полная discovery matrix, bundled/catalog и
skill tool), полный noninteractive `run` subprocess suite **18 PASS / 60 assertions**,
Agent typecheck **PASS**, `git diff --check` **PASS**. Включены model error,
provider continuation, JSON stdout, permissions, attach, SIGINT и release.
Logs `cli-global-diagnostic-{source-green,matrix-source-green,run-source-green,typecheck}.log`.
Native исправление ещё требует новой чистой сборки; native RED из прежнего binary
не объявляется GREEN по одним source tests. Desktop/TUI consumers не менялись.

## Native CLI diagnostics GREEN: `6cfda621f`

Новая полная clean сборка, archive roundtrip, manifest verification и checksum
**PASS**. Source `6cfda621f830db948ced6aac602bfb717b8e2e61`, tree SHA-256
`045266116220e5a2239b5c14005499659cdc39fe9819556bd8d1f23531221126`,
`sourceDirty: false`; pins prod 0.1.17 / Bun 1.3.14 / Node 24.19.0 неизменны.
Archive SHA-256 `8d3946036622a10d3ee7119f3f6cc81a23e86ee3fde2f1bed9c4b3b727188abe`.
Candidate `candidate-6cfda621f-cli/`; logs `cli-6cfda621f-{build,verified}.log/json`.

Native public discovery matrix **7 PASS / 115 assertions**, включая stderr
diagnostics для canonical/obsolete skills, config-команд и bad bundle. Healthy
cases exit 0, повреждения exit 1 без fallback, wrong root отвергнут до модели;
JSON stdout разобран без warning records, writer released. RED `a8912ccbd` →
GREEN `6cfda621f` на неизменных assertions. Evidence
`cli-6cfda621f-diagnostic-green/` и одноимённый `.log`.
Модель scripted; TS runner не выполняет процессную выборку. Desktop/TUI
user-facing диагностики этой серией не проверяются; весь этап 3 ещё открыт.

## Desktop: reserved diagnostics были невидимы

Cold GUI driver `product-skills-smoke.mjs` получил отдельный opt-in
`LOGINOM_AI_AGENT_TEST_RESERVED_SKILLS=1`: в собственном `/tmp` workspace
создаются canonical/obsolete внешние skills, config задаёт одноимённые команды.
Проверяет реальные `/skill` и `/command`, неизменный bundled catalog и видимость
точных diagnostic texts в окне. Сохраняет body/screenshots/processes, после
закрытия удаляет только свой temporary root. Обычный clean smoke сохранён.

Native AppImage `aeef6c2c3`: первый RED и **STABLE 3/3 FAIL** повторов — все
каталоги правильные, но diagnostic text не появился за 10s. Все повторения
завершились exit 1 через locator timeout; app закрыто, own remaining 0 и temp
roots удалены. Source driver/AppImage/Node/driver resource hashes неизменны.
Report `desktop-global-diagnostic-signal-aeef6c2c3/report.md`, initial evidence
`desktop-aeef6c2c3-reserved-diagnostic-red/`. Screenshot проверен: wizard
доступен, warning text отсутствует. Это missing UI integration, не отказ
reserved-name защиты. Breaking commit не искался: общий notification handler
сохранял global error, но не показывал его текст в окне.

Shared `NotificationProvider` теперь показывает global diagnostic через
существующий `showToast`, используя существующий error formatter и i18n fallback.
Session-bound notifications сохраняют прежнее поведение. Новые UI строки,
schema/API и отдельный notification manager не вводились.

App полный unit suite **734 PASS / 3077 assertions**, полный browser-conditions
suite **60 PASS / 181 assertions**, App/Desktop typecheck **PASS**, Desktop
packaging suite **12 PASS / 2 macOS SKIP / 102 assertions**, diff whitespace
check **PASS**. Logs `desktop-global-diagnostic-{app-tests,app-typecheck,
desktop-typecheck,packaging-tests}.log`. Эти source checks не заменяют native
GREEN: требуется новая clean Desktop сборка с этим UI handler.

## Native Desktop diagnostics: `2aa3a3284`

Новая полная clean сборка Linux Desktop: source
`2aa3a3284d3cb7bf47c0d1050fdd42aa4c192352`, `source.dirty: false`;
prod 0.1.17 / Bun 1.3.14 / Electron 42.3.3 / Electron Node 24.15.0 /
bundled Node 24.19.0. DEB, AppImage и полный source archive сохранены в
`candidate-2aa3a3284-desktop/`, предыдущие candidates сохранены.

| Артефакт | SHA-256 |
| --- | --- |
| DEB | `896bcad6529e5b8bac726096883abeaddae474a3a58019da6b99c23201cfcf2b` |
| AppImage | `646070601971b1645680e679e9323a66c22856f92d79770e587cbb4248fa88aa` |
| Source archive | `51c037e5bdbfc7b9b230c8b658baf225cf63bfa3e73338c4ec41fb3792115576` |

Оба static artifact verifier **PASS / 4654 resources** каждый. Resource manifest
SHA-256 `f243b311f39abfdeb408521805549d700a1b0de437460227b7bce7c9345b10d8`;
UI-only изменение не меняет bundled skills. Logs
`desktop-global-diagnostic-build.log`, `desktop-2aa3a3284-package.log`,
release manifest и static reports в каталоге candidate.

Native AppImage clean smoke **PASS**: четыре поля unconfigured wizard,
ровно три ожидаемые записи каталога, оба Product skills с `source: bundled`,
64-hex digest и путями mounted ресурсов, `.lgp` доступен в composer.
Evidence `desktop-2aa3a3284-clean-green/`: 10 observed processes, remaining 0.
Native GUI permission suite **5 PASS**: text deny/allow, оригинальное вложение,
explicit attachment read/edit deny. Input SHA не изменился; permission profile
и original user parts проверены. Evidence
`desktop-2aa3a3284-gui-permissions-green/`: 55 observed, remaining 0.
Обе серии: собственные HOME/profile/workspace, sampling 25 ms, Chromium Loginom
и `--no-sandbox` не наблюдались, свои temporary roots удалены. Permission suite
использует scripted provider и реальный HTML composer; natural routing и
OS file picker этой серией не проверены. DEB этой версии проверен статически,
новая установка DEB и вся Linux-матрица ещё не выполнены.

Первый native diagnostic run на новом UI handler ещё **FAIL**: после появления
трёх skill warnings command locator находил два одинаковых текста. Collector
подтвердил full smoke **3/3 FAIL**, конкретный package-docs locator
**FLAKY: 1/3 FAIL, 2/3 PASS**; при его успехе следующий locator находил два
loginom-automation warnings. Catalog/commands правильны, все свои процессы
завершены. Report `desktop-toast-locator-signal-2aa3a3284/report.md`.
Сохранённые body/screenshots показывают дубли; источник toast использует
`data-visible`/`data-removed` и сохраняет node на выходе. Это согласуется с
exit-transition hypothesis, точный lifecycle не установлен экспериментом;
breaking commit через bisect не искался.

Driver теперь требует ровно одно активное видимое уведомление с точным
diagnostic text; ушедшие notifications не участвуют в locator. Wizard закрыт
до запроса discovery. Повторные попытки запуска, `.first()`, произвольные sleeps
и ослабление проверок текста не добавлены. Первичный native **PASS**:
`desktop-2aa3a3284-active-diagnostic-green/`, все шесть skill/command diagnostics,
trusted catalog, отсутствие UNTRUSTED/obsolete command. Screenshots проверены;
15 observed processes / remaining 0, sampling 25 ms, own root удалён.
Collector подтвердил **STABLE 5/5 PASS**, duration
10.786 / 12.308 / 10.970 / 11.345 / 10.944 s, каждый exit 0, без retries.
Во всех fresh HOME/workspace/profile: шесть diagnostics, trusted catalog/commands,
no UNTRUSTED, own remaining 0 и temp roots removed. Driver/AppImage/Node и оба
resource manifests до/после неизменны. Evidence
`desktop-active-toast-stability-signal-2aa3a3284/`; продуктовые бинарники и
resource manifests изменением теста не менялись. Diagnosis — flaky locator,
native product integration REDaeef → GREEN2aa теперь подтверждена повторениями.
Повреждения Desktop bundle и остальные Linux gates этой positive/reserved
серией не проверяются; этап 3 целиком ещё открыт.

## Native Desktop: повреждение skill в собственной копии

Cold GUI driver получил opt-in `LOGINOM_AI_AGENT_TEST_SKILL_DAMAGE`:
`modified`, `missing`, `unlisted`. Он требует unpacked Desktop executable,
копирует весь `linux-unpacked` в свой `/tmp/application`, меняет только copied
skill tree, запускает именно этот executable и проверяет actual resource root.
Reserved external skills/config остаются в своём fixture. Исходные
DEB/AppImage/ASAR/resources не меняются. Это native compiled Desktop с
контролируемым повреждением resources, не новая installed-artifact сборка.

Первый modified case не прошёл GUI warning assertion; повторения **3/3 FAIL**,
29.362 / 30.760 / 25.878 s, exit 1. Immediate DOM во всех содержит правильную
reinstall diagnostic с `data-visible=false`, index 3; visible limit штатного
toaster — три. Правильный builtin-only catalog и no external fallback уже
подтверждены. Report `desktop-damaged-toast-signal-2aa3a3284/report.md`;
snapshot driver показывает, что timeout в repeats пришёл из следующего
reserved-skill loop после ожидания reinstall message. Начальный primary run
остановился на самом reinstall wait. Это ошибочная последовательность ожиданий
в тесте, не установленная product regression; bisect не выполнялся.

Driver читает и закрывает передние notifications как пользователь, требуя
все четыре текста независимо от порядка. Hover использует actual toast:
первый вариант с region без собственной visible box дал timeout, log
`desktop-2aa3a3284-modified-skill-acknowledged-green.log` несмотря на имя — **FAIL**.
После этого modified case **PASS**, но missing case обнаружил race между
чтением и закрытием динамического front locator; log
`desktop-2aa3a3284-missing-skill-green.log` — **FAIL**. Теперь ID конкретного
уведомления закреплён до чтения/close, acknowledgement сохраняется сразу.
Forced clicks, sleeps и retries не добавлены; все required texts обязательны.

Missing case **PASS**: `desktop-2aa3a3284-missing-skill-pinned-toast-green/`;
unlisted case **PASS**: `desktop-2aa3a3284-unlisted-skill-green/`.
Оба native catalog builtin-only, Product/config replacement commands отсутствуют,
reinstall и все reserved diagnostics прочитаны, `.lgp` selectable, sampling
25 ms / no Loginom Chromium / no `--no-sandbox` / own remaining 0 и root removed.
Modified case с final driver **STABLE 5/5 PASS**, durations
17.518 / 19.664 / 18.835 / 18.340 / 19.790 s, все exit 0, без retries.
Evidence `desktop-damaged-toast-stability-signal-2aa3a3284/`: каждый раз
reinstall + три reserved texts прочитаны/acknowledged, внешние команды
игнорированы, own remaining 0, temporary root удалён. Исходные executable,
ASAR/manifest/SKILL, Node и driver hashes до/после серии совпали.
Результаты не доказывают natural skill selection, качество отчёта или полную
матрицу установленного Linux продукта.

Окончательный source driver повторно прошёл unchanged AppImage: clean и reserved
smokes **2 PASS**, evidence `desktop-2aa3a3284-final-smoke-{0,1}/`.
Оба bundled source/digest/path, composer и wizard сохранены; reserved commands
проверены с `source: skill`, no UNTRUSTED/obsolete alias. Native syntax check
поставляемым Node и `git diff --check` **PASS**. Product source/binaries этой
test-only задачей не менялись; новые сборки по одному изменению driver не создавались.
Native TUI diagnostics ещё не проверены, поэтому весь этап 3 не закрыт.

Сохранённые ASAR/resource manifest/SKILL SHA-256:
`c7a73eb96617fb05b0cd87f4297547b234bd740a8c1c5de9747a6d9994331bac`,
`f243b311f39abfdeb408521805549d700a1b0de437460227b7bce7c9345b10d8`,
`d6792becbc643affd729bc269a3aef72b5d7e85cadb43dab22a682c67570037d`.
Bookend file `desktop-2aa3a3284-damage-source-before.sha256`;
сохранённые candidate checksums проверены после initial runs, без изменений.

## Native TUI: предупреждение при загрузке каталога

PTY driver получил opt-in `--reserved-diagnostics skills`: в собственном
workspace он создаёт три внешних reserved skill, требует trusted bundled
catalog, отсутствие UNTRUSTED в model context и хотя бы одно видимое
предупреждение. Штатный TUI показывает одно текущее toast, поэтому одновременное
отображение всех трёх не требуется. ANSI/raw output сохраняются отдельно.

CLI `6cfda621f` **RED 3/3**: 10.295 / 9.633 / 10.068 s; CLI exit 0, extraction,
оригинальное вложение и trusted catalog исправны, но warning отсутствует и в
raw, и в plain terminal. Все input hashes до/после совпали, writer отсутствует,
own live processes 0, Chromium не наблюдался, temporary roots удалены.
Evidence `tui-reserved-warning-signal-6cfda621f/report.md`.

Public `Tui.run`/renderer test сначала подтвердил, что после готовности App
global `session.error` без session ID отображается. Затем тот же diagnostic
передан из `/agent` fetch при первоначальной загрузке: **RED**, остальные
lifecycle tests PASS. Причина: SyncProvider скрывает дочерний App до завершения
блокирующей загрузки; handler внутри App ещё не существует, когда Agent/Skill
публикуют предупреждения. Это обнаруженный пробел startup diagnostics; known
good native pin для этой новой проверки нет, first bad commit не установлен.
Предположение о необходимости RPC buffering не подтвердилось и не реализовано.

Handler перенесён в уже работающий SyncProvider, workspace filter и игнорирование
MessageAbortedError сохранены; используется существующий formatter/toast.
Удалён ставший ненужным private formatter App. Новый public regression test
**GREEN**. Первое полное выполнение выявило отсутствующий ToastProvider в
общей sync test fixture; добавлен настоящий provider, без изменения assertions.
Typecheck обнаружил недостающие event ID/explicit undefined в новой fixture,
они исправлены. Повторный весь TUI: **198 PASS / 1 SKIP**, 8 прежних snapshots,
477 assertions; `bun typecheck`, Python AST и `git diff --check` **PASS**.
Логи `tui-bootstrap-diagnostic-{source,source-green,full,full-green,typecheck,typecheck-green}.log`.
Native GREEN новой полной CLI-сборки ещё требуется; этап 3 остаётся открытым.

## Native CLI83: TUI diagnostics и ленивые отказы

Из clean source `83a2aff26ce793b9351e92a13042b1aa4759482b` построена полная CLI
с ресурсами, installer и archive roundtrip. Candidate
`candidate-83a2aff26-cli/payload/`, archive SHA-256
`7a5920de3bee9efb90fcdd26fff07ae6a89dbe2cf3acc8f41028219f35f04e7d`,
sourceTreeSha256
`eed8d0e63cd63129112de9510b581cb8d64df88c94ea29222a71f6fc3d9acab0`,
sourceDirty=false. Build, manifest/source verification и повторный checksum
**PASS**; `cli-83a2aff26-{build.log,verified.json}`.

Initial reserved-skills native TUI **GREEN**; collector подтвердил
**STABLE 5/5 PASS**, 10.562 / 10.071 / 10.277 / 10.306 / 11.788 s.
Warning `Ignored external skill 'package_docs'` присутствует в raw/plain
terminal; каталог3, trusted locations, оригинальная MIME/file URI, SHA и
extracted structure проверены. Writer absent, forced=false, own live=0,
Chromium не наблюдался, temporary roots удалены. Bookend hashes совпали;
evidence `tui-reserved-warning-stability-83a2aff26/report.md`.

Driver далее получил отдельный `--reserved-diagnostics commands` и
`--modified-skill`. Последний запускает compiled CLI с CLI_BUNDLE, указывающим
на собственную полную reflink copy resources с изменённым SKILL.md; копия
удаляется вместе с temporary root, изменённый Markdown сохраняется в evidence.
Изменённый skill не принимается даже при внешних reserved copies: model
catalog builtin-only, UNTRUSTED отсутствует, skill возвращает reinstall hint,
package_docs_run и structure не появляются, оригинальное вложение сохраняется.
Scripted provider явно отвечает об отсутствии skill. Product CLI/resources
не меняются. Native command-collision и damaged-copy cases **2 PASS**,
`tui-83a2aff26-{reserved-commands,modified-skill}-green/`; normal exit0,
no Chromium / remaining0 / profile released.

Окончательный driver повторно проверен в трёх fresh native запусках: clean,
reserved skills, reserved commands — **3 PASS**,
`tui-83a2aff26-final-{clean,reserved-skills,reserved-commands}/`.
Серия 5/5 относится к предыдущей версии driver до добавления двух opt-in
режимов; её hash закреплён в отчёте. Modified case выполнялся один раз.
Python AST и `git diff --check` **PASS**.

Native адаптер existing lazy-preflight test использует
`LOGINOM_AI_AGENT_TEST_CLI_BIN`: unconfigured и help-unavailable выполняются
через compiled binary и копию его настоящих Node/Host/knowledge resources.
Source-only managed-entry replacement не используется; меняется только
endpoint собственного resource manifest на недоступный loopback. PATH продукта
`/nonexistent`; реальные пользовательские настройки/секреты не читаются.
Оба native cases **PASS**, 12 assertions: конкретный prepare error, JSON terminal
error/exit2 или exit1, writer release и отсутствие runtime directory.
Остальные тесты файла для native gate отфильтрованы.
Полный source файл **12 PASS / 84 assertions**, Agent `bun typecheck` **PASS**;
`cli-83a2aff26-lazy-preflight-native.log`,
`cli-lazy-preflight-adapter-source.log`,
`agent-lazy-preflight-adapter-typecheck.log`.
Эта проверка exit-контракта не делает process sampling и не заменяет весь
knowledge/cancellation/Linux gate этапа 4.

Этап 3 завершён совокупностью source integrity/precedence tests, native CLI
discovery, Desktop clean/reserved/damaged cases и TUI positive/reserved/damaged
проверок. Статическая проверка DEB/AppImage относится к Desktop2aa, новая CLI
сборка — CLI83; весь установленный продукт на одном source pin, live natural
routing/report quality и парный evals gate остаются отдельными открытыми этапами.
Требования замороженного плана не перерабатывались: отмечен только выполненный
этап и его последний подтверждённый подпункт.

## Docs narrative: null в hierarchy и порты подмодели

Старый live report gate CLI520 остаётся **RED** по ручной фактографической
проверке: утверждения о входе/выходе через несуществующие порты. SKILL.md и
narrative-prompts.md у CLI520, CLI83 и текущего source совпадали побайтно
(SHA `d6792bec…` и `416eb2bb…`); новая TUI правка не меняла эти инструкции.
Known-good full report pin для этого кейса нет, first bad commit не установлен.

Точечная правка existing skill/references по утверждённому этапу 6:
null в hierarchy обозначает отсутствие соответствующего ребра на этом уровне,
не внешний порт; внешние порты подмодели искать у её узла в родителе, внутренние
links — в её собственном workflow. Изолированный узел не подтверждает поток.
Добавлены конкретные корректные формулировки для пустых портов, неизвестной
бизнес-задачи/настроек и отдельного описания каждого уровня подмодели.
Контракты инструментов, extractor, шаблон, judge/harness и план не менялись.

Host bundled integrity **9 PASS / 16 assertions**, Agent metadata/discovery/skill
**21 PASS / 132 assertions**, diff check **PASS**;
`docs-port-guidance-{integrity,discovery}.log`.
Generic Codex `skill-creator/scripts/quick_validate.py` отказался на existing
frontmatter `compatibility`: его allowed-fields список не содержит этого поля.
Product Agent Skills metadata validator принимает поле и прошёл; корректное
поле не удалялось ради несовместимого helper. Ни одна static проверка не
доказывает правильность narrative. Нужны clean candidate и новые live reports
с прежними model/variant/input, проверкой фактов и PDF layout. GREEN полного
качества пока не заявляется; старые evidence сохранены.

## CLI startup и Help: native exit/cancellation regression

Полный clean CLI `c7213af4ce1512b97a62d755b6bb4bb84bff872d` собран с
Node 24.19.0 и прежними release pins. Source verification, manifest, archive
roundtrip и checksum **PASS**, dirty false; tree
`f678375bad2bd76148b8449b5d9da428cafe66d9dec8f39f612a147b0546da17`, archive
`ad67451846c9afaaa8a131db14ee753b39c19d5a270aade9eecc5ec9e530c633`.
SKILL `f6a1015e…` и narrative `4fae816c…` включают последнюю правку port/null.
Старые кандидаты и baseline не изменены.

Existing standalone-preflight tests расширены на native binary без замены
compiled knowledge/browser entry. Каждый case получает собственную копию
ресурсов, profile/HOME/XDG; только endpoint собственного manifest направлен
на контролируемый MCP. PATH продукта `/nonexistent`, DISPLAY/Wayland пустые.
Обычный запрос без настройки: сохранённый baseline `fc3d97dbf` **RED**, exit2
`LOGINOM_CONFIG_REQUIRED`; CLIc721 **GREEN**, реальный публичный run reaches
scripted provider, exit0, ответ и profile release. Это регрессия механики,
не natural model selection.

Общий native выбор **8 PASS / 48 assertions**: обычный чат, реальный MCP
isError Help refusal при успешном ответе, lazy unconfigured/help-unavailable,
явный automation preflight ready/cancel/unavailable, ordinary-unavailable.
Отмена возвращает 130, Help preflight отказ — 1, lazy config — 2; обычные
ответы — 0. `.writer` снят, browser runtime directory отсутствует.
Полный source файл **12 PASS / 88 assertions**, Agent typecheck **PASS**.
Драйвер не выполняет process sampling; отсутствие directory не объявляется
доказательством полного browser exec/cleanup. Остальные management/recovery
cases при native выборе отфильтрованы, их source результаты выделены отдельно.
Evidence: `cli-ordinary-baseline-native.log`,
`cli-c7213af4c-{ordinary,help-refusal,help-preflight,all-preflight}-native.log`,
`cli-preflight-adapters-source.log`, `agent-preflight-adapters-typecheck.log`.

Новая live PDF серия с прежними fixture/model/variant начата отдельно:
`cli-live-pdf-c7213af4c-r2/`. Первая попытка в
`cli-live-pdf-c7213af4c/` завершилась **до модели** из-за mode0700 у
несекретного bind-mounted test context, недоступного container UID1200.
Container удалён; failure evidence сохранены. Context получил mode0755,
driver bytes не менялись. Новая серия имеет отдельные имена и results root;
факты/качество отчётов пока не объявляются GREEN.

## Docs narrative: противоречивые примеры шаблона

Первый настоящий CLIc721 PDF завершился за 114.269 s: actual installed launcher,
Help B, extract/skeleton/emit, exit0, один PDF, исходный `.lgp` SHA не изменён,
Chromium exec0. Узлы обеих подмоделей описаны отдельно; пустые порты и links,
неизвестные Python/Reference настройки обозначены корректно. Механическая
проверка **PASS**; полный фактографический gate **FAIL**: пакет и модуль названы
демонстрационными по одному имени «Демо», хотя назначение/заметки отсутствуют.
Actual events подтверждают чтение всех трёх references до написания отчёта.

В `report-template.md` обнаружен старый пример «Нет внешних зависимостей»
в разделе внешних пакетов, противоречащий SKILL/narrative и data.lgd fixture.
Пример заменён точным утверждением об отсутствии ссылок на внешние пакеты;
добавлен пример различения связи узлов и неизвестной формулы. Narrative
исключает демонстрационную цель и в модульном описании; обе ссылки теперь
одинаково трактуют null как отсутствие ребра. Это правка existing инструкций
по этапу 6, без изменения требований плана, executor или инструментов.

Перед правкой сохранён `attempt-1/manual-facts-verification.json` с конкретным
RED. Host integrity **9 PASS / 16 assertions**, Agent skill/discovery
**21 PASS / 132 assertions**; `docs-fact-guidance-{integrity,discovery}.log`.
Эти static checks не проверяют смысл текста. CLIc721 серия продолжает
использовать неизменный архив/driver; новая правка требует отдельной сборки
и новых live результатов. Старую серию нельзя приписывать новым инструкциям.

PDF первого запуска: две A4 страницы просмотрены после render системным
`/usr/bin/pdftoppm`, русский текст читаем, вложенные списки нумеруются 1/2,
обрезания/placeholder нет. Bare `pdfinfo` из bundled Codex runtime не запустился
из-за GLIBC_2.38; использован уже установленный `/usr/bin/pdfinfo`.
Это зависимость внешней проверки, не продукта. Layout PASS не снимает
фактографический FAIL.

## Этап 4: справка и локальный startup подтверждены

Свежая проверка `knowledge/host-port/connection-readiness/connection-validation`
**35 PASS / 318 assertions**, runtime actual knowledge entry/client
**22 PASS**, pinned Node 24.19.0. Повторно проверены local startup до каталога,
ленивый lease, Help маршрутизация отдельно от уже подготовленного браузера,
собственная отмена request/run, shutdown, поколения/ключи и состояние browser.
Evidence: `host-knowledge-stage4-final.log`, `runtime-knowledge-stage4-final.log`.
Они дополняют CLI native8/source12 и прежние actual GUI/TTY first-setup checks.

Два настоящих CLIc721 PDF прогона подтвердили готовность отчёта при Help-ready
и намеренно недоступном Loginom web: native первая настройка сохранила key-only
connection с `browser: failed`, затем Help B и emit без Chromium exec.
Открытый дефект текста относится к качеству отчётов этапа 6, не скрывается
успешной механикой. В плане этап 4 и три оставшихся implementation/test пункта
отмечены выполненными; ни одно требование не перерабатывалось. Полная Linux
матрица одного финального кандидата и browser cleanup/cancellation остаётся
в этапе 8; этот checkpoint её не заменяет.

## Профиль и вложения: сверка выполненных подпунктов этапа 5

Текущий source regression `task-scope/profile-tools/prompt/revert-compact/
compaction/package-docs` **200 PASS / 2 SKIP / 881 assertions**; два SKIP
относятся к отключённому V2 projector. Host task-scope **11 PASS / 65 assertions**.
Evidence: `agent-profile-stage5-final.log`, `host-task-scope-stage5-final.log`.
Исполнение — реальные публичные prompt/tool/Host paths с scripted provider
и собственными runtime fixtures; это не live классификация модели.

Результаты дополняют прежние metadata/origin/HTTP, Task bypass и CLI attachment
проверки из этого журнала. В плане отмечены уже реализованные reducer/history,
resolve/execute allowlists, private pending/apply на текущем run, первый
prepare/admission и V1 новый prompt во время работы. Проверены отказ apply,
revert pending, новая задача/default, отмена release/resume, owned originals
после compaction/fork, forbidden subtask и impersonation. История применяется
до tool dispatch; Host остаётся authority до runtime/input/journal side effects.
Требования плана не менялись. Комплексная установленная матрица переходов и
build → docs semantic flow ещё не приняты; этап 5 целиком не отмечен выполненным.

CLIc721 серия завершена: **3/3 mechanics/Help B PASS**, 114.269/190.124/172.915 s,
Chromium exec0, неизменный input SHA, по одному PDF. Все шесть PDF страниц
просмотрены: читаемая кириллица и правильная нумерация 1/2, layout PASS.
Полный facts gate **0/3**, во всех описаниях неподтверждённая демонстрационная
цель; последняя попытка добавляет предположение об учебном назначении.
Отдельные `report-verification.json` и `manual-facts-verification.json`
сохраняют различие механики/фактов. Старые контейнеры удалены.

Новая clean сборка CLI `704d441d587ea3b537c35fd50fb56cc20052cc46`, tree
`08aa67abf702f67bbf4d0fe121193d702bce600dcc1340af5385effe7cc94cd5`, archive
`734e47376d38967c87420d3adbcf648ae5e40de8350264b84f50303ae7db5bd1`:
build/manifest/archive roundtrip/source verification PASS, dirty false.
`cli-live-pdf-704d441d5/` использует прежние driver/fixture/model/variant/image
и отдельные контейнеры; результаты пока не приняты.

Соседняя калибровка проверена read-only через thread snapshot и git refs:
`calibration-near-miss` 64d634087, `evals` 904f7f85b; `evals/` совпадает.
323 tests/typecheck/XML guard приняты владельцем, live judge после guard
повторно не запускался. Наблюдаемые harness gaps и предлагаемая отдельная
задача записаны в [handoff](package-docs-evals-handoff.md). Запрошено только
назначение владельца этой задачи согласно правилу параллельной работы;
её код, чужие worktree/профили/.env/результаты не изменялись. Это ещё не pin A/B.

## CLI704: два качественных PDF, один неподтверждённый тип

Три native live PDF завершились за 159.412/125.550/65.259 s:
механика/Help B **3/3 PASS**, Chromium exec0, input SHA неизменён, один документ
на попытку, все шесть страниц просмотрены и читаемы. Полный facts/layout gate
**2/3 PASS**. В третьем тексте DerivedReference назван «производной ссылкой
на внешний справочник», хотя settings пусты и цель не установлена.
Actual Help read в этой попытке содержит только Calc/Python документы.
Минимальный Help B был соблюдён, но он не подтверждает семантику остальных типов.
Отдельные mechanical и manual facts JSON не скрывают этот FAIL.

По сохранённому RED уточнены existing SKILL/narrative: общую возможность типа
добавлять только из прочитанной справки этого типа; неизвестный тип описывать
по структуре без догадки о справочнике/источнике. Порог B остаётся прежним;
контракты extractor/emit и требования плана не менялись. Host integrity
**9 PASS / 16 assertions**, Agent catalog/skill **21 PASS / 132 assertions**;
`docs-type-guidance-{integrity,discovery}.log`. Новая инструкция ещё требует
своей clean сборки/live gate, старые результаты ей не приписываются.

## CLI704: обычные естественные запросы без подключения

Два точных corpus case на основной модели **xiaomi-token-plan-sgp/mimo-v2.5-pro**,
variant default: `default-unconfigured-arithmetic` и `default-translation`,
по три раза, итого **6/6 PASS**. Ответы соответственно `102` и
`Documentation is ready.`. Ни одного tool call/skill activation, ни output,
ни Chromium exec; `.writer` освобождён. Вопрос с цитатой «Документация готова»
не активировал документацию. Все HOME/profile/workspace новые; настройки
Loginom не добавлялись, шесть временных roots удалены после проверки.

Evidence: `cli-live-default-704d441d5/{conditions,verification}.json`, отдельные
case/attempt events/result/roots/strace; driver SHA
`44151a6dbf8cdfd889a9c12abfcc8529af0e86c3d34ee3b1ec2ab8d8744d04e6`.
Это два из 20 кейсов на CLI, без Desktop или второй модели; strace browser exec
audit не является самостоятельной переписью surviving processes.
Модельный ключ читался из существующего auth без изменения, затем сохранялся
только в собственных временных private profiles; в git/conditions его нет.

## Общий source pin 67c3898c3: CLI/Desktop и PDF gate

Обе полные сборки сохранены на clean source
`67c3898c3f6bc0d5e86f9a1e1bd0729fad6b0a2d`, Node 24.19.0,
Bun 1.3.14, Chromium 1243, prod 0.1.17. CLI archive/roundtrip/source verifier
прошли; tree `1eb50dc60719d3aa28a45c939d137bdedbdcf0263cf90c6fbd9741ed1416afd4`,
archive `eb0b4a84317dd0af6ea3b2dbb90a4b9121e22c3a8173a08092edf863b61ce1bf`.
Desktop включает соответствующий полный source archive и release manifest;
DEB и AppImage static verifiers **PASS**, по **4654 resources**.

| Desktop artifact | SHA-256 |
| --- | --- |
| AppImage | `cca65b1024f1d11ab622cf00b397b76b915d5784ed1c310b59cc697afa0c51e1` |
| DEB | `54ea495bb9a0cf8252d96b06162cb0e40012f1517534dd9107a144d015dc2777` |
| Source archive | `9c97c4c59bb1e6f39dce8f9dda56668244aec604d537f2b29a94d621e1c85ac0` |
| Resource manifest | `c00c687be2490b263e77c5b8d5f4e439d77385e0edc71593b16b931ead1f4631` |

CLI `docs-attached-pdf`, та же основная модель/variant/fixture/driver/image:
**3/3 mechanics/Help B/layout PASS**, 178.786 / 254.772 / 162.103 s,
input SHA не изменился, Chromium exec **0**. Просмотрены все шесть страниц
PDF системным Poppler; все читаемы, без clipping/placeholder, нумерация 1/2
сохранена. Narrow verifier прошёл три раза, **полные факты — 2/3 PASS**.
Третий отчёт назвал `DerivedReference` «производным компонентом, созданным
на базе другого узла» после чтения только generic `derived-component.md`.
Настройки не содержат базовый узел; statistical derived/reference grouping
не доказывает наследование. Этот live gate остаётся **FAIL**, результаты
не заменяются повторным запуском и не объединяются с предыдущими source pins.

Evidence: `candidate-67c3898c3-{cli,desktop}/`, build/verify logs,
`cli-live-pdf-67c3898c3/attempt-*/{report-verification,manual-facts-verification}.json`,
events/strace/workspace и page PNG. Все три собственных контейнера удалены.
Требования основного плана не пересматриваются; дальнейшая правка guidance
выполняет согласованный пункт этапа 6 о фактах и стабильности модели.

## Native Desktop67: crash logging с sandbox

После полной сборки выполнен обязательный `test/loginom/crash-logging.mjs`
на неизменной AppImage67, UID 1001, Xvfb, pinned Node. Драйвер теперь явно
задаёт `chromiumSandbox: true`, поскольку default Playwright Electron launch
добавляет `--no-sandbox`, недопустимый по Linux runbook.

На коротком `TMPDIR=/tmp` **6 PASS**: routing backend в server.log,
main rejection/renderer exception/sidecar exit, initialization failure,
unexpected exit/restart, native Crashpad dump/restart, clean quit/restart,
rotation/retention budget 100 MB. Desktop `bun typecheck` **PASS**.
Это проверка логирования и восстановления собственной тестовой программы,
не живое построение Loginom и не полная Linux матрица.

Первый запуск с TMPDIR внутри длинного acceptance path остановился на
первом Electron launch с SIGILL; main.log содержал только `app starting`.
Его log/minidump/profile сохранены в `desktop-67-crash-home/tmp/`.
Повтор на коротком пути прошёл; точная причина первого native abort не
установлена, длинные profile paths этим запуском не приняты. Условия первой
попытки не выдаются за проверку продукта без ограничений.

Evidence: `desktop-67-crash-logging{,-short-tmp}.log`,
`desktop-crash-driver-typecheck.log`. Пользовательская установка, profiles,
launcher, соседний worktree и основной план не изменены.

## Statistical grouping guidance: новый RED→GREEN цикл

RED: третий неизменный CLI67 PDF report использовал generic derived-component
Help для определения неизвестного `DerivedReference`. Другие две попытки
прошли, поэтому наблюдаемый сбой модели — **1/3**, не стабильный deterministic
failure. SKILL и narrative теперь явно отделяют statistical grouping и
частичное совпадение имени от доказательства поведения/наследования узла.
В narrative исправлена прежняя подсказка `service name is operational essence`:
имя служит поисковым ключом, а назначение требует подтверждения.
Help B, extractor, tool/catalog и emit contracts не менялись.

Source integrity **9 PASS / 16 assertions**; skill/discovery **26 PASS /
144 assertions**; `git diff --check` PASS. Тесты проверяют настоящую загрузку
ресурсов, не дублируют новые фразы. Live GREEN ещё требует отдельной clean
сборки и полной серии; прежний FAIL остаётся в evidence.

Дополнительный immutable AppImage67 cold smoke **PASS**: собственный пустой
HOME/workspace, unconfigured wizard, `.lgp` picker, два bundled skills с digest,
native Electron sandbox. Process sampling 25 ms и cleanup — в
`desktop-67-cold-discovery/{result,processes,roots}.json`; test root удалён.
Это не model routing/полный отчёт/installed DEB приёмка.

## Общий source pin 70a2d5a93: статистические группы и реальный Desktop

CLI и Desktop собраны на clean source
`70a2d5a93ba9a4d6a0292528893227e045b4c0ed`, prod 0.1.17, Node 24.19.0.
CLI tree `07096167dd15c0e5d5d313283d4cd81c8a5f6927f5d4efce414b954e65e3fd24`,
archive `21c6460c31105f1f813e70d2a60b61d2f26c4e6c1ad230bcc1f0c46d2380cbbb`;
полный archive/roundtrip/source verification PASS. Desktop static DEB/AppImage
**4654 resources PASS**; resource manifest
`c2fe6d0e82f1039b94310631ff7504f0d06949423ff14506e24ca557ae114d00`.

| Desktop artifact | SHA-256 |
| --- | --- |
| AppImage | `f56ae105a89efd3cc3b9f2495f2ae685d07abe667c67e88c253d2011921d865c` |
| DEB | `03e99c2d8250618c9107db74e7fe3812dbacaf9ea3fcdef83898c3456b3f1e66` |
| Source archive | `aaf49186c24c3fedf207fa7182f925e6e23f1ab98be17626fff212ce19d8e389` |

CLI PDF: **3/3 mechanics/Help B/facts PASS**, 144.828 / 122.791 / 159.948 s,
Chromium exec0, исходный input SHA неизменён. Все шесть PDF страниц просмотрены.
Layout **2/3 PASS**: второй документ показывает подмодели как 1/1 вместо 1/2
из-за вложенных `-` bullets. Facts guidance прошёл эту серию, но весь live gate
остаётся FAIL. Evidence: `cli-live-pdf-70a2d5a93/attempt-*/`, отдельные narrow
и `manual-facts-verification.json`; три собственных контейнера удалены.

Native Desktop AppImage: **3/3 mechanics/Help B/facts/layout PASS**,
118.300 / 165.338 / 199.245 s. Основная модель/variant/fixture/prompt те же;
отдельные HOME/workspace/profile, UID 1001, Xvfb, Electron sandbox включён.
Вложения и естественные запросы переданы настоящему Desktop backend через
HTTP; это не проверка живого GUI composer или всего корпуса. Выбран
`package-docs`, один PDF на попытку, исходный input неизменён, Chromium exec0
после начала модельной работы. Все шесть PDF страниц просмотрены;
process census/cleanup: remaining0, собственные временные roots удалены.
Evidence: `desktop-live-routing-extracted-70a2d5a93/`, conditions,
messages/result, process trace/census/cleanup и manual review JSON.

Первый Desktop driver с strace поверх FUSE AppImage завершился до Electron:
fusermount exit1, AppImage exit127, модель не запускалась. Сохранился собственный
пустой test root из `roots.json`; его cleanup не подтверждён. Принятая серия
использует разрешённый Linux runbook `APPIMAGE_EXTRACT_AND_RUN=1` и тот же
AppImage, без отключения sandbox. Первоначальная ошибка не скрыта и не
приписывается модели. CLI первый build остановился на отсутствующем parent
directory; после создания своего parent полная сборка прошла, оба logs сохранены.

## PDF/DOCX: вложенные Markdown bullets, TDD

Сохранённый CLI70 layout RED изолирован на immutable Node bundle: вложенный
`-` превращался в обычный абзац и сбрасывал счётчик внешнего списка.
Минимальный пример даёт 1/1 **3/3** в PDF и DOCX, в том числе через публичный
Node `emit`; exit0 не означал правильную нумерацию. Контроль со `*` — **3/3 PASS**.
Evidence: `pdf-numbering-signal-70a2d5a93-collector/`.

Сначала существующий регрессионный тест расширен на `*`, `-`, `+`:
**1 PASS / 2 FAIL**, фактические PDF text и DOCX XML показывают 1/1.
Затем одна строка parser принимает все три Markdown bullet markers.
Полный Node pipeline suite **45 PASS / 173 assertions**, Host `bun typecheck`
PASS; `docs-hyphen-list-{red,green}.log`, `host-hyphen-list-typecheck.log`.
Порог проверки качества сохранён; новая сборка и live приёмка после исправления
ещё нужны. Требования основного плана не пересматриваются.

Перед новым общим build публичный Node CLI повторно обработал точный сохранённый
неудачный черновик CLI70: PDF и DOCX по три раза, **6/6 PASS**, нумерация 1/2,
exit0/empty stderr, неизменный LGP SHA. Evidence:
`pdf-numbering-public-green-fb9b2e396/{build,results}.json` и готовые документы.
Это source bundle с исправлением, не новый установленный candidate.

Docker matrix runner принимает необязательный собственный `--image-prefix`;
прежний default сохранён. Linux runbook описывает отдельный output/tag и
сохранение чужих images. Desktop `bun typecheck` PASS. Диагностический installed
DEB70 Ubuntu22 прогон запущен с `loginom-package-docs-70a2d5a93:ubuntu22`;
его результат пока не принят, полная Linux матрица остаётся открытой.

## Общий source pin 3ccc3b4c9: bullet fix и оставшийся facts RED

Полные CLI и Desktop собраны на clean source
`3ccc3b4c9e50b73b9c51af1d0a9e7a8c9ebf4fd0`, prod 0.1.17, Node 24.19.0.
CLI archive/roundtrip/source verification PASS; tree
`185e47f99edfb17d3f7e68c470801183eca03e74ee03201e82df34cb222a9bc6`, archive
`4b852e04e9ad85f7d699a8339cbc8b205f02e795085aa26d866775b7d5a8df99`.
Desktop DEB/AppImage static **4654 resources PASS**; resource manifest
`f85488c897e2bca127514275e77b3e62293125035eca6bf3f7a6cca932ce0e71`.

| Desktop artifact | SHA-256 |
| --- | --- |
| AppImage | `f4ab491e2fce051bee15925cc0da5b26c1e9849d5b4fa8d9b2c4fbd9117f9dd5` |
| DEB | `6108effe6a1cd3b6ad7567918551addd30e217b5ec10572fc2aeb155e9e5bdc0` |
| Source archive | `eed5200a8cb882cdf5e83ea68081050fc7ed7172b48b9b8ac5d79297fb3f3883` |

CLI PDF `--no-headless`: **3/3 mechanics/Help B/layout PASS**,
150.877 / 131.212 / 183.530 s, input SHA неизменён, Chromium exec0,
один PDF на попытку. Просмотрены все шесть страниц: нумерация 1/2 и читаемая
кириллица. Facts **2/3 PASS**: третья попытка снова описала `DerivedReference`
как создаваемый на базе другого узла после generic derived-component Help.
Полный quality gate остаётся FAIL; узкий verifier проходит все три раза.
Evidence: `cli-live-pdf-3ccc3b4c9/`, отдельные manual review JSON.

Исследование actual tool transcript исключило неверную подпись экстрактора:
service_name получается из исходного Engine без выдуманной расшифровки.
Модель получила актуальный SKILL полностью (`truncated: false`), прочитала
narrative и повторно прочитала заполненный черновик перед emit. Наблюдаемый
сбой — перенос общей справки после расширения поиска неизвестного типа.
Контракт структуры и требования основного плана не менялись.

CLI Word mechanics **3/3 PASS**, 73.652 / 97.116 / 140.410 s,
`--no-headless`, Chromium exec0. Первое описание проверено относительно
структуры/actual Help; полная facts/layout серия ещё не принята.
Поставляемый documents renderer 26.904.11930 на текущем хосте не запускает
LibreOffice: требуются GLIBC 2.38 / GLIBCXX 3.4.31. Ошибка записана в
`word-render.log`; проверяется тот же bundled renderer в собственном Ubuntu24
контейнере. Первой контейнерной попытке не хватило libcurl/liblcms;
её log сохранён. Пользовательский LibreOffice не запускался.

Независимые серии запущены с отдельными roots: CLI Markdown, три CLI docs
case без локального входа и 13 single-turn Desktop case ×3. Desktop adapter
явно отказывает для сценарных/multiturn/внешних permission case; для запросов
без входа workspace пуст. Эти незавершённые серии не являются приёмкой
всего корпуса. Ubuntu22 DEB70 diagnostic ещё выполняется; чужие tags,
профили, результаты, launcher и соседний worktree не изменены.

## Unknown Engine: решение перед переносом Help, новый цикл

По сохранённому CLI3ccc facts RED изменён порядок анализа в SKILL/narrative:
сначала установить соответствие точного Engine обработчику Help, затем
объяснять возможности идентифицированного типа. Если найдена только общая
категория или похожий обработчик, неизвестный тип описывается по структуре.
Первая фраза narrative теперь требует подтверждённых фактов, а не только
отсутствия противоречия структуре. Статистика и контракт extractor/emit прежние.
Integrity **9 PASS / 16 assertions**, discovery **26 PASS / 144 assertions**;
`docs-grounding-decision-{integrity,discovery}.log`. Семантический live GREEN
новой инструкции ещё не проверен; текущие серии используют immutable 3ccc.

Ubuntu22 diagnostic DEB70 **PASS**: offline nonroot Chromium/Electron launch,
sandbox, resource hashes и четыре поля мастера. Использован собственный tag
`loginom-package-docs-70a2d5a93:ubuntu22`, image
`sha256:609fba83b043725e2fb3fea7fa65b27012237e9bfcf41c32cfdc24399d8a9615`.
Evidence: `desktop-70-prefix-ubuntu22/{linux-matrix.json,ubuntu22-smoke.log}`.
Это один старый artifact на одной ОС; не полная матрица финального candidate.

Первый CLI3ccc Word успешно открыт и отрендерен **без изменения исходного DOCX**
тем же bundled documents renderer/Python/LibreOffice 26.904.11930 в собственном
Ubuntu24 контейнере `loginom-package-docs-word-render:20261007-v2`, network none,
UID 1001, readonly input/runtime. Добавлены системные библиотеки только своего
контейнера; пользовательская ОС и LibreOffice не менялись. Обе страницы
просмотрены: кириллица, все разделы, нумерация 1/2, без clipping/overlap.
Первый Word facts/layout PASS; остальные Word/MD ещё требуют своей проверки.
Неуспешные host/v1 renderer logs сохранены рядом с успешным v2 log.

## Quoted Markdown lists: Word live RED → public Node GREEN

Закончена CLI3ccc серия Word/Markdown. Word mechanics **3/3**, facts **1/3**,
layout **2/3**: второй отчёт ошибочно связал два выхода в описании пакета;
третий приписал неизвестному Engine возможности Reference Node без чтения
справки этого обработчика. Обе страницы каждого исходного Word открыты
bundled renderer и просмотрены. Третий Word также печатал literal `*`
внутри quoted nested list. Полные Markdown outputs **3/3 PASS** по fixture,
actual Help B, отсутствию placeholders, равенству draft/output и input hash.
Evidence: `cli-live-formats-3ccc3b4c9/`, manual review JSON в каждой попытке.

Регрессионный тест quoted list сначала дал **3 FAIL** для `*`, `-`, `+`.
После распознавания heading/list внутри quote pipeline **48 PASS / 182
assertions**, Host typecheck PASS. Обычные quote paragraphs и frozen legacy
outputs проходят прежние проверки. Фактический третий Word draft повторён
через публичный Node CLI: frozen3ccc **PDF/DOCX RED**, исправленный source
bundle **6/6 GREEN**. Две PDF и две Word страницы результата просмотрены:
markers/numbering исправлены, clipping/overlap нет. Это проверка formatter,
а не приёмка качества прежнего текста. Evidence:
`quoted-list-public-64fcf578e-v3/`, `docs-quoted-lists-{red,green}.log`.
Ошибки настройки standalone verifier (module resolution/Buffer/assertion)
сохранены отдельно; итоговый v3 replay завершён успешно.

CLI3ccc без входа **3/3 PASS**: запрос локального файла, нет отчёта/Chromium.
Missing-file attempt1 также дал корректный запрос `.lgp`, без отчёта/браузера;
его exit1 соответствует исходному `runToolOutcome` для unresolved tool error.
Prototype ошибочно требовал exit0 и остановил оставшиеся прогоны: серия
missing/server cases не принята. Контракт exit code подтверждён source
**11 PASS / 27 assertions**; product CLI не менялся.
Основной план не редактировался, требования не перерабатывались.

## Направление связей в кратком описании

По Word2 facts RED в narrative добавлена проверка направления `links` для
краткого описания пакета и подробного описания модуля: source output → target
input. Контракты extractor/emit не менялись. Resource integrity **9 PASS /
16 assertions** с pinned Node, skill/discovery **24 PASS / 73 assertions**;
новый live текст ещё не проверен. Первый integrity запуск без обязательного
Node env дал configuration failure; корректный запуск сохранён отдельно.

## Чистый candidate 5a99b75f4 и первый live GREEN

Общие Desktop/CLI build inputs зафиксированы на
`5a99b75f42e73ed4addf8432251816c6a0844ca3`, dirty=false. Полный CLI archive
roundtrip/source verification PASS: archive
`296e29b7d85c22756cd9af53f450ead407a5c950040f8f991b907847a261978b`,
source tree `2f0f4e4dc866b185f43fee3dfe969501cdce95cba196ed2c9ba609b848d71657`.
Desktop DEB/AppImage static **4654 resources PASS**:
DEB `75d1e1c9e2f81f8d8af91f99f9fdd2bda23ff841eeb247e9acec36e1f14af177`,
AppImage `3aabb2d89f82717825b3cf6f2ce03946fda05fb34d74ad6b31b8fe06e833a39e`;
resource manifest `11c53aa80b1cdb667aafca3d57b8a0984775f1764746ec4f1a86cc28325d4b8e`.
Source archive/manifest сохранены в `candidate-5a99b75f4-desktop/`.

CLI установлен один раз в собственном frozen seed image
`loginom-package-docs-cli-installed:5a99b75f4`, image
`sha256:c05e46ad5541439c59a457d4cf33d6664f05bfdbe4f3874ab9a670785c899b00`.
В образ не передавались credentials/профили; каждая модельная попытка — новый
контейнер с отдельным профилем/workspace. Installed version 0.1.17 и sandbox
root:root4755 подтверждены. Это убрало повторную установку из каждой попытки.

CLI5a PDF **3/3 mechanics/facts/layout PASS** на исходном естественном запросе,
Mimo-v2.5-pro/default, `--no-headless`, Chromium exec0, input hash unchanged.
Все шесть PDF страниц просмотрены; неизвестному DerivedReference теперь не
приписано неподтверждённое поведение, направление source→target корректно.
Одна мелкая опечатка отмечена в manual JSON. Это GREEN предыдущего facts RED
на ограниченном кейсе, не весь routing gate. Evidence:
`cli-live-formats-5a99b75f4/docs-attached-pdf/`.

CLI5a no-input **3/3 PASS**. Missing-file ответы корректны и дают штатный exit1
как после `extract`, так и после обычного `read`. Два prototype adapters
ошибочно ограничивали допустимый tool либо формулировку просьбы; ошибки и
ответы сохранены. Новый frozen negative-v3 adapter проверяет механику,
семантика ответа требует ручного просмотра. Активный formats adapter не
редактировался. Desktop13 single-turn×3, CLI Word/MD/negative и новая Desktop
Linux5 matrix ещё выполняются. Матрица использует собственный image prefix.
Требования основного плана заморожены; соседняя evals сессия не изменялась.

## Checkpoint

- Product candidates: Desktop/CLI `5a99b75f4`, clean source/artifacts/manifests; static Desktop 4654 resources PASS; предыдущие candidates сохранены.
- Полный чистый baseline `fc3d97dbf`: CLI, resources, manifest и детерминированные проверки сохранены.
- Этапы 0–4 выполнены; требования плана заморожены, соседний evals worktree не изменялся.
- Product skills/staging/loader/prepare локальны; Publisher отключён, серверная запись сохранена.
- Source attribution сохраняет 35 baseline mismatches; live gate ещё не принят.
- Docs Node48 PASS; CLI5a PDF3/3 facts/layout GREEN; CLI3ccc Word facts1/3/layout2/3 FAIL, MD3/3 PASS; quoted lists public6/6 GREEN.
- BrowserStatus/key-only Help: first setup GUI/TTY/stdin-json native PASS; CLIc721 startup/Help/cancel/lazy 8 PASS, source 12 PASS; Host35/runtime22 PASS; этап 4 закрыт.
- Scope/history/prompt/revert/docs: 200 PASS / 2 V2 SKIP; Host scope11 PASS; пять implementation подпунктов этапа 5 отмечены; installed переходы ещё открыты.
- Host scope проверяет pending/apply/живую работу и запрещает браузер для default/docs.
- Первый prepare: scope → runtime → original bytes admission → workspace call.
- Новый runtime повторно получает байты; неудачный prepare не выдаёт Dock-каталог.
- Полный Host 224 PASS / 7 SKIP; Agent history/tools/registry 30 PASS; typecheck обоих PASS.
- Старый package_docs/Python тест заменён actual bundled flow/Node executor без Host call/admit.
- Lazy admission/full history: 128 PASS / 1 SKIP; actual prompt 11 PASS; Agent typecheck PASS.
- Bundled activation: 109 PASS / 1 SKIP; pending-revert: 4 boundary tests и 87 PASS / 1 SKIP; typecheck PASS.
- Slash source: 104 PASS / 1 SKIP; typecheck PASS; build/general остаются в исходной сессии.
- CLI `.lgp`: 94 PASS / 1 SKIP; CLI6cf discovery 7 PASS, CLIa891 pipeline 5 PASS; CLI938 PTY 4 PASS; TUI CLI83 warning 5/5 stable GREEN, command/damage PASS, suite 198 PASS / 1 SKIP.
- CLI installer C8 RED 3/3: chown сбрасывал setuid; fix/Host 226 PASS / 6 SKIP; C6 native installer/status/browser/uninstall PASS.
- Installed DEB85 smoke/metadata/ASAR PASS; GUI2aa permissions/damage PASS; Desktop67 crash logging 6 PASS на short TMPDIR, typecheck PASS; corpus/evals/Linux gates открыты.
- Далее: unknown type grounding facts RED→GREEN, полный routing gate и installed переходы; A/B ждёт согласованной harness задачи из handoff. Требования плана не перерабатывать.
