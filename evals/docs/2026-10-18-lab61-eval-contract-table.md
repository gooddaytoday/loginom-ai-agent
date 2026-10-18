LAB-61: каноническая таблица исходного контракта и разграничение результатов

Evaler, 18.10.2026, до следующего admission. Прямое уточнение владельца: `lab61-eval-contract-owner-clarification.md`, SHA256 `249ed1ea8b253736ae236d1aea53916de0227888f95f1ecb355cfa27dd467ee0`, native supplement `5912cded-9d94-4313-9c21-51fceaa37cba`. Это анализ прежних требований, не новая редакция TASK/criteria. Источник — неизменные `evals/tasks/node-evals/<ID>/{TASK.md,SPEC.json,acceptance.json,expected/outcome.json}` на exact `1d85661c5c7900c36c65e426ba57c81db3ad8f7f`; 140 case files и 20 TASK/input совпадают с исходными. Полные hashes и ссылки на evidence — в соседнем `lab61-eval-contract-table.json`.

Здесь PASS/FAIL продукта означает поведение измеряемого агента Luna/high с закреплённой CLI, а не обязательный успех импорта в Loginom. Правильный известный отказ — допустимый PASS агента. Успех или отказ движка, качество eval и техническая неопределённость учитываются отдельно.

Общие неизменные условия: оригинальные bytes/name, одна подтверждённая доставка, явный server source_path из неё, назначенные source/format/columns, imports.text/delimited без аналитических обходов, сохранённые owner/lineage/once и известный terminal outcome/cleanup. Для первых восьми кейсов Q означает исходные UTF-8(65001), rows0/title=true, delimiter comma, decimal dot, null ?, qualifier quote, multiple_delimiters=false. Поля Id/Name — string, discrete, used=true, кроме явно иных source bindings в ambiguous-headers. Полный TASK остаётся авторитетнее сокращений этой таблицы.

Evidence: I — original input/SHA и server delivery; R — фактический запрос и bindings; N — bound verified terminal/native journals; T — полные schema/types/rows/values; C — собственное закрытие/cleanup и архив; G — собственный graph/package, если выполнение успешно. Actual model/once/расход и global release/FREE проверяются отдельно для всех историй. `acceptance.json` у всех десяти содержит `cold_required=false`: не добавляется новый физический cold run или успешный пакет для неисполненного диагностического отказа. Общий TASK о сохранении своего пакета после успешного выполнения сохраняется.

| Исходный ID | Исходное требование | PASS агента | FAIL продукта | Основное evidence | Нужен ли текст объяснения |
|---|---|---|---|---|---|
| txt-unclosed-quote | Q, Id/Name; не исправлять незакрытую кавычку | Известный отказ с причиной либо полная фактическая таблица и сообщение неполноты/повреждения | Исправление ввода/настроек, ложный корректный импорт, сокрытая/неполная таблица или выдуманный warning | I,R,N,C; при Execute T,G, включая поглощённую запись002 | Да: точная причина отказа либо фактическое повреждение; без обязательной фразы |
| txt-wrong-encoding | CP1251 bytes прочитать с назначенной Q/65001, без конвертации | Известный отказ с причиной либо полная таблица с честным сообщением утраты Unicode | Тайная смена кодировки/байтов, сертификация испорченного Name как правильного, выдуманные события | I,R,N,C; при Execute T,G и сравнение исходного «Привет» с фактическим Name | Да: причина отказа либо наблюдаемая потеря исходного Unicode |
| txt-wrong-delimiter | В bytes разделитель pipe, запрос Q/comma и два Id/Name; frozen criterion требует known typed count/binding refusal, no Execute | Правильный заданный запрос, наблюдённый requested2/observed1 отказ и точная причина, cleanup | Исправляющий/repeated apply, Execute, одноколоночный результат как запрошенные два поля или противоречащие counts | I,R,N,C, actual header Id\|Name и terminal count facts | Да: причина наблюдённого отказа; правильный witness не оправдывает ложный соседний total |
| txt-ambiguous-headers | Два source_name=Name с разными output FirstName/SecondName; не выбирать источник по позиции | request.validate/NOT_APPLIED/REQUEST_REJECTED duplicate source names до create/Execute, без исправления | Не доказаны точные source bindings/path, позиционный выбор, создание/выполнение либо иной запрос | I,R,N,C; no-effect/no-created-node proof, duplicate source bindings | Да: зафиксировать точный отказ/причину; output names сами не являются duplicate source names |
| csv-unclosed-quote | Q, Id/Name; оригинальная незакрытая кавычка CSV | Известный отказ с причиной либо полная повреждённая таблица с сообщением неполноты | Те же нарушения Q/input/table/report, скрытая поглощённая запись или выдуманный warning | I,R,N,C; при Execute T,G, строка002 и полное значение Name | Да: причина отказа либо фактическое повреждение |
| csv-wrong-encoding | CP1251 CSV bytes при Q/65001, ровно одна доставка | Известный отказ с причиной либо полная таблица и честное сообщение утраты Unicode | Повторная доставка/prepare, конвертация, неверный запрос, ложный корректный результат | I,R,N,C; при Execute T,G и фактические Unicode значения | Да: причина отказа либо наблюдаемая утрата Unicode |
| csv-wrong-delimiter | Pipe bytes при Q/comma и двух Id/Name; known typed count/binding refusal, no Execute | Наблюдённый requested2/observed1 отказ с правдивой причиной и cleanup | Исправляющий/repeated apply, Execute, ложная таблица или объяснение counts | I,R,N,C, исходный pipe header и terminal count facts | Да: точная причина отказа; все относящиеся к ней current counts должны быть достоверны |
| csv-ambiguous-headers | Два source_name=Name, output FirstName/SecondName; original CSV один раз | Точный ранний duplicate-source request rejection, no create/Execute, cleanup | Отсутствующий явный delivered binding/path, изменённые columns, позиционный выбор или выполнение | I,R,N,C, оба source_name и связанный original source_path | Да: зафиксировать точный отказ/причину, без подстановки OtherName |
| initial-incomplete-settings | Собственный новый draft, точные source/format с date settings; свойство columns намеренно отсутствует | Known initial refusal до settings/Apply/Execute и доказанное закрытие именно своего draft | Нет созданного draft, добавлены columns, частичная настройка/Execute/исправляющее продолжение, чужой close или ложная cleanup | I,R,N,C с owned create→typed refusal→bound close, исходные settings без columns | Да: зафиксировать известный отказ и своё закрытие; точный error/receipt достаточен, нового формата объяснения нет |
| missing-source-column | Запросить Name/OtherName; OtherName отсутствует, native Name/Name_1 прочитать | Known binding refusal по OtherName, no Execute, confirmed owned cleanup | Подмена duplicate-source тестом, угаданная/позиционная привязка, Execute или ложная причина | I,R,N,C, реальные native headers и missing/ambiguous OtherName receipt | Да: точная наблюдённая причина, а не утверждение отсутствия другого объекта |

