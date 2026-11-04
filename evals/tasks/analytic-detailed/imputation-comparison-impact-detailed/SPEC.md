# Влияние заполнения пропусков на сравнение подразделений — фактический эталон P29

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

## Источник и общий контракт
jobs.csv полностью synthetic: шесть работ, уникальный job_id, ASCII department, часы processing_hours; источник создан автором eval, внешних данных/лицензий нет, код и fixture распространяются по MIT проекта.
Зерно — одна работа. processing_hours — конечные неотрицательные часы или исходный numeric NULL, записанный пустым последним CSV-полем; буквальный NULL/пробелы не используются.
J01=0 является наблюдением; J03/J05/J06 missing; DEP_C не имеет исходных наблюдений. Дат/денежных единиц нет.
Общая средняя восстановления вычисляется по всем исходно известным часам файла, включая0: (0+4+8)/3=4; она одинакова для подразделений.
jobs включает все работы, observed_jobs только исходно известные часы, imputed_jobs только исходные пропуски; jobs=observed_jobs+imputed_jobs.
observed_mean относится к исходным наблюдениям; без наблюдений она неопределённа и экспортируется пустой. completed_mean относится ко всем работам после глобального заполнения.
Все department сохраняются по одному, ASCII ASC DEP_A/DEP_B/DEP_C. Имена шести колонок точные, порядок колонок не оценивается.
D/B получают одинаковые raw/контракт/oracle/рубрику; способ расчёта добавлен только D. Эквивалентная native-композиция допускается без node-name/count/layout gate.

## Фактическая композиция Unit_0/Unit.xml
Пакет содержит9 native узлов и9 workflow links, без JS/готовых статических ответов/подмены raw; количество описывает observed reference, не критерий альтернативного решения.
1. TBGImportTextFile читает jobs.csv: UTF-8/заголовок/«;»/точка/двойная кавычка/пустой NULL; job_id и department dtString, processing_hours dtFloat/dkContinuous.
2. TBGCalcData до обеих ветвей создаёт integer originally_missing=IFF(IsNull(processing_hours),1,0) и originally_observed=IFF(IsNull(processing_hours),0,1).
3. Исходный TBGGroupDataEngine по department: gdCount(job_id)→jobs, gdSum(originally_observed)→observed_jobs, gdSum(originally_missing)→imputed_jobs, gdAvg(processing_hours)→observed_mean.
Полный оригинальный порт сохраняет C jobs1/observed0/imputed1/observed_mean NULL и J01 как исходное наблюдение.
4. TBGDataRecoveryEngine MaxNullsPercent=100, только processing_hours ActionNull=anMean; ordered=false в actual request/readback. Шесть свежих строк подтверждают J03/J05/J06→4 и неизменные исходные flags/J01zero.
Random RandSeed=692293402 сохранён как actual default; выбран детерминированный arithmetic anMean, не random replacement. Common seed42 для выбранного stochastic-step здесь не применяется; иных методов восстановления не проверяли.
5. Второй TBGGroupDataEngine по department вычисляет gdAvg заполненного processing_hours→completed_mean:8/3,6,4. Исходная ветвь отдельно reread/активирована и не утрачивает исходную полноту/NULL.
6. TBGJoinDataEngine LEFT по department сохраняет полное основание исходной ветви и добавляет completed_mean.
7. TBGReformColumnsEngine приводит observed_jobs/imputed_jobs SUM к dtInteger, сохраняя jobs и обе средние.
8. TBGSortingEngine department ASC/LocaleAware=false; TBGExportTextFile один UTF-8 CSV с именами/«;»/точкой/двойной кавычкой/пустым NULL, LF/без BOM по actual request/receipt/readback.

## Полный ожидаемый CSV
Все18ячеек и порядок3строк оцениваются; все9 counters — неотрицательные целые тексты, единственная пустая ячейка DEP_C/observed_mean.
Числа сравниваются с абсолютным допуском±0.001, без промежуточного округления или дополнительной minprecision/decimal-padding.
```csv
department;jobs;observed_jobs;imputed_jobs;observed_mean;completed_mean
DEP_A;3;2;1;2;2.666666666666666666666666667
DEP_B;2;1;1;8;6
DEP_C;1;0;1;;4
```
Полный независимый ручной ledger и raw-only Decimal oracle созданы после raw freeze до native; gold не входит в agent prompt.
Консервация:6jobs=3observed+3missing; сумма completed_hours24=12observed+3×global4. Нулевой наблюдаемый час включён в правильные знаменатели.

## Фактическое выполнение и ограничения
Reference — оригинальный D/A1/package.lgp; B честно разделяет этот пакет, без вымышленной B session/model/attempt.
Original PRIVATE_PROCESS terminal0 и CLI0; собственная DB подтверждает33assistant openai/gpt-6-sol/xhigh,1user/128parts, final stop. Requested STANDARD, response tier NOT_OBSERVED, speed NOT_MEASURED.
Summary:37tool events/36unique calls/toolErrors1/errors[]; повтор skill имеет тот же callID/input/output и enriched metadata, не отдельную попытку.
join-dept-001 остановлен до эффекта из-за неактивного input0: NOT_APPLIED/effect_possiblefalse/cleanuptrue; refresh-original-001 активировал источник, join-dept-002 успешен внутри того же A1, без reset/hint/новой CLI/browser recovery.
DB prompt10505B отличается от argv/file10502B только внешними кавычками и одним escape(+3); remainder exact/literal newlines, byte equality/valid JSON не заявляются.
Нулевой memory-writer counter не доказывает отсутствие автоматического контекста; generic bundled skill и readonly Help использованы, autocontext absence NOT_ATTESTED.
Save save_completed/workflow_preserved=true, reopened/persisted_content_verified=false; arrangement result_unconfirmed/warning=true, data/goal outcome не повышены до verified.
Own saved-package Close/logout, исходные Runtime+Knowledge ACK и actualexit0/noSignal, binding CLI chat/Dock document/account/path подтверждены отдельно от CLI0; subsequent scoped idle/config preserved.
Native actual33APPROVE/rootFULLREADe89488 CLOSED; cold отдельно: один browser RunAll04:32:23.747Z,9native+1service grey→green/27ports.
Новый CSV136B/inode [private]/mtime04:32:24.185534100Z совпал с native; LGP/raw SHA,size,inode,mtime,ctime,device неизменны. Все18значений/9integer/soleNULL подтверждены; native8/3 сериализован2.6666666666666665, что укладывается в допуск.
Configure/Save не вызывались; NoSave prompt→home→Logout signin подтверждены последующим DOM, own ownTab[private] закрыта/IAB[]. Два полных scoped metadata passes при живом observer дали нулевой runtime/writer/pending/recovery; CLI probe не выполнялся.
Immediate AX мог опережать async UI; два первых domSnapshot не были emitted, что не означает пустую страницу. Следующий сохранённый DOM подтверждает состояния; UI-действия/RunAll не повторялись из-за наблюдателя.
Scenario URL выведен из actual endpoint, имени сохранённого пакета и Unit_0/Info.xml Name=Unit1; отдельный deep-link visit не заявляется.
Четыре public near-miss используют actual XML/full wrong CSV/recipes только на disposable oracle copies; job-count-as-observed-mean имеет0NULL, остальные по1NULL согласно своей ошибочной логике. Native mutants не исполнялись.
Combined independent cold+public review ожидается; calibration/sole D/B/pair acceptance NOTRUN/PENDING, campaign dependencies сохраняются без нового pair-only gate.
