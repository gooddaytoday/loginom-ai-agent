# Квантование: подплан полного покрытия

Component ID: `component.preprocessing.Binning`. Slug: `preprocessing-binning`. [Карточка](README.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md).

В базе `5f772aea9` отдельный handler отсутствует. Наличие компонента в Help и историческом каталоге не является поддержкой runtime. Это документационный маршрут реализации; он не запускает Loginom, не назначает исполнителя и не повышает readiness.

## Полное поэтапное покрытие Help 7.4 — 2026-10-02

Снимок исходников: `5f772aea9de6414a19feb6ecc109a196c9e92453`. Исследованы официальные страницы ниже и существующие handlers; живой discovery, новые прогоны и реализация расширений не выполнялись. `accepted_scope_maintenance` означает сопровождение ранее принятого ограниченного объёма, а не новую CLI-приёмку. Все расширения имеют статус `discovery_required`; полное покрытие не достигается одним первым этапом.

### `preprocessing-binning:s1` — Внутренние интервалы и сохранённая модель

Статус: `discovery_required`. Приоритет: P3. Покрывает: `preprocessing-binning:r01`, `preprocessing-binning:r02`.
Жёсткие предпосылки: `foundation:oracle-tabular`, `foundation:training`. Рекомендуется после: нет.
Условия среды: доступный компонент выбранной редакции Loginom 7.4; отдельный тестовый пакет и аккаунт.

- `preprocessing-binning:r01` — Integer/Real/DateTime: Width/count/tiles/SD coefficients, auto/manual bounds, округление и открытые края. Источник: `preprocessing-binning:help1` Проверка: Для каждого метода сверить интервалы, настройки и assignments; отдельная матрица Integer/Real/DateTime и недоступность String/Boolean/Variant без неявного преобразования. Train→новые данные→apply не пересчитывает старую модель.
- `preprocessing-binning:r02` — Tiles из количества/сумм и пять правил совпадающих значений; manual editing, invert boundary type, histogram/label template. Источник: `preprocessing-binning:help1` Проверка: Повторяющиеся boundary values, число интервалов/объёмы, ручная правка и отсутствие лишнего retrain.

### `preprocessing-binning:s2` — Внешние диапазоны и оба результата

Статус: `discovery_required`. Приоритет: P3. Покрывает: `preprocessing-binning:r03`, `preprocessing-binning:r04`.
Жёсткие предпосылки: `preprocessing-binning:s1`. Рекомендуется после: нет.
Условия среды: доступный компонент выбранной редакции Loginom 7.4; отдельный тестовый пакет и аккаунт.

- `preprocessing-binning:r03` — External range mapping: identifier/type/index/bounds/label/quotas/open ends и приоритет полей над checkbox. Источник: `preprocessing-binning:help2` Проверка: Собственная range table без готового Binning-предшественника; required/optional fields и defaults.
- `preprocessing-binning:r04` — Выходная таблица: interval id/label/bounds/inclusivity/outside; ranges output с type codes и точечными интервалами. Источник: `preprocessing-binning:help3`, `preprocessing-binning:help4` Проверка: Сверить оба outputs, NULL quotas для точек и специальные квоты «Оставить как есть».

### Реализация и общие контракты

Нового handler нет. Два outputs и динамические range inputs использовать через общую shell. Модель — интервалы либо настройки до расчёта: execution и retrain нельзя смешивать; сохранённые интервалы проверять на новом входе. По Help узел считается обученным после настройки; отсутствие рассчитанных интервалов означает расчёт при execution, наличие — применение сохранённых границ. Эти состояния фиксировать раздельно.

Проверенные точки переиспользования: [общая tabular shell](../../../../packages/loginom-runtime/client/lib/calculator-node.mjs), [ближайший handler](../../../../packages/loginom-runtime/client/lib/filter-node.mjs), [адресные проверки аналога](../../../../packages/loginom-runtime/client/test/node-read.test.mjs). Это исходники для расширения, не доказательства реализации нового узла.

Переиспользовать `node.apply` с pure validation до эффектов, общий gate/journal/deadline и наблюдаемые node/port identities. Для новых возможностей актуализировать node registry/contracts, parameter schema, driver/readback, compact user-v1 и адресные tests; имена полей/режимов API закрепить после discovery. Публичный новый контракт и уточнённые критерии приёмки согласуются до runtime-изменения. Названия Help не являются готовыми runtime enum.

