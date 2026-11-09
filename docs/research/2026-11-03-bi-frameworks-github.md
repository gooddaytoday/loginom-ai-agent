# Готовые BI/dashboard-фреймворки для интеграции с Loginom

Дата проверки: 2026-11-03. Отдельное исследование GitHub, официальной документации, лицензий и опубликованных npm-пакетов. Существующее исследование интеграции с Loginom не изменялось.

## Вывод

Предварительную рекомендацию «React + Vite + shadcn/ui» стоит уточнить: это средства разработки интерфейса, а значительную часть BI-поведения придётся реализовать отдельно. Среди изученных проектов есть готовые аналитические движки, редакторы и приложения.

**Моя рекомендация для первого прототипа, получающего данные узла прямо в браузере Loginom, — Perspective.** Он подходит и для dashboard, конфигурацию которых создаёт агент. Graphic Walker интересен как визуальный редактор анализа, но требует отдельной композиции dashboard и выяснения условий брендинга. Если допустим дополнительный сервер, самые полезные новые кандидаты — **Drizzle Cube** для встроенной React-аналитики и **Vizro** для генерируемых агентом dashboard. У Vizro и HoloViz Panel обнаружены официальные skills; наличие специализированного skill только у shadcn больше не является аргументом в его пользу.

**Cube Core из примера пользователя — прежде всего семантический backend.** Сам по себе он не даёт готового интерфейса dashboard. Это прямо разграничено в README проекта: визуальные BI-возможности продукта Cube относятся к коммерческому предложению. [Источник](https://github.com/cube-js/cube#readme).

Запрет на дополнительный backend не задан пользователем. Поэтому серверные решения не исключены, а оценены как отдельный способ интеграции. Итоговый выбор зависит от того, нужен ли dashboard непосредственно над результатом узла или отдельная BI-система с собственными источниками и моделью данных.

## Что проверялось

В разной глубине просмотрены 22 проекта/репозитория, перечисленные ниже. Для основных кандидатов изучены API, отдельные исходники, декларативные форматы, лицензии и skills; для части альтернатив — документация и README. Число звёзд не использовалось как доказательство качества.

Критерии: готовность многопанельного dashboard; получение данных узла без обязательной SQL-публикации; пригодность конфигурации для генерации агентом; пользовательское редактирование; способ встраивания; необходимые серверные компоненты; лицензирование; состояние поддержки; наличие прикладного skill.

Это исследование исходников и документации. Установка, сборка, нагрузочные измерения и проверка внутри Loginom в этой боковой беседе не выполнялись. Совместимость с конкретным клиентом Loginom пока не доказана ни для одного нового кандидата.

## Основные кандидаты

### 1. Perspective — первый кандидат для аналитики прямо в браузере Loginom

[Репозиторий](https://github.com/perspective-dev/perspective). Apache-2.0. Аналитический движок с WebAssembly, обработкой в worker и интерфейсом Web Component. Поддерживает JSON, CSV, Arrow, обновление данных, группировки и визуализации; отдельный сервер возможен, но не обязателен для браузерного сценария. [README](https://raw.githubusercontent.com/perspective-dev/perspective/master/README.md).

Существенная поправка к прежнему сравнению: Perspective не ограничен ручным построением отчёта. Его состояние сохраняется и восстанавливается как конфигурация; агент может создавать эту конфигурацию. В исходниках есть многопанельный workspace, раскладка и панели, управляющие общими фильтрами. Это подтверждается и типами опубликованного `@perspective-dev/viewer@5.6.1`, а не только веткой разработки. [Save/restore](https://raw.githubusercontent.com/perspective-dev/perspective/master/docs/md/how_to/javascript/save_restore.md), [upstream-тесты workspace](https://github.com/perspective-dev/perspective/blob/444865accd46bcfdeb552960ce4f63fe8286de42/rust/perspective-viewer/test/js/multi_panel/save_restore_workspace.spec.ts), [WorkspaceConfig в релизе 5.6.1](https://unpkg.com/@perspective-dev/viewer@5.6.1/dist/esm/ts-rs/WorkspaceConfig.d.ts).

Для Loginom остаются получение и преобразование данных, размещение компонента, обновление после выполнения узла и хранение конфигурации. Вывод: здесь уже есть значительная часть BI, которую пришлось бы писать поверх UI-kit. Возможности произвольного оформления бизнес-страниц следует проверить отдельно; наличие аналитического workspace не означает готовый дизайнер любого интерфейса.

Для прототипа следует использовать актуальные пакеты `@perspective-dev/*`: старый `@finos/perspective-viewer` опубликован с отметкой о переходе на новое имя. [Текущий пакет](https://registry.npmjs.org/%40perspective-dev%2Fviewer/latest), [старый пакет](https://registry.npmjs.org/%40finos%2Fperspective-viewer/latest).

### 2. Graphic Walker — готовый визуальный редактор анализа, с двумя оговорками

[Репозиторий](https://github.com/Kanaries/graphic-walker). Встраиваемый React-компонент принимает строки `data` и описание `fields`; вычисления могут выполняться в браузере либо через собственную функцию `computation`. Есть формат состояния графика и компактная TerseSpec, специально рассчитанная в том числе на LLM. Это хороший интерфейс для исследования результата узла. [README](https://raw.githubusercontent.com/Kanaries/graphic-walker/main/README.md), [протокол вычислений](https://raw.githubusercontent.com/Kanaries/graphic-walker/main/computation.md).

Однако полноценная композиция dashboard из нескольких графиков явно исключена из целей TerseSpec. Нельзя приравнять встроенный редактор графика к готовому приложению со страницами и общей раскладкой: эту часть нужно обеспечить отдельно. [Дизайн TerseSpec](https://raw.githubusercontent.com/Kanaries/graphic-walker/main/docs/terse-spec-design.md).

В репозитории одновременно присутствуют Apache-2.0 `LICENSE` и `LICENSE2` с условиями сохранения брендинга Kanaries и отдельного white-label-соглашения; во втором файле есть также пометка о sample license. До выяснения применимости этих условий нельзя уверенно обещать встраивание без логотипа и дополнительных договорённостей. [LICENSE](https://raw.githubusercontent.com/Kanaries/graphic-walker/main/LICENSE), [LICENSE2](https://raw.githubusercontent.com/Kanaries/graphic-walker/main/LICENSE2). Опубликованный пакет на дату проверки — `0.5.3`. [npm](https://registry.npmjs.org/%40kanaries%2Fgraphic-walker/latest).

### 3. Drizzle Cube — самый интересный новый кандидат для встроенного React BI

[Репозиторий](https://github.com/cliftonc/drizzle-cube). Это другой проект, не `cube-js/cube`. MIT. Даёт семантические определения, React `AnalysisBuilder` и `AnalyticsDashboard`: несколько визуализаций, перемещаемые и изменяемые по размеру блоки, фильтры, редактирование и callbacks для сохранения. По объёму готового поведения он существенно ближе к встроенному BI, чем shadcn. [README](https://raw.githubusercontent.com/cliftonc/drizzle-cube/main/README.md), [документация dashboard](https://www.drizzle-cube.dev/client/dashboards/), [лицензия](https://raw.githubusercontent.com/cliftonc/drizzle-cube/main/LICENSE).

Цена этой готовности — Drizzle/SQL/backend. Нужно определить cubes над схемой БД и предоставить API; приложение отвечает за авторизацию и сохранение конфигураций. Передать произвольный массив строк Loginom вместо всей этой части как штатный основной сценарий документация не предлагает. Компонент dashboard использует метаданные из Cube provider. [Клиентский API](https://www.drizzle-cube.dev/client/), [исходник AnalyticsDashboard](https://github.com/cliftonc/drizzle-cube/blob/f99329e74311fd2ca574e7be2d0aec08c50b734b/src/client/components/AnalyticsDashboard.tsx).

Есть MCP-инструменты для агента. При этом собственные AI HTTP endpoints приложения — дополнительная интеграция, а не автоматически готовый сервер чата. [AI/MCP](https://www.drizzle-cube.dev/ai/). Опубликован `drizzle-cube@0.12.2`; это не основание считать совместимость с Loginom или эксплуатационную зрелость проверенными. [npm](https://registry.npmjs.org/drizzle-cube/latest).

Мой вывод: обязательно включить в сравнение, если рассматривается SQL-хранилище результатов Loginom. Для задачи «открыть dashboard над текущим узлом в текущем браузере» добавление SQL-публикации должно иметь самостоятельную пользу.

### 4. Vizro — готовый dashboard-фреймворк с официальными skills

[Репозиторий](https://github.com/mckinsey/vizro). Python-фреймворк на Dash с декларативной моделью dashboard: страницы, раскладки, графики, таблицы, контролы и действия. Модели можно задавать через Python/JSON/YAML. Это более готовая основа для генерации аналитического приложения, чем набор компонентов React. [README](https://raw.githubusercontent.com/mckinsey/vizro/main/README.md).

В официальном репозитории есть отдельный `vizro-e2e-flow`: skills проектирования и сборки dashboard, справочные материалы и проверки. Прочитанные `dashboard-design` и `dashboard-build` включают работу со спецификацией, актуальной схемой моделей и функциональной проверкой через Playwright. Есть настоящий вспомогательный валидатор агрегации, но его AST-эвристика не доказывает правильность бизнес-метрик. [Workflow](https://github.com/mckinsey/vizro/tree/main/vizro-e2e-flow), [design skill](https://github.com/mckinsey/vizro/blob/146b932464447c64ee5d19b67aef85ac244d59e2/vizro-e2e-flow/skills/dashboard-design/SKILL.md), [build skill](https://github.com/mckinsey/vizro/blob/146b932464447c64ee5d19b67aef85ac244d59e2/vizro-e2e-flow/skills/dashboard-build/SKILL.md), [валидатор](https://github.com/mckinsey/vizro/blob/146b932464447c64ee5d19b67aef85ac244d59e2/vizro-e2e-flow/skills/dashboard-build/scripts/validate_aggregation.py).

Обычный путь — запуск Python/Dash-приложения. Для Loginom потребуются доставка данных в это приложение и его встраивание. Мой вывод: сильный кандидат, если приоритет — построение dashboard агентом с готовым процессом проверки и дополнительный Python-сервис допустим. Преимущество skills подтверждено чтением файлов; качество результата на наших данных ещё не проверялось.

### 5. HoloViz Panel — ещё один вариант с официальным прикладным skill

[Репозиторий](https://github.com/holoviz/panel). BSD-3-Clause. Python-фреймворк аналитических приложений с раскладками, виджетами, таблицами и интеграцией разных библиотек графиков. Типовой серверный запуск описан через `panel serve`. [Основные концепции](https://panel.holoviz.org/en/docs/latest/getting_started/core_concepts.html), [развёртывание](https://panel.holoviz.org/en/docs/latest/tutorials/basic/deploy.html).

Официальная документация рекомендует `holoviz-skills`. Прочитанный Panel skill содержит пример KPI dashboard, рекомендации по реактивности и состоянию, ссылки на реальные примеры, Playwright-тестирование, диагностику и проверку интерфейса. Это содержательная база для AI Skill, а не только рекомендация цвета и отступов. [Документация для AI](https://panel.holoviz.org/en/docs/latest/how_to/use_llms.html), [исходник skill](https://github.com/holoviz-dev/holoviz-skills/blob/main/developing-with-holoviz/skills/panel/SKILL.md).

Panel поддерживает также преобразование приложения для исполнения в браузере через Pyodide/PyScript. Поэтому дополнительный Python-сервер не является безусловным требованием для любого Panel dashboard. Но этот путь добавляет загрузку Python runtime и ограничения совместимости пакетов; Loginom → Python/WASM bridge отдельно не проверен. [Официальное описание конвертации и ограничений](https://panel.holoviz.org/en/docs/latest/how_to/wasm/convert.html).

Мой вывод: оставить рядом с Vizro для Python-варианта. Для непосредственного JS-встраивания в Loginom Perspective требует меньше разных технологий.

### 6. Apache Superset — когда нужна отдельная полноценная BI-платформа

[Репозиторий](https://github.com/apache/superset). Apache-2.0. Здесь уже есть собственное BI-приложение. Официальное встраивание dashboard предусматривает iframe/Embedded SDK, разрешённые домены и guest token, выдаваемый доверенным backend. Этот режим не равнозначен встраиванию полного редактора Superset. [Официальная документация embedding](https://superset.apache.org/user-docs/using-superset/embedding/).

Мой вывод: разумный ориентир для решения «Loginom + отдельная BI-система», если результаты доступны её источникам данных. Передача текущего браузерного массива узла не заменяет настройку источника, доступа и жизненного цикла dashboard.

## Что именно даёт Cube

[Cube Core](https://github.com/cube-js/cube) связывает источники данных с семантической моделью и API, предоставляет кеширование и средства контроля доступа. README прямо описывает Core как headless и отделяет его от коммерческого Cube с dashboard/workbooks. Лицензии также разделены: MIT для клиентских библиотек, Apache-2.0 для backend. [Первичный источник](https://github.com/cube-js/cube#readme).

Следовательно, Cube полезен, если нам нужна единая модель метрик и повторное использование данных несколькими приложениями. Для готового встроенного dashboard поверх результата узла потребуется выбрать и интегрировать ещё и frontend. Покупка коммерческого BI Cube — отдельный вариант, не свойство OSS Core. Это архитектурный вывод из описанного разграничения, а не результат теста продукта.

## Другие перспективные проекты

- **[UWData Mosaic](https://github.com/uwdata/mosaic)**: согласованные аналитические представления, `vgplot`, связанные выделения и вычисления через DuckDB, в том числе WASM. Хорошая основа генерируемой аналитики; в изученных материалах не обнаружен готовый универсальный редактор BI dashboard. Основная лицензия BSD-3-Clause, часть кода имеет ISC-условия. [Лицензия](https://raw.githubusercontent.com/uwdata/mosaic/main/LICENSE). Второй эшелон для браузерного прототипа.
- **[Rill](https://github.com/rilldata/rill)**: локальная разработка аналитики через SQL/YAML, DuckDB/ClickHouse, материалы для агентов. README отделяет Rill Developer от Cloud, где описывается embedding. Готовность нужного нам производственного self-hosted embedding именно в OSS-части не установлена; нельзя обещать её по общему списку функций продукта. [README](https://github.com/rilldata/rill/blob/main/README.md).
- **[GoView](https://github.com/dromara/go-view)**: MIT, визуальное построение экранов на Vue/ECharts. В README различаются чисто frontend-ветка `master` и вариант `master-fetch` с backend; актуальные обновления предлагается смотреть на Gitee. Ближе к дизайнеру визуальных экранов, чем к модели метрик и аналитическим запросам. Потребуются проверка актуальной версии и адаптер данных.
- **[Grafana Scenes](https://github.com/grafana/scenes)**: готовые раскладки и аналитические панели, но официальный путь установки рассчитан на Grafana app plugin. Перенос в произвольный Loginom-клиент не подтверждён документацией и требует дополнительной работы с окружением Grafana. [Setup](https://grafana.com/developers/scenes/).

## Привлекательные варианты, которые пока не стоит выбирать основой

### Dashbuilder: хороший формат, проблема с продолжением разработки

Клиентские dashboard, декларации YAML/JSON, встроенные данные/URL, публикация статических страниц и интеграция через сообщения подходят задаче по форме. [Официальная документация](https://www.dashbuilder.org/docs/). Но 23 апреля 2026 года в основной KIE Tools объединён PR удаления Dashbuilder из потока 10.3.x и далее. Проверенный npm-пакет остаётся на `10.2.0`. Это не доказательство прекращения всех возможных форков, но конкретная причина не брать проект новым стандартом без понятного владельца поддержки. [PR удаления](https://github.com/apache/incubator-kie-tools/pull/3540), [npm](https://registry.npmjs.org/%40kie-tools%2Fdashbuilder-client/latest).

### Supersubset: почти идеальное описание, но авторы предупреждают об экспериментальности

[Репозиторий](https://github.com/wandir-tech/supersubset). React Designer/Renderer, Puck, ECharts, JSON/YAML, Apache-2.0. Однако README прямо предупреждает о непригодности для production и возможном отсутствии дальнейшего сопровождения. Кроме того, нужен безопасный endpoint выполнения SQL; JSON-адаптер метаданных не устраняет эту потребность. Мой вывод: источник идей или экспериментальный прототип. [README](https://raw.githubusercontent.com/wandir-tech/supersubset/develop/README.md).

### Analytix: проверить происхождение пакетов и условия исходников

[Репозиторий](https://github.com/007krcs/analytics-builder). Есть реальный React builder с pivot/chart/KPI/report, а не только макет README. Но `@gridstorm/analytix-react` объявлен deprecated в пользу umbrella-пакета `gridstorm` с другим репозиторием в метаданных. В прочитанном исходнике компонента находится запретительный copyright-header, несмотря на MIT-позиционирование проекта. Пока расхождение не объяснено, уверенная рекомендация в качестве чисто MIT-компонента была бы преждевременной. [Исходник с header](https://github.com/007krcs/analytics-builder/blob/6265e783fe7c1631cbbf375c08b57b8a2af74288/packages/react/src/components/AnalyticsBuilder.tsx), [пакет Analytix](https://registry.npmjs.org/%40gridstorm%2Fanalytix-react/latest), [пакет gridstorm](https://registry.npmjs.org/gridstorm/latest).

### GitHub-доступность не всегда означает нужную открытую лицензию

- **Chartbrew**: текущий LICENSE использует FSL-1.1-MIT с коммерческим вариантом. Его нельзя описывать просто как MIT OSS для любого способа распространения. Развёртывание включает API, frontend, MySQL и Redis. [Лицензия](https://raw.githubusercontent.com/chartbrew/chartbrew/master/LICENSE.md), [compose](https://raw.githubusercontent.com/chartbrew/chartbrew/master/docker-compose.yml).
- **DataEase**: LICENSE ветки `dev-v3` содержит модифицированную GPLv3 с дополнительными условиями сохранения логотипа и уведомлений. Это требует отдельного разбора для брендированного встраивания. [Лицензия](https://raw.githubusercontent.com/dataease/dataease/dev-v3/LICENSE).
- **GoodData UI SDK**: проверенный LICENSE связывает использование с сервисом и подпиской GoodData. Публичный SDK не является независимой OSS BI-платформой для произвольного нашего backend. [Лицензия](https://raw.githubusercontent.com/gooddata/gooddata-ui-sdk/master/LICENSE).

Дополнительно просмотрены обзорные материалы **[Frappe Insights](https://github.com/frappe/insights)**, **[Redash](https://github.com/getredash/redash)**, **[Metabase](https://github.com/metabase/metabase)**, **[Grafana](https://github.com/grafana/grafana)** и **[Freeboard](https://github.com/Freeboard/freeboard)**. На уровне этого обзора не установлено преимущество, которое делало бы их более прямым путём к текущему браузерному результату узла, чем основной список. Это результат отбора по нашей задаче, а не аудит качества или всех коммерческих редакций этих проектов.

## Что найдено по готовым skills

Подтверждены чтением исходников:

1. **Vizro dashboard-design/dashboard-build**: наиболее близки к требованию «агент строит dashboard по задаче». Есть декларативная схема, workflow и функциональная проверка.
2. **HoloViz Panel skill**: подробная прикладная база для генерации dashboard, поведения виджетов, тестирования и диагностики.

Ссылки на конкретные файлы приведены в разделах проектов. По выполненным запросам к `skills.sh` специализированные карточки именно этих frameworks подтвердить не удалось; это ограничение поиска, а не утверждение об их отсутствии в каталоге. Официальные GitHub-skills уже существуют и не требуют выбирать framework по наличию карточки в рейтинге.

У Drizzle Cube есть agent/MCP-возможности и skills разработки самого проекта. Это не следует автоматически приравнивать к проверенному skill создания пользовательского dashboard. Для Perspective и Graphic Walker пригодны их декларативные API, но готовый специализированный skill того же уровня в этом исследовании не подтверждён.

## Как уточняется рекомендация для Loginom

1. **Первым проверить Perspective на реальных данных узла.** Минимальная проверка: несколько панелей, общий фильтр, создание конфигурации агентом, сохранение/восстановление и обновление после выполнения узла. Это проверка ещё не выполненной интеграционной гипотезы.
2. **Graphic Walker сравнивать, если важен визуальный редактор анализа.** Перед решением выяснить условия брендинга и проверить, сколько кода потребует общий dashboard.
3. **Drizzle Cube сравнивать при полезности отдельного SQL/семантического backend.** Он экономит разработку встроенного BI, но меняет путь доставки данных.
4. **Vizro и Panel рассматривать для генерируемых агентом Python-приложений.** Здесь уже есть официальные skills. Между ними Vizro ближе к декларативной модели dashboard; Panel даёт более общий реактивный инструментарий и отдельную WASM-возможность.
5. **Superset выбирать при потребности в самостоятельной BI-платформе. Cube — при потребности в семантическом слое.** Это разные задачи и разные объёмы инфраструктуры.

React/Vite/shadcn могут остаться оболочкой для особого оформления, но не обязаны быть основой всей аналитики. Загрузчик frontend-приложения в Loginom и выбор BI-движка — отдельные решения: ни один рассмотренный проект сам не добавляет кнопки Loginom, не получает данные выбранного узла и не определяет, где хранить привязку dashboard к нему.

## Воспроизводимость и границы доказательств

На дату проверки прочитаны метаданные опубликованных пакетов: `@perspective-dev/viewer` и `@perspective-dev/client` 5.6.1, `@kanaries/graphic-walker` 0.5.3, `drizzle-cube` 0.12.2, `@supersubset/runtime` 0.2.2, `@kie-tools/dashbuilder-client` 10.2.0. Для Perspective дополнительно прочитаны типы именно релиза 5.6.1. Это не запуск библиотек. Ссылки `latest` изменяются со временем; версия здесь фиксирует наблюдение.

Просмотренные ревизии исходников ключевых проектов: Perspective `444865accd46bcfdeb552960ce4f63fe8286de42`, Graphic Walker `87e8e51d2d8e2e32d6c763d32a3357fe29f379a0`, Drizzle Cube `f99329e74311fd2ca574e7be2d0aec08c50b734b`, Vizro `146b932464447c64ee5d19b67aef85ac244d59e2`, Analytix `6265e783fe7c1631cbbf375c08b57b8a2af74288`. Ветка разработки не автоматически совпадает с опубликованным релизом.

Не проверены: реальные объёмы данных Loginom, точность преобразования его типов, размер и время загрузки bundles/WASM, CSP/worker-ограничения клиента, изоляция CSS, пригодность русской локализации и поведение после обновления Loginom. Эти вопросы требуют небольшого интеграционного прототипа, а не дополнительных обещаний по README.
