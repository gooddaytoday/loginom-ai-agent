# P4: управляемое завершение и clipboard lease

6 сентября 2026. Добавлен `client/lib/managed-shutdown.mjs`, подключённый CLI и
включённый в runtime digest. Все управляемые SIGINT/SIGTERM/stdin EOF используют
один shutdown request. Повторные сигналы не повторяют неопределённое закрытие.

CLI выходит успешно только когда bridge подтвердил закрытие transport,
наблюдал завершение его дочернего процесса и не удерживает clipboard leases.
При отказе, отсутствующем подтверждении или исключении сохраняется живой процесс,
выводится фиксированная диагностика без upstream текста; неизвестный исход не
превращается в `process.exit(0)`. Дополнительный keepalive не является блокировкой:
единственный механизм межклиентной блокировки остаётся loopback port 46419.

Bridge теперь учитывает actual `StdioClientTransport.onclose`. В закреплённом
MCP SDK 1.30.0 этот callback вызывается из `ChildProcess.close`;
`Protocol.connect` вызывает установленный заранее callback. После fulfilled
`browser.close()` bridge ждёт callback не более одной секунды. Сам fulfilled
promise недостаточен: SDK после отправки SIGKILL не ждёт final close event.
Отсутствующий callback оставляет transport unconfirmed и leases удержанными.
`browser_close` tool не вызывается: он закрывает страницу и не является
доказательством завершения transport process.

Результат bridge.close содержит `browser_transport_closed`,
`browser_process_terminated`, `clipboard_leases_retained`. Первый результат
сохраняется; повтор close не запускает неизвестное закрытие заново. Подтверждение
касается MCP child process, а не доказанной гибели всех Chromium descendants.

## Проверенные границы

На закреплённом Node 24.19.0 прошли 13 профильных outer tests. Новые child-process
проверки запускают настоящий CLI с изолированными transport fixtures и настоящей
kernel lease на случайном порту, не используют браузер, системный clipboard,
server или модели. Подтверждены:

- SIGTERM, SIGINT и stdin EOF при неопределённом shutdown сохраняют процесс и
  недоступность lease второму владельцу;
- повторные сигналы не обходят удержание и не повторяют close;
- thrown upstream error не попадает в диагностический текст;
- подтверждённое завершение освобождает lease и CLI завершается с кодом 0;
- fulfilled transport close без actual exit event не освобождает lease;
- настоящий SDK Client/stdio child-process test подтвердил сохранение pre-connect
  callback и его вызов после actual child termination;
- SIGKILL уничтожает процесс и kernel lock: это явно проверенное ограничение.

Внешний fault mock проверяет contract обработчика; это не новая live-приёмка
Loginom copy/paste и не доказательство остановки Chromium descendants.

## Что остаётся P4/P7/P8

**P4:** отдельная typed copy/cut/paste capability, exact graph effect/ownership,
подтверждение результата и live clipboard acceptance остаются открытыми. Новый
shutdown не означает завершение P4. Неопределённый shutdown сейчас требует
операторской диагностики; автоматического reconciliation после late exit нет.

**P7:** SIGKILL/crash/power loss не сохраняют kernel lease. Для защиты следующего
клиента потребуется durable uncertainty record до copy, fsync, доказанный
terminal result и отказ новой clipboard операции до reconciliation. Record
должен использовать тот же lock; stale PID/timeouts не дают права его очищать.
В этом изменении durable barrier не реализован.

**P8/P9:** старый клиент, не читающий будущий uncertainty record, сможет обойти
защиту после process death. Нужен отдельный совместимый admission/lifecycle
контракт перед обещанием защиты между версиями. Новый runtime требует нового pin;
старые clipboard или native acceptance results автоматически не переносятся.
