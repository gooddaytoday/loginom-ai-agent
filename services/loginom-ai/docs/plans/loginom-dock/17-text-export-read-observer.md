> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-a623b37cf80d` и изменения: [происхождение](../../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../../docs/node-development/README.md).

> Исторический contract1. Уточнение координатора и актуальная офлайн-интеграция:
> [contract2](17-text-export-read-observer-v2.md). Applied-settings snapshot
> больше не требуется для узкого byte-read gate; native smoke всё ещё pending.

# Node17: локальный observer подготовлен, native snapshot остаётся блокером

Назначение `node17:acceptance-read-observer:1:77de0909`.
Выполнена независимая локальная часть: single-shot dispatch gate, запись цепочки
наблюдения, проверка фактического файла и отдельный Python verifier. Это
**не подключённый к SDK каркас диагностического инструмента**, не готовый native
reader и не публичная возможность Hermes. `acceptance_readiness.ready=false`;
защиты `run.py` и полного аудитора оставлены без изменения.

## Реализованная часть

`packages/loginom-runtime/tools/loginom-acceptance/text-export-read-observer.mjs` принимает host-owned
`dispatch`, `observe`, журнал и приватный artifact root. Callback по умолчанию
отказывает с `NATIVE_APPLIED_SETTINGS_GRAPH_READER_UNAVAILABLE`. Нет импорта
entry клиента, перехвата SDK или запуска браузера. Тестовые callbacks создают
синтетические файлы только в собственных временных каталогах.

На интервале наблюдения все конкурирующие вызовы **через этот gate** блокируются;
уже активный dispatch запрещает старт. Это не глобальная атомарность: внешние
писатели и вызовы, которые не проходят через будущий wrapper, не блокируются.
Один observer получает новый read ID, общий AbortSignal и абсолютный deadline:
минимум 60 секунд и оставшегося общего бюджета. Повторное чтение не разрешено.
При таймауте, неопределённости или неподтверждённом cleanup gate отказывает без
replace; поздний callback не может разрешить dispatch. Если сам dispatch уже
был вызван и транспорт упал, результат честно обозначен как неопределённый.

Сохраняются hash-linked события `reject_bound → read_started → read_completed →
replace_dispatch`. Требуются исходные original/reject causal anchors, исходный
запрос без изменения, один download, listener до жеста, точное имя, origin,
session/read IDs и снимки document/workflow/node/source/graph/settings до и после.
Фактический новый обычный файл проверяется независимо от заявленного `passed`:
размер, SHA-256, отсутствие symlink, неизменность inode/size/mtime/ctime при чтении.
Лимит принимаемого файла 16 MiB; он не ограничивает заранее объём записи браузером.

`text_export_observer_evidence.py` проверяет цепочку, байты и отдельный actual
replace-dispatch anchor. `expected` должен поступать из настоящего внешнего
ledger; нельзя копировать его из observer proof. `replace_dispatch` внутри
observer — лишь intent. Источник actual anchor ещё не интегрирован. Успех verifier
имеет только scope `unadmitted_observer_proof`, не меняет готовность acceptance.

## Точная причина остановки зависимой части

`unavailable:artifact-82761f3be30144eb` на закрытом графе возвращает identity, surface,
refs и locked. Он не читает применённые настройки export/source и весь граф.
`unavailable:artifact-77aa2804b7e8d895` требует уже открытый мастер, а его browser
reader читает поля страниц мастера. После terminal reject мастер закрыт.
Старый handler readback не доказывает текущее состояние настроек. Открытие мастера
для чтения может менять активность узла и противоречит требованию невмешательства.
Проверенного reader настроек из закрытого графа в изученном коде не найдено.
Это отсутствие подтверждённого механизма, а не доказательство невозможности
такого чтения вообще. Свойства внутренней модели не угадывались.

Поэтому зависимые native adapter, привязка к единственному owned browser client,
перехват реального replace, actual-dispatch ledger и включение verifier в полный
аудитор **не реализованы**. Нельзя ослаблять снимок до identity или выдавать
исторические настройки за наблюдённые. Следующий владелец решения — координатор.

## Проверки и неизменные границы

- 8 Node tests PASS на закреплённом Node 24.19.0: успешный synthetic callback,
  негативы состояния/cleanup/цепочки, реальные изменённые bytes, timeout и поздний
  ответ, конкуренция, отсутствующий native reader, неопределённый dispatch,
  истёкший общий бюджет.
- 6 новых Python tests PASS: positive только synthetic, 24 семантических
  негатива с пересчитанной hash chain, 5 вариантов отсутствующего/чужого actual
  anchor, повреждение журнала/файла, подмена запроса/symlink, неверное время.
- 6 существующих readiness/acceptance tests PASS. `git diff --check` PASS.
- Все 155 runtime inputs и предыдущие 247 harness inputs сверены без изменений;
  добавлены ровно 4 observer/test файла. Goal, fixtures, 22 nodeops, 3 deliveries
  и save/reopen gates сохранены. Pins приведены в соседнем JSON.
- Новый live, Hermes, повторное review, model slot, VPS/main/push/plugin/routing
  не запускались и не менялись. Работа ограничена этой веткой.

## План узкой native проверки — пока не разрешён к запуску

1. После отдельного решения координатора и свежего disk check: один изолированный
   browser client test-2, `/test-2`, Loginom 7.4.2 Linux; visible maximized,
   viewport null. Сначала только чтение закрытого графа и исследование конкретных
   settings/source fields, без открытия мастера, Configure/Finish/Execute/save/
   upload. Не выгружать целиком внутреннюю модель. Одно ограниченное наблюдение
   до 30 секунд, без ретраев. Если полный снимок недоступен — остановиться.
2. Только после подтверждения такого reader закончить wrapper/adapter/ledger и
   его адресные проверки, закрепить новые отдельные hashes. Native smoke:
   baseline → terminal reject → ровно одно скачивание → возврат в прежний workflow
   → точное сравнение всех состояний → неизменённый replace. Сам интервал observer
   ≤60 секунд внутри общего timeout. Никаких действий настройки или исполнения
   внутри observer. Отдельная подготовка исходного baseline требует согласованного
   smoke задания; она не маскируется под read-only наблюдение.
3. Независимый verifier проверяет raw chain/новый файл/actual dispatch. Любая
   неопределённость закрывает gate. Только успешные адресные native и негативные
   проверки могут стать основанием отдельного решения о readiness; затем слот
   финального Hermes выделяет координатор. Исходный полный goal не сокращается.

Последний локальный disk check: 2,111,737,856 свободных байт (~1.97 GiB).
Оценка новых малых proof/download данных ≤32 MiB при исходном CSV 124 bytes;
это плановый бюджет, не реализованный жёсткий disk cap. Рост профиля браузера и
служебных журналов сюда не входит, его требуется оценить перед разрешением live.
Новые browser profiles и крупные fixtures сейчас не создавались; старые evidence
не удалялись. При текущем недостатке места автоматического старта нет.
