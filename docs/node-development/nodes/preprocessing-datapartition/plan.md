# Разбиение на множества: подплан полного покрытия

Component ID: `component.preprocessing.DataPartition`. Slug: `preprocessing-datapartition`. [Карточка](README.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md).

В базе `5f772aea9` отдельный handler отсутствует. Наличие компонента в Help и историческом каталоге не является поддержкой runtime. Это документационный маршрут реализации; он не запускает Loginom, не назначает исполнителя и не повышает readiness.

## Полное поэтапное покрытие Help 7.4 — 2026-10-02

Снимок исходников: `5f772aea9de6414a19feb6ecc109a196c9e92453`. Исследованы официальные страницы ниже и существующие handlers; живой discovery, новые прогоны и реализация расширений не выполнялись. `accepted_scope_maintenance` означает сопровождение ранее принятого ограниченного объёма, а не новую CLI-приёмку. Все расширения имеют статус `discovery_required`; полное покрытие не достигается одним первым этапом.

### `preprocessing-datapartition:s1` — Размеры, приоритет и три выхода

Статус: `discovery_required`. Приоритет: P1. Покрывает: `preprocessing-datapartition:r01`, `preprocessing-datapartition:r02`.
Жёсткие предпосылки: `foundation:oracle-tabular`. Рекомендуется после: `preprocessing-sampling:s1`.
Условия среды: доступный компонент выбранной редакции Loginom 7.4; отдельный тестовый пакет и аккаунт.

- `preprocessing-datapartition:r01` — Train/test количество или процент, остаточный принцип при конфликте размеров, приоритет test. Источник: `preprocessing-datapartition:help1` Проверка: Полные membership трёх выходов, flag consistency и остаток; не требовать общего выхода равным всему входу.
- `preprocessing-datapartition:r02` — Приоритетное test: алгоритм/начало/конец; последовательный отбор sampled/unused размеров. Источник: `preprocessing-datapartition:help1` Проверка: Заданные RowID в начале/конце и точный порядок; все строки учтены без ложной потери.

### `preprocessing-datapartition:s2` — Все методы сэмплинга и seed

Статус: `discovery_required`. Приоритет: P2. Покрывает: `preprocessing-datapartition:r03`, `preprocessing-datapartition:r04`.
Жёсткие предпосылки: `preprocessing-datapartition:s1`. Рекомендуется после: `preprocessing-sampling:s2`.
Условия среды: доступный компонент выбранной редакции Loginom 7.4; отдельный тестовый пакет и аккаунт.

- `preprocessing-datapartition:r03` — Random, uniform с группами, stratified поля, bias factor/явное количество. Источник: `preprocessing-datapartition:help1` Проверка: Матрица пяти методов, неодинаковые классы и несколько strata; проверить кратности и разбиение.
- `preprocessing-datapartition:r04` — Seed fixed/always-random/generate/copy и повторное разбиение. Источник: `preprocessing-datapartition:help1` Проверка: Одинаковые входы/seed дают одинаковые множества; настройки сохраняются после reopen.

### Реализация и общие контракты

Нового handler нет. Использовать multi-output подход filter и shared execution binding для всех трёх выходов. Название «обучающий набор» не означает обучение самого узла или зависимость ML от этого handler.

Проверенные точки переиспользования: [общая tabular shell](../../../../packages/loginom-runtime/client/lib/calculator-node.mjs), [ближайший handler](../../../../packages/loginom-runtime/client/lib/filter-node.mjs), [адресные проверки аналога](../../../../packages/loginom-runtime/client/test/filter-parameters.test.mjs). Это исходники для расширения, не доказательства реализации нового узла.

Переиспользовать `node.apply` с pure validation до эффектов, общий gate/journal/deadline и наблюдаемые node/port identities. Для новых возможностей актуализировать node registry/contracts, parameter schema, driver/readback, compact user-v1 и адресные tests; имена полей/режимов API закрепить после discovery. Публичный новый контракт и уточнённые критерии приёмки согласуются до runtime-изменения. Названия Help не являются готовыми runtime enum.

Общие зависимости раскрыты в [приёмке](../../foundations/acceptance/plan.md), [типизированных портах](../../foundations/typed-ports/plan.md), [динамической схеме](../../foundations/dynamic-schema/plan.md), [обучении](../../foundations/training/plan.md) и [внешних системах](../../foundations/external-systems/plan.md). `recommended_after` передаёт опыт; самостоятельный fixture позволяет начинать без готового парного import/export либо аналитического предшественника.

### Дополнительные самостоятельные fixtures

RowID=1..20. Приоритет test в начале с 5 строками закрепляет test=[1..5]; train 10 выбирается только из остатка. Общий выход содержит 15 строк, test flag true ровно 5, train/test не пересекаются. Наборы для последующего ML допустимо подавать готовыми файлами.

Перед автономным прогоном разместить задачу и входы отдельно от `expected`/oracle; указать точные типы, NULL, порядок там, где он значим, и числовую точность. Неоднозначную формулу/тип/границу сначала подтвердить отдельной диагностикой, затем заморозить ожидания. Сохранённые исторические fixtures, если перечислены выше, используются в исходных границах.

### Приёмка и восстановление

- Для каждого требования выполнить new/existing, Done/Close/Execute там, где применимо; проверить сохранённые настройки, свежий результат и save/reopen. Положительный тест сопровождается отказом на неверные типы/поля/порты.
- Адресные tests запускаются из пакета; oracle проверяется намеренной подменой значения, порядка, схемы и execution identity. Полный небольшой результат проверяется независимо; preview или старый PASS не доказывает новый этап.
- Один operation_id не допускает повторного эффекта. Потерянный ответ и expiry сохраняют неоднозначность до штатного inspect/recover; дедлайн не продлевается. Cancel закрывает только принадлежащий операции draft, чужие узлы/связи неизменны.
- Cold-check должен поддерживать именно заявленный вид результата, число выходов и точность. Текущий базовый скрипт читает один tabular output 0 и сравнивает строки без порядка; такие ограничения устраняются в prerequisite до зависимой приёмки.
- PASS требует чистый source SHA, pins клиента/runtime/модели/платформы, независимый oracle и подтверждённые `package_closed=true`, `logged_out=true`. Неисполненные строки остаются NOT_RUN; сохранение/технический успех/аналитика/интеграция/выпуск различаются. Checkpoint — до 20 строк, с результатом, ограничениями и следующим этапом.

### Проверенные официальные источники

- `preprocessing-datapartition:help1` — [Разбиение на множества](https://help.loginom.ru/userguide/processors/preprocessing/partitioning.html), Help 7.4, прочитано 2026-10-02.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `preprocessing-datapartition:s1` | Исследование и необучаемая предобработка | preprocessing-datapartition | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `preprocessing-datapartition:s2` | Исследование и необучаемая предобработка | preprocessing-datapartition | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
