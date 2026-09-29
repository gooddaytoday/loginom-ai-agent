# Кросс-таблица: скользящая схема

Доставь три CSV в свой каталог Loginom штатной доставкой вложений с подтверждёнными upload receipts. Импортируй base.csv: Region и Category — дискретные строки, Amount — real, Quantity — integer, разделитель запятая, `?` — NULL.

Построй один Sliding CrossTable: строки Region, колонка Category, без лимита категорий (`columns: {mode: "sliding", min_values: 0}`). Для Amount и Quantity — сумма. Выполни и прочитай полный выход с точными числами (sample_rows=100, require_exact_numbers=true). Используй operation_id `sliding-base`. Сохрани возвращённые IDs импорта, CrossTable и исходную операцию.

Замени источник В ТОМ ЖЕ импорте на changed.csv с сохранением типов. CrossTable не пересоздавай и не перенастраивай. Вызови публичный loginom_dock_node_read с operation_id `sliding-changed-read`, source_operation_id `sliding-base`, ports [0], sample_rows 100, require_exact_numbers true. Дождись SUCCEEDED с полным свежим результатом. Сохрани новый пакет `{{PACKAGE_PATH}}` только после чтения.

Отдельно верни источник того же импорта на base.csv и повторно прочитай тот же CrossTable через node_read с исходной операцией `sliding-base` (operation_id `sliding-restored-read`). Затем замени источник того же импорта на same-count.csv: в нём только C заменена на D, число полей остаётся прежним. Снова публичный node_read: operation_id `sliding-same-count-read`, source_operation_id `sliding-base`, ports [0], sample_rows 100, require_exact_numbers true. Дождись полного SUCCEEDED и сохрани пакет `{{PACKAGE_PATH}}` после последнего чтения.

Не изменяй настройки и связи CrossTable после исходного создания. Не создавай дополнительные узлы. Не перезаписывай чужие файлы. При неопределённом исходе не повторяй мутации. Источник и read должны оставаться привязаны к прежним IDs.
