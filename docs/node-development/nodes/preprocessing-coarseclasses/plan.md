# Конечные классы: подплан полного покрытия

Component ID: `component.preprocessing.CoarseClasses`. Slug: `preprocessing-coarseclasses`. [Карточка](README.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md).

В базе `5f772aea9` отдельный handler отсутствует. Наличие компонента в Help и историческом каталоге не является поддержкой runtime. Это документационный маршрут реализации; он не запускает Loginom, не назначает исполнителя и не повышает readiness.

## Полное поэтапное покрытие Help 7.4 — 2026-10-02

Снимок исходников: `5f772aea9de6414a19feb6ecc109a196c9e92453`. Исследованы официальные страницы ниже и существующие handlers; живой discovery, новые прогоны и реализация расширений не выполнялись. `accepted_scope_maintenance` означает сопровождение ранее принятого ограниченного объёма, а не новую CLI-приёмку. Все расширения имеют статус `discovery_required`; полное покрытие не достигается одним первым этапом.

### `preprocessing-coarseclasses:s1` — Автоматическое построение и три выхода

Статус: `discovery_required`. Приоритет: P3. Покрывает: `preprocessing-coarseclasses:r01`, `preprocessing-coarseclasses:r02`.
Жёсткие предпосылки: `foundation:oracle-tabular`, `foundation:training`. Рекомендуется после: нет.
Условия среды: доступный компонент выбранной редакции Loginom 7.4; отдельный тестовый пакет и аккаунт.

- `preprocessing-coarseclasses:r01` — Роли unused/input/output, event value; continuous prebin/count/inclusivity, discrete initial classes. Источник: `preprocessing-coarseclasses:help1`, `preprocessing-coarseclasses:help3` Проверка: Сверить роли и 3 output schemas; исходные поля неизменны, class id начинается с 0.
- `preprocessing-coarseclasses:r02` — Минимальная доля, максимум классов, равномерность; WoE/IV, значимость, counts/fractions. Источник: `preprocessing-coarseclasses:help1`, `preprocessing-coarseclasses:help3` Проверка: Разные ограничения на одном fixture; независимые totals и model statistics, не только class labels.

### `preprocessing-coarseclasses:s2` — Внешнее разбиение

Статус: `discovery_required`. Приоритет: P3. Покрывает: `preprocessing-coarseclasses:r03`.
Жёсткие предпосылки: `preprocessing-coarseclasses:s1`. Рекомендуется после: нет.
Условия среды: доступный компонент выбранной редакции Loginom 7.4; отдельный тестовый пакет и аккаунт.

- `preprocessing-coarseclasses:r03` — Continuous ColumnName/UpperBound/IncludeUpperBound и discrete UniqueValue/ClassNumber. Источник: `preprocessing-coarseclasses:help2` Проверка: Строго возрастающие границы и постоянная inclusivity; повтор category, NULL, неверные поля; нет зависимости от Binning.

### `preprocessing-coarseclasses:s3` — Ручная корректировка и заморозка

Статус: `discovery_required`. Приоритет: P4. Покрывает: `preprocessing-coarseclasses:r04`, `preprocessing-coarseclasses:r05`.
Жёсткие предпосылки: `preprocessing-coarseclasses:s1`. Рекомендуется после: нет.
Условия среды: доступный компонент выбранной редакции Loginom 7.4; отдельный тестовый пакет и аккаунт.

- `preprocessing-coarseclasses:r04` — Merge previous/next, split boundary, freeze/unfreeze, Apply/Cancel, IV versus class count. Источник: `preprocessing-coarseclasses:help3`, `preprocessing-coarseclasses:help4` Проверка: Сохранить ручные границы; frozen apply/retrain сохраняет разделение и обновляет только статистику.
- `preprocessing-coarseclasses:r05` — Табличная/диаграммная детализация, доли/количества и фильтр/сортировка входных полей. Источник: `preprocessing-coarseclasses:help4` Проверка: Представления согласованы с тройным output; изменение вида не меняет модель.

### Реализация и общие контракты

Нового handler нет. Основа — training lifecycle, three-output reader и optional range input. WoE/IV oracle вычислять независимо от UI; frozen поля сохраняют разбиение при переобучении и обновляют статистику.

