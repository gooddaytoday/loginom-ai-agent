# JavaScript

Component ID: `component.programming.JavaScript`. Каталог: `current_help`.

[Самостоятельный подплан полного покрытия](plan.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md).

Статус документа — **discovery_required**. Обработчик отсутствует в dispatcher базы `5f772aea9`; историческая запись каталога и Help не доказывают runtime поддержку. Документальная подготовка 2026-10-02 не меняет implementation/acceptance/integration/release status.

## Границы

Необязательные несколько табличных входов и переменные → один/несколько табличных выходов. Код исполняется движком Loginom; backend Node.js и runtime handler не должны вычислять результат вместо узла.

В подплане 9 требований и 4 этапов до полного функционального покрытия. Первый этап — код, фиксированные таблицы и базовый api.

## Доказательства и продолжение

- Официальные источники: Help 7.4, прочитаны 2026-10-02; точные ссылки/версии и requirement IDs находятся в плане.
- Проверено: статический реестр, existing runtime patterns и документация. Live discovery, source tests и автономная CLI-приёмка не выполнялись.
- Самостоятельный fixture: Таблица A из 4 строк (id,amount,text,flag,date), независимая B из 2 строк, переменная factor=3; вручную рассчитанные amount×3 и второй агрегатный выход. Отдельные файлы ES6/CommonJS с функцией x+7, изолированные HTTP ledger/FS fixtures. Скрипт является частью business input; expected скрыты от модели.
- Ограничение: Версия JS engine, фактический API/DOM редактора, механизм durable cancelled outcome и limits code/output выясняются discovery; неизвестные browser/Node APIs не обещаются.
- Следующий шаг: назначение stage s1, подготовленное окружение и targeted discovery без выдуманных controls. Модель — из назначения, предел попытки — 7200 секунд.
