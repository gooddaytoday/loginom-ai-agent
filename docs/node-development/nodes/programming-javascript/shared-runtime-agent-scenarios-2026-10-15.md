# Проверочные сценарии общего runtime node-javascript

Подготовлены 2026-10-15 по результатам
[исследования C01–C36](shared-runtime-review-2026-10-15.md).
Проверяемые исходники: `a00e00eb72ba901adcef47bb1c520b7674a4f2da`;
сравнительная база: `38ee045e79720d363a35666484f17804162b55a1`.

**Это задания для будущих адресных проверок, не журнал выполненных прогонов.**
Создание этого файла не запускает новую модельную серию и не меняет критерии
прежней. Сначала использовать уже достаточные доказательства; новый запуск —
после изменения соответствующего кода/runtime или при существенном пробеле.

Все новые live-проверки выполнять в текущей локальной системе. Модельные CLI
процессы с одним профилем последовательны. Только своя Loginom-сессия, новые
временные входы/пакет/выходы. Следующий процесс — после подтверждённых exit,
package Close/logout и освобождения профиля. Unknown cleanup не обходить.
Чужие пакеты, профили и параллельные сессии для этих тестов не нужны.

## Как оценивать

У каждого прогона отдельно записывать:

- **Выбор узлов:** стандартные части выполнены известными стандартными узлами;
  JS только по явной просьбе либо для заранее обоснованного функционального
  пробела. Проверять весь журнал, включая временные и отвергнутые JS-запросы.
- **Функциональность:** схема, значения, связи, сохранение/повторное открытие.
  Ошибка oracle — функциональная ошибка, а не автоматически runtime failure.
- **Runtime:** точный owner, отсутствие повторов неопределённых жестов,
  собственные Close/logout, ACK+actual exit и profile release.
- **Попадание в исправление:** `REPRODUCED_AND_PASSED`, `REPRODUCED_AND_FAILED`
  либо `NOT_REPRODUCED`. Если нужная mask/гонка/overflow не наблюдалась, нельзя
  назвать обычный функциональный успех доказательством соответствующей ветви.

Сохранять prompt, входные bytes/hash, SHA исходников и runtime, полный tool/event
журнал, исходные outcomes/ошибки, LGP/CSV при наличии, независимый oracle и cleanup
evidence. Старый FAIL не заменять новым успешным повтором.

## S01. Стандартный Import: формат, даты и безопасное имя файла

**Проверяет:** C13, C14, C16; частично C05/C26. Не проверяет civil milliseconds.

Вход `javascript-sales.csv`, UTF-8:

```csv
Id;Category;Amount;EventDate
1;"A; retail";12,50;2026/10/13
2;"A; retail";0;2026/10/14
3;B;NULL;2026/10/15
```

**Задание агенту:**

> Импортируй javascript-sales.csv: разделитель точка с запятой, кавычки двойные,
> десятичный разделитель запятая, NULL обозначает пропуск. Id — целое, Category —
> строка, Amount — вещественное, EventDate — дата в формате yyyy/mm/dd с разделителем
> /. Отсортируй по EventDate по убыванию и экспортируй в новый CSV. Построй сценарий
> стандартными узлами и сохрани новый пакет.

**Oracle:** три строки Id3,2,1; Category у Id1/2 ровно `A; retail`; Amount
соответственно NULL,0,12.5; даты15,14,13 октября2026, тип datetime. Проверять
значения по колонкам, а не форматирование CSV/порядок колонок по предположению.

**Что доказывает именно исправление:** native picker/readback `date_format`
и slash должны присутствовать в receipts. Для C13 нужен реальный matched
NOT_APPLIED/no-effect UI epoch refusal и новый ref к тому же field/settings.
Если refusal не возник, C13=`NOT_REPRODUCED`; не создавать искусственную гонку
моделью. Маски загрузки не должны обходиться generic click.

## S02. Join: обе роли входов и hidden breadcrumb

**Проверяет:** C06/C07, отсутствие прямого изменения Join semantics.