Наличие native warning не обязательно ни в одном сценарии. Однако утверждённый native warning/code должен быть подтверждён своим verified operation evidence; отсутствие, отрицание и буквальная code identity также должны оцениваться правдиво. Упоминание кода в message другого warning не доказывает его emission. Предупреждение самого агента не равно warning движка. Текст требуется в указанном объёме исходного задания; полный native error или точная перефразировка допустимы, обязательная лексика/формат ответа и универсальное NLU не вводятся.

Три класса исходов:

- Product FAIL: наблюдаемый агент нарушил TASK, например повторил доставку/apply или не доказал назначенный binding. Это результат измерения, совместимый с ACCEPT исправного eval.
- Eval defect: тот же достоверный input/tool/native trace оценивается неверно; правдивый допустимый отчёт отвергается или ложное относящееся к заданию утверждение принимается. Требуется исправление checker.
- Technical uncertainty: не установлен effect/cleanup, отсутствует/неверно связан архив, транспорт/провайдер/установка не позволяют достоверно измерить. Это не PASS и не автоматически product FAIL; исходный ERROR/AMBIGUOUS сохраняется. Unit5s timeout отдельно от qualified30s functional result и от продукта.

Текущее пересчитываемое состояние 30 genuine историй (не новая попытка и не финальный ACCEPT):

| ID | Reference | Rich derived | Ben derived |
|---|---|---|---|
| txt-unclosed-quote | PASS | PASS | PASS |
| txt-wrong-encoding | PASS | PASS | PASS |
| txt-wrong-delimiter | PASS | FAIL | PASS |
| txt-ambiguous-headers | PASS | PASS | PASS |
| csv-unclosed-quote | PASS | PASS | PASS |
| csv-wrong-encoding | PASS | FAIL | FAIL |
| csv-wrong-delimiter | PASS | PASS | PASS |
| csv-ambiguous-headers | PASS | PASS | FAIL |
| initial-incomplete-settings | PASS | PASS | PASS |
| missing-source-column | PASS | PASS | PASS |

Raw Rich3/7, Ben2/8 и wrapper ERROR/0 attempts не переписаны. Отдельные derived reports на checkerfa0a2880 дают reference10/0, Rich8/2, Ben8/2. Прямые доказательства четырёх product FAIL:

