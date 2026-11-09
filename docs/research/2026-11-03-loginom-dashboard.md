# Исследование skill для dashboard в Loginom

Статус: исследование перед согласованием дизайна. Продуктовый код и skill пока не создаются.

## План исследования

1. [x] Изучить проект, фактические ветки и существующие skills; проверить этот план независимым агентом до запуска окружения. Review: Approved, обязательных исправлений нет.
2. [x] Установить отдельные dev-контейнеры Loginom по существующим средствам integration. Зафиксировать версию, commit и режим минификации; сохранить чужие контейнеры и изменения.
3. [x] Через MCP Playwright изучить workflow, контекстное меню, toolbar, жизненный цикл клиента и доступ к данным узла. Сопоставить с кодом агента и e2e-tests. Проверить ключевые предположения на master с минифицированным клиентом. Проверены UI-объекты и чтение данных; новые кнопки и dashboard пока не реализованы.
4. [x] Исследовать готовые открытые dashboard/BI решения и skills.sh по первичным источникам; сравнить пригодность для встраивания, работу с данными Loginom, требования к серверу и лицензии. Окончательный выбор зависит от смысла кнопки «создать».
5. [x] Исследовать существующие способы безопасного чтения SSH .env внутри процесса без вывода значений в инструменты, логи и контекст модели. Реальные SSH-секреты не читались, remote deployment не выполнялся.
6. [ ] Зафиксировать подтверждённые результаты, ограничения и вопросы. Предложить визуальное сопровождение, затем задавать по одному существенному вопросу с вариантами.
7. [ ] Предложить 2–3 подхода и согласовать дизайн по частям: интеграция, данные, создание dashboard, установка и проверка.
8. [ ] После согласования сохранить дизайн в docs/superpowers/specs, провести независимый review, затем подготовить план реализации через writing-plans.

## Критерий завершения исследования

Есть воспроизводимые свидетельства по клиенту и данным, обоснованный shortlist технологий и чётко обозначенные непроверенные места. Выбор поведения, который зависит от намерений пользователя, вынесен в вопросы; реализация не подменяет исследование.

## Ограничения

- Временные материалы: $HOME/storage/tmp/.
- Не менять исходники Loginom, агента, integration и e2e-tests ради исследования.
- Использовать отдельные контейнеры и тестовые сценарии; не затрагивать чужие окружения.
- Секреты не выводить и не включать в документы.
- Документ является текущей точкой продолжения; результаты будут добавлены сюда.

## Проверенные основания

- Текущий worktree: upstream detached `501ff62cbf`. Фактический код агента изучается read-only в `<project-root>`, ветка `loginom`, SHA `90b0cb8164`; Dock — `$HOME/git/loginom-dock`, SHA `83c52ebb`.
- `~/git/skills/.agents/skills/loginom-automation/SKILL.md` содержит рецепты UI через MCP и data-tid. `~/git/loginom-dashboard` создаёт отчёты по git; это не готовая интеграция dashboard в клиент Loginom.
- Агент имеет прямой reader выходного порта: `packages/loginom-runtime/client/lib/node-port-output.mjs`: `port.data.get_Output()` → `QueryInterface(bg.IBGDataSource)` → row count/columns/AsVariant. Его лимиты выборки относятся к диагностическому инструменту, не доказывают лимит Loginom.
- Validation schema использует другой путь: `node-preview-schema.mjs` → `FPreviewManager.FPreviewForm.FFormCache` → `DataSetForm.FColumnInfosStore`; это кэш схемы preview, не raw dataset.
- Готовой постоянной серверной установки dashboard JS и готового SSH executor в исследованных runtime/host/client модулях нет. Ветка `secret-guard` защищает Git от секретов, но не закрывает чтение `.env` моделью.
- Штатным механизмом integration найден свежий master `fe412e7de97270adba53238f1f792d85174a4b26`, pipeline `204732`, job `1358774`, successful; master commit от 2026-11-02. Артефакт содержит `Dist/Client/client` и `Dist/ClientDebug/client` одного билда.

## Начальные точки UI по debug-артефакту master

