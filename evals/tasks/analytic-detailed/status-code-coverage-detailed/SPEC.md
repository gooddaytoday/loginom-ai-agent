# Согласование кодов операционного статуса — фактический эталон P30

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

## Источник и общий контракт
requests.csv полностью synthetic:14 уникальных заявок id, два ASCII source, текстовый status; внешних данных нет, fixture и код распространяются по MIT проекта.
Целый маркер ? обозначает настоящий NULL, quoted empty — пустую строку, текст NULL остаётся буквальным значением; дат, валют и весов нет.
completed строго done/closed/Готово/Завершено; open строго new/in_progress/Новая/В работе. Сопоставление регистрозависимо, без trim.
R09 done с конечным пробелом, R10 Done и R11 готово остаются unmapped; R12 actual NULL и R13 empty относятся к missing, R14 literal NULL — к unmapped.
Одна заявка даёт ровно requests1 и одну из completed/open/missing/unmapped; все source сохраняются по одному итогу ASCII ASC.
completion_pct=100*completed/(completed+open); missing/unmapped исключены из знаменателя; при отсутствии распознанных статусов процент неопределён и пуст.
D/B имеют одинаковые входы/словарь/common/schema/oracle/tolerance/rubric, метод добавлен только D. Эквивалентная native-композиция допускается без node-name/count/layout gate.

## Фактическая композиция Unit_0/Unit.xml
Пакет содержит7 native узлов и6 workflow links; это описание observed reference, не критерий альтернативного решения. Все7 XML прочитаны,14 файловых payloads, внешних reference/JS/static totals нет.
1. TBGImportTextFile читает actual requests.csv; id/source/status dtString. Оригинальный typed request/свежий полный14-row port подтверждают UTF8/header/semicolon/quote/? NULL-marker, строковые регистр и пробелы; часть default настроек не сериализована явным атрибутом Unit.xml.
2. TBGCalcData создаёт requests=1 и integer flags. completed/open используют RegExMatch с точными якорями \A(?:aliases)\z и NVL(status,empty); missing=IFF(IsNull(status) or status=empty,1,0); unmapped=requests−completed−open−missing.
Полный native порт сохраняет R12 NULL/is_nulltrue, R13 empty/is_nullfalse, R14 literalNULL/is_nullfalse; все14 флагов сверены с frozen raw.
3. TBGGroupDataEngine по source суммирует все5 флагов gdSum; actual mappings requests_Sum/completed_Sum/open_Sum/missing_Sum/unmapped_Sum названы requests/completed/open/missing/unmapped. Непустой status не подменяет число всех заявок.
4. TBGCalcData: IF(completed+open>0,100.0*completed/(completed+open),Null). SRC_A denominator8→50; SRC_B denominator0→true numeric NULL.
5. TBGReformColumnsEngine приводит все5 SUM counters к dtInteger, сохраняя source и completion_pct.
6. TBGSortingEngine сортирует source ASC, LocaleAware=false. 7. TBGExportTextFile выгружает один CSV UTF8/header/semicolon/dot/quote/emptyNULL/noBOM/LF по actual request/readback.

## Полный ожидаемый результат
Все14 named cells/2 строки, все10 counters — неотрицательные целые тексты без дробной части; sole empty SRC_B/completion_pct. Имена семи колонок точные, порядок колонок не оценивается.
Абсолютный численный допуск±0.001; нет промежуточного округления, дополнительной minprecision или padding.
```csv
source;requests;completed;open;missing;unmapped;completion_pct
SRC_A;11;4;4;0;3;50
SRC_B;3;0;0;2;1;
```
Independent full manual и raw-only Decimal oracle созданы после freeze до native. 14requests=8recognized+6missing/unmapped; SRC_A11=4+4+0+3, SRC_B3=0+0+2+1.
Gold присутствует только в материалах судьи, вне agent prompt/inputs. Оба original oracle выполнены по одному GREEN; public использует только existing corpus recipes на disposable copies.

## Фактическое исполнение и ограничения
Reference — original detailed A1/package.lgp; business честно разделяет этот reference, без отдельной B session/model/attempt.
Original PRIVATE_PROCESS terminal0, CLI0/458s/A1used1of3/nohint/noreset; own DB30assistant подтверждает openai/gpt-6-sol/xhigh. Requested STANDARD,response tier NOT_OBSERVED,speed NOT_MEASURED.
36completed tool events/35unique calls/0tool errors; один skill callID/input/output повторён с metadata activation, не новая попытка или whole-event equality.
Actual argv/prompt9530B — task+normal tail; DB9537B отличается только exterior quotes+five escaped quotes(+7), remainder exact/literal newlines, validJSONfalse. Отдельные74B framing+282B raw text+282B raw file сохранены; autocontext absence NOT_ATTESTED.
Native collect extra-arg usage error8d685f остановлен до сбора; затем штатный collect713a23/check57b305 PASS. Модель/oracle не перезапускались.
Save save_completed/workflow_preserved=true,reopened/persisted_content_verified=false; arrangement attempted/result_unconfirmed/warningtrue; исходные data not_checked/goal not_verified не повышены до verified.
Own ordinary saved-package Close/logout, original Runtime+Knowledge closed_ack/actualexit0/noSignal и binding CLI/Dock/document/account/path подтверждены; последующий idle/config preserved. Native actual34APPROVE/rootFULLREADcb8fbe adopted2a9f41.
Cold: один browser RunAll05:11:52.833Z, все7native+1service grey→green/23ports; NoConfigure/NoSave. Новый CSV100B/inode [private]/mtime05:11:53.185589117Z совпал byte-exact с native/manual/oracle.
Server LGP/raw SHA+size/inode/mtime/ctime/device неизменны; collect915b05/check2e7559 --rerun PASS once/full14/10integer/soleNULL. NoSave→home→Logout signin→own ownTab[private]close/IAB[] подтверждены DOM.
Packages text timeout был до menu effect; следующий AX показал closed menu, container click открыл его. Immediate AX асинхронен; последующий DOM подтверждает closure, Open/RunAll/NoSave/logout выполнены по одному разу.
Два полных scoped metadata прохода при живом observer:195 realUID процессов каждый, matching runtime/writer/pending/recovery отсутствуют, config/raw unchanged; denied unrelated metadata limits сохранены, новый CLI probe не выполнялся.
ScenarioURL derived из actual endpoint/saved package/Unit1, отдельный deep-link visit не заявлен. Подробные accepted pins и факты — в provenance.json.
Четыре existing-kind near-miss: requests→completed mapping, open-only denominator, отсутствие конечного completed regex anchor и source DESC. Каждый полный wrongCSV независимо выведен только из raw; XML/recipe применяются к disposable copies, native mutants не исполняются.
Combined cold+public actual review ожидается; calibration/sole D/B/pair acceptance NOTRUN/PENDING. Campaign dependencies сохраняются без нового pair-only gate.
