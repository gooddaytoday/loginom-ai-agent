Создай пакет обработки данных: импорт «Main» из input.csv и один узел «Замена» с именем «Typed».
CSV: UTF-8, заголовки в первой строке, разделитель «;», ограничитель двойная кавычка, десятичный разделитель «.», Null-маркер NULL.
Поля Id и Code — целые, Amount — вещественное, Category и Keep — строки; исходные имена и метки сохраняются.
Для Typed используй внутреннюю таблицу точных замен и режим добавления новых столбцов.
Category: учитывать регистр; North→N, пропущенное значение (NULL)→Missing, пустая строка→Empty, текст null→Literal; остальные значения — Null.
Code: точность 0; 1→9223372036854775807, остальные значения сохранять; целый тип.
Amount: точность 0; 1.25→9.125, остальные значения→-5.25; вещественный тип.
Выход: Id, Category, Category_Replace, Category_Replaced, Code, Code_Replace, Code_Replaced, Amount, Amount_Replace, Amount_Replaced, Keep.
У производных полей метки «<имя исходного поля> Замена» и «<имя исходного поля> Заменен»: например, Category_Replace — «Category Замена», Category_Replaced — «Category Заменен»; у остальных метки равны именам; выходная автосинхронизация выключена.
Выполни Typed, затем добавь только правило Keep: учитывать регистр, A→AA, остальные значения сохранять; прежние правила и режим добавления сохранить.
Итоговый выход: Id, Category, Category_Replace, Category_Replaced, Code, Code_Replace, Code_Replaced, Amount, Amount_Replace, Amount_Replaced, Keep, Keep_Replace, Keep_Replaced; Keep_Replace — «Keep Замена», Keep_Replaced — «Keep Заменен», метки от имени исходного поля.
Выполни перенастроенный Typed и сохрани пакет {{PACKAGE_PATH}}.
