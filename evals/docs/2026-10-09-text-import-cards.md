# Созданные карточки текстового импорта

Текущий этап завершён: подготовлены код и материалы, созданы **8 карточек**
для **58 ID / 59 inputs**. Все карточки — backlog, squad «Eval узлов Loginom»
назначен через `--no-start`. Финальный readback: runs=[] и wakeups=[] у каждой;
workspace autopilots отсутствуют. Стартов, mentions и поручений в комментариях не было.

| № | Карточка | Кейсов | Зависимость будущего выполнения |
|---|---|---:|---|
| 0 | [LAB-56: test(evals): Проверить подготовленный комплект и допуск текстового импорта](https://mas.kartamyshev.dev/lab/issues/LAB-56) | 0 | — |
| 1 | [LAB-57: test(evals): Пилот текстового импорта — 6 кейсов](https://mas.kartamyshev.dev/lab/issues/LAB-57) | 6 | LAB-56 |
| 2 | [LAB-58: test(evals): Кодировки, BOM и десятичная запятая — 9 кейсов](https://mas.kartamyshev.dev/lab/issues/LAB-58) | 9 | LAB-57 |
| 3 | [LAB-59: test(evals): Заголовки, пропуск строк и разделители — 12 кейсов](https://mas.kartamyshev.dev/lab/issues/LAB-59) | 12 | LAB-58 |
| 4 | [LAB-60: test(evals): Кавычки и многострочные значения — 11 кейсов](https://mas.kartamyshev.dev/lab/issues/LAB-60) | 11 | LAB-59 |
| 5 | [LAB-61: test(evals): Повреждённые входы и отказы настройки — 10 кейсов](https://mas.kartamyshev.dev/lab/issues/LAB-61) | 10 | LAB-60 |
| 6 | [LAB-62: test(evals): Исправление узла и обновление источника — 4 кейса](https://mas.kartamyshev.dev/lab/issues/LAB-62) | 4 | LAB-61 |
| 7 | [LAB-63: test(evals): Точность импортированных данных — 6 кейсов](https://mas.kartamyshev.dev/lab/issues/LAB-63) | 6 | LAB-62 |

Опубликованный неизменяемый кодовый срез: `59ab36329c13f1399dab4313e94f3e9c6954301b` в remote
`text-import-evals`; база `7a45abd845f830610f376e2f21631acc8a48e8b2`.
CLI отдельно: `5cd74d8ee5d6125692d953eb327b4d4f833c27a1` (remote txt-delivery).
Skill 1.0.7 tree SHA256: `577c50a1d494844eecfa9559de0d63faaa8a2786057bfe3c434cfbd9d8ca5c89`.
Preparation manifest SHA256: `f66cd2e0ad57ffa6c6473846e7fe84ce9ae672f80d8e7be6b5fb8507473b58ec`.

В LAB-56 доставлены исходники harness/закрытые drafts, skill, manifest и offline
отчёт. В LAB-57–LAB-63 — семь inputs-only ZIP. Все **15 вложений** скачаны с сервера
и побайтно сверены с локальными файлами; IDs, bytes, SHA256, case IDs и зависимости
сохранены в [readback](text-import-multica-readback.json).
Публикуемый preparation snapshot предшествует созданию карточек; итоговая карта
и checkpoint сохранены отдельным documentation commit и не меняют frozen code pin.

Модели Rich/Ben/Evaler сохранены: `gpt-6.1-sol/xhigh`, concurrency=1, прежний runtime.
`openai/gpt-6-luna/high` назначен только Loginom AI Agent, который будет строить
reference и product. Проверены запросы модели в offline admission; фактическая
Luna ещё не запускалась. Actual модель подтверждается на следующем этапе.

Проверки: **544 unit/integration pass / 0 fail**, `bun typecheck`, корпус/typed oracle,
CRC/SHA/privacy/reproducibility ZIP, native helper syntax. Подробности и пределы
проверки — [offline report](2026-10-09-text-import-preparation-report.md).
Последний readback LAB-55: `in_progress`, revision 5;
её активный run и runtime сохранены. Серверные ресурсы/профили/pins не менялись,
подготовка выполнялась локально; чужие Chrome процессы не останавливались.

Живые reference/product/cold, доступность Luna, CLI сборка/активация и реальные
браузерные контракты пока **NOT_RUN**. Настоящие положительные reference появятся
после следующего отдельно разрешённого этапа. Ничего не запускать сейчас.
После команды владельца на запуск серии допускается последовательность
0→1→2→3→4→5→6→7 с ACCEPT предыдущей карточки, confirmed cleanup и повторным
ресурсным допуском относительно LAB-55; это не требует повторного разрешения
для каждого перехода, если команда владельца уже охватывает всю серию.