- `bg/app/ModelForm.js`: `Items.tlbModel` — горизонтальный toolbar, `FNodeContextMenu` — меню узла. `PrepareListeners` (4272) создаёт меню через `PrepareContextMenus`; `PrepareNodeContextMenu` (5733) собирает native Ext menu.
- `CreateDiagram` (1371) регистрирует mxGraph selection change; `OnMxNodeContextMenuShow` (1488) использует выбранный node и вызывает настройку меню перед show. `Dispose` (340) уничтожает меню и граф.
- `bg/app/TabForm.js:644` создаёт ModelForm; `SetWorkFlow` передаёт текущий workflow.
- `index.html` минифицированного клиента остаётся читаемым и подключает ExtJS, Loader и Uses обычными script tags. Возможность постоянной установки отдельного bootstrap рядом с ним пока только вывод из файлов; живой mount не проверен и не реализован.

## Установленный стенд и границы проверки

- Minified: `http://127.0.0.1:32808/app/?testable=true`; debug: тот же origin, `/app-debug/?testable=true`.
- Версия `7.5.0-alpha+build.4732`, master SHA выше. Server binary SHA256 совпал с загруженным артефактом. Базовый образ предоставляет Debian 13 и библиотеки, а бинарник и оба клиента заменены файлами свежего билда; это не clean production build.
- Контейнеры `dashboard-research-20261103-server` и `dashboard-research-20261103-studio`, отдельная сеть `dashboard-research-20261103-net`, localhost port, `Mounts=[]`. Чужие контейнеры и хранилища не затрагивались.
- Команды, provenance и teardown сохранены в [SETUP.md](loginom-dashboard-evidence/SETUP.md), контрольные суммы — в [manifest.json](loginom-dashboard-evidence/manifest.json). Исходный рабочий каталог стенда: `$HOME/storage/tmp/dashboard-research-20261103/`.
- Полный installer integration нельзя использовать для такого исследования: его `docker_prep` останавливает все контейнеры с именем loginom, другие шаги удаляют branch-specific ресурсы. Кроме того, для master он выбирает ClientDebug; сама ветка master не доказывает минификацию.
- Legacy `CalendarGenerator.lgp` оказался несовместим: отсутствует CountOrder и не восстановлены связи. Это ошибка пригодности тестового пакета; она не доказывает дефект API или dashboard. Пакет не исправлялся.

## Живые свидетельства MCP Playwright

1. На `/app/?testable=true` выполнен вход и открыт workflow. `bg.app.ModelForm` существует; `View.$className === 'bg.app.view.ModelForm'`, `View.Controller === controller`. Toolbar имеет xtype toolbar; `FNodeContextMenu` — menu. Их `.add`, selection listeners и dispose существуют в минифицированном runtime.
2. Контекстное меню открыто реальным right-click по узлу; выбор узла синхронно изменил состояние toolbar. Проверены несколько вкладок workflow. У всех свои ModelForm и контекст.
3. Открыт публичный тестовый `sales.lgp` из `evals/tasks/local-path-scenarios/local-lgp-edit/data/Пакет #1/`. Через toolbar выполнен только source node `bee595ca-d654-4594-b941-c50a69511e0f`. Остальные узлы и export не выполнялись.
4. До открытия preview прямой DataSource вернул 3 строки, схему `Category` (String=5), `amount` (Integer=4), строки с offset=1: `Beta/20`, `Alpha/25`; первая строка — `Alpha/10`. Все полученные прокси освобождены.
5. Независимый агент сверил эти значения с SourceText и OutputColumns внутри исходного LGP; SHA256 исходника и контейнерных копий совпал: `4313b47f09cc875993e8acc42ef2d35baec7d7dc61589af817d413b37261e7bf`.
6. Затем открыт native preview; он показал те же три строки и схему. [Скриншот проверки](loginom-dashboard-evidence/minified-preview.png) сохранён с материалами исследования.
7. Отдельно открыт **обычный** `/app/` без testable. На странице 0 data-tid; native toolbar, меню и DataSource доступны. В этой browser session source node снова выполнен через UI, затем без preview прочитаны rowCount=3 и первая/последняя строки. Значит, проверенный native путь не требует testable/data-tid.

