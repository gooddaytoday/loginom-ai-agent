# A01. Симметричное разложение изменения выручки

Фактический reference построен detailed CLI-попыткой 2, модель `openai/gpt-6.1-sol/xhigh` подтверждена по БД сессии. Попытка assisted: техническая подсказка потребовала штатный checkpoint Save перед Export и финальный Save. Содержательный prompt, inputs и oracle сохранены. Отдельная авторская сборка B не выполнялась; при приёмке обе формы используют один reference.

## Текущее подтверждение

CLI exit0; полный CSV совпал с независимым oracle при допуске 0.000001, входные байты совпали. Проверка сохранённого пакета нашла 9 связанных native-узлов. Отдельный browser cold2 открыл точный сохранённый пакет и выполнил все 9 native-узлов, включая обе ветви фильтра, без изменения настроек и Save. Старый CSV был припаркован; новый полный CSV создан после запуска cold2 и прошёл check-rerun. SHA256 фактического серверного LGP до/после совпадает. Cleanup package closed/logout подтверждён. Первый неуспешный cold-вызов, выбравший служебный UI-объект Переменные сценария до исполнения native-узлов, сохранён отдельно; его результат не зачтён. Минимальная поправка private-вызова исключила только этот служебный объект; product/runtime guards не менялись. Калибровка и измерения учитываются отдельно в каноне пилота.

## Вход и контракт

Собственный искусственный `data/bridge_observations.csv`: UTF-8, `;`, десятичная точка, 14 наблюдений, ключ `(division,sku,period)`. Для каждого SKU заданы base/current, количество целое неотрицательное, цена известна и неотрицательна. Строковые поля имеют тип dtString/dkDiscrete; quantity — dtInteger/dkContinuous, unit_price — dtFloat/dkContinuous. Нулевое количество не означает неизвестную цену.

## Реальный сохранённый граф

| Узел | Engine | Фактическая настройка |
| --- | --- | --- |
| Исходные наблюдения | TBGImportTextFile | Импорт загруженного bridge_observations.csv, CodePage=65001, DelimiterChar=;, DecimalSeparator=., пустой ValueNull; пять полей. |
| Базовый период | TBGFilterDataEngine | period=base, точное строковое равенство; количество/цена переименованы q0/p0. |
| Текущий период | TBGFilterDataEngine | period=current; количество/цена q1/p1. |
| Пары периодов по SKU | TBGJoinDataEngine | Inner (jtJoin) по division и sku; полное совпадение двух периодов. |
| Симметричные вклады SKU | TBGCalcData | base_revenue=p0*q0, current_revenue=p1*q1, price_effect=(p1-p0)*(q0+q1)/2, quantity_effect=(q1-q0)*(p0+p1)/2. |
| Итоги по подразделениям | TBGGroupDataEngine | Ключ division; gdSum четырёх показателей. Output mappings сохраняют точные технические имена без _Sum. |
| Изменение и сверка | TBGCalcData | revenue_change=current_revenue-base_revenue; reconciliation=current_revenue-base_revenue-price_effect-quantity_effect. |
| Итог по division | TBGSortingEngine | division по возрастанию; итоговый состав семи полей. |
| Итоговый CSV | TBGExportTextFile | Один result.csv в собственном хранилище; CodePage=65001, CaptionType=ctUseColumnNames, DelimiterChar=;, DecimalSeparator=., пустой ValueNull. |

Источник расходится на два фильтра; обе ветви сходятся на составном equijoin. Далее последовательно Calculator → Group → Calculator → Sorting → Export; всего 9 связей. Независимых несвязанных ветвей нет. Это один допустимый native-путь; rubric принимает эквивалентные композиции и не требует тех же имён или числа узлов.

## Oracle и результат

`oracle.py` использует Fraction: независимо считает контрфактическую выручку при двух порядках замены факторов, усредняет маржинальные вклады и сверяет аддитивность каждого SKU. Native-экспорт не используется для вычисления ожидаемых значений. Полные ожидаемые строки находятся в oracle.csv, а также в result-пункте rubric.

Одна строка на division, порядок division по возрастанию. Поля: division, base_revenue, current_revenue, revenue_change, price_effect, quantity_effect, reconciliation. Все показатели вычисляются из входа; взаимодействие делится поровну, нулевые продажи сохраняются. Проверяются все строки и колонки; точные текст/NULL/имена/порядок строк, числа ±0.000001. Порядок колонок не оценивается. Окончательное округление до шести знаков не меняет значения этого fixture; дополнительные нули после точки не требуются.