Общие зависимости раскрыты в [приёмке](../../foundations/acceptance/plan.md), [типизированных портах](../../foundations/typed-ports/plan.md), [динамической схеме](../../foundations/dynamic-schema/plan.md), [обучении](../../foundations/training/plan.md) и [внешних системах](../../foundations/external-systems/plan.md). `recommended_after` передаёт опыт; самостоятельный fixture позволяет начинать без готового парного import/export либо аналитического предшественника.

### Дополнительные самостоятельные fixtures

X=[-1,0,5,10,15,20,21], explicit ranges [0,10),[10,20] с закрытым внешним диапазоном. Проверить 0/5 в первом,10/15/20 во втором, outside codes -1/+1 для -1/21. Два одинаковых значения на границе плитки проверяют все пять tie policies отдельно.

Типовая матрица не сводится к числам: повторить граничный fixture для Integer и дробного Real, затем независимо для DateTime. Для DateTime зафиксировать календарные значения без преобразования в Unix epoch: 2026-01-01 00:00:00, 2026-01-01 12:00:00, 2026-01-02 00:00:00, 2026-01-02 12:00:00, 2026-01-03 00:00:00. Задать два внутренних диапазона [2026-01-01, 2026-01-02) и [2026-01-02, 2026-01-03] с явно сохранёнными типами границ; ожидаемая принадлежность [0,0,1,1,1] после согласования нумерации интервалов. Oracle сравнивает календарные значения и включённость границ, а не сериализацию handler; в обоих выходах сверить календарную семантику границ и код 2 в таблице диапазонов. Фактический способ представления границ в каждом выходе подтвердить при discovery и зафиксировать в expected, не считать числовое представление Unix epoch без основания. Настройку и сохранение поддержанного DateTime проверить для каждого внутреннего метода; при неоднозначной единице ширины/округлении сначала провести discovery. String/Boolean/Variant не объявлять допустимыми квантуемыми полями: Help перечисляет только Integer/Real/DateTime.

Перед автономным прогоном разместить задачу и входы отдельно от `expected`/oracle; указать точные типы, NULL, порядок там, где он значим, и числовую точность. Неоднозначную формулу/тип/границу сначала подтвердить отдельной диагностикой, затем заморозить ожидания. Сохранённые исторические fixtures, если перечислены выше, используются в исходных границах.

### Приёмка и восстановление

- Для каждого требования выполнить new/existing, Done/Close/Execute там, где применимо; проверить сохранённые настройки, свежий результат и save/reopen. Положительный тест сопровождается отказом на неверные типы/поля/порты.
- Адресные tests запускаются из пакета; oracle проверяется намеренной подменой значения, порядка, схемы и execution identity. Полный небольшой результат проверяется независимо; preview или старый PASS не доказывает новый этап.
- Один operation_id не допускает повторного эффекта. Потерянный ответ и expiry сохраняют неоднозначность до штатного inspect/recover; дедлайн не продлевается. Cancel закрывает только принадлежащий операции draft, чужие узлы/связи неизменны.
- Cold-check должен поддерживать именно заявленный вид результата, число выходов и точность. Текущий базовый скрипт читает один tabular output 0 и сравнивает строки без порядка; такие ограничения устраняются в prerequisite до зависимой приёмки.
- PASS требует чистый source SHA, pins клиента/runtime/модели/платформы, независимый oracle и подтверждённые `package_closed=true`, `logged_out=true`. Неисполненные строки остаются NOT_RUN; сохранение/технический успех/аналитика/интеграция/выпуск различаются. Checkpoint — до 20 строк, с результатом, ограничениями и следующим этапом.

### Проверенные официальные источники

- `preprocessing-binning:help1` — [Квантование](https://help.loginom.ru/userguide/processors/preprocessing/binning.html), Help 7.4, прочитано 2026-10-02.
- `preprocessing-binning:help2` — [Внешние диапазоны](https://help.loginom.ru/userguide/processors/preprocessing/binning/external-ranges.html), Help 7.4, прочитано 2026-10-02.
- `preprocessing-binning:help3` — [Структура результирующего набора](https://help.loginom.ru/userguide/processors/preprocessing/binning/calculated-columns.html), Help 7.4, прочитано 2026-10-02.
- `preprocessing-binning:help4` — [Параметры диапазонов квантования](https://help.loginom.ru/userguide/processors/preprocessing/binning/parameters-of-binning-ranges.html), Help 7.4, прочитано 2026-10-02.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `preprocessing-binning:s1` | Обучаемая предобработка и неконтролируемые модели | preprocessing-binning | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `preprocessing-binning:s2` | Обучаемая предобработка и неконтролируемые модели | preprocessing-binning | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