Это проверка API и объектов UI, а не готового расширения. Bootstrap, добавление собственных кнопок, iframe mount, обновление/откат установки и remote SSH не реализовывались. Проверка через MCP Codex не является приёмкой skill внутри поставляемого Loginom AI Agent.

## DataSource: что переносить из существующего агента

- Использовать именованные `bg.IBGDataSource`, `get_RowCount()`, `get_Columns()`, `AsVariant(row,col)`, а не номера RPC interfaces и constructor names. На свежем master номер interface отличается от версии агента; live constructor dataSource называется `bT`.
- Cache-helper минифицирован: имена полей представлены `$c`, `$d` и т. п. Старые обращения к `$FHelper.$FData` непереносимы. По свежему `bg.customconnectors.rpc.js` native helper сам читает блоки по 100 строк, сразу все колонки, и инвалидирует cache по DataChange/StateChange. Ручной fetch/cache поверх него не нужен. Eviction при чтении множества блоков в исследованном helper не обнаружен.
- Сохранение integer через decimal string необходимо за пределами безопасного Number. Исходные decoder/Int64 проверены локально отдельным агентом на границах 2^53 и Int64/UInt64; серверный end-to-end этих типов ещё не проверялся.
- Preview строки может обрезать на 5000 символов. Native UI дочитывает через `GetDetailedString(row,col,out,maxLen)`, обычно maxLen=300000. `out.value < 0` означает полное значение; иначе это исходная длина усечённой строки. Длинные строки вживую пока не проверены.
- Binding требует контекста package/workflow/node/port. Port GUID повторяется у разных узлов одного типа; одного GUID порта недостаточно. Имена узлов также нельзя считать стабильными идентификаторами.
- Новые dataset чтения должны учитывать деактивацию/повторный Execute, закрытие package, смену вкладки, потерю подключения и изменение схемы. Конкретный механизм ещё не выбран; существующую инфраструктуру procedure/journal целиком копировать не требуется.
- Не подтверждены: большие datasets/скорость/память, offset 99→100 вживую, NULL/Date/Variant, long Unicode strings и обновление уже открытого dashboard. Это адресные проверки реализации, а не основания объявлять текущий probe полной приёмкой.

## Исследование frontend и BI

Исследован широкий набор решений по первичным источникам и реальным лицензиям. Предварительная рекомендация для **генерации произвольного dashboard агентом** — React + Vite + shadcn/ui (Chart/Recharts), а не отдельный BI-сервер. Для **ручного BI-конструктора** лучший кандидат из исследованных — Perspective. Выбор между этими задачами принадлежит пользователю.

