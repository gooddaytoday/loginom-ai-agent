# v0.4.0: оставшиеся возможности, LAB-973

07.11.2026, mas, Loginom 7.4.2,
`https://app.loginom.ai/app/?testable=true`.
База `v040@4b202757f6d0021160dd4dfc104ee788ae33cbec`.
Только worker назначенной пары, собственный пакет, два новых профиля.
Node 24.19.0, Playwright из закреплённого bootstrap/cache, Chromium 1246,
headless, sandbox включён, `--no-proxy-server`.
Новой сборки CLI и модельных прогонов нет. Для lifecycle/save использованы
существующие helpers из кешированной CLI, для UI — доверенные Playwright-жесты;
это **native-исследование**, не тест обработчика на заданном SHA.
Внутренний JS Loginom не перехватывался и не менялся. Native getters читали
только собственную страницу, связанные с DOM контролы и загруженные grid pages.

**Итог частичный:** численно подтверждены apply, coefficients, Real weights,
standardize, ручные Ridge/LASSO/Elastic Net. Выборки и валидация обследованы
по UI; численный сценарий разбиения не завершён. После повторных отказов
операторской UI-настройки исследование остановлено по регламенту, а не
объявлено полным покрытием. Сводка имеет независимое численное расхождение.

## Маркеры

`W = MF;TF-1;WizrdMCF`; suffix вкладки динамический.
`P = W;LogRegressionWizard`, `D = W;LogRegressionWizard-1`.
`T = MF;TF-1;ModelForm;PreviewWindow;PreviewForm;DataSetForm;grdDataTable;grd-1;tbl`.
Все сокращения ниже обозначают точные наблюдённые `data-tid`, не XPath по тексту.
Автоматическая подпись собственного узла меняется после настройки;
привязывать будущий обработчик к фиксированному русскому названию нельзя.

Порты не меняются ни при выборе метода, ни при весах/нормализации:
`Input_Data-0`, `Output_Data-0`, `Output_Data-1`, `Output_Var-2`.
Дополнительный control input скрыт до native команды
`mn;mniShowControlVariablesPort`; его привязки не исследованы численно.

## Применение сохранённой модели

Отдельного пункта `apply` в picker метода нет: native применение — команда
`mn;mniActivateNode`, обучение — отдельная `mn;mniTeachNode`.
Новый публичный apply предлагается как orchestration-поведение существующего
узла, а не как выдуманный native метод. Уже есть аналог LinReg в заданной базе.

Enter обучен на 32 строках train.csv; X без нормализации, затем с standardize.
Полный прогноз standardize совпал с независимой MLE, max |Δp|=6.724e-10.
Пакет сохранён `package.save_checkpoint`, затем закрыт, logout=true,
discard=false. В новом профиле открыт тот же пакет и выполнен
`mn;mniActivateNode` без настройки/Teach: **все 32×8 ячеек совпали** с тёплым
чтением, холодный порядок passthrough X/Target/RowID/Note.

В том же Import изменён только источник на `modes/holdout.csv`, имена и типы
первых четырёх полей сохранены. После выполнения Import и того же узла
**без Teach** прочитаны три строки RowID 101/102/103:

| X | p(yes), независимое | native p | класс при .8 |
|---:|---:|---:|---|
| -3 | 1/28 | 0.03571428608477339 | no |
| 0 | 1/2 | 0.5 | no |
| 3 | 27/28 | 0.9642857139152265 | yes |

Target и ActualEvent — NULL во всех строках, Note NULL сохранён.
Максимальная ошибка 3.705e-10. Смена параметров метода с обычным Execute
ранее вернула старые коэффициенты: только явный Teach подтвердил новую модель.
Будущий apply не должен ни переобучать, ни считать факт старого обучения
доказанным только по сохранённому mode.

Снимки/данные опыта: `apply-output.png/json`, `cold-output.json`,
`save.json`, `cleanup1.json` — приложены к карточке, не включаются в Git.

## Коэффициенты и сводка

Порт 1 открыт двойным кликом собственного `Output_Data-1`.
В уже загруженном buffered store таблицы T ровно 2 записи (count=total=2).
Служебные внутренние `$id` не относятся к выходной схеме.

Наблюдённые имена; предложенные типы для следующих expected:
Name, DisplayName, UniqueValues — String; затем Real-поля
Target_coefficients, Target_stdError, Target_wald, Target_waldPValue,
Target_oddsRatio, Target_lowerBound, Target_upperBound.
Тип UniqueValues при NULL не доказан значением и требует schema-readback
перед этапом 1. Для непрерывного X UniqueValues=NULL. У константы DisplayName=NULL,
oddsRatio/lowerBound/upperBound=NULL. Строки — `<Константа>`, затем X.
В будущем имена численных колонок должны строиться по **наблюдённой цели**,
а не быть захардкожены для Target.