Проверенные точки переиспользования: [общая tabular shell](../../../../packages/loginom-runtime/client/lib/calculator-node.mjs), [ближайший handler](../../../../packages/loginom-runtime/client/lib/filter-node.mjs), [адресные проверки аналога](../../../../packages/loginom-runtime/client/test/node-read.test.mjs). Это исходники для расширения, не доказательства реализации нового узла.

Переиспользовать `node.apply` с pure validation до эффектов, общий gate/journal/deadline и наблюдаемые node/port identities. Для новых возможностей актуализировать node registry/contracts, parameter schema, driver/readback, compact user-v1 и адресные tests; имена полей/режимов API закрепить после discovery. Публичный новый контракт и уточнённые критерии приёмки согласуются до runtime-изменения. Названия Help не являются готовыми runtime enum.

Общие зависимости раскрыты в [приёмке](../../foundations/acceptance/plan.md), [типизированных портах](../../foundations/typed-ports/plan.md), [динамической схеме](../../foundations/dynamic-schema/plan.md), [обучении](../../foundations/training/plan.md) и [внешних системах](../../foundations/external-systems/plan.md). `recommended_after` передаёт опыт; самостоятельный fixture позволяет начинать без готового парного import/export либо аналитического предшественника.

### Дополнительные самостоятельные fixtures

20 строк, binary target: класс A содержит 2 events/8 non-events, B —8/2. Фиксированное внешнее разбиение A/B позволяет вручную проверить counts/fractions и WoE/IV после фиксации знака и обработки нулевых частот. Отдельно numeric границы 10/20 и категориальные NULL/empty.

Перед автономным прогоном разместить задачу и входы отдельно от `expected`/oracle; указать точные типы, NULL, порядок там, где он значим, и числовую точность. Неоднозначную формулу/тип/границу сначала подтвердить отдельной диагностикой, затем заморозить ожидания. Сохранённые исторические fixtures, если перечислены выше, используются в исходных границах.

### Приёмка и восстановление

- Для каждого требования выполнить new/existing, Done/Close/Execute там, где применимо; проверить сохранённые настройки, свежий результат и save/reopen. Положительный тест сопровождается отказом на неверные типы/поля/порты.
- Адресные tests запускаются из пакета; oracle проверяется намеренной подменой значения, порядка, схемы и execution identity. Полный небольшой результат проверяется независимо; preview или старый PASS не доказывает новый этап.
- Один operation_id не допускает повторного эффекта. Потерянный ответ и expiry сохраняют неоднозначность до штатного inspect/recover; дедлайн не продлевается. Cancel закрывает только принадлежащий операции draft, чужие узлы/связи неизменны.
- Cold-check должен поддерживать именно заявленный вид результата, число выходов и точность. Текущий базовый скрипт читает один tabular output 0 и сравнивает строки без порядка; такие ограничения устраняются в prerequisite до зависимой приёмки.
- PASS требует чистый source SHA, pins клиента/runtime/модели/платформы, независимый oracle и подтверждённые `package_closed=true`, `logged_out=true`. Неисполненные строки остаются NOT_RUN; сохранение/технический успех/аналитика/интеграция/выпуск различаются. Checkpoint — до 20 строк, с результатом, ограничениями и следующим этапом.

### Проверенные официальные источники

- `preprocessing-coarseclasses:help1` — [Конечные классы](https://help.loginom.ru/userguide/processors/preprocessing/coarse-classes.html), Help 7.4, прочитано 2026-10-02.
- `preprocessing-coarseclasses:help2` — [Настройка внешнего разбиения](https://help.loginom.ru/userguide/processors/preprocessing/coarse-classes/configure-external-binning.html), Help 7.4, прочитано 2026-10-02.
- `preprocessing-coarseclasses:help3` — [Настройка назначений столбцов](https://help.loginom.ru/userguide/processors/preprocessing/coarse-classes/configure-column-usage-types.html), Help 7.4, прочитано 2026-10-02.
- `preprocessing-coarseclasses:help4` — [Настройка конечных классов](https://help.loginom.ru/userguide/processors/preprocessing/coarse-classes/configure-coarse-classes.html), Help 7.4, прочитано 2026-10-02.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `preprocessing-coarseclasses:s1` | Обучаемая предобработка и неконтролируемые модели | preprocessing-coarseclasses | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `preprocessing-coarseclasses:s2` | Обучаемая предобработка и неконтролируемые модели | preprocessing-coarseclasses | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `preprocessing-coarseclasses:s3` | Обучаемая предобработка и неконтролируемые модели | preprocessing-coarseclasses | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