`left.csv`:

```csv
Id,LeftAmount
1,5
2,10
```

`right.csv`:

```csv
Id,RightAmount
1,15
2,20
```

**Подготовка:** viewport1280×800, длинные имена нового пакета/сценария/Join.
Не менять рабочие настройки чужого пользователя. В журнале нужно наблюдать,
какой именно breadcrumb оказался скрыт.

**Задание агенту:**

> Импортируй обе таблицы. Сделай стандартное Слияние по Id: left — главная
> таблица, right — присоединяемая. Сохрани Id, LeftAmount и RightAmount без
> дублированного ключа. Отсортируй по Id, экспортируй и сохрани пакет.

**Oracle:** `(1,5,15),(2,10,20)`, обе native input roles, точные GUID источников
и концов связей, никаких временных/неуспешных JS requests. После cold reopen
проверить те же параметры/данные.

Для C07 нужен actual hidden caption «Главная таблица» или «Присоединяемая
таблица» при сохранённой native ownership цепочке. Если скрылась папка
«Входные порты», это отдельный overflow-случай из C07, а не тот же positive
case. Обычный успешный Join не подтверждает hidden DOM fix.

## S03. Короткий Import → Sort → Export с перекрытым входом

**Проверяет:** C07/C08, положительный C30/C31, скачивание C26/C28.

```csv
Category,Amount
A,6
B,21
A,11
```

**Подготовка:**1280×800; создать Export так, чтобы после Link его input был
ниже viewport. Зафиксировать actual `bottom>height`; прежнее доказательство
имело804>800. Если LLM placement этого не воспроизводит, точную геометрию
проверять коротким существующим no-model driver, а не тратить повторы модели.

**Задание агенту:**

> Импортируй CSV, стандартной Сортировкой упорядочь Amount по убыванию,
> экспортируй Category и Amount в новый CSV и сохрани новый пакет.

**Oracle:** B21,A11,A6, ровно3узла/2связи; корректный input mapping Export;
сохранённый пакет и полученный файл. Bytes oracle фиксировать по реально
запрошенному delimiter/newline, не подгонять под старый27-byte файл.

**Внутренняя проверка:** один own scroll, own-label click только после своего
reveal/при cover, затем строгий port opener. Нельзя click сквозь tooltip,
закрывать чужую overlay или повторять unknown gesture. Дополнительно смотреть
caption «Источник данных», если он реально скрыт overflow.

**Уже есть достаточный local no-model evidence для исходной сборки:**
`evals/results/node-selection-local/20261014T112452Z-5e223f/native-export-input-reveal-minimal-proof/run/result.json`,
runtime `659588af…`. Не повторять на неизменном runtime без причины.

## S04. Cold JS output → declared mapping → Table → Save/reopen

**Проверяет:** C01–C03, C07/C09/C10/C22/C24.

Вход — три строки S03.

**Задание агенту:**

> По моей явной просьбе используй JavaScript для расчёта Amount2=Amount*2.
> Выход задаётся объявленной схемой: Category (строка), Amount2 (вещественное),
> Note (строка, значение "test"). Сначала настрой узел без явного запуска и
> проверь доступную настроенную схему. Затем выполни его. В выходном mapping
> отключи autosync, оставь Amount2 и Category в этом порядке, назови Amount2
> DoubleAmount и исключи Note. Прочитай результат, экспортируй и сохрани пакет.

**Oracle:** DoubleAmount/Category:12/A,42/B,22/A; явный порядок/имена после
сохранения и cold reopen; schema/types/source identity не перепутаны с labels.
Материализация и итоговый Execute могут быть двумя разными executions по
контракту; не требовать искусственно одного.

**Дополнительные условия:**

- Cold mapping читать до materialization, не выдавать configured-only поля за
  подтверждённый результат. Внутренний DataSet snapshot может быть полностью
  пустым либо configured/source-pending; это разные состояния.
