# Сэмплинг: подплан полного покрытия

Component ID: `component.preprocessing.Sampling`. Slug: `preprocessing-sampling`. [Карточка](README.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md).

В базе `5f772aea9` отдельный handler отсутствует. Наличие компонента в Help и историческом каталоге не является поддержкой runtime. Это документационный маршрут реализации; он не запускает Loginom, не назначает исполнителя и не повышает readiness.

## Полное поэтапное покрытие Help 7.4 — 2026-10-02

Снимок исходников: `5f772aea9de6414a19feb6ecc109a196c9e92453`. Исследованы официальные страницы ниже и существующие handlers; живой discovery, новые прогоны и реализация расширений не выполнялись. `accepted_scope_maintenance` означает сопровождение ранее принятого ограниченного объёма, а не новую CLI-приёмку. Все расширения имеют статус `discovery_required`; полное покрытие не достигается одним первым этапом.

### `preprocessing-sampling:s1` — Последовательный и базовый случайный отбор

Статус: `discovery_required`. Приоритет: P1. Покрывает: `preprocessing-sampling:r01`, `preprocessing-sampling:r02`.
Жёсткие предпосылки: `foundation:oracle-tabular`. Рекомендуется после: нет.
Условия среды: доступный компонент выбранной редакции Loginom 7.4; отдельный тестовый пакет и аккаунт.

- `preprocessing-sampling:r01` — Размер в строках/процентах; sequential начало/конец; random/uniform и размер группы. Источник: `preprocessing-sampling:help1` Проверка: Точный sequential результат, число строк, membership и fixed seed repeatability.
- `preprocessing-sampling:r02` — Seed заданный/всегда случайно/генерировать/копировать, поведение повторного запуска. Источник: `preprocessing-sampling:help1` Проверка: Не требовать одинаковые случайные результаты при different/always-random seed.

### `preprocessing-sampling:s2` — Стратификация и смещение

Статус: `discovery_required`. Приоритет: P2. Покрывает: `preprocessing-sampling:r03`, `preprocessing-sampling:r04`.
Жёсткие предпосылки: `preprocessing-sampling:s1`. Рекомендуется после: нет.
Условия среды: доступный компонент выбранной редакции Loginom 7.4; отдельный тестовый пакет и аккаунт.

- `preprocessing-sampling:r03` — Stratified по нескольким полям; полнота уникальных значений включена/выключена. Источник: `preprocessing-sampling:help1` Проверка: При fullness=true все страты представлены либо явная ошибка при невозможном размере; при fullness=false не требовать присутствия всех страт. Независимый oracle проверяет размер и допустимость состава в обоих режимах.
- `preprocessing-sampling:r04` — Bias по полю/уникальному значению и положительному фактору, граница 10000 уникальных. Источник: `preprocessing-sampling:help1` Проверка: Размер/кратности заданного класса и отрицательные/нулевые параметры; вероятностные ожидания не подменять точным неподтверждённым списком.

### Реализация и общие контракты

Нового handler нет. Реализовать самостоятельный sampling editor и single-table output на общей shell. Seed semantics не распространять на stratified/bias: Help гарантирует repeatability random/uniform.

Проверенные точки переиспользования: [общая tabular shell](../../../../packages/loginom-runtime/client/lib/calculator-node.mjs), [ближайший handler](../../../../packages/loginom-runtime/client/lib/filter-node.mjs), [адресные проверки аналога](../../../../packages/loginom-runtime/client/test/filter-parameters.test.mjs). Это исходники для расширения, не доказательства реализации нового узла.

Переиспользовать `node.apply` с pure validation до эффектов, общий gate/journal/deadline и наблюдаемые node/port identities. Для новых возможностей актуализировать node registry/contracts, parameter schema, driver/readback, compact user-v1 и адресные tests; имена полей/режимов API закрепить после discovery. Публичный новый контракт и уточнённые критерии приёмки согласуются до runtime-изменения. Названия Help не являются готовыми runtime enum.

Общие зависимости раскрыты в [приёмке](../../foundations/acceptance/plan.md), [типизированных портах](../../foundations/typed-ports/plan.md), [динамической схеме](../../foundations/dynamic-schema/plan.md), [обучении](../../foundations/training/plan.md) и [внешних системах](../../foundations/external-systems/plan.md). `recommended_after` передаёт опыт; самостоятельный fixture позволяет начинать без готового парного import/export либо аналитического предшественника.

### Дополнительные самостоятельные fixtures

RowID=1..20, Class=A для 1..10 и B для 11..20. Sequential first/last 5 →[1..5]/[16..20]. 25% →5 строк. Random/uniform same seed →тот же состав при тех же входных данных; stratified size1 при включённой полноте двух классов должен отказать; тот же size1 при выключенной полноте допускает отсутствие одного класса и не должен выдавать ошибку невозможности обеспечить полноту.

Перед автономным прогоном разместить задачу и входы отдельно от `expected`/oracle; указать точные типы, NULL, порядок там, где он значим, и числовую точность. Неоднозначную формулу/тип/границу сначала подтвердить отдельной диагностикой, затем заморозить ожидания. Сохранённые исторические fixtures, если перечислены выше, используются в исходных границах.

### Приёмка и восстановление

- Для каждого требования выполнить new/existing, Done/Close/Execute там, где применимо; проверить сохранённые настройки, свежий результат и save/reopen. Положительный тест сопровождается отказом на неверные типы/поля/порты.
- Адресные tests запускаются из пакета; oracle проверяется намеренной подменой значения, порядка, схемы и execution identity. Полный небольшой результат проверяется независимо; preview или старый PASS не доказывает новый этап.
- Один operation_id не допускает повторного эффекта. Потерянный ответ и expiry сохраняют неоднозначность до штатного inspect/recover; дедлайн не продлевается. Cancel закрывает только принадлежащий операции draft, чужие узлы/связи неизменны.
- Cold-check должен поддерживать именно заявленный вид результата, число выходов и точность. Текущий базовый скрипт читает один tabular output 0 и сравнивает строки без порядка; такие ограничения устраняются в prerequisite до зависимой приёмки.
- PASS требует чистый source SHA, pins клиента/runtime/модели/платформы, независимый oracle и подтверждённые `package_closed=true`, `logged_out=true`. Неисполненные строки остаются NOT_RUN; сохранение/технический успех/аналитика/интеграция/выпуск различаются. Checkpoint — до 20 строк, с результатом, ограничениями и следующим этапом.

### Проверенные официальные источники

- `preprocessing-sampling:help1` — [Сэмплинг](https://help.loginom.ru/userguide/processors/preprocessing/sampling.html), Help 7.4, прочитано 2026-10-02.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `preprocessing-sampling:s1` | Исследование и необучаемая предобработка | preprocessing-sampling | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `preprocessing-sampling:s2` | Исследование и необучаемая предобработка | preprocessing-sampling | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
