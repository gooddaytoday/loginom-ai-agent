# Приёмочный комплект

Критерии утверждены решением v040-scope в LAB-776, подплан ready_for_development.
Этап 1 назначается отдельно: сначала выходные страницы/mapping, точный порядок
после reopen через явный mapping и полный readback после retrain.
Расхождение с утверждённым предложением — стоп с вопросом.
Сценарии `factor-pca`/`factor-retrain` зарегистрированы в
`scripts/node-acceptance/run-check.py`.

| Будущий сценарий | Prompt / входы модели | Ожидания вне модели |
|---|---|---|
| factor-pca | task.md / data/matrix.csv | expected.json |
| factor-update | task-update.md / data/matrix.csv, data/update.csv | expected-update.json |

data/null.csv и data/constant.csv — данные исследования границ; не отправлять
их в основной сценарий. NULL-обучение/константы не имеют утверждённого oracle.
Oracle, expected, fixtures/type-card и материалы discovery модели не передавать.
Шаблон PACKAGE_PATH заполняет будущий штатный run-check.

Генерация ожиданий (Python stdlib, без сторонних библиотек):

```sh
python3 -B docs/node-development/nodes/research-factoranalysis/acceptance/oracle.py --expected
python3 -B docs/node-development/nodes/research-factoranalysis/acceptance/oracle.py docs/node-development/nodes/research-factoranalysis/fixtures/update.csv --expected
```

`oracle.py --compare actual.json` проверяет только независимую математику
нормализованных двух таблиц: `outputs:[{output_port,columns:[{name,type}],rows:[{…}]}]`.
Это не runner и не замена живым проверкам. На вход передаются числовые значения,
NULL и строки с подтверждённой точностью; имена/типы/порядок должны быть прочитаны
отдельно штатными средствами runtime. Поле `factor_signs` ({columns, ports:[0,1]})
исполняет `alignFactorSigns` в `scripts/node-acceptance/expected-outputs.mjs`:
один знак на фактор для обоих портов, без перестановок; другие ключи отвергаются.
Без поля сравнение прежнее.

Для каждого фактора знак выбирается по первой ненулевой нагрузке oracle в порту 1
(`oracle.py --compare` — по скалярному произведению) и применяется ко всем его нагрузкам и scores обоих портов. Затем
проверяются все ячейки. Порядок факторов фиксирован убывающими различными λ;
перестановки, независимые знаки строк или портов не допускаются.

Утверждённые критерии: PCA, K=2, без вращения, полные конечные числовые признаки;
ordered=true, column_order=exact, порты 0 и 1,
первый — 8 строк, второй — 3; все поля, исходные значения, типы и NULL точны;
для вычисленных Real abs=1e-8 и rel=1e-10, метки без пользовательского требования
label_any=true. Явное output mapping с autosync=false должно сохранить
заданный порядок после cold reopen; это ещё не проверено.
Сохранённый пакет, два скачанных CSV, штатные Save/cleanup/cold и требуемые
сквадом 2/3 PASS исполнителя и проверяющего на одном SHA остаются обязательными.