- Для C01 нужна фактическая пустая disabled `colTargetDelete` mask. Если её не
  было — соответствующий case не воспроизведён.
- Для C03 нужны actual DataSet autosync/reorder/exclusion receipts.
- Для C09 нужен один Add Table и pending descriptor→verified card, если такая
  задержка возникла. Просто наличие итоговой Table не доказывает pending branch.
- JS output0 только один. Не добавлять неподдержанные multi-output требования.

Если public API не позволяет требуемый холодный промежуточный read, его выполняет
существующий operator harness; агенту не предлагается обход через generic UI.

## S05. Изменение technical Name входа JS: J19

**Проверяет:** C04, новые context/source перед исправлением. Это комбинированный
operator+agent сценарий: специальное input edit не объявлять обычной capability.

**Подготовка оператора:** взять собственный fixture со строковым `Customer` и
числовым Amount, успешным JS, читающим `Customer`. Штатной фиксированной J19
процедурой переименовать только target technical Name input0 в `CustomerNow`;
label остаётся `Customer`. Сохранить source connections/type/usage/Required/
order/autosync и весь остальной mapping. Не Execute старый source для его починки.

**Задание агенту после подготовки:**

> В моём существующем JavaScript-узле изменено техническое имя входного поля.
> Получи текущие source и context, найди фактическое Name при прежней подписи
> Customer и исправь обращение в коде. Остальные настройки и граф сохрани.
> Выполни узел, проверь результат и сохрани пакет.

**Oracle:** новый public context получен до source edit; код читает CustomerNow,
не угадывает имя по label. Сравнение полного mapping/graph до и после не
показывает посторонних изменений. В own-editor чтении binding должен остаться
к исходным opening/port/record. Если такой operator этап не выполнен, ordinary
исправление текста JS не доказывает C04.

## S06. JS → стандартные Group и Sort, две downstream ветви

**Проверяет:** C11/C09/C10, узкую роль JS.

Вход S03.

**Задание агенту:**

> Явно используй JavaScript только для Amount2=Amount*2. Дальше построй две
> стандартные ветви: Группировка суммы Amount2 по Category и Сортировка исходных
> строк Amount2 по убыванию. Экспортируй обе таблицы в разные новые файлы и
> сохрани пакет. Подсчёт суммы и сортировку не переноси в JavaScript.

**Oracle:** Group A34/B42; Sort B42/A22/A12. Связи обеих ветвей начинаются
именно от managed JS output0. В каждом preflight читается полная схема заново
открытого native preview; сами строки и Execute не относятся к этому чтению.
Результаты затем подтверждаются исполнением downstream узлов и oracle.
Source/schema/socket JS до/после равны. Неиспользованные временные JS-узлы
тоже проверять по журналу. Нельзя подменить новое чтение схемы старым receipt.

**Уже был локальный no-model gate на `21fcca85…`:**
`evals/results/node-selection-local/20261014T064745Z-367f4b/native-js-downstream-proof/run/result.json`.
Он доказал свою исходную сборку, а не любой будущий runtime/модельный workflow.

## S07. Полный UI-read JS: граница100/101

**Проверяет:** C12 и честность C25. Boundary лучше deterministic, чем два
дорогих модельных прогона; достаточно одного agent smoke плюс existing tests.

**Вход:** независимые строки Id1…100, Amount=Id; второй fixture Id1…101.
Порядок входа фиксирован; oracle — удвоенные Amount, точное число строк.

**Задание агенту:**

> По явной просьбе используй JavaScript для Amount2=Amount*2. Получи полный
> результат output0, без молчаливого усечения строк. Если полное UI-чтение не
> поддерживается для этого размера, явно сообщи ограничение; затем отдельно
> экспортируй весь результат и сохрани пакет.

**Проверка параметров:** full допустим только JS handler с capability,
Execute/output0/sample_rows100/exact numbers. Для100строк допустим полный
результат, если он помещается в остальные UI/wire bounds. Для101 нельзя
утверждать full по100строкам. Экспорт101строки — отдельная успешная функция,
не успех full UI-read. Calculator не должен получить JS-only capability.

