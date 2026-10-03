# Редактирование выбросов: подплан полного покрытия

Component ID: `component.preprocessing.Elimoutlier`. Slug: `preprocessing-elimoutlier`. [Карточка](README.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md).

В базе `5f772aea9` отдельный handler отсутствует. Наличие компонента в Help и историческом каталоге не является поддержкой runtime. Это документационный маршрут реализации; он не запускает Loginom, не назначает исполнителя и не повышает readiness.

## Полное поэтапное покрытие Help 7.4 — 2026-10-02

Снимок исходников: `5f772aea9de6414a19feb6ecc109a196c9e92453`. Исследованы официальные страницы ниже и существующие handlers; живой discovery, новые прогоны и реализация расширений не выполнялись. `accepted_scope_maintenance` означает сопровождение ранее принятого ограниченного объёма, а не новую CLI-приёмку. Все расширения имеют статус `discovery_required`; полное покрытие не достигается одним первым этапом.

### `preprocessing-elimoutlier:s1` — Выявление и независимые выходы

Статус: `discovery_required`. Приоритет: P2. Покрывает: `preprocessing-elimoutlier:r01`, `preprocessing-elimoutlier:r02`.
Жёсткие предпосылки: `foundation:oracle-tabular`. Рекомендуется после: нет.
Условия среды: доступный компонент выбранной редакции Loginom 7.4; отдельный тестовый пакет и аккаунт.

- `preprocessing-elimoutlier:r01` — Стандартное отклонение или IQR, раздельные множители для выбросов/экстремумов, выбор полей и ordered. Источник: `preprocessing-elimoutlier:help1` Проверка: До модели зафиксировать SD/quartile convention и пограничное equality; проверить исходный RowID каждого flagged ряда.
- `preprocessing-elimoutlier:r02` — Основной выход, выбросы и экстремальные строки. Источник: `preprocessing-elimoutlier:help1` Проверка: Все три схемы и составы из одного execution; untouched поля сохранены.

### `preprocessing-elimoutlier:s2` — Все методы редактирования

Статус: `discovery_required`. Приоритет: P3. Покрывает: `preprocessing-elimoutlier:r03`.
Жёсткие предпосылки: `preprocessing-elimoutlier:s1`. Рекомендуется после: нет.
Условия среды: доступный компонент выбранной редакции Loginom 7.4; отдельный тестовый пакет и аккаунт.

- `preprocessing-elimoutlier:r03` — Оставить/удалить/mean/median/most-probable/constant/ограничить; отдельная политика двух классов аномалий. Источник: `preprocessing-elimoutlier:help1` Проверка: Каждый метод на малом fixture; применимость type×kind×ordered по Help, точные границы clip и строки delete.

### Реализация и общие контракты

Нового handler нет. Field-list editor и applicability checks брать из missing-values; три выхода привязать к одному выполнению через multi-output механизм filter. Не считать output outliers/extremes автоматически взаимно исключающимися до live проверки.

Проверенные точки переиспользования: [общая tabular shell](../../../../packages/loginom-runtime/client/lib/calculator-node.mjs), [ближайший handler](../../../../packages/loginom-runtime/client/lib/missing-values-node.mjs), [адресные проверки аналога](../../../../packages/loginom-runtime/client/test/missing-values-parameters.test.mjs). Это исходники для расширения, не доказательства реализации нового узла.

Переиспользовать `node.apply` с pure validation до эффектов, общий gate/journal/deadline и наблюдаемые node/port identities. Для новых возможностей актуализировать node registry/contracts, parameter schema, driver/readback, compact user-v1 и адресные tests; имена полей/режимов API закрепить после discovery. Публичный новый контракт и уточнённые критерии приёмки согласуются до runtime-изменения. Названия Help не являются готовыми runtime enum.

Общие зависимости раскрыты в [приёмке](../../foundations/acceptance/plan.md), [типизированных портах](../../foundations/typed-ports/plan.md), [динамической схеме](../../foundations/dynamic-schema/plan.md), [обучении](../../foundations/training/plan.md) и [внешних системах](../../foundations/external-systems/plan.md). `recommended_after` передаёт опыт; самостоятельный fixture позволяет начинать без готового парного import/export либо аналитического предшественника.

### Дополнительные самостоятельные fixtures

Самостоятельный numeric ряд из двадцати нулей и значений 10,100, плюс RowID и необрабатываемое поле. Статистику, threshold и классификацию заранее вычислить независимым oracle с подтверждённой формулой dispersion/quantile. Для replacement constant=-1 точные изменённые cells известны после фиксации принадлежности.

Перед автономным прогоном разместить задачу и входы отдельно от `expected`/oracle; указать точные типы, NULL, порядок там, где он значим, и числовую точность. Неоднозначную формулу/тип/границу сначала подтвердить отдельной диагностикой, затем заморозить ожидания. Сохранённые исторические fixtures, если перечислены выше, используются в исходных границах.

### Приёмка и восстановление

- Для каждого требования выполнить new/existing, Done/Close/Execute там, где применимо; проверить сохранённые настройки, свежий результат и save/reopen. Положительный тест сопровождается отказом на неверные типы/поля/порты.
- Адресные tests запускаются из пакета; oracle проверяется намеренной подменой значения, порядка, схемы и execution identity. Полный небольшой результат проверяется независимо; preview или старый PASS не доказывает новый этап.
- Один operation_id не допускает повторного эффекта. Потерянный ответ и expiry сохраняют неоднозначность до штатного inspect/recover; дедлайн не продлевается. Cancel закрывает только принадлежащий операции draft, чужие узлы/связи неизменны.
- Cold-check должен поддерживать именно заявленный вид результата, число выходов и точность. Текущий базовый скрипт читает один tabular output 0 и сравнивает строки без порядка; такие ограничения устраняются в prerequisite до зависимой приёмки.
- PASS требует чистый source SHA, pins клиента/runtime/модели/платформы, независимый oracle и подтверждённые `package_closed=true`, `logged_out=true`. Неисполненные строки остаются NOT_RUN; сохранение/технический успех/аналитика/интеграция/выпуск различаются. Checkpoint — до 20 строк, с результатом, ограничениями и следующим этапом.

### Проверенные официальные источники

- `preprocessing-elimoutlier:help1` — [Редактирование выбросов](https://help.loginom.ru/userguide/processors/preprocessing/eliminate-outliers.html), Help 7.4, прочитано 2026-10-02.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `preprocessing-elimoutlier:s1` | Исследование и необучаемая предобработка | preprocessing-elimoutlier | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `preprocessing-elimoutlier:s2` | Исследование и необучаемая предобработка | preprocessing-elimoutlier | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
