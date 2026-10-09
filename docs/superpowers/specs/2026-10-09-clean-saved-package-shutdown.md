# Штатное закрытие чистого сохранённого пакета

Это уточнение исправления отказа из этапов6/8 согласованного
[плана изоляции skills](../plans/2026-10-05-package-docs-isolation.md).
Публичные инструменты и IPC-поля не меняются. Реализация ещё не начата.

## Подтверждённый отказ

Локальный installed CLI49 создал и сохранил отдельный пустой пакет.
Оба последовательных CLI-хода завершились exit0, `.writer` снят, собственных
дочерних процессов0. Второй prepare показал native label «только чтение».
Private normal-close readback:
`1db17497827532580fd07231a52648dede044e10864b79c69a1a288cfb3898a9`.
`ownership_verified=false` сам по себе не доказывает readonly: prepare
устанавливает этот флаг только при `new_draft`.

Контроль с существующим acceptance-only close чистого пакета/logout:
первое завершение имеет bound SUCCEEDED receipt, новый native клиент
показывает `ReadOnly=false`; второй view также закрыт/logout подтверждён,
remaining0, discard=false. Нет model/judge calls. Испытуемая сборка не менялась.
Точный ID исторического серверного writer ещё не установлен.

Справка Loginom описывает удержание сессии после разрыва соединения:
[параметры подключения](https://help.loginom.ru/userguide/admin/parameters/connection-parameters.html).
Это описание механизма, а не измерение настроек нашего стенда.

## Решение

При закрытии `user-v1` bridge, если в этом runtime подтверждено сохранение
ровно одного пакета, использовать существующую проверяемую native процедуру
закрытия этого пути и logout. Путь берётся только из completed save receipt
bridge; модель или вызывающий Host не задают дополнительное cleanup-поле.
Остальные профили и acceptance-only режим сохраняют свои контракты.

Нужно использовать текущие проверки session/document/account/path,
единственного пакета и fresh modified=false. Перед native cleanup и повторно
внутри browser gate проверить полное `hasUnsettledWork`, включая retained
node/delivery uncertainty, clipboard uncertainty и leases; одного
`assertPreparationAllowed()` недостаточно.

Добавить отсутствующую проверку вкладки **до** native ClosePackage: receipt
того же prepared document/session должен связывать exact native package node
с прежним tab object; он остаётся в document и имеет exact tabTid. Прежнее
ожидание detach после ClosePackage не является такой проверкой. Отсутствие,
подмена либо чужая package/tab binding отклоняются до серверной мутации.
Не добавлять save, discard, отмену узлов, CloseAllPackages, RPC-обход
native ClosePackage guard, смену server config либо удаление lock.
При несколько saved paths не угадывать текущий путь.

Для обычного product shutdown отказ native процедуры сохраняется как
BLOCKED evidence; он не становится подтверждённым server cleanup.
После отказа всё равно выполнить прежний close MCP/browser и подтвердить
только реально завершившиеся ресурсы. Native transport/parsing failure и
ошибка записи package-cleanup.json/execution journal также не пропускают
попытку close MCP/browser. Ошибка evidence остаётся явной BLOCKED/
CLEANUP_EVIDENCE_UNCONFIRMED в возвращаемом результате, без raw errors.
Если файл не записан, успешная долговременная запись не объявляется. Нельзя удерживать Chromium только
из-за отказа закрыть чужой, грязный или выполняемый серверный пакет.
Строгий acceptance-only режим сохраняет прежний отказ и guards.

Перед повторной product задачей право automation по-прежнему требует
активации skill; закрытие не выдаёт новых прав, не запускает браузер
в default/docs и не исполняется между ходами живого runtime Desktop.

## Альтернативы

Настройка тайм-аутов сервера меняла бы пользовательский стенд и лишь
откладывала немедленное повторное открытие. Принудительный logout без
проверки пакетов мог бы потерять несохранённую работу. Выбран bounded
native close только одного подтверждённого чистого сохранённого пакета.

## Проверки и порядок

1. Один публичный MCP bridge lifecycle тест: user-v1 без
   acceptanceCleanupPackage после подтверждённого save закрывает пакет
   перед browser и возвращает bound native cleanup. Сначала RED.
2. Минимальная правка `client/lib/bridge.mjs`, GREEN этого поведения.
3. Отдельно проверить native BLOCKED и busy: обычный browser close
   сохраняется, серверное закрытие не объявляется успешным. Retained
   unsettled work без running, состояние, изменившееся в gate, реальный
   EISDIR при сохранении evidence, отсутствующий/подменённый tab должны
   иметь отдельные проверки отказа до мутации либо продолжения browser close. No-save,
   несколько paths, repeated close и прежний acceptance-only контракт.
4. Pinned Node24.19.0, узкие bridge/package-cleanup тесты, затем штатный
   upstream suite. Изменение сопровождается отдельным коммитом и AGENTS.
5. Новый candidate в новом каталоге с manifest; installed normal-close
   observation и scenario-modify, Linux Desktop/CLI lifecycle/переходы.
   Старые candidate49 и baseline неизменны. Изменение продукта требует
   новых общих A/B conditions, обоих smoke и полной пары90.

Это не исправление зависания v9 harness: его причина UNKNOWN и приёмка
остаётся отдельной незавершённой задачей. Старые raw profiles/leases
и чужие ресурсы не очищаются этой правкой.
