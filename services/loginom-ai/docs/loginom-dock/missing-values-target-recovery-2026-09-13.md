# Node14: target placement и завершение проверенного отказа

Узкая живая проверка прошла. Отказ создания за пределами видимого графа больше
не оставляет операцию pending, если исходный граф не изменился, а предварительное
чтение источника завершилось с проверенным закрытием редактора. Известный эффект
деактивации источника сохранён: результат FAILED, а не NOT_APPLIED.

Назначение: `node14:target-recovery-followup:1:02b9e4c36e346f8ceebf1257a7571f88c8f56f20`.
Source и harness закоммичены: `e433c593cbc729af29c69933a777a70d672a4e21`.
[Машинные pins](missing-values-target-recovery-pins-2026-09-13.json).

## Подтверждённая причина

Loginom 7.4.2, Chromium/macOS, test-4. Во всех трёх новых собственных сессиях
viewport=null; inner 1508×862, outer 1508×949. Граф расположен в x=324,y=100,
имеет ширину1178 и высоту756. Запрошенная позиция {x:1200,y:260} вычисляется
в `node-target-browser.mjs` как экранная точка {x:1524,y:360}: она находится
за правым краем графа1502 и окна1508, elementFromPoint=null.

Отказ проверки до drag корректен. Независимый снимок cached UI nodes и DOM
связей до/после показал отсутствие созданного узла и неизменный граф. Координата
не была молча сдвинута. Проверена связь с E2E `bg/helpers/workflow/node.ts`
(AddNodeBase/CheckNodeDropX) и правилами coordinate drag из Loginom automation.

Полная node.apply добавляет предварительное чтение типов/видов полей источника
через редактор выходного порта. В живом случае оно изменило active=true→false,
но не настройки; отмена редактора подтверждена. `executor.mjs` не передавал
проверенный target-отказ при preflight.effect_possible=true. Поэтому applyNode
оставлял target pending, хотя ни drop, ни незавершённого редактора не было.
Inspect подтверждал cleanup и снимал внутреннюю pending phase; исходный ID
оставался AMBIGUOUS. Resume повторил отказ, cancel завершённого worker ничего
не менял, save_checkpoint вернул OPERATION_STILL_PENDING. Изменённая координата
под прежним ID была отклонена. Это воспроизвело цепочку исходного FAIL.

## Изменение и границы

- `missing-values-preflight.mjs` передаёт свидетельство завершённого чтения
  только после проверки отмены и подтверждённой записи доказательства.
- `executor.mjs` использует существующий путь verified refusal, когда target
  доказанно NOT_APPLIED без частичного эффекта/pending, а законченный Missing
  preflight подтвердил неизменные настройки. Известный эффект на источник
  остаётся effect_possible=true; результат FAILED освобождает gate.
- `node-target.mjs` перед принятием каждого pre-dispatch refusal дополнительно
  читает граф. Изменение графа либо потеря этого чтения сохраняют pending.

Публичные схемы, operation identity, сроки и лимит локальных попыток не изменены.
Повтор того же запроса возвращает сохранённый результат; изменить параметры
того же ID нельзя. После проверенного FAILED с cleanup=true и inspect=resolved
для новой позиции применяется **новый operation ID**. Исходный ID и его отказ
сохраняются. Неопределённый/частичный эффект не разрешает такой переход.
Исправление не восстанавливает старые закрытые сессии и не очищает их журналы.

## Живые доказательства

Все пути ниже относительно корня этого worktree; индекс SHA/размеров2523 файлов:
`.dock/node14-target-followup/evidence-files.json`.

| Проверка | Доказательство | Результат |
|---|---|---|
| Исходная геометрия и отказ без source preflight | `.dock/node14-live-1789290924775/geometry-target.json` | NOT_APPLIED, граф неизменен |
| Полная исходная цепочка | тот же каталог: `check-chain.json`, `resume-before.json`, `check-after-resume.json`, `execution-events.jsonl` | AMBIGUOUS/pending, save заблокирован |
| Исправленный отказ | `.dock/node14-live-1789291337674/check-fixed.json` | FAILED, cleanup=true, inspect=resolved, узла нет |
| Новый ID и доступная позиция750,260 | `correct-new-id.json`, `finish-fixed-final.json` в том же каталоге | SUCCEEDED, ровно один узел и одна связь |
| Независимая таблица | `missing-note-only-followup-corrected-independent-full-raw.json` и `finish-fixed-final.json` | 4×5, все20 ячеек сверены |
| Native save | `finish-fixed-final.json`, `execution-events.jsonl`, `final-ui.json`, `saved-graph.png` | SUCCEEDED, save_flow_completed, тот же workflow |

