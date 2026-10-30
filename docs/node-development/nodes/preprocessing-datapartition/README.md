# Разбиение на множества

Устойчивый ID: `component.preprocessing.DataPartition`. Slug: `preprocessing-datapartition`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; `discovery_required`. В LAB-533 подтверждены палитра,
мастер и наличие последовательного метода. Этап 0 пары blocked по вопросу
контракта смещения у Сэмплинга. [Discovery](discovery.md),
[приёмочные предложения](acceptance/README.md). Выполнение и схемы портов P
не проверены; CLI не собирался, модельная приёмка не запускалась.

## Планируемый объём по этапам

- Этап 1 — явные размеры без случайности, последовательный метод,
  приоритет test и три выхода; после завершения discovery и утверждения.
- Прочие методы и seed — отдельные последующие назначения.

Текущая база уже поддерживает адресацию нескольких output_port одного узла;
старое требование отдельной W3 не переносится автоматически. При новой общей
потребности — stop с вопросом владельцу.

## Источники

- [Разбиение на множества](https://help.loginom.ru/userguide/processors/preprocessing/partitioning.html) — `loginom-help@353e506b:data/processors/preprocessing/partitioning.md`.
- `e2e-tests@486caef44:bg/labels.ts:150-160 — метки Предобработки; общие workflow/port_label и mapping-сценарии не являются oracle этого алгоритма` — прочитанные исходники, не результат выполнения.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; обработчика нет.
