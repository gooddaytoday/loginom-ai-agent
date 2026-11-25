Подготовь сводку по возвратам в разрезе сегментов клиентов.
Подключение: Microsoft SQL Server, сервер [[DB:DB_HOST]], порт [[DB:DB_MSSQL_PORT]], база [[DB:DB_NAME]], пользователь [[DB:DB_USER]], пароль [[DB:DB_PASSWORD]].
В SQL-запросе соедини orders с customers по customer_id. Возьми только заказы со статусом «Возврат» и посчитай их количество в каждом присутствующем сегменте. В результате нужны segment и return_count. Выгрузи итог в bh-d104-returns.csv.