Пакет: `/test-4/packages/Node14-target-recovery-fixed-fresh.lgp`.
Отдельный CSV: `/test-4/Node14-target-followup-20260913-fresh.csv`.
Только Null поля Note заменён строкой «Пропуск»; остальные Null, строка `null`,
пустая строка и числовые значения сохранены. Содержимое .lgp после независимого
переоткрытия не проверялось; здесь подтверждено штатное завершённое сохранение.

Промежуточная сессия `.dock/node14-live-1789291255047` открыла прежний компонентный
образец read-only из-за серверной блокировки и остановилась до необходимой
проверки. Она сохранена как непрошедшая подготовка; исправление затем проверено
в новом черновике с отдельным CSV. Первоначальная диагностическая ошибка схемы
нового запроса и проба save без conflict_policy также сохранены; они не считались
продуктовыми дефектами. Valid save probe отдельно подтвердил исходную блокировку.
Собственные процессы трёх сессий остановлены; read-only process check09:29:16UTC
сохранён в `.dock/node14-target-followup/process-check.json`.

## Проверки и следующий кандидат

Focused:123 PASS. Полный клиентский набор последовательно:1444 PASS,1 SKIP.
Missing Values Python:12 PASS. В первоначальной sandbox-попытке9 тестов не смогли
открыть локальные сокеты; разрешённый параллельный повтор получил один нестабильный
старый тест timeoutMs=2 (UI_BUILD_MISMATCH вместо DEADLINE). Его отдельный повтор
26/26 и полный последовательный повтор прошли; сам тест не менялся. Все логи сохранены.

Source preflight:395 build inputs совпадают с коммитом; runtime156 файлов:
`0f835b823b54e2eefc3fd720fbfdf73606bcab70e9f9a805487efa6399a97b18`.
Harness248 inputs SHA: `e6d7dbac1eab35731f8170db8d2549f151c6d82d850f6a8d52a98d3bcfd5b2d5`.
Goal и fixtures не менялись. В verifier/reopen обновлены только ожидаемый runtime
и версия следующего каталога; критерии принятия не ослаблены.

Подготовлена версия `2026.09.13-node14-test4.2-candidate`, **не staged**.
Архив `.dock/node14-target-followup/catalog-packet/catalog-source.tar` содержит
11 tracked build dependencies из source-коммита. SHA:
`d120d055300863f2e0594e04ccc38147c79ba55296fc24a942270e36fef6cfcd`.
Он совпадает с предыдущим архивом: исходники каталога не менялись.
Новый source-manifest SHA:
`d504ab5f0cd4e600a41c0606c5a6e5957c8be49160b144ed837a9709765a87f3`.
Все файлы извлечены в отдельный каталог и сверены; builder import и publisher
--help прошли. Сборки каталога на Mac и действий на VPS не было.

Для координатора: использовать прежний [VPS workflow](../../tools/loginom-acceptance/node14/VPS.md)
с новым архивом, source-коммитом и версией test4.2, обоими save roots=/test-4.
Перед stage требуется проверить отсутствие новой версии; manifest SHA появится
только после server build/readback. Новый экземпляр архива воспроизводится:

```sh
python3 tools/loginom-acceptance/node14/build_packet.py --commit e433c593cbc729af29c69933a777a70d672a4e21 --version 2026.09.13-node14-test4.2-candidate --out .dock/node14-target-followup-packet-copy
```

**Остаток полного допуска:** `missing_values_acceptance.py:22,112` по-прежнему
требует единственный успешный node_checkpoint для каждого node_apply_prepared.
Чистый отказ и исправленный запрос с новым ID автоматически не принимаются
полным аудитором. Этот критерий в данной узкой фазе не менялся; координатору
нужно отдельно решить, требуется ли доказательный аудит терминальных отказов
перед следующим полным прогоном. Product fix и архив готовы к следующему
candidate stage, но это не разрешение/допуск к Hermes и не принятие полного goal.

Исходный FAIL20260913-113814-1bc86af9 и все13 receipts сверены и неизменны.
Новых model runs, review, merge, push, deploy, activation, переноса чужих фиксов,
изменений main/shared plugin/memory routing не было.
