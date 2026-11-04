# Сопоставимость измерений в разных единицах — фактический эталон P31

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

## Источник и общий контракт
samples.csv полностью synthetic:6 уникальных измерений id, material ASCII, исходные length/unit/mass_kg; внешних источников нет, fixture и код распространяются по MIT проекта.
Коды регистрозависимы без нормализации: mm=.001м,cm=.01м,m=1м; ft и CM неизвестны. Все исходные длины/массы положительны, NULL нет.
Неизвестная единица исключает и длину, и массу строки из валидных сумм, сохраняя строку в unknown_unit_samples. Один итог на каждый material в ASCII ASC; MAT_B сохраняется с unknown0.
kg_per_m — валидная суммарная масса/валидная суммарная длина, не среднее отдельных отношений; положительная валидная длина гарантирована.
D/B имеют одинаковые raw/common/schema/oracle/tolerance/rubric, только D раскрывает метод; эквивалентная native-композиция разрешена без node count/name/layout gate.

## Фактическая композиция Unit_0/Unit.xml
Genuine package13516B:9native/9links,7XML/14filepayloads; это observed reference, не требование к альтернативам. Все XML прочитаны/разобраны, References пуст, JS/static totals нет.
1. TBGImportTextFile: samples.csv UTF8/header/semicolon/dot/quote; id/material/unit dtString,length/mass_kg dtFloat. Typed request и свежий полный6row port подтверждают точные значения cm≠CM.
2. TBGCalcData factor_m=IFF(RegExMatch("^mm$",unit),.001,IFF(RegExMatch("^cm$",unit),.01,IFF(RegExMatch("^m$",unit),1,0))); valid_sample=factor_m>0,unknown_sample=factor_m=0.
valid_length_m=length*factor_m;valid_mass_kg=IFF(factor_m>0,mass_kg,0). S01→1m/2kg,S02→3m/3kg,S03→2m/6kg,S06→.5m/1kg.
S04ft/S05CM→factor0/valid0/unknown1/length0/mass0; исходные100+20kg исключены. Saved expressions и свежий6row port доказали семантику, не каталог узлов.
3. TBGGroupDataEngine «Итоги по материалу»: material utGroup,valid_sample/unknown_sample gdSum; output mappings valid_sample_Sum→valid_samples,unknown_sample_Sum→unknown_unit_samples.
4. Отдельный TBGGroupDataEngine «Валидные суммы»: полный material basis,valid_length_m/valid_mass_kg gdSum; output mappings→length_m/mass_kg.
5. TBGJoinDataEngine jtJoin двух уникальных полных сводок по material без потери/размножения. Inner join не является требованием к альтернативному решению.
6. TBGCalcData kg_per_m=mass_kg/length_m после сводок. 7. TBGReformColumnsEngine приводит два счётчика к dtInteger и оставляет6колонок.
8. TBGSortingEngine material ASC/LocaleAware=false. 9. TBGExportTextFile: один UTF8/header/semicolon/dot/quote/emptyNULL/noBOM/LF CSV по actual request/readback; часть defaults не сериализована отдельным XML-атрибутом.

## Полный ожидаемый результат
Две строки/все12named cells;4counter texts целые без дробной части,empty0. Имена шести колонок точные, порядок колонок свободный; допуск±.001 без промежуточного округления/minprecision/padding.
~~~csv
material;valid_samples;unknown_unit_samples;length_m;mass_kg;kg_per_m
MAT_A;3;2;6.000;11;1.833333333333333333333333333
MAT_B;1;0;0.5;1;2
~~~
Ручной полный расчёт после freeze предшествовал raw-only Decimal oracle/native;4valid+2unknown=6, валидная масса12kg/исключённая120kg; MAT_A3/2/6/11/11÷6,MAT_B1/0/.5/1/2.
Native Float1.8333333333333333 и6 численно совпадают с Decimal28 и6.000 в пределах.001, но НЕ byte-equal. Cold byte-equal native, не Decimal oracle.
Gold только у судьи вне agentprompt/inputs;original oracle GREEN выполнен один раз/форму;public recipes исполняют лишь disposable copies.

## Фактическое исполнение и ограничения
Reference — original detailed A1; B разделяет тот же пакет без отдельной B session/model/attempt.
PRIVATE_PROCESS originalterminal0,CLI0/834s/A1used1of3/nohint/noreset;55actualassistant DB подтверждают openai/gpt-6-sol/xhigh/finalstop. Requested STANDARD,tier NOT_OBSERVED,speed NOT_MEASURED.
60tool events/59unique calls/6original errors;skill samecallID/input/output с activationmetadata enrichment, не новый dispatch/whole-event equality.
Prepare1 HOST_REQUEST_FAILED leafUNKNOWN сохранён;prepare2 READY в той же CLI/model A1. Три configureNext UI_REFERENCE_OBSCURED исходно AMBIGUOUS/cleanupfalse;3recoveries released_after_proof/discarded ownunsavedconfig/goalfalse/cleanuptrue не повышают исходный исход.
Group explicit-input omission и inactive-source join preflight — noeffect/request rejected;исправленные операции того же A1 дали свежие полные порты. Причина третьего wizard point_observed отказа UNKNOWN.
Read-only observer разобрал recovery2NDJSON как один JSON; исправлен только parsing observation без runtime/oracle/check replay. Все исходные ошибки сохранены.
Actual argv9879B=task+normal tail;DB9882B exteriorquotes+oneescapedquote(+3),remainder exact/literalnewlines/validJSONfalse. Raw143B exact,73B Read framing отдельно;auto-context absence NOT_ATTESTED.
Save save_completed/workflow_preservedtrue,reopened/persisted_content_verifiedfalse;arrangement attempted/result_unconfirmed/warningtrue;original data not_checked/goal not_verified сохранены.
Own ordinary saved-package Close/logout,все3 original Runtime/Knowledge ACK/actualexit0/noSignal/binding подтверждены;idle/config unchanged,denied unrelated metadata сохранены.
Native actual34APPROVE/rootFULLREAD0f418c adopted a3becd;original numeric/storage/Close/DB/privacy retained. First prepare leafUNKNOWN не новая model attempt.
Cold own ownTab[private] Packages→Open exactsavedLGP→один RunAll05:54:43.271Z;все9native+service grey→green/28ports,Configure0/Save0.
Новый CSV122B/inode [private]/mtime05:54:44.193836270Z byte-exact native;serverLGP/raw SHA+allstat unchanged;collectcc6895/check11bc2c --rerun oncePASS/full12/4integer/empty0/±.001.
NoSave→home→Logout signin→own tabclosed/IAB[];idle two full202realUID zero passes/PRIVATE_OPERATION/config17offline preserved. Новый CLI idle probe не выполнялся.
ScenarioURL derived из actual endpoint/savedpackage/Unit1; отдельный deep-link visit не заявлен. Принятые pins и происхождение в provenance.json.
Четыре existing-kind nears: CM принят как cm;unknown массы включены;длина/масса вместо массы/длины;material DESC. Full12wrongCSV/all6ID ledgers независимо из raw; XML-мутанты не запускались.
Combined cold+public actual review ожидается;calibration/sole D/B/pair acceptance PENDING,campaign dependencies без нового pair-only gate.