- **React + Vite + shadcn/ui/Recharts**: статический dist, не нужен Node runtime на сервере; свободная компоновка, стандартные frontend-массивы данных. Это стек разработки, не готовая BI-система. shadcn и Recharts — MIT. [Vite deployment](https://vite.dev/guide/static-deploy.html), [React embedding](https://react.dev/learn/add-react-to-an-existing-project), [shadcn Chart](https://ui.shadcn.com/docs/components/chart), [license](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md).
- **Perspective**: готовый frontend BI custom element, pivot/filter/sort/aggregation/chart/layout; JSON/CSV/Arrow, worker/WASM, server optional. Apache-2.0. Меньше свободы дизайна, больше готовой аналитики. [Guide](https://perspective-dev.github.io/guide/), [repository](https://github.com/perspective-dev/perspective).
- **Observable Framework + Plot**: специализированный static framework с реактивным JS/Inputs; официальные exported modules и iframe embedding; ISC. Хорош для аналитических страниц; у React шире UI-экосистема и найден готовый качественный skill. [Embedding](https://observablehq.github.io/framework/embeds), [deploying](https://observablehq.github.io/framework/deploying), [repository/license](https://github.com/observablehq/framework).
- **Apache ECharts**: Apache-2.0, сильная библиотека графиков с dataset API, но без dashboard layout/editor/persistence. Подходит при требованиях сложных графиков; не нужен автоматически вторым chart engine. [Dataset](https://echarts.apache.org/handbook/en/concepts/dataset/), [modular build](https://echarts.apache.org/handbook/en/basics/import/).
- **GridStack**: MIT, drag/resize и JSON layout; только если нужен ручной layout. Не заменяет графики/data engine. [Repository](https://github.com/gridstack/gridstack.js).
- **Tremor**: React dashboard components, нынешний copy/paste продукт Apache-2.0; альтернатива shadcn, а не BI engine. [Repository/license](https://github.com/tremorlabs/tremor).
- **Malloy**: MIT, семантический/query слой; browser DuckDB/WASM возможен, но для уже подготовленного результата Loginom добавляет отдельный слой. [Docs](https://docs.malloydata.dev/), [license](https://github.com/malloydata/malloy/blob/main/LICENSE).
- **Evidence**: MIT; актуальная self-host документация требует `evidence serve`, connector и connection.yaml, embedded analytics указана Studio-only. Старые заявления README о static output нельзя без версии переносить на текущий продукт. [Current self-host](https://docs.evidence.dev/self-host), [repository](https://github.com/evidence-dev/evidence).
- **Superset**: Apache-2.0, Python BI server; embedding требует Superset backend и guest token. [Embedding](https://superset.apache.org/user-docs/using-superset/embedding/).
- **Metabase**: OSS AGPL-3.0 и отдельные commercial/embedding лицензии; production modular React SDK требует платную редакцию/JWT SSO. [SDK](https://www.metabase.com/docs/latest/embedding/sdk/quickstart), [licenses](https://github.com/metabase/metabase).
- **Grafana**: AGPL-3.0, отдельный сервер/datasource/auth; iframe требует allow_embedding. [Config](https://grafana.com/docs/grafana/latest/setup-grafana/configure-grafana/), [embedding auth](https://grafana.com/docs/grafana/latest/setup-grafana/configure-access/configure-authentication/jwt/).
- **Lightdash**: MIT вне enterprise subtree, отдельная EE лицензия; warehouse/semantic backend, embedding JWT. [License](https://github.com/lightdash/lightdash/blob/main/LICENSE), [embedding](https://docs.lightdash.com/embed/reference).
- **Cube**: Apache-2.0 по умолчанию, некоторые пакеты MIT; backend semantic API, не готовый dashboard frontend. [Repository/license](https://github.com/cube-js/cube).

Frontend-решения не устанавливались в Loginom; сравнение документационное. Наличие API chart library не доказывает готовый dashboard editor или пригодность embedding без проверки сборки.

## Skills.sh: проверено содержимое

- Рекомендованный референс — официальный [shadcn](https://skills.sh/shadcn/ui/shadcn), [реальный SKILL.md](https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/SKILL.md): project info/docs, semantic tokens, accessibility, dry-run/diff и browser verification. Он помогает строить frontend, но не знает Loginom data API и deployment.
- [kpi-dashboard-design](https://skills.sh/wshobson/agents/kpi-dashboard-design) полезен как справочник KPI/компоновки; SQL/Python/Streamlit примеры не являются готовой интеграцией.
- [react-vite-dashboard](https://skills.sh/google-labs-code/stitch-skills/react-vite-dashboard) требует Stitch MCP и Stitch artifacts, часть workflow посвящена Web3; не годится обязательной зависимостью.
- [davaded/echarts-ai-skill](https://skills.sh/davaded/echarts-ai-skill) строит отдельный chart CLI; renderer использует внешний CDN ECharts 5 и фиксированный размер, test script — только typecheck/build. Не рекомендован как готовая качественная dashboard-основа.
- Skills не устанавливались. Для будущего skill предпочтительнее один проверенный frontend default и короткие Loginom-specific инструкции/скрипты, чем копирование нескольких больших чужих skills.

## SSH и секреты: вывод исследования

- При удалённой цели спрашивать **путь** к `.env`; файл читается только внутри узкого локального executor. Модель получает operation/status и безопасные сообщения, а не env values. `cat`, `source`, env dump, credential argv и вывод сырых subprocess exceptions для этого пути непригодны.
- Существующий `loginom-dock/tools/loginom-acceptance/scenario_profile.py` демонстрирует parse-by-key без исполнения shell. Host уже использует private credential store и allowlisted child environment; это референсы, не готовый SSH installer.
- Для реализации надо определить допустимые ключи .env, SSH key/agent/password, права на client root, способ доставки и rollback. Нельзя обещать remote deployment без проверки этих условий. Формат .env ещё не согласован, реальные SSH credentials не открывались.
- Проверка будущего executor должна использовать canary credentials и убедиться, что stdout/stderr, успешные и ошибочные ответы не содержат ни значений, ни сырого содержимого env. Инструкция в SKILL.md сама по себе не доказывает закрытую границу секретов.

## Предварительное направление, не согласованный дизайн

### Упаковка skill и разрыв в возможностях агента

- Новый bundled `loginom-dashboard` не требует нового runtime profile. Для Dock работы он может явно активировать существующий `loginom-automation` через skill tool; grants выдаются только двум известным runtime skills. Обычный dashboard skill сам такой grant не выдаёт и не отменяет уже выданный.
- Упаковка: каталог `packages/product/skills/loginom-dashboard`, reservedSkillNames в product/src/skills.ts и существующие проверки каталога. stage-resources уже копирует всё дерево skills.
- Product verifier допускает frontmatter только name/description/license/allowed-tools/metadata/compatibility; generic create-skill рекомендация `disable-model-invocation: true` здесь несовместима с продуктом. Cross-skill markdown-ссылки за пределы каталога тоже запрещены; зависимость указывается вызовом skill по имени.
- **Существующий `loginom_dock_node_read` не является пассивным reader произвольного узла**: он требует source_operation_id завершённой локальной операции, повторно выполняет node и возвращает bounded sample. `kind:context` относится к JavaScript. Поэтому «только добавить SKILL.md и использовать готовый reader» не покрывает произвольные уже существующие узлы.
- Старый reader зависит от interface ID 116 и helper cache-fields; managed preparation дополнительно проверяет catalog build. Если skill сам инспектирует любой текущий узел на master minified, нужен адресный пассивный reader/дополнение текущего API и совместимость catalog. Новая host protocol/profile инфраструктура из этого не следует.

### Возможная интеграция

Сохранить тонкую интеграцию Loginom независимой от frontend stack: отдельный bootstrap и загрузка статического frontend artifact, browser data adapter к текущей Loginom session. Изоляция CSS/DOM через iframe выглядит перспективно, но mount/bridge и CSP ещё не проверены. Патчить минифицированные bundle регулярными выражениями оснований нет.

В агенте уже есть Desktop deep link `loginom-ai-agent://new-session?directory=...&prompt=...` (`packages/app/src/pages/layout/deep-links.ts` и layout.tsx). Он открывает проект и подставляет prompt на локальном server; это ещё не автоматическое выполнение и не перенос browser session. Для CLI он не решает browser→agent handoff. Использовать его или вообще связывать кнопку с агентом — зависит от уточнения поведения кнопки.

## Вопросы для согласования (по одному)

1. Что означает «создать dashboard»: поручить генерацию агенту, открыть ручной BI-конструктор или подключить уже подготовленный frontend? Это определяет default framework и browser→agent handoff.
2. Dashboard работает только в текущем Loginom session/package или должен отдельно открываться коллегами без workflow? Второе меняет доступ к данным/auth/deployment.
3. Какой типичный объём/обновление данных и сколько источников/портов нужны одному dashboard? Не вводить silent sample как замену полному результату.
4. Как сохранять и повторно открывать dashboards, что делать при повторном нажатии/rename/move package?
5. После функциональных решений уточнить упаковку skill для поставляемого агента и supported versions/deployment targets.

Предложение визуального сопровождения отправлено отдельным вопросом. Ответ ожидается; визуальные материалы и реализация не начаты.

Независимый review результатов: Approved. Live-свидетельства отделены от статического анализа и непроверенных предположений. Следующий шаг — уточнение поведения кнопки и согласование дизайна; реализация ещё не разрешена.