| Показатель X | Native Enter |
|---|---:|
| β | 1.0986122874040274 |
| SE | 0.3390317511789093 |
| Wald | 10.5004559740227 |
| p-value | 0.001193450897422177 |
| odds ratio | 2.999999996207753 |
| lower/upper, 95% | 1.5436075864985104 / 5.830497372497336 |

Константа 3.58e-17, SE 0.4822428289970912. Независимые значения —
Fisher information / normal quantile в oracle, не native числа.
Форматированные две цифры в DOM не служат доказательством точности:
числа прочитаны из уже загруженных записей связанного с T store.
Будущему production-чтению нужен штатный exact-number UI-канал.

Порт 2 — отдельный VariablesForm, таблица
`MF;TF-1;ModelForm;PreviewWindow;PreviewForm;VariablesForm;grdValuePreview;tbl`.
Загружено ровно 19 записей. Integer: TotalSamples, TotalSelectedSamples,
TrainSamples, DFE, ModelDF. Остальные Real:
TrainRMSError, TrainClsErrorPercentage, TrainAvgCE, TrainThreshold,
NullMinusTwoLogL, MinusTwoLogL, R2, AdjustedR2, Chi2, AIC, AICc, BIC, HQC,
ModelPValue. Типы прочитаны из DataType, значения из ValueVariant.

Числа Enter: TrainSamples=32, RMS=0.3665719574653795,
CE=0.6209417771080842 (биты), deviance=27.545858694038433,
null deviance=44.3614195558365, AIC=0.985808084188701,
AICc=0.9987391186714596, BIC=1.077416578113684, HQC=1.0161737081702555.
Информационные критерии здесь делятся на N; подставлять ненормированные
числа предыдущего selection-oracle нельзя.

**Несовпадение:** `VariablesForm;colValue_TrainClsErrorPercentage` показывает
6.25. По всем 32 исходным строкам и p>=.8 ошибочны восемь классов, то есть
25%. Семантика native показателя не выяснена; 6.25 не объявляется правильным
числом ошибок, причина не приписывается runtime. В proposed expected сохранён
независимый расчёт 25. Нужно решение владельца; обход через subset matcher,
пропуск поля или подмену oracle не выполнялся.

## Веса

Роль задаётся на `W;TuneDataSourceInputPortWizard;colName_Weight` →
`EditTuneColumnDefForm;cbxUsageType;trg_picker`.

- Weight Real: `...;boundlist;Вес` доступен; X/Target сохраняют роли,
  Weight не появляется в таблице normalizers (там только X и Target).
- Weight Integer: в boundlist только «Не задано» / «Входное», **Вес отсутствует**;
  `cbxDataType` disabled=true, value=4. Не обходилось конвертацией этого поля.
  Для положительного опыта загружен отдельный CSV с Weight Real.

`modes/weighted.csv`: yes=3.0, no=1.0, 32 строки. После явного Teach
Enter без нормализации полный выход сохранил Weight и все исходные строки.
Независимая MLE β=(ln(3),ln(3)), p по X=-2/-1/0/1/2:
.25/.5/.75/.9/27/28. Max |Δp|=3.855e-10.
Нули, отрицательные/NULL веса и вещественные нецелые веса не исследованы;
не выдавать их поддержку по результату положительного примера.
Снимки: `weight-integer-unavailable.png`, `weight-real-role.png`,
`weights-output.png`; отдельный отрицательный fixture integer-weight.csv.

## Регуляризация

Выключить `P;pedAutoMethod;ValueControl;DisplayEl`, выбрать
`P;pedRegressionMethod;ValueControl;trg_picker`.
Ridge native=4; LASSO и Elastic-net выбраны по точным подписям picker,
их числовые индексы этим опытом не закрепляются. Включить
`P;pedUseDetailedSettings;ValueControl;DisplayEl`, перейти в D.

| Контрол D;...;ValueControl | Ridge | LASSO | Elastic-net |
|---|---|---|---|
| pedRidgeSetupMethod / pedLambdaRidge | доступны | disabled | доступны |
| pedLassoSetupMethod / pedLambdaLasso | disabled | доступны | доступны |
| pedRegSelQuality / pedAddSignificance / pedRemoveSignificance | disabled | disabled | disabled |

Оба setup picker: «Задать вручную» / «Автоматически» (native 0/1).
При ручной настройке λ=1 по умолчанию. У Elastic Net **два независимых λ**;
отдельный предполагаемый alpha не обнаружен. Контролы сразу после перехода
содержат временные null/неверный disabled: нужна готовность и readback,
одного появления страницы недостаточно. Подтверждён ввод десятичного epsilon
1e-10; научную запись в native number field не отправлять.

На исходном train.csv, none, intercept=true, epsilon=1e-10:

| Метод, ручные λ | native βX | Независимый score |
|---|---:|---|
| Ridge, λR=1 | 0.9927097270995701 | score(β)=β |
| LASSO, λL=1 | 0.9919862129318355 | score(β)=1 |
| Elastic-net, λL=λR=1 | 0.9070104512673767 | score(β)=1+β |

Константа 0. Независимая бисекция совпала с каждым β лучше 2e-14.
Это проверка коэффициента на одном невырожденном наборе, не полного порта 0
и не доказательство auto λ, λ=0, предельного sparsity и коррелированных X.

## Нормализация

`W;NormTuneWizard;colDisplayName_X` → btnEdit →
`W;ColumnsEditForm;cbxNormType;trg_picker`.
Наблюдены: Нет, масштабирование [min;max], [-1;1], [0;1],
абсолютное, стандартизация, отношение. Индексы readback подтверждены
только для Нет=0 и стандартизация=5; остальные не выводятся из порядка списка.
Точные подписи есть в снимке normalizers; min/max и ratio численно не проверены.
Target остаётся «Отклонение» (9), multiplier=1, irremovable=false.
Для X standardize принят native NormType=5; обучены 32 строки, max |Δp|=6.724e-10.
Save/reopen без Teach дал те же результаты. Coefficient denormalize=true
поддерживает выдачу в исходных единицах; false не исследован.
Для отдельной будущей проверки масштаба fixture normalization.csv содержит
X'=10+2X, а не только симметричные X с нулевым средним.

## Выборки и валидация: UI подтверждён, числа не приняты

Страница `W;LearnPartitionWizard`:

| Контрол / picker | Наблюдение |
|---|---|
| pedSamplingMethod;ValueControl | Случайный=0, Последовательный=1, По столбцу=2 |
| SizeGridForm;colRelativeSize;FloatPropEdit... | Обучение; принято 50 |
| тот же путь FloatPropEdit-1 | Тест; независимо принято 50; изменение обучения не меняет тест |
| ByColumnMethodForm;pedPartitionColumn;ValueControl | Появляется при способе 2, процентные поля disabled |
| RandSeedEdit;edtRandSeed;ValueControl | Редактируемый seed; default не фиксировать как контракт |
| ValidationSettings;pedLearnValidationMethod;ValueControl | Без валидации=0, K-fold=1, Монте-Карло=4 |
| ValidationSettings;pedFolds;ValueControl | K-fold: default 5; есть pedKFoldsSamplingMethod |
| ValidationSettings;pedIterations;ValueControl | Монте-Карло: default 10; доли 80/20 редактируемые |

У K-fold доли 80/20 при пяти блоках disabled; поле folds определяет их.
Валидация не добавляет портов. Состав дополнительных переменных сводки
при включённой валидации **не прочитан**, численные expected этих переменных
не выдумываются. При режиме «По столбцу» нужно исследовать соответствие
категорий train/test; значение 0/1 пока предложение task, не native факт.

Диагностический источник partition.csv: первая половина — исходный train,
вторая — те же X с обратными Target. При корректном последовательном 50/50
MLE обучения — исходная; при ошибочном обучении на всех 64 βX=0.

Операторский опыт после смены схемы weighted → partition оставил старый
вход несогласованным (красный Input_Data-0). Native диалог удаления потерянных
связей был подтверждён, но результат всё ещё «Узел не активирован» в
`...;PreviewForm;pnl;cnt;label`. Этот опыт **не доказательство отказа режима**:
изменялся fixture/schema, а не production-обработчик.

Повтор с новым собственным узлом также не завершён: после жеста выбора
`MF;TF-1;ModelForm;btnSetup` оставался disabled; три одинаковых timeout при
операторской настройке, затем недоступен ожидаемый `Graph;<новый>;Setting`.
Классификация: неизвестный отказ операторского native-опыта; не модельный
FAIL и не доказанный дефект узла. Жесты не обходились force/native-вызовами.
Load при старте .32/.17, после отказов .25/.22, 12 ядер — не нагрузка.
Снимки partition-execute и partition-fresh-node, DOM с точными data-tid —
во вложении к карточке. Исследование остановлено по регламенту повторов.

## Ограничения доставки

В Git — только изложение наблюдений и authored предложения, без raw logs,
screenshots, аккаунтов/конфигов и реальных hash-пинов карточки типа.
Снимки и raw scalar readback доставляются отдельным вложением в карточку.
Сохранённое последнее состояние исследовательского пакета не является
принятым acceptance fixture; закрытие/logout проверяются отдельно.

Предложено 11 пользовательских комплектов и оценка каждого PR в
[acceptance/modes](acceptance/modes/README.md). Случайный состав выборок,
Монте-Карло и автоматические λ требуют отдельного решения критериев;
не добавлять новый verifier или обход через другой узел без владельца.
