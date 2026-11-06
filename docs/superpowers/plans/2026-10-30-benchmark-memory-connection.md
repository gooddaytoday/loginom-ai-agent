# Полное чтение Benchmark memory через одно HTTPS-соединение

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

## Результат и границы

Снять существующий memory gate P41B полным read-only snapshot, сохранив все семь полей сравнения с P41Dafter и G03before. Само измерение B100/sole1/1, FAIL ресурсов, oracle/rubric, исходный timeout17794 и история попыток не меняются. Следующее измерение допускается только после полного snapshot и независимого actual review.

Наблюдаемая проблема: три первичных fullREST чтения прерывались на TCP connect timeout. Установленный `urllib.request.AbstractHTTPHandler.do_open` выставляет `Connection: close` и закрывает сокет после каждого ответа. Это установленное поведение клиента, а не доказанная причина исходных сетевых отказов. Doctor actor healthy/authready на отдельном endpoint переиспользуется; никакой общей неисправности OpenViking не установлено.

Один диагностический probe65459 дал два authenticated HTTP200/identitymatch по одному и тому же TLS-сокету за2361ms, `will_close=false`. Свидетельство: private `analytics-expansion/p41-memory-keepalive-probe.json`; snapshot этим не подтверждён.

## Последовательность

1. Независимое offline review этого изменения процедуры: исходные data/изоляция/полнота не меняются; новый retry/fallback и новая инфраструктура не нужны. Результат — APPROVE либо конкретное нарушение существующего требования.
2. Один полный verification-запуск существующим Python stdlib `http.client.HTTPSConnection` к тому же approved exact-host `PRIVATE_KNOWLEDGE_HOST:443`. Default TLS verification, прежний per-operation timeout20s, тот же key/identity и GET параметры. Сокет открывается один раз; перед каждым запросом проверяется та же socket object, поэтому библиотека не может неявно открыть новое соединение. Каждый ответ полностью прочитывается, `will_close` и состояние сокета фиксируются. Ошибка либо закрытие при необходимости следующего запроса прерывают чтение; автоматический reconnect/request retry/fallback не допускается. Закрытие после последнего полного ответа не отменяет уже полученные данные и сравнение.
3. Полностью прочитать health/identity, peers listing со всеми metadata, все existing user/peer memory roots: полные directory listings (hidden=true/nonrecursive/node_limit10000 без truncation), raw files (`raw=true/limit=-1`). Новый peer directory требует полного обхода по существующему контракту; текущий approved before содержит только два metadata и не содержит peer directories, поэтому неожиданный directory останавливает эту конкретную процедуру без выдуманного пустого результата. После получения всех данных сохранить complete snapshot0600/O_EXCL и сравнить все семь raw fields с обеими baseline. При ошибке сохранить конкретный failed request/URI и неполный статус; complete snapshot/PASS не создавать.
4. Независимый review результата и всех P41B measurement gates. Только затем закрыть форму и перейти к frozen P03B. Если чтение не завершится, сохранить конкретный blocker/условие продолжения; без нового полного запуска по тому же основанию.

## Проверки и цена

Первый end-to-end результат — полный unchanged snapshot через одно наблюдаемое HTTPS-соединение; два health и component checks его не заменяют. Проверки — полный raw all7 equality, прежняя completeness, отсутствие reconnect/retry и независимый review. Сохраняется original17794 failure; предыдущие memory proofs не переписываются, отличие только транспорта проверки не объявляется эффектом D/B.

Новых dependencies, source/config/profile/credentials/setup/OAuth, серверов, global network/proxy/TLS/timeout изменений, persistent retry/helper/framework, model/judge/cold rerun нет. Используется стандартный клиент в одном временном операторском вызове, удалять/переносить общие патчи не требуется. Ожидаемый diff: один план около30 строк; private probe/result и краткий SDD review вне Git. Код продукта и harness не меняется.

## Checkpoint

- Plan independent review APPROVE/rootread. ONE full18216 terminal0:34GET/oneHTTPSconnection/no retry/reconnect, complete23files/7dirs/2metadata/all7exact к P41Dafter/G03before. Original17794 failure сохранён; старые TCP causes UNKNOWN.
- P41B100/sole1/1 и fullmemory независимым finalactualreview APPROVE/rootread; P41 принята/K13/G03completed8. Следующая форма — frozen originalP03B.
