# Совместимость имени входа с закреплённым CLI

В LAB-57 reference txt-comma-utf8#1 корректный вход отвергнут warm checker:
CLI 5cd74d8ee5d6125692d953eb327b4d4f833c27a1 сохраняет artifact.name как
`<sha256([chat,userMessage])>-<input index>-<original basename.slice(-120)>`.
Checker ожидает исходный basename. В реальном receipt совпадают 200 bytes и
SHA256 903cf4ea60b3732510fc7a9540358f23537c7e8dbaf07708d91df3e80178bd19.
Архив evidence проверен по SHA256 5a846d7b044ec975fd518d07d49d9b598e5cb48d5463f94c13c279f26c04104b;
его копия inputs.ts совпадает побайтно с exact Git source.

Рассмотрены изменение CLI (нарушает pin), произвольный suffix match (принимает
неверный формат/индекс) и ограниченное распознавание штатного формата.
Выбрано последнее: исходный basename для совместимости либо полное совпадение
с 64 lowercase hex, точным индексом SPEC.inputs и suffix исходного basename
из алгоритма inputStore. Значение prefix не выводится из недоступных original
message IDs; оно принимается только как наблюдённая форма собственного receipt.
Принадлежность и данные по-прежнему проверяются отдельными workspace/artifact/
grant/destination/bytes/SHA/уникальность gates. Произвольное endsWith не вводится.

Изменения ограничены evals/script/check-text-import.py и публичными тестами
validateNodeAttempt. Oracle, prompt, исходные bytes, ожидаемая таблица, модели,
CLI pin, provenance и критерии runtime приёмки сохраняются. Первая reference
попытка остаётся исходным измерением; новая попытка не запускается. Бюджет
txt-comma-utf8 — 1/3, остальные 0/3; admission ledger — 3/3.

Проверки: RED штатного prefixed имени → минимальная реализация → GREEN;
неверный basename/индекс/identity format/bytes/SHA/дубли остаются FAIL. Выполнить
всю text-import evidence/corpus/cold/node routing группу и bun typecheck локально.
На доставленных реальных событиях отдельно перепроверить source admission;
это не означает warm/cold/reference ACCEPT. Raw evidence не добавлять в Git.

Основание работы — команда владельца самостоятельно устранять блокеры мониторинга.
Передача исправления работникам и изменение назначенного frozen SHA требуют
явного полномочия на сообщения и штатного решения Evaler; их не выдаёт этот patch.
