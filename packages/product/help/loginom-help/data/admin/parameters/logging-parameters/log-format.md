# Формат записи в лог

Каждая строка в файле журнала представляет собой сообщение в формате:

`yyyy-mm-ddThh:mm:ss.mss level GUID (process:thread>[user:session[:requestID]]) — message[textJSON]`,

где

- `yyyy-mm-ddThh:mm:ss.mss` — дата и время с указанием миллисекунд (дата и время разделены литерой `T`)
- `level` — уровень логирования
- `GUID` — уникальный идентификатор сообщения, записанный в нижнем регистре, без скобок и дефисов
- `process` — имя исполняемого файла
- `thread` — идентификатор потока
- `user` — имя пользователя, запустившего процесс (необязательный параметр; может отсутствовать, если логируемое действие происходит вне сессии пользователя)
- `session` — идентификатор сессии (необязательный параметр; отсутствует, если нет параметра `user`)
- `requestID` — идентификатор запроса (необязательный параметр; присутствует, если процесс запущен из внешнего сервиса)
- `message` — текст сообщения
- `textJSON` — параметры, записанные в формате JSON (необязательная часть)

В `textJSON` могут быть параметры, записанные в формате `"key": "value"`:

- `CLIENT_IP` — IP адрес пользователя
- `CLIENT_HOST` — доменное имя пользователя (является опциональным и необходимо при использовании внешнего IP-адреса для идентификации пользователя; по умолчанию отключен)
- `COLUMN_NAME` — имя колонки
- `COLUMN_CAPTION` — метка колонки
- `COMPONENT` — название компонента сервера, для которого в [Администрировании](../../README.md) был изменен параметр ([LDAP](../ldap-parameters.md), [OpenID](../openid-parameters.md), [Логирование](README.md), [Python](../python-parameters.md), [Выполнение программы](../exec-program-parameters.md))
- `ERROR_MESSAGE` — текст сообщения об ошибке
- `ELEMENT_GUID`, `ELEMENT_NAME`, `ELEMENT_ID` — параметры для идентификации элементов конфигурации
- `EXCEPTION` — текст исключения
- `ExceptionClass` — класс исключения
- `ExceptionType` — тип исключения ('Error', 'Warning', 'Hint')
- `HEADERS` — список HTTP заголовков текущей сессии браузера пользователя
- `NAME` — название измененного параметра в Администрировании
- `NEW_VALUE` — новое значение параметра в Администрировании
- `NODE_GUID` — GUID узла
- `NODE_CAPTION` — метка узла
- `Message` — текст сообщения
- `PACKAGE_FILE`/`PACKAGE_NAME` — параметры для идентификации пакета
- `PROCESS_CAPTION`, `PROCESS_NAME`, `DIM_CAPTION`, `DIM_NAME` — параметры для идентификации процесса
- `PROP_NAME` — название параметра учетной записи
- `PROP_VALUE` — значение параметра учетной записи
- `REASON` — текст сообщения об ошибке входа в учетную запись
- `ROW_NUM`, `ROW`, `LINE` — номер строки данных, к которой относится сообщение (для `ROW_NUM` нумерация начинается с 0, для `ROW`, `LINE` — с 1)
- `SESSION_TYPE`, `SESSION_NAME` — параметры для идентификации сессии
- `Sender` — класс отправителя исключения
- `StackTrace` — строка с callstack-ом исключения
- `USER_NAME`, `GROUP_NAME` — имя пользователя/группы
- `VERSION` — версия Loginom

При логировании в journald информация записывается в виде пары: имя параметра - значение.

Список параметров journald:

- Стандартные (зарезервированные) для journald поля:
  - `MESSAGE_ID` — обязательный идентификатор сообщения
  - `MESSAGE` — текст сообщения
  - `PRIORITY` — приоритет сообщения
- Стандартные поля для сообщения от Loginom:
  - `USER` — имя пользователя
  - `SESSION_ID` — идентификатор сессии
  - `REQUEST_ID` — идентификатор запроса, от которого пришло сообщение (необязательный параметр; присутствует, если процесс запущен из внешнего сервиса)
- Поля для сообщения об исключении от Loginom:
  - `Exception` — текст исключения
  - `EXCEPTION_CLASS` — класс исключения
  - `STACK_TRACE` — строка с callstack-ом исключения
  - `EXCEPTION_TYPE` — тип исключения (Error, Warning, Hint)
  - `SENDER` — класс отправления исключения
