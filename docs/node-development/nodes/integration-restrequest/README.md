# REST-запрос

Component ID: `component.integration.RestRequest`. Каталог: `current_help`.

[Самостоятельный подплан полного покрытия](plan.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md).

Статус документа — **discovery_required**. Обработчик отсутствует в dispatcher базы `5f772aea9`; историческая запись каталога и Help не доказывают runtime поддержку. Документальная подготовка 2026-10-02 не меняет implementation/acceptance/integration/release status.

## Границы

REST connection + необязательная таблица запроса и управляющие переменные → таблица ответов и дополнительных данных. Без входного набора отправляется один запрос; с набором — запрос на строку.

В подплане 6 требований и 3 этапов до полного функционального покрытия. Первый этап — методы, url и request bindings.

## Доказательства и продолжение

- Официальные источники: Help 7.4, прочитаны 2026-10-02; точные ссылки/версии и requirement IDs находятся в плане.
- Проверено: статический реестр, existing runtime patterns и документация. Live discovery, source tests и автономная CLI-приёмка не выполнялись.
- Самостоятельный fixture: Контролируемый HTTP(S) echo-сервис с request ledger и endpoints success/400/408/429/500/wrong-content-type/delay. Входные строки содержат UTF-8, reserved URL characters, дату, JSON body. Серверный ledger и заранее заданные ответы — независимый oracle.
- Ограничение: Схемы response/допданных, классификация transport errors, timeout при retries и поведение подключённой пустой таблицы требуют discovery.
- Следующий шаг: назначение stage s1, подготовленное окружение и targeted discovery без выдуманных controls. Модель — из назначения, предел попытки — 7200 секунд.
