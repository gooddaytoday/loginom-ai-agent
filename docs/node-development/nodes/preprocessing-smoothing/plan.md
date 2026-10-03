# Сглаживание: подплан полного покрытия

Component ID: `component.preprocessing.Smoothing`. Slug: `preprocessing-smoothing`. [Карточка](README.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md).

В базе `5f772aea9` отдельный handler отсутствует. Наличие компонента в Help и историческом каталоге не является поддержкой runtime. Это документационный маршрут реализации; он не запускает Loginom, не назначает исполнителя и не повышает readiness.

## Полное поэтапное покрытие Help 7.4 — 2026-10-02

Снимок исходников: `5f772aea9de6414a19feb6ecc109a196c9e92453`. Исследованы официальные страницы ниже и существующие handlers; живой discovery, новые прогоны и реализация расширений не выполнялись. `accepted_scope_maintenance` означает сопровождение ранее принятого ограниченного объёма, а не новую CLI-приёмку. Все расширения имеют статус `discovery_required`; полное покрытие не достигается одним первым этапом.

### `preprocessing-smoothing:s1` — Ходрик–Прескотт

Статус: `discovery_required`. Приоритет: P2. Покрывает: `preprocessing-smoothing:r01`, `preprocessing-smoothing:r02`.
Жёсткие предпосылки: `foundation:oracle-tabular`. Рекомендуется после: нет.
Условия среды: доступный компонент выбранной редакции Loginom 7.4; отдельный тестовый пакет и аккаунт.

- `preprocessing-smoothing:r01` — Выбор continuous numeric полей, Lambda или связанный период сглаживания; исходные плюс smoothed поля. Источник: `preprocessing-smoothing:help1` Проверка: Числовой oracle и обе связанные настройки; не принимать Lambda=0 только из теоретического описания, UI минимум 0.0625.
- `preprocessing-smoothing:r02` — Пропуски HP и сохранение порядка/неизменных полей. Источник: `preprocessing-smoothing:help1` Проверка: Interior/edge/all-null cases; точные статусы невозможного расчёта и сохранённая конфигурация.

### `preprocessing-smoothing:s2` — Три семейства вейвлетов

Статус: `discovery_required`. Приоритет: P3. Покрывает: `preprocessing-smoothing:r03`, `preprocessing-smoothing:r04`.
Жёсткие предпосылки: `preprocessing-smoothing:s1`. Рекомендуется после: нет.
Условия среды: доступный компонент выбранной редакции Loginom 7.4; отдельный тестовый пакет и аккаунт.

- `preprocessing-smoothing:r03` — Добеши order1..10, Койфлеты1..5, CDF9/7 без order; depth1..10. Источник: `preprocessing-smoothing:help1` Проверка: Каждая family на собственном детерминированном ряду, малые длины и границы параметров.
- `preprocessing-smoothing:r04` — Семь продолжений границ и предварительная линейная интерполяция NULL. Источник: `preprocessing-smoothing:help1` Проверка: Симметричное/антисимметричное с/без крайней точки, нули, constant, periodic сравнить с независимым oracle.

### Реализация и общие контракты

Нового handler нет. Использовать field-specific editor аналогично missing-values, общую scalar shell и ordered oracle. Узел принимает continuous integer/real; входная сортировка задаётся fixture, а не обязательным Sorting handler.

Проверенные точки переиспользования: [общая tabular shell](../../../../packages/loginom-runtime/client/lib/calculator-node.mjs), [ближайший handler](../../../../packages/loginom-runtime/client/lib/missing-values-node.mjs), [адресные проверки аналога](../../../../packages/loginom-runtime/client/test/missing-values-parameters.test.mjs). Это исходники для расширения, не доказательства реализации нового узла.

Переиспользовать `node.apply` с pure validation до эффектов, общий gate/journal/deadline и наблюдаемые node/port identities. Для новых возможностей актуализировать node registry/contracts, parameter schema, driver/readback, compact user-v1 и адресные tests; имена полей/режимов API закрепить после discovery. Публичный новый контракт и уточнённые критерии приёмки согласуются до runtime-изменения. Названия Help не являются готовыми runtime enum.

Общие зависимости раскрыты в [приёмке](../../foundations/acceptance/plan.md), [типизированных портах](../../foundations/typed-ports/plan.md), [динамической схеме](../../foundations/dynamic-schema/plan.md), [обучении](../../foundations/training/plan.md) и [внешних системах](../../foundations/external-systems/plan.md). `recommended_after` передаёт опыт; самостоятельный fixture позволяет начинать без готового парного import/export либо аналитического предшественника.

### Дополнительные самостоятельные fixtures

Непрерывный ряд [2,2,2,2,2,2,2,2] проверяет сохранение константы подходящими граничными режимами; ряд [1,2,NULL,4,5,6,7,8] проверяет разные NULL политики HP и wavelet. Для HP независимое решение системы минимума; для wavelet отдельная реализация с тем же extension convention.

Перед автономным прогоном разместить задачу и входы отдельно от `expected`/oracle; указать точные типы, NULL, порядок там, где он значим, и числовую точность. Неоднозначную формулу/тип/границу сначала подтвердить отдельной диагностикой, затем заморозить ожидания. Сохранённые исторические fixtures, если перечислены выше, используются в исходных границах.

### Приёмка и восстановление

- Для каждого требования выполнить new/existing, Done/Close/Execute там, где применимо; проверить сохранённые настройки, свежий результат и save/reopen. Положительный тест сопровождается отказом на неверные типы/поля/порты.
- Адресные tests запускаются из пакета; oracle проверяется намеренной подменой значения, порядка, схемы и execution identity. Полный небольшой результат проверяется независимо; preview или старый PASS не доказывает новый этап.
- Один operation_id не допускает повторного эффекта. Потерянный ответ и expiry сохраняют неоднозначность до штатного inspect/recover; дедлайн не продлевается. Cancel закрывает только принадлежащий операции draft, чужие узлы/связи неизменны.
- Cold-check должен поддерживать именно заявленный вид результата, число выходов и точность. Текущий базовый скрипт читает один tabular output 0 и сравнивает строки без порядка; такие ограничения устраняются в prerequisite до зависимой приёмки.
- PASS требует чистый source SHA, pins клиента/runtime/модели/платформы, независимый oracle и подтверждённые `package_closed=true`, `logged_out=true`. Неисполненные строки остаются NOT_RUN; сохранение/технический успех/аналитика/интеграция/выпуск различаются. Checkpoint — до 20 строк, с результатом, ограничениями и следующим этапом.

### Проверенные официальные источники

- `preprocessing-smoothing:help1` — [Сглаживание](https://help.loginom.ru/userguide/processors/preprocessing/smoothing.html), Help 7.4, прочитано 2026-10-02.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `preprocessing-smoothing:s1` | Исследование и необучаемая предобработка | preprocessing-smoothing | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `preprocessing-smoothing:s2` | Исследование и необучаемая предобработка | preprocessing-smoothing | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
