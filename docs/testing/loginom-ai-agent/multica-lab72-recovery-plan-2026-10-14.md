# LAB-72: проверка плана восстановления — 14.10.2026

> Исторический документ: результаты и ограничения сохранены. Правила оркестрации заменены 14.10.2026 на [независимую обработку узлов](multica-mas.md); старые команды не являются действующей инструкцией.

Снимок подготовки R3 до последующего verdict. На момент перехода independent-nodes review R3 уже завершён с требованием quiesce; подготовленный Генератором R4 не имеет самостоятельного execution verdict. Recovery выделено в отдельную задачу и не входит в миграцию остальных узлов. **Исполнение не разрешено.** Разрешение владельца относится к сохранительному recovery, а предложенный аварийный вариант допускает потерю несохранённого draft. Полная приёмка узла не входит в эту проверку.

## Предмет и доказательства

Original owner `4914cd02-218b-44cf-9492-9b2a9c60d361`, native GUID `0aaf2c63-3ad2-4f84-a453-f5f780366c79`, frozen product `010cdccf914940eed3813435a1a360f1be22ea10`, исходный foreground45354. Retained Worker `01a13545-d71b-7b39-9d4d-490dbfead7c8` и queued receiving `01a13884-799a-7679-86e0-05c560522e19` сохранены. UNKNOWN операция не повторялась.

R2 SHA256 `eb6d95d229b7328c3236d1ae255acf92ce2200444a1cec5314f73ff067ee33ff` остаётся историей. Оператор подготовил R3 SHA256 `743f5388f89cdbdc053a03ce2efdef52701ba82446c874037f90ed4684f5e7e3`; приватный пакет из12 файлов mode0600/каталог0700 доставлен на MAS с точным readback, manifest SHA256 `3b68ba0a1f53508d013e507df09b130755c159546afa7b07e2b316744ece6d24`. Секреты и сырые диагностические данные в git не включены.

- Root13:26:56 МСК: два полного PID/task/FD обхода без ошибок; original15/четыре reciprocal UNIX socket пары стабильны, сторонних holders не обнаружено. Равенство network namespaces всех targets reader — false; этот факт не переписан.
- Вложенные PID namespaces потребовали отдельной проверки: завершение namespace init может завершить всех его членов. [Linux PID namespaces](https://man7.org/linux/man-pages/man7/pid_namespaces.7.html).
- Новые объединённые scope reads13:59:44 и14:00:03: read-only NS_GET_PARENT классифицировал каждый видимый процесс относительно initial PID namespace; members/chains стабильны, в пяти затрагиваемых sandbox namespace subtrees нет членов вне original15. Константа initial namespace сверена с установленным MAS linux/nsfs.h. Чужие argv/содержимое FD не копировались.
- В этих двух reads сохранились4 и2 исчезнувших FD links (ENOENT), поэтому `noCaptureReadErrors=false`, execution admission отрицателен. Ошибки не удалены, бесконечных повторов capture нет. Все15 preparation pidfds закрыты после каждого чтения. Сигналов/native действий0.
- Source collector восстановлен из исходной heredoc+launch команды13.10 12:51:09UTC и совпал с текущим файлом побайтно: SHA256 `b0496fd8df777d55662b99e9c875eff65d1ee3015eb50a5f2c75cb3a3fa1e17f`. Текущие PID/start/parent/stateT/script/cwd/exe подтверждены. Это provenance запуска, не извлечение загруженного bytecode.
- Python3.14.4 `subprocess.py` SHA256 `6628ffdd65c093a6c08cae01ffe82877d3ced515aac9e7be0cff16512c30a7d9`: текущий `send_signal` сначала вызывает poll. Достаточность этих данных для bounded collector continuation передана на независимое решение; более сильная loaded-code гарантия не заявлена.

## Проверяемое действие R3

Предлагается отдельно разрешаемое аварийное завершение15 original application/browser/helper процессов через удерживаемые process pidfds. Перед действием требуются свежие identity/FD/peer/namespace проверки без ошибок; mismatch/new unqualified member/unknown holder означает отказ без расширения списка. Порядок: managed→sandbox children→остальные browser children/zygotes→Chrome root→crashpad/monitor→host→original CLI. Каждый terminal ожидается до10 секунд, основной этап до150 секунд. Timeout/error/partial result останавливает оставшиеся действия без fallback. Перед namespace-init действием требуется новая проверка membership; неатомарность snapshot/fork предъявлена ревьюеру явно.

Collector, wrapper, shell, daemon, предки и соседи исключены из SIGKILL scope. Никаких name/group kill, удаления .writer/pending/temp, подделки receipt/ACK, native Close/Save или повтора CLI. Локальный terminal не подтверждает очистку серверного сеанса.

Collector SIGCONT рассматривается отдельно: только после terminal всех15, повторной сверки исходного collector и принятия его provenance. Ожидание original model-exit/foreground receipt — до30 секунд. Negative CLI exit, collector/outer exit и cancelledAtLimit bookkeeping учитываются отдельно. Native GUID→server row/SessionID остаётся UNKNOWN и требует штатной target-only проверки, не закрытия по одному имени.

## Доставка и точка продолжения

Генератор получил уточнение `a8b16056-f7b6-4daf-bb5a-1230522eaeee`: оператор является единственным автором addendum и отправителем final review; дублирующий review не создавать. В14:06 Генератор содержательно принял это разделение и сохранил координацию после verdict.

`handoff.py`: комментарий `01a13a16-6b88-725b-82a4-34ad55781c7d` → реально running Ловец `01a13a16-6b9f-757f-a22b-246c6801a92a`, `assigned/durable_assignment`, acceptance ещё не подтверждена. Reviewer читает пакет; R1/R2/source suites повторно не назначены. Checkpoint72 description-only CAS658→659/readback.

Нужен итог раздельно по observed scope, порядку/bounds/partial stop, collector continuation и execution readiness. Только после устранения технических замечаний можно представить владельцу конкретный вариант с возможной потерей draft. До этого сохраняются custody и очередь; модель не запускается.
