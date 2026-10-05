# Разбиение на множества: черновик требований

Component ID: `component.preprocessing.DataPartition`. Slug: `preprocessing-datapartition`. [Карточка](README.md) · [Реестр](../../registry.json) · [Шаблон подплана](../../templates/node-plan.md).

Черновик собран 2026-10-02 по справке и исходникам `5f772aea9`; каталог: компонент есть в текущей Help 7.4. Живое исследование, E2E и прогоны не выполнялись, обработчика нет. Это входные данные для подплана, а не назначение: перед назначением подплан переписывается по шаблону — этап 0 живого исследования, самостоятельный этап 1, приёмочный комплект и задание модели.

## Источники

- `preprocessing-datapartition:help1` — [Разбиение на множества](https://help.loginom.ru/userguide/processors/preprocessing/partitioning.html), Help 7.4, прочитано 2026-10-02.

## Требования справки

| ID | Возможность | Предлагаемая независимая проверка | Источник |
| --- | --- | --- | --- |
| `preprocessing-datapartition:r01` | Train/test количество или процент, остаточный принцип при конфликте размеров, приоритет test. | Полные membership трёх выходов, flag consistency и остаток; не требовать общего выхода равным всему входу. | `preprocessing-datapartition:help1` |
| `preprocessing-datapartition:r02` | Приоритетное test: алгоритм/начало/конец; последовательный отбор sampled/unused размеров. | Заданные RowID в начале/конце и точный порядок; все строки учтены без ложной потери. | `preprocessing-datapartition:help1` |
| `preprocessing-datapartition:r03` | Random, uniform с группами, stratified поля, bias factor/явное количество. | Матрица пяти методов, неодинаковые классы и несколько strata; проверить кратности и разбиение. | `preprocessing-datapartition:help1` |
| `preprocessing-datapartition:r04` | Seed fixed/always-random/generate/copy и повторное разбиение. | Одинаковые входы/seed дают одинаковые множества; настройки сохраняются после reopen. | `preprocessing-datapartition:help1` |

## Предлагаемое разбиение на этапы

Разбиение — гипотеза до этапа 0. Каждый этап должен приниматься самостоятельно; общие изменения, нужные этапу, входят в его же карточку.

- `preprocessing-datapartition:s1` — Размеры, приоритет и три выхода. Требования: `preprocessing-datapartition:r01`, `preprocessing-datapartition:r02`.
- `preprocessing-datapartition:s2` — Все методы сэмплинга и seed. Требования: `preprocessing-datapartition:r03`, `preprocessing-datapartition:r04`. После: `preprocessing-datapartition:s1`.

## Заметки черновика

Нового handler нет. Использовать multi-output подход filter и shared execution binding для всех трёх выходов. Название «обучающий набор» не означает обучение самого узла или зависимость ML от этого handler.

RowID=1..20. Приоритет test в начале с 5 строками закрепляет test=[1..5]; train 10 выбирается только из остатка. Общий выход содержит 15 строк, test flag true ровно 5, train/test не пересекаются. Наборы для последующего ML допустимо подавать готовыми файлами.
