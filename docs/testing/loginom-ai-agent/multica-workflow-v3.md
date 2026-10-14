# Multica v3: checkpoint, допуск и распределение работ

> Исторический документ: результаты и ограничения сохранены. Правила оркестрации заменены 14.10.2026 на [независимую обработку узлов](multica-mas.md); старые команды не являются действующей инструкцией.

Внедрение 13.10.2026. Ветка `multica-workflow`, отдельный worktree; основной `txt-delivery`, незавершённые правки `node-orchestration` и `artifact-cleanup` сохранены. Клиент/сервер Multica, модели, роли, лимиты и критерии приёмки не изменялись. Канонический процесс — [multica-mas.md](multica-mas.md); инструкции четырёх ролей — [multica-roles](multica-roles).

## Обвязка и установка

База `ad03e9ba178a16ee3c74dab9f39b1e442dde7953` совпала по хешам с закреплённым и установленным MAS-набором. Более поздние artifact protections из `942fce6f462be4f13ca7140061f00945b66af58b` отдельно сопоставлены и сохранены: `artifacts.py` SHA256 `ee911349e5ccbf9cc3e497e45ad0d768550b123ad9a248db60b9b700e18f1650` совпал с ранее установленным файлом. Cleanup не ослаблялся.

Итоговая обвязка: `ed6ce02cbf21bb94b01df916af3985813f5785af`, опубликована в `multica-workflow`, установлена отдельно в `/home/user/.local/share/loginom-multica/orchestration/ed6ce02cbf21bb94b01df916af3985813f5785af`. Все 14 Python/Markdown файлов сверены побайтно через SFTP, CLI help проверен. Предыдущие каталоги сохранены. Squad URLs/SHA256 и четыре role instructions записаны через API и точно перечитаны; остальные конфигурационные поля сохранены. Daemon PID212379 при установке прежний, перезапуска не было.