## S08. Консоль, ожидание и адресный Stop

**Проверяет:** C18–C21; при большой истории — ограничения L03.

**Обычная часть:** вход Id/Amount со строками3/30,1/10,2/20. Начать с закрытой
консоли; повтор режима с pinned/unpinned нужен только если нет прежних данных.

**Задание агенту:**

> Стандартными узлами импортируй таблицу, отсортируй по Id и экспортируй.
> После выполнения заново прочитай результат той же Сортировки и сохрани пакет.

**Oracle:**1/10,2/20,3/30; сначала control-only console read, затем open и native
inventory. Namespace соответствует реальной панели. Console opening не должен
случайно повторять выполнение. Результат reread привязан к новому выполнению
того же узла, а не к сохранённому sample.

**Отдельная адресная Stop-часть, только если она действительно нужна:** заранее
подготовить конечное достаточно длительное JS-вычисление с верхней оценкой
времени и явным пользовательским разрешением JS. Не просить модель придумать
бесконечный цикл или произвольно нагружать сервер. После появления своего
execution ID дать steering «останови только текущее моё вычисление».

**Stop oracle:** один cancel по своему child, native terminal cancellation,
отсутствие повторного Execute. Старые завершённые процессы с тем же caption
сохраняются. Подписи «Расчёт JavaScript»/«python» не должны ломать мониторинг.
Короткий `dock_node_wait` timeout сам по себе не останавливает вычисление.
Object replacement/ABA/lost reply требуют O03, не случайного live stress.

## S09. Source/context и изменение кода при прежней схеме

**Проверяет:** C17/C22–C24, source-bound reread.

**Подготовка:** собственный JS под нейтральной подписью «Итог», Amount2=Amount*2,
один output0; сохранить исходные operation/source digest/schema.

**Задание агенту:**

> Прочитай полностью сохранённый код и текущий context узла «Итог», не выполняя
> его только ради чтения. По моей просьбе измени коэффициент с2 на3, сохрани
> прежнюю схему и остальные настройки. Выполни, проверь и сохрани пакет.

**Oracle:** source/context read не Execute; source chunks без разрывов/дублирования,
конечный digest совпадает, Close подтверждён. Замена требует digest исходного
полного read. Результат18,63,33 для входа S03, прежняя schema/socket.

Проверку reread по **старой** operation receipt лучше выполнить оператором:
он должен отказать из-за source policy, а не выполнить новый код под старым
основанием. Новый source-bound receipt читает новый результат. Control Sort
reread рядом должен оставаться стандартным. Generic UI deny проверяется O02:
нейтральная подпись не превращает JS в обычный узел.

## S10. Медленный мастер и Save As/rekey

**Проверяет:** C05/C06, ограничение L02. Это диагностический сценарий, не
обещание, что текущая ветка уже умеет все saved-package aliases.

**Вход:** собственный конечный CSV подходящего размера; размер/время заранее
ограничить. Не создавать внешнюю нагрузку для замедления Loginom.

**Задание агенту:**

> Построй Import → Calculator с Amount2=Amount*2 → Sort по Amount2 → Export.
> Сохрани новый пакет. Затем выполни Save As под новым именем и в сохранённом
> пакете измени Сортировку на обратный порядок. Проверь результат, экспортируй
> под новым именем и сохрани изменения. Используй стандартные узлы.

**Oracle:** обе версии данных соответствуют направлению sort, один и тот же
нужный native node, связи не продублированы. При долгом открытии один open gesture,
ожидание до исходного deadline. Для проверки снятого45s cap нужно actual >45s.

После Save As фиксировать canonical workflow/path/native owner. Если path
изменился, точный current refusal сохранять как limitation; нельзя подбирать
старый ref или «чинить» его JS. Если rekey не случился, L02=`NOT_REPRODUCED`.

## S11. Большой preview и файл сразу после Export

