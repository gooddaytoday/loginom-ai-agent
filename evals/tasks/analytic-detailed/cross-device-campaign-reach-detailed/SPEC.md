# Охват кампаний после сопоставления устройств и людей

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

## Задача и происхождение данных

Одна строка на кампанию полного реестра: все показы, число разных известных людей, число неизвестных показов и частота идентифицированных показов на известного человека. Detailed и business имеют одинаковые входы, общий контракт, rubric, tolerance и oracle; подробная форма раскрывает способ расчёта.

Данные полностью синтетические, созданы eval-author: 3 campaigns, 3 identities и 7 impression events. Три raw CSV заморожены до ручного gold и oracle. Это не UCI, реальные пользователи или производный снимок; внешние datasets, готовые пакеты и сторонние лицензии не использованы, лицензия репозитория — MIT. Временного окна и преобразований дат нет.

campaigns.csv(campaign_id) — полный реестр с уникальным campaign_id. В impressions.csv(event_id,campaign_id,device_id) уникален event_id, каждый campaign_id существует в campaigns. identities.csv(device_id,person_id) имеет уникальный device_id и однозначное device→person; несколько устройств могут принадлежать одному человеку. Устройство показа может отсутствовать в identities. Входные ячейки непустые, без NULL; ключи — строки ASCII с учётом регистра. Входы UTF-8, `;`, заголовок, десятичная точка, двойная кавычка как текстовый ограничитель.

Независимый Python stdlib csv oracle читает три raw: хранит event/unknown counters и set известных person_id на кампанию, отдельно обходит полный campaigns. Повторные события не удаляются; неизвестные не входят в set. Частота — (impressions−unknown_impressions)/known_people без промежуточного округления; при пустом set записывается пустая ячейка. Полная ручная таблица 3×5 создана независимо до native. Фактический Python runtime/version записан в provenance.

## Фактический native reference

Saved Info.xml задаёт Name=Unit1; граф находится в ZIP member Unit_0/Unit.xml. Наблюдаются 15 native узлов и 15 data links — это описание принятого reference, не критерий числа/имён узлов или внутренней композиции. Все три импорта связаны с единственным текстовым экспортом; JavaScript и готовые итоговые значения не подставлены.

1. «Показы», «Люди и устройства», «Реестр кампаний» — три TBGImportTextFile. Читаются доставленные storage-файлы с suffix impressions.csv, identities.csv, campaigns.csv; точные пути сохранены в provenance. Исходные колонки имеют dtString/dkDiscrete; UTF-8/`;`/header/decimal-dot/empty-NULL.
2. «Сопоставить устройства» — TBGJoinDataEngine, impressions слева и identities справа, LEFT по device_id. Ключи сохранены; SyncThroughColumns передаёт исходные event_id/campaign_id/device_id и person_id, отсутствующий person_id остаётся NULL.
3. «Признак неизвестного» — TBGCalcData: integer unknown_flag=`IFF(IsNull(person_id), 1, 0)`.
4. «Показы и неизвестные» — TBGGroupDataEngine по campaign_id: event_id с gdCount и unknown_flag с gdSum. Output mappings event_id_Count→impressions (dtInteger), unknown_flag_Sum→unknown_impressions (на этой стадии dtFloat). device_id/person_id не являются группировками.
5. Параллельная ветвь «Известные люди» — TBGFilterDataEngine: person_id frtIsNotNull, строковый active input person_id, SyncThroughColumns=true. Неизвестные события остаются в первой ветви, но не образуют человека здесь.
6. «Пары кампания человек» — TBGGroupDataEngine по campaign_id/person_id. event_id gdCount→identified_events (integer) через mapping event_id_Count. Группируется человек после сопоставления устройств, поэтому несколько устройств и несколько событий одного person_id дают одну пару.
7. «Уникальные люди» — TBGGroupDataEngine по campaign_id, person_id gdCount; output mapping person_id_Count→known_people (integer). identified_events не участвует в подсчёте людей.
8. «Все кампании и показы» — TBGJoinDataEngine: полный campaigns слева, первая агрегатная ветвь справа; LEFT по campaign_id. «Все кампании и люди» — второй LEFT по campaign_id: предыдущий результат слева, known_people справа. Ключи и показатели передаются через SyncThroughColumns.
9. «Нули для пустых кампаний» — TBGCalcData с тремя replaced dtInteger выражениями `NVLF(impressions, 0)`, `NVLF(known_people, 0)`, `NVLF(unknown_impressions, 0)`. Так отсутствующие агрегаты становятся целыми нулями.
10. «Показы на человека» — TBGCalcData: dtFloat identified_impressions_per_person=`IF(known_people > 0, (impressions - unknown_impressions) / known_people, Null)`.
11. «Порядок кампаний» — TBGSortingEngine, campaign_id ASC, LocaleAware=false; пять output mappings передают одноимённые поля. В saved reference порядок колонок frequency/campaign_id/impressions/known_people/unknown_impressions, что допустимо.
12. «Итоговый CSV» — TBGExportTextFile: один UTF-8 CSV, `;`, names header, decimal `.`, qualifier `"`, empty NULL; фактический LF/no BOM. Путь PRIVATE_STORAGE — исходный Authoring export.

