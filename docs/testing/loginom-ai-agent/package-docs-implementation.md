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

## Checkpoint

- Ветка `docs-no-browser`, исходный продуктовый SHA `fc3d97dbf`.
- Этап 0 выполнен: полный чистый baseline и детерминированные проверки сохранены.
- Этап 1 выполнен: каталог, staging, локальный runtime и передача resource root проверены.
- Каталог skills перенесён и адаптирован; source-only проверки перечислены выше.
- Локальный loader и динамический prepare реализованы; единый digest проверен в Bun/Node.
- Shared inventory и полный staging реализованы, два настоящих bundled skills найдены вне checkout.
- Полный verifier общий для Host/runtime; reference/generated closure и classic bridge проверены.
- Publisher отключён без чтения файлов/сети; серверная запись сохранена для baseline/старых клиентов.
- Static catalog и source/installed generated exception проверены; installed/live ещё открыты.
- Bootstrap и локальные evidence checks проверены; общий source audit имеет 35 baseline mismatches.
- Resource root Desktop/CLI и обе bundled команды проверены; client suite 2550 PASS / 10 SKIP.
- Этап 2: writers и Node CLI extract/skeleton 32 PASS; emit CLI, staging/tool ещё открыты.
- Следующий шаг — emit CLI; 35 baseline source-map mismatches остаются live gate.
- Живая приёмка и удаление серверного skill остаются открытыми.