**Проверяет:** C16/C25/C26/C28, browser pin smoke C35.

**Вход:** ≥100 строк с уникальным Id, длинным кириллическим Text, кавычками и
корректно экранированными CSV переносами; отдельные поля Zero=0, Missing=NULL,
WideInteger=9223372036854775807 с **явным integer типом**. Файл `javascript-data.csv`.
Вход/содержимое генерируются до модели и имеют независимый hash/oracle.

**Задание агенту:**

> Стандартными Import и Sort отсортируй строки по Id, запроси preview100строк
> с точными числами, экспортируй весь результат в новый CSV и сразу получи этот
> файл. Сверь количество строк и контрольные значения, сохрани пакет. Если preview
> ограничен, явно укажи это и не называй его всей таблицей.

**Oracle:** сохранены NULL/0/точный64-bit integer и целые строки; ordinary
preview может стать короче100, но sample_complete/limitations обязаны отражать
неполноту. Final MCP envelope≤46000bytes с учётом text/structured/advice. Если
сама полная schema не помещается, допустим явный delivery refusal, не молчаливое
усечение и не повтор mutation. Экспортированный файл проверяется целиком отдельно.

Для C26 нужен actual storage-loading/pending→ready с same owner/store и
единственным Refresh. Если файл сразу ready, это download smoke, а не race PASS.

## S12. Ошибка собственного JS и ошибка upstream — разные факты

**Проверяет:** C20/C22, ограничения интерпретации runtime errors.

**Задание агенту:**

> По моей явной просьбе добавь JavaScript, который выдаёт диагностическую
> ошибку OWN_JS_SENTINEL. Выполни его один раз и объясни, какому узлу относится
> ошибка. Затем исправь его на Amount2=Amount*2, проверь результат и сохрани пакет.

**Oracle:** первый child native-owned, failure_verified с точным root/group/node;
не ложный success, не повтор неизвестного Execute. Исправление — новая
подтверждённая операция. Для сравнения upstream error использовать подготовленный
fixture/operator harness: агент не должен объявить ошибку зависимости доказанной
ошибкой JS. Не создавать неисправную внешнюю БД/систему ради этого теста.

## S13. Offscreen Table cards на стандартном output

**Проверяет:** остаточное L01. Нужен при адресном исправлении scroll capability,
не основание повторить всю аналитическую матрицу.

**Подготовка:** свой стандартный Sort/Calculator output; штатно создать несколько
Table views так, чтобы кнопка Add или нужная card стала ниже viewport. Не
использовать неподдержанный multi-output JS. Снимок должен подтвердить actual
offscreen и тот же native port/panel.

**Задание агенту:**

> В подготовленном моём сценарии прочитай свежий результат существующей
> Сортировки, вернись к сценарию и сохрани пакет. Если нужная таблица не видна,
> работай только с её собственной панелью визуализаторов.

**Oracle:** точный port/card identity при scroll, один новый Table Add, точные
данные после возвращения/cold reopen. Текущее `Owned viewer scroll anchor
unavailable` сохранять как известный отказ. Успех на visible card L01 не проверяет.

## S14. Native full-read при pinned console

**Проверяет:** остаточное L04, а не JS UI-full из S07.

**Подготовка:** собственный небольшой принятый Collapse либо CrossTable case
из node-evals с native full provenance, ≤50строк/8колонок; консоль действительно
pinned и имеет namespace `MF;ConsoleForm;…`.

**Задание агенту:**

> Выполни подготовленный стандартный узел и прочитай его полный результат
> через поддерживаемый native full-read. Сверь его с ожидаемой таблицей и
> сохрани пакет. JavaScript не используй.

**Oracle:** результат соответствует независимому oracle, native execution tree
привязан к своему root/group/node. Отказ из-за поиска только `ConsoleForm` —
L04, а не ошибка аналитики; не подменять full UI sample либо JS. Для сравнения
использовать тот же case с unpinned namespace, только после чистого освобождения
первой сессии. Если namespace не сменился, отрицательная ветвь не воспроизведена.