Связи: impressions+identities→LEFT→две ветви: unknown_flag→campaign aggregates и known-person filter→campaign/person groups→campaign person count. campaigns+aggregates→LEFT; его результат+person count→LEFT→integer zero-fill→frequency→sort→sole export. Все три LEFT подтверждены actual native readback; отсутствие JoinType в XML само по себе не является доказательством LEFT.

## Полный результат и проверенные границы

Ровно 3 строки × 5 колонок. Имена колонок и состав точны; их порядок при сверке свободный. Строки campaign_id ASC как ASCII с учётом регистра; тексты и пустые ячейки точны. Числовой допуск ±0.001; три счётчика — целые неотрицательные тексты без дробной части/разделителей тысяч. Для frequency дополнительного минимума знаков после точки нет; промежуточного округления нет.

```csv
campaign_id;impressions;known_people;unknown_impressions;identified_impressions_per_person
C01;5;2;1;2
C02;2;0;2;
C03;0;0;0;
```

C01 E01–E05: 5 событий, P01/P02 — 2 человека, DX — 1 неизвестный показ; (5−1)/2=2. D01/D02 одного P01 не образуют двух людей; повторные события сохраняются. C02: DY/DZ дают 2 показа и 2 unknown, 0 людей и NULL frequency. C03 без показов сохранена с тремя нулями и NULL frequency. Проверены все 15 именованных ячеек, 9 integer texts и 2 пустые frequency; actual column order отличается от oracle допустимо.

A1 из разрешённого бюджета3 с технической подсказкой завершён CLI exit0; фактически одна попытка. БД подтвердила openai/gpt-6-sol/xhigh. За878s:50tools,41Loginom calls,0tool errors,0memory calls. Actual candidate CLI0.0.0-preview-cache; finalizer выполнил только --version, binarySHA совпал с исходным A1 pin. Все15 saved native GUID имеют SUCCEEDED/completed execution;15links согласованы с запросами. Эти числа — наблюдения, не дополнительные gates.

Save SUCCEEDED/save_completed=true/cleanup_complete=true и modified=false. Исходные reopened=false/persisted_content_verified=false сохранены честно; arrangement.status=attempted/reason=result_unconfirmed/warning=true. Оба ORIGINAL runtime/knowledge Close: ACKtrue/request_error=null/exit0/signal=null; сохранённое post-A1 idle evidence writer=null/recovery=[].

Root cold открыл точный сохранённый пакет через «Пакеты → Открыть», без Configure/мастеров/перепривязки/Save. F9 выполнен для первых двух импортов, затем существующая кнопка «Выполнить все» нажата один раз; 15 отдельных успешных F9 не заявляются. Две screenshots показывают все15зелёных узлов и связи. После единственного park появился новый125B CSV на другом inode с mtime после park; все15cells/9integer/2NULL/ASC совпали с manual/oracle, CSV побайтно равен CLI export. Server LGP и3raw SHA+stat неизменны, старый CSV сохранён. Close→«Не сохранять», logout, закрытие собственного ownTab[private]/browser2 и idle writer=null/recovery=[] подтверждены. Независимые actual native и cold SPEC+QUALITY reviews APPROVE; cold не меняет ограничения исходной Save-операции.

scenario_url в provenance выведен из Authoring endpoint, saved package и Info.xml Name=Unit1. Cold открывал пакет через UI; посещение этой deep link отдельно не утверждается. Private D финализирован штатно по original A/.case, original7files/form и original A/.case сохранены. Business использует shared accepted detailed reference с source_task/source_provenance без отдельной B attempt/model/session/CLI.

Четыре near-miss на форму: device_id вместо person_id даёт C01 known3/frequency4/3; пропуск unknown через known-person filter и count grouped events объединяет неизвестных в одного fictitious person/campaign (C01 known3/frequency4/3, C02 known1/frequency0); inner вместо первого campaign LEFT теряет C03; все показы в числителе дают C01 frequency2.5. Для unknown формула frequency не изменена; его expected_failed — identity/base/result. Все имеют oracle=false; полные CSV пересчитаны из3raw точными изменениями временной копии oracle. Только calibration copies Unit.xml редактируются; GUIDs/links и остальные13payloads/BIN сохраняются. Native/cold исполнение mutants не утверждается.

Positive — genuine reference и oracle. Foreign для будущей полной G05 — штатная следующая выбранная отличная аналитическая задача той же формы; D/B этой пары не negatives друг другу. Fresh public SPEC→QUALITY, judged calibration, sole D/B measurements и окончательная приёмка пары pending; live judge здесь не запускался.