- Остальные параметры:
  - `COLUMN_NAME` — имя поля
  - `COLUMN_CAPTION` — метка поля
  - `USER_NAME` — имя пользователя
  - `GROUP_NAME` — имя группы
  - `ROW_NUM` — номер строки данных к которой относится сообщение (начинается с 0)
  - `ERROR_MESSAGE` — текст сообщения об ошибке
  - `ELEMENT_GUID`, `ELEMENT_NAME`, `ELEMENT_ID` — идентификация элементов конфигурации
  - `PACKAGE_FILE`, `PACKAGE_NAME` — идентификация пакета
  - `SESSION_TYPE`, `SESSION_NAME` — идентификация сессии
  - `PROCESS_CAPTION`, `PROCESS_NAME`, `DIM_CAPTION`, `DIM_NAME` — идентификация процесса
  - `NODE_CAPTION`, `NODE_GUID` — идентификация узла сценария

**Пример записи лога в файл**

```json
2025-06-24T15:51:41.100 info 62daaab383b6e040b3e7f113bfd48cc1 (loginomd.exe:6956>user:26) - Инициализирована сессия для пользователя user
{"USER_NAME": "user", 
"SESSION_TYPE": "Интерактивная сессия", 
"CLIENT_IP": "127.0.0.1", 
"HEADERS": "{host=localhost:8080,connection=Upgrade,pragma=no-cache,cache-control=no-cache,\"user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 OPR/119.0.0.0\",upgrade=websocket,origin=http://localhost,sec-websocket-version=13,\"accept-encoding=gzip, deflate, br, zstd\",\"accept-language=ru,en-US;q=0.9,en;q=0.8,ru-RU;q=0.7\",sec-websocket-key=Tp7wqmeSRi9BFO60AN5kSg==,\"sec-websocket-extensions=permessage-deflate; client_max_window_bits\"}"}

2025-06-24T15:52:21.813 info 61cd3695e5dc384f99172926c3eead51 (loginomd.exe:6956>user:26) - Закрыта сессия для пользователя user{"USER_NAME": "user", "CLIENT_IP": "127.0.0.1"}

2025-06-24T15:52:11.706 debug 9e9522e2e3f0144584b037907fede1b8 (loginomd.exe:12832>user:26) - Активация узла "Текстовый файл" GUID={B44FB31C-DBF9-4643-A466-A856D903D59B} Пакет=test{"NODE_CAPTION": "Текстовый файл", "NODE_GUID": "{B44FB31C-DBF9-4643-A466-A856D903D59B}", "PACKAGE_NAME": "test"}

2025-06-18T12:09:06.020 error 9c6c3b27939a424fa9b7a12b5a1d275f (loginom.exe:6532>user:22) - Не удалось загрузить некоторые элементы конфигурации
```

**Пример записи лога journald**

Для journald просмотр логов в системе можно осуществить через стандартную команду `journalctl`, выполнив ее, например, со следующими параметрами:

`sudo journalctl -xe | grep loginom`

```json
июн 25 10:20:11 astra loginomd[563]: Инициализирована сессия для пользователя user
июн 25 10:20:16 astra loginomd[563]: Открыт пакет "/user/Package1.lgp" в режиме редактирования
июн 25 10:20:36 astra loginomd[563]: Активация узла "Переменные в таблицу" GUID={6A5BF7B5-91CB-47EA-A0BC-06F29C63B681}
июн 25 10:20:36 astra loginomd[563]: Успешно активирован узел "Переменные в таблицу" GUID={6A5BF7B5-91CB-47EA-A0BC-06F29C63B681}
июн 25 10:20:58 astra loginomd[563]: В результате вычисления выражения "Выражение1" получено значение строкового типа, оно несовместимо с заданным типом Вещественный
июн 25 10:21:00 astra loginomd[563]: Активация узла "Калькулятор" GUID={8A54DC3C-1B60-47B0-9F44-49C22FE5AE79}
июн 25 10:21:00 astra loginomd[563]: Ошибка активации узла "Калькулятор" GUID={8A54DC3C-1B60-47B0-9F44-49C22FE5AE79}
июн 25 10:21:06 astra loginomd[563]: Деактивирован узел "Калькулятор" GUID={8A54DC3C-1B60-47B0-9F44-49C22FE5AE79}
июн 25 10:21:08 astra loginomd[563]: Сохранён пакет "/user/Package1.lgp"
июн 25 10:21:10 astra loginomd[563]: Закрыт пакет "/user/Package1.lgp"
июн 25 10:21:13 astra loginomd[563]: Закрыта сессия для пользователя user
июн 25 10:45:06 astra loginomd[563]: Инициализирована сессия для пользователя admin
июн 25 10:50:16 astra loginomd[563]: Изменился параметр сервера "Период проверки соединения с клиентом"
июн 25 10:50:41 astra loginomd[563]: Изменился параметр компонента сервера Python:"Выполнение запрещено"
июн 25 10:51:27 astra loginomd[563]: Закрыта сессия для пользователя admin
```

> **Примечание:** используется кодировка UTF8.