## Что не стоит проверять новым модельным сценарием

### O01. Private Import callback / civil DateTime

C15: существующий `javascript-native-datetime.test.mjs` и civil-datetime operator
oracle. Проверить NULL, `2024-02-29T23:59:59.123`, `2026-03-29T01:59:59.999`,
raw evidence и отсутствие UTC-сдвига. Public модель callback включить не может;
новый ordinary Import этого не докажет.

### O02. Generic script deny

C17: `workspace-script-guard.test.mjs`, включая renamed JS, forged actions,
foreign/native replacements, own FItems и обычный Calculator рядом с JS.
В обычном user-v1 этих generic tools нет; не расширять каталог для модели
ради отрицательного теста.

### O03. Masks, redraw, Stop и journal races

C01/C04/C05/C06/C19–C21/C36: существующие serialized production UI fixtures,
точная подмена owner/record/epoch/ACK, fake delayed durable write с measured
timestamps. Каждый negative должен отказать **до** следующего опасного жеста.
Нельзя считать отсутствие случайной live гонки доказательством guard.

### O04. Схемы, границы выдачи и catalog

C24/C25/C28/C36: `node-api.test.mjs` сравнивает AJV и actual dispatch;
`user-preview-budget.test.mjs`/`user-response-budget.test.mjs` проверяют exact
wire boundaries/escaping/structured copy/full refusals; tests catalog/config
проверяют отключённый WebMCP. Не писать зеркальную копию validator вместо
вызова настоящей реализации. Простой agent prompt не проверяет весь input space.

### O05. Absolute deadline и длинные read timeouts

C27/C29: `action-parent-deadline.test.mjs`, runtime `call-timeout.test.mjs`,
Host `read-timeouts.test.ts`. Управляемые часы + настоящий adapter/Node process
доказывают source310s/context610s/ordinary181s без30-минутной модельной задержки.
Cursor transport allowance не должен обновлять reader deadline.

### O06. Save admission, cleanup refusal, ACK и exit

C30/C31/L05: existing `package-cleanup-bridge`, `saved-package-shutdown`,
`managed-resources-close`, `managed-entry-close` process tests. Дополнительно
при изменении алгоритма:

- Save A→Save B→replay/inspect old A: cleanup authority остаётся B;
- повтор Save одного path с разными original sequence: старый receipt не latest;
- running/unsettled/dirty/no own Save/foreign inventory: никакого auto-save,
  discard/Stop/false ACK; исходный failure сохранён;
- positive own Save→native package Close→logout→bridge resources→Host ACK→exit0;
- false bridge ACK, retained clipboard, incomplete later IPC frame, IO failure:
  не превращаются в успешное освобождение profile;
- если добавлен retry после pre-effect refusal, доказать отсутствие эффекта,
  прежнего owner и one-flight; unknown Close повторять нельзя.

Новый аналитический LLM process не умеет надёжно создать эти private conditions.

### O07. Headless, focus и URL provenance

C32–C34: compiled Host matrix policy×headless, acceptance headed focus guard,
setup/restart/status/actual local prepare. `urlSource` не выбирает URL и тест
наличия metadata не доказывает routing regression. X11 focus evidence не
аттестует Windows/macOS. Отдельный модельный аналитический прогон не нужен.

## Минимальный разумный порядок при будущей необходимости

1. Изменение только конкретного helper: сначала его адресные O-тесты.
2. Export/runtime сомнение: S03 без модели, если прежнего соответствующего
   runtime evidence уже недостаточно.
3. Composition JS→native: S06; output mapping lifecycle: S04.
4. Import format: S01; hidden Join: S02 только с доказанным overflow.
5. Остальные S — только по изменённой области/пробелу. S10/S13/S14 адресуют
   ограничения; их отказ не превращать в новую причину писать всё на JS.

Не суммировать эти диагностические сценарии с замороженной приёмочной серией
skill и не переименовывать прежние аналитические/технические FAIL в PASS.
