# SOAP-запрос

Component ID: `component.integration.SoapRequest`. Каталог: `current_help`.

[Самостоятельный подплан полного покрытия](plan.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md).

Статус документа — **discovery_required**. Обработчик отсутствует в dispatcher базы `5f772aea9`; историческая запись каталога и Help не доказывают runtime поддержку. Документальная подготовка 2026-10-02 не меняет implementation/acceptance/integration/release status.

## Границы

SOAP connection + необязательная таблица и переменные → данные, WSDL fault, дополнительные данные. WSDL1.1 и SOAP1.1/1.2. Без таблицы — один запрос без параметров.

В подплане 6 требований и 3 этапов до полного функционального покрытия. Первый этап — операции, группы и три выхода.

## Доказательства и продолжение

- Официальные источники: Help 7.4, прочитаны 2026-10-02; точные ссылки/версии и requirement IDs находятся в плане.
- Проверено: статический реестр, existing runtime patterns и документация. Live discovery, source tests и автономная CLI-приёмка не выполнялись.
- Самостоятельный fixture: Независимый локальный WSDL и SOAP fixture: операция Sum с повторяющимися Items, ответ total, controlled WSDL fault, malformed response, delay. Input A:10,20 и B:5 даёт grouped totals30/5; ledger хранит envelope/request IDs без секретов.
- Ограничение: Пустая подключённая таблица, NULL/group ID, schema fault при нескольких faults и timezone типизация устанавливаются discovery.
- Следующий шаг: назначение stage s1, подготовленное окружение и targeted discovery без выдуманных controls. Модель — из назначения, предел попытки — 7200 секунд.
