# Предложение навыка v040, не активная инструкция

Разбиение: sequential, random, stratified, biased и uniform.
Задай train_count и test_count в строках; для uniform — seed и
uniform_group_sizes с train/test в строках. Это отдельные размеры групп,
не размеры выходных множеств. Приоритет тестового множества — отдельная
настройка: test_priority и test_priority_position algorithm/beginning/end.
Без приоритета положение не применяется. У существующего узла пропуски
сохраняют настройки. Не передавай allocation_order для случайных методов.
Читай все выходы: общий (0), train (1), test (2). IsTestSet — boolean.
Сравни повтор при неизменных входе, seed, группах и приоритете.
Точный случайный состав заранее не обещай. Сохрани пакет после CSV.
