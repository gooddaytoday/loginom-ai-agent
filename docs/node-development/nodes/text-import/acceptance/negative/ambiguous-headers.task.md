Создай новый диагностический пакет {{PACKAGE_PATH}}. Используй оригинальный приложенный ambiguous_headers.txt без преобразования, одну доставку с проверкой серверных bytes/SHA.

Это намеренный негативный запрос повторной ссылки на исходное поле: файл имеет два заголовка Name,Name. Выполни ровно один loginom_dock_node_apply с target.kind=new, target.type=imports.text, mode=delimited, label=ambiguous_headers и новым operation_id {{OPERATION_ID}}. Источник — текущий подтверждённый artifact_id/upload_operation_id, settings.source.source_path — его подтверждённый destination. Остальные settings задаются ниже дословно.

{{SETTINGS}}

Имена выходных полей FirstName и SecondName различны, но оба source_name равны Name. Не заменяй второй source_name на Name_1, OtherName или другое имя, не исправляй запрос и не создавай альтернативный узел. Это проверка фактического отказа, а не просьба успешно импортировать. finish=execute, read.ports=[0], sample_rows=10, require_exact_numbers=true: отказ должен предотвращать Execute. При однозначном отказе до эффектов сохрани собственный диагностический пакет в указанном пути и остановись. Сохрани точную ошибку. При running опроси тот же operation_id; при неизвестном эффекте остановись без повторения, cleanup или нового импорта.