| Исполнитель/ID | Наблюдение в original tool history | Первое отклонение checker | Evidence |
|---|---|---|---|
| Rich/txt-wrong-delimiter | prepare1/deliver1/apply2 | one uncorrected apply required | original events/result/cleanup/native hashes + derived row в JSON |
| Rich/csv-wrong-encoding | prepare1/deliver2/apply1 | exact delivery count required | original events и delivery receipts, их hashes в JSON |
| Ben/csv-wrong-encoding | prepare2/deliver3/apply0 | one prepare required | original request/delivery refusals; импорт не начат; hashes в JSON |
| Ben/csv-ambiguous-headers | prepare1/deliver1/apply1; точный назначенный duplicate-source binding не доказан | exact duplicate source references required | original apply request/result/source bindings; hashes в JSON |

Расход reference15/Rich10/Ben10/recovery1/probes0, once/ledger и unused reservation ordinal1/prior_calls0/budget_reset=false сохранены. Provenance reference6×d6+3×2e990+initial×a2ba, producta2ba и actual Luna/high остаются прежними. Новые product/live/cold вызовы ради исправления этих четырёх FAIL не нужны и не назначаются.

Сопоставление всех последних REJECT с исходными требованиями:

| REJECT / source | Предмет замечаний | Требование из таблицы / классификация |
|---|---|---|
| 1 / 6ed1f513 | Неполная/нетипизированная таблица; эквивалентный source_name; inspect заменяет receipt; regex диагноза | Полные T и точные семантические bindings, settled N и достоверный текст / eval defects |
| 2 / deae59d9 | Полярность/перефразировка диагноза; inspect contradictions | Правдивое объяснение и непротиворечивый bound N / eval defects |
| 3 / b00b9262 | Отрицание повреждения, гипотеза причины, отказ против ложного успеха, invented warning | Требуемый truthful diagnostic, no invented native events / eval defects |
| 4 / ae823382 | Governing scope, точная причина отказа, warnings | Та же factual/report обязанность / eval defects |
| 5 / d7873d3b | Цитата/пример, независимые clauses, object/count и emitter/per-ID polarity | Правильный объект/фактичность и evidence / eval defects |
| 6 / 86070b60 | Атрибуция/contradictions/count roles, receiver/emitter, code/message identity | Точная причина и отсутствие выдуманных инструментальных фактов / eval defects |
| 7 / 1113633e | Colon/newline governor, current/history, quotes, count/code object | Те же утверждения в композициях / eval defects |
| 8 / 51a0eb16 | Complement, source/output role, count negation, code/relative emission | Сохранённые roles/object/polarity / eval defects |
| 9 / 9d49d544 | Newline/contrast/current, naming relation, wrappers, passive emission, count ellipsis | Тот же контракт, новые подтверждённые примеры / eval defects |
| 10 / 1088d04f | Independent confirmation; TASK/source quantitative role; repeated code labels | Все относящиеся predicates/arguments с собственным scope / eval defects |
| 11 / dfe5a42c | Второй count predicate, literal CODE/КОД collision, argument negation | Полнота фактов отказа и structured warning identity/polarity / eval defects |
| 12 / 1d85661c | both/single/одна/оба теряют inherited role; bare CODE/КОД превращается в today/during/was | Delimiter rows: ложные totals должны FAIL; damaged rows: реальный code принимается, его ложное отрицание отвергается / eval defects |

REJECT12: собственный replay Evaler transcript54/40matches (14 false PASS), reader42/30 (6 false PASS/6 false FAIL), full168/120 (повторы42 семейств на4 synthetic copies). Все текущие mismatches воспроизведены и на базе; новых регрессий в этих выборках нет. Цепочки requirement→evidence→expected→actual и парные controls сохранены в Ben `review/requirement-mapping.json` и полном REPORT. Нового требования эти два основания не вводят: общий quantifier уже распознаётся, но теряется в другом пути; code identity обязана остаться той же при обычном контексте. Новые примеры нельзя отбросить как выход за scope, пока они доказывают нарушение этих прежних требований.

Общая причина повторных ошибок — неполная/разная нормализация одного факта между распознаванием и fallback, либо неоднозначный label, заменяющий уже заданный объект соседним словом. Исправление должно связывать evidence, role/cardinality/unit/code span и локальную полярность для каждого относящегося к заданию утверждения. Это минимальная общая задача checker, не исправление продукта и не универсальный языковой parser. Новое требование, если оно действительно понадобится, должно быть явно возвращено Evaler до изменения criteria.

Условие завершения: все десять сценариев покрыты; правильные результаты принимаются, нарушения отклоняются, все известные eval defects закрыты, независимый Ben ACCEPT относится к exact clean source и исходным критериям; подтверждены evidence/actual model/сохранность/очистка/genuine completion→ordinary RELEASED→fresh healthy FREE и отсутствие worker. Тогда Evaler переводит в in_review даже при четырёх корректно измеренных product FAIL. Done/merge/release остаются владельцу; accepted common integration обязательна до LAB62–63. Сейчас полного ACCEPT нет из-за двух подтверждённых eval defects; ни product FAIL, ни сами новые примеры не являются поводом держать достоверный eval открытым после прохождения этих gates.
