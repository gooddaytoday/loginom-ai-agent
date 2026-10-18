# Excel: упрощённая приёмка этапа 1 (LAB-96)

Текущая карточка LAB-96 задаёт более узкий объём, чем исторический plan.md:
один XLSX, первый лист или лист по имени, заголовки и явные string/integer/real/datetime.
Named ranges, несколько книг/листов, XLS/XLSM, автоопределение и большой аудит отложены.
Ветка excel-stage1 от demo-022; PR направляется в demo-022 по прямому назначению владельца.

В модель передаются только task.md с подстановкой нового личного пути пакета
и data/sales.xlsx. Книга получена из канонического book-a.xlsx этапа 0:
изменены только строковые заголовки и названия регионов, структура книги сохранена.
Три продажи: Id 1/2/3, Region North/South/West, Amount 10/20/30.
Задание проверяет сохранение всех строк, имён и типов и выгрузку CSV, без агрегации.

`python3 oracle.py` независимо читает XML внутри XLSX стандартной библиотекой
и формирует expected.json до живых прогонов. Oracle и expected не передаются модели.
Ожидания описывают выход imports.excel и наличие связанного exports.text.
Критерий: модель openai/gpt-6.1-sol, variant medium, 1800 секунд; ≥2/3 cold PASS
на одном опубликованном SHA, затем независимые 2/3 и регрессия s1.

18.10.2026 исходная чистая CLI-сборка 40aacdbc65f71e97c4d2eecdce57b72f707f4e0d:
после настройки точной модели в личных профилях три последовательные попытки
остановились до обращения к модели на AI_UnsupportedFunctionalityError для MIME
application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.
Вызов через `--command loginom-automation` имеет тот же результат.
Новые профили и пути пакетов использованы; Loginom-операции сценария не начались.

Локализация: packages/agent/src/session/message-v2.ts, сериализация user file parts.
Исключение для недекодируемого бинарного CSV сохраняет исходные байты для host admission
и даёт модели текстовое описание. Для XLSX такого исключения нет: SDK получает file part.
Исправление общего слоя Agent требует карточки W либо разрешения владельца.
Обработчик Excel ещё не реализован; model/cold PASS 0/3, s1 NOT_RUN.
Сырые свидетельства публикуются во вложении карточки, в Git не включаются.


18.10.2026 продолжение по разрешению владельца: отдельный PR #136
(`lab96-xlsx-attachment`, b9f5f4000d) устраняет provider file part для inline XLSX:
модель получает имя/размер/описание книги, оригинальный file part сохраняется.
42 теста message-v2 и typecheck Agent PASS. Ветка этапа 1 содержит тот же фикс.
На чистой сборке 6a61aa06540c74ac902582f850988537b94a567f модель
openai/gpt-6.1-sol/medium начала сценарий; dock_prepare вернул prepared=true.
Доставка sales.xlsx остановлена до upload: ARTIFACT_VERIFICATION_UNSUPPORTED,
«Server-copy verification supports only admitted CSV/TSV/TXT files».
Три проверки расширений в executor.mjs и artifact-discovery.mjs не допускают XLSX;
artifact-discovery.test.mjs явно проверяет отказ XLSX. Это отдельный runtime scope,
который не входит в разрешённую одну правку message-v2.ts.
Пакет не сохранён; cold-check/s1 NOT_RUN. Предлагаемая минимальная правка whitelist
приложена к карточке для решения владельца; в продукт не внесена.