- [checkpoint.py](https://github.com/gooddaytoday/loginom-ai-agent/blob/48b5a0c867f71d06a8c50d7136ac3cd7d863490d/scripts/multica/checkpoint.py): GET → `PUT description+expected_revision` → exact GET. 20 строк, приватная receipt до записи, конфликт/потерянный ответ без слепого повтора. Только описание.
- [admit.py](https://github.com/gooddaytoday/loginom-ai-agent/blob/48b5a0c867f71d06a8c50d7136ac3cd7d863490d/scripts/multica/admit.py): task/input hashes, полный clean candidate manifest, model/variant, profile/config/shared OAuth, требования и применимость исправлений, свежий resource/cleanup evidence. Один вызов штатного CLI; существующая receipt не разрешает второй запуск.
- [admission.md](https://github.com/gooddaytoday/loginom-ai-agent/blob/48b5a0c867f71d06a8c50d7136ac3cd7d863490d/scripts/multica/admission.md): точный формат и ограничения. Для LAB-72 проверяются оба этапа enabled prefixes, `Joined_` и метка `Присоединённое: `; исходный strict сценарий отдельный. Oracle/evidence не передаются как prompt, attachments или служебное окружение.

В процессе дополнительной сверки первоначальный71494 был заменён447dd (явный общий OAuth и idle initialized profile), затем85097 (оба этапа Union и точная метка), затемed6ce02c (равенство cwd/PWD/--dir). Новые вызовы admit направлены наed6ce02c; предыдущие receipts/каталоги не удалялись. Реальных модельных запусков для проверки обвязки не выполнялось. Это не sandbox, доказательство истинности reviewer evidence или защита от ручного обхода.

## Проверки

Контракт CAS и agent actor изучен в исходниках Multica `7ab92d7622ecd81d179a8d83ae2dea74835a5069`: handler issue, атомарная revision-проверка, routing/middleware, `WillEnqueueRun`. Изменение description не является status/assignee transition. Human-only guard для этого поля отсутствует.

На85097 иed6ce02c: **25 новых HTTP/process тестов PASS на macOS и MAS**. Итоговый полный установленныйed6ce02c набор: **MAS83/83 PASS**. Покрыты успешная запись, stale/racing revision, потерянный ответ, последующая чужая запись,403, сохранность draft/assignee/status, отсутствие POST/dispatch; CLI один раз, неверные оба этапа/метка, изменённые task/inputs/profile/payload, чужой candidate, missing fix, unexplained nonapplicability, stale/UNKNOWN resource-cleanup, busy profile, отсутствующий shared OAuth и отсутствие приватного oracle/token в передаче процессу.

Полный набор на447dd: macOS81 тест/skipped8; MAS81/81 PASS. Первый Linux проход на71494 имел6 отказов старых cleanup-тестов `Runtime process visibility incomplete`; они сохранены как исходный результат. Отдельный тест на прежнем установленном942fce прошёл; полный повтор447dd прошёл без изменения artifact защиты. Это временная видимость процессов, а не основание ослаблять cleanup.

**Live agent-token CAS подтверждён:** Генератор LAB-72, run `01a1359a-d318-7a8e-8a92-06d55672cc48`,13.10 14:19:29Z: `checkpoint.py --revision 520`, receipt verified, observed_revision521. Хеш checkpoint.py неизменен между71494 и85097. Операторский токен агенту не передавался.

Операторские live CAS/readbacks: LAB-66 `514→515`,67 `518→519`,68 `740→741`,69 `330→331`,70 `561→562`,71 `642→643`,73 `412→413`; status/assignee сохранены, во время каждой записи новых task-runs не наблюдалось. Первые drafts67/68/72 остановлены при изменении свежей проекции;67/68 согласованы с новыми caller/Resource68 результатами, чужой checkpoint72 сохранён. Это временной срез; текущие revision/результаты перечитывать перед действием.

## Продолжение

Один содержательный проход Регистратуры доставлен через handoff.py: comment `01a1359b-3805-7ad9-959c-68b4cc646d17`, связанный run `01a1359b-381d-75b4-933e-5567226335cf`, Handoff-ID `c7743bbca4b0e2de8e77b9240a3b806aef3532200fce529e12045f712293f48f`. Исходный Source-SHA71494 обозначает предмет поручения; окончательная версияed6ce02c передана update.py `01a135b3-518d-717a-9302-a29e3f883e7c` в то же назначение без нового run. queued/readback — доставка, не выполненный проход.

Текущие running/queued сохранены. Для следующих независимых остатков Resource68→68, terminal→70, Import→71, Replacement→73; пересекающиеся записи последовательно у одного автора конкретного исправления. В карточках ожидания связаны с источником, исполнителем, результатом и доступной независимой работой/prerequisite. Полные исторические доказательства остаются в комментариях/артефактах.

LAB-72: действующий Ловец определил original-owner passive qualification; первый Model86 FAIL и cleanup refusal сохранены. Владелец в этой сессии отдельно разрешил qualified same-owner recovery → new own UUID conflict-fail Save → confirmed cleanup и отсрочку post-inference collector SIGINT17:51:10МСК. Разрешение доставлено в **существующий** retained run `01a13545-d71b-7b39-9d4d-490dbfead7c8` human supplement `16e3a5a2-407d-46ed-9573-336be9a2d261`, exact readback. Само разрешение не доказывает route, Save или cleanup. Независимая offline подготовка исправленного business task выполнена прежним Генератором: comment01a135ae-f91a-772b-91db-3a7440cd3e3b → running01a135ae-f932-772c-8b7e-bdf06f9ac1b3; отдельное ревью прежним Ловцом, без модели/изменения текущих ресурсов. Регистратура уведомлена той же queued delta01a135af-9d14, дубль не нужен. Reset/hot patch guards/replay/discard/новый Runtime не разрешены; inference7200с сохранена. Worker подтвердил исходный collector SIGSTOP в14:32:20Z (comment01a135af-b427); оператор отдельно прочитал `ps`: collector2419169=T, CLI2419170/host2419197/managed2419464=Sl, daemon212379=Ssl. Save/cleanup/ACK/exit пока NOT_COMPLETED: нужен supported source-owned reconciliation на исходной tuple; frozen collector не читает stdout, поэтому при recovery учитывать backpressure и безопасное возобновление после terminal.

LAB-73: прежний автор опубликовал `67bd3ebd3ef2b360094ecfb4f8c892de3ba50e04`, parent0f469ca7: шесть строк canonical-array guard, immutable202610131403. Author SOURCE28+INSTALLED28, исходные reviewer assertions и duplicate/abort controls приложены. Независимое review выполнено прежним Ловцом: comment `01a135bb-b45c-7bb2-9b9a-def95890dea9`13.10 17:47МСК, run `01a13598-7aa8-736d-b4d8-6aa85aed3f6b`:28/28 SOURCE и28/28 INSTALLED PASS, unchanged author23+reviewer3+duplicate/abort2. Исходная потеря дополнительных array keys закрыта; exact202610131403,12 902 path/byte records и mode/snapshot расхождение проверены. Page/graph/wizard/resource/owner — doubles; stock native authority, receiving73 и полная приёмка остаются отдельными. Reviewer применил finaled6 и agent-token CAS747→748, сохранив другие строки; передача Регистратуре имеет linked queued run01a135bb-b470, это ещё не receiving73.

Исправленный business task LAB-72 и receiving73 доставлены действующим исполнителям; финальный requirements отдельно проверен; агентский итог отдельного прохода Регистратуры ещё ожидается в штатной очереди, операторский срез выполнен. Полная приёмка восьми узлов, merge и выпуск не входят в этот результат. Приватные квитанции/снимки/логи в git не включены.

## Доставка готового PASS и устранение гонки

67bd передан непосредственно прежнему Манки73 после fresh отсутствия active/queued: comment `01a135c0-a095-7a1b-9622-38a53288a881` → running `01a135c0-a0a1-76a4-89d3-ce8d7646e200`, Handoff `ea70e5d677181fb6f54bc18303a3e26793748b408afc83a7f022017ab451a959`. Предмет и файлы: original-pin producer0f, six-line retained-capture guard67 и адресные tests, текущая PR55 база/stronger guards сохранены. Это минимальный receiving в целевой карточке, не новая реализация общего producer.

Выявлена реальная гонка двух отправителей: Регистратура читала отсутствие назначения до операторского POST и затем создала duplicate `01a135c1-946f`/run`01a135c1-9484`. После readback она отменила только свой новый дубль **до запуска**, сохранив исходный running и pinned evidence; update `01a135c3-a165` подтверждает один оставшийся receiving. Handoff-ID предотвращает повтор одного action key, но разные scopes разных отправителей не являются атомарной блокировкой предмета. Рабочее правило одного отправителя и fresh dedup остаётся обязательным; сервер/клиент не менялись.

Регистратура также исправила свою запоздалую delta72: update `01a135c0-1b4b` снимает повторный вопрос о recovery, отдельную подготовку Worker и устаревший447dd для новых admit. Подготовка принадлежит Генератору72, удержание ресурсов прежнему Worker, финальный наборed6ce.

## Содержательный срез зависимостей, 13.10.2026 18:00 МСК

Снимок8 карточек, comments/task-runs/wakeups перечитан через API. Все checkpoints≤20 строк; source/installed/native/model результаты разделены. Revision — наблюдение этого среза, не блокировка дальнейших агентских записей.

| Карточка | Revision | Фактическое продолжение или точный prerequisite |
| --- | --- | --- |
| LAB-66 | 516 | Current owner/Page не установлены. С14:18 ждёт Resource68 у прежнего Манки/Ловца: дваP2 source7f4, corrective01a135a3-9939 уже queued. Receiving требует исправленного applicable provider; отдельный live не назначен. |
| LAB-67 | 523 | Independent caller1c0 bounded PASS получен, stage2 forwarding01a135bc-bab9 running у автора67. Original control через реальные startup awaits, затем exact product→Ловец; не ждать полного Resource68. |
| LAB-68 | 765 | Existing Union reconciliation author и generation7fec review идут; Resource68 corrective и terminal provider queued сохранены. Новые независимые Import/Replacement/terminal остатки уходят71/73/70 только после прежних назначений. |
| LAB-69 | 333 | Qualification4b699dc2 закончена: original caller signal/deadline отсутствуют. С17:07 ждёт конкретного согласования caller-control seam с FP67 entry, Registry69 run01a13597-0fe6 уже назначен; probes готовы, shared запись до согласования пересекается. Host7fec review отдельно, whole branch не prerequisite. |
| LAB-70 | 562 | С14:52 ждёт original-interface/storage-retention provider01a1359a-d847 у прежнего68 автора/Ловца. Разрешение на UUID Save получено, но original content verifier/storage authority ещё не доказаны; contract44628/a171 SOURCE не native release. |
| LAB-71 | 647 | Registration receiving4cca получил независимый bounded composition PASS. До native нужны original Import opening/readPreconfigSample/opaque clean/guarded Close и qualified generation7fec. ABI/evidence подготовлены, прежнее68 read/clean назначение сохраняется. |
| LAB-72 | 530 | Business task исправлен, independent preparation review01a135be-dd04 running; retained Worker отдельно хранит owner/UNKNOWN. Recovery разрешено, но original channel/settled reconciliation ещё нет; Save/cleanup/ACK/exit не завершены. |
| LAB-73 | 418 | Independent lossless-array67bd PASS передан в единственное running receiving01a135c0-a0a1; новый exact receiving SHA/build/addressed review — следующий результат. Stock native envelope остаётся отдельным prerequisite. |

Исторические queued/completed не обозначены текущей активностью. Дополнительных заданий ради слотов нет. Новые записи66 `515→516` и69 `331→332` точно перечитаны, status/assignee сохранены, новых runs при них0; остальные изменившиеся карточки уже обновили действующие агенты, оператор их новые тексты не перезаписывал.

## Независимая проверка подготовки LAB-72

Reviewer result `01a135c7-1a23-794b-8734-a0191c818a1b`: **PASS только LAB-72-enabled-prefixes**. Business task2851 байт, SHA256 `c312f6a01fa5e258aca71bd0ae97753a91ae16b7398cca3ec4bcbd8d956a6097`; оба этапа enabled, точный `Joined_` и `Присоединённое: ` с завершающимU+0020.10 payload pins и три прежних CSV побайтно проверены, oracle неизменён, business directory содержит только task+inputs. Исходный strict FAIL/open не переоценён.

Requirements draft `010e2950e0aced4c4178abab5626d43f4f64564141cc51dcd3c080d1b8eac4f5` независимо проверен: пять required_text и четыре route/cleanup prerequisites. Reviewer назначил прежнему Генератору только offline финализацию `review_reference` с новым requirements digest и update существующему retained Worker/Регистратуре. Это не создание resource/fix PASS и не разрешение нового model/native прогона. Новый source68 receipt-component `d92891adc645072207f9bcc269ec0d8d0c2b01b4` имеет авторские52+52, но original callback/cookie producer и runner/executor reconciliation всё ещё отсутствуют; current owner010 этим не освобождён.

## Уточнение границ координации

Наблюдаемый долгий проход обычного Import PASS выявил слишком широкое правило новой роли: «до завершения сверить все восемь». Оно заменено на проверку **только затронутых карточек** в обычном назначении; все восемь — только в отдельно назначенном проходе внедрения. Изменение записано в role и squad через API, exact readback/сохранность остальных настроек проверены. Это сокращает повторный аудит, сохраняя прежние роли/лимиты/безопасность. Операторский свод передан существующему v3 run информационной delta, без нового назначения.

Повторный `ps` после18:00МСК: daemon212379 с исходным start time, collector2419169=T, CLI2419170/host2419197/managed2419464=Sl. Перезапуска daemon/владельца не было; recovery still BLOCKED не скрывается за новой receipt-component SOURCE проверкой. Один read-only API snapshot завершился TLS EOF; повторное чтение прошло, потерянной записи/повторного dispatch не было.

Финальный private requirements создан прежним Генератором и дополнительно прочитан оператором на MAS: SHA256 `599397e479797d9153490fcc2ae5130fa3ba9bb003080db803d48bfa132acc31`, `review_reference=01a135c7-1a23-794b-8734-a0191c818a1b`. Task digestc312f6, required_text, точная trailing-space метка, все три исходных CSV и ровно4 файла business каталога сверены. Подготовительная ошибка закрыта, resource/fix admission не выдан. Приватный путь и raw evidence в репозиторий не копировались.

Проверено содержательное продолжение receiving73: опубликован `2e367922a4949edbaf840511f5bf5d84a2a91a5a`, parenta10fc, clean exact202610131503. Действующий автор сообщил28+9 SOURCE и28+9 actual-product PASS; canonical-array guard уже equivalent, добавлены original-pins module и2tests. Это авторский receiving результат, независимый receiving verdict ещё не заявлен. Информационная передача существующему v3 run: `01a135cd-1990-74a8-a839-a504f2c577b1`, без нового coordination run.

Граница итогового отчёта: обвязка установлена и проверена, инструкции обновлены, операторский проход всех8checkpoints/ожиданий выполнен, реальные продолжения LAB72/73 подтверждены. Отдельное назначение Регистратуры `01a1359b-381d` ещё queued за прежним действующим согласованием LAB69 `01a13597-0fe6`; queued не объявляется выполненным агентским проходом. Его вход дополнен точным операторским срезом и уже выполненными передачами, чтобы не повторять работу. Current-owner recovery/Save/cleanup LAB72, independent receiving73 и полная приёмка узлов остаются открытыми в действующих назначениях. Следующий безопасный шаг — завершить эти существующие технические продолжения; merge/release не выполнялись.
