# Host cleanup и повтор автономного пилота

**Цель:** устранить причину `LOGINOM_HOST_CLEANUP_FAILED` из LAB-1564 и получить
на новой карточке судейский результат для каждого из трёх прежних кейсов.
Quality FAIL допустим; `no_artifact`, ошибка CLI или `unscored` приёмку не заменяют.

**Подход:** сначала связать исходный отказ с конкретной стадией shutdown,
затем исправить только её и проверить реальной закреплённой поставкой.
Обычные партии продолжает вести существующая служба, роли squad сохраняются.
Исходный результат LAB-1564, его pins и архив остаются неизменными.

## Ограничения

- Сохранить три кейса, один раунд, N=2, batchSize=2, maxStartedAttempts=4,
  модель продукта и судью, их настройки и корпус предыдущего пилота.
- Не ослаблять ACK `closed:true`, фактический clean exit, владение ресурсами,
  profile guard, Close/logout и проверки отсутствия чужих процессов/файлов.
- Если причина в установленном CLI, собрать отдельный воспроизводимый CLI
  с необходимым исправлением и новым pin. Не выдавать старый бинарник за новую
  сборку и не переносить целиком другую продуктовую ветку.
- До назначения подготовить подключённый runner; после назначения только
  наблюдать. Ручное вмешательство фиксируется и требует новой карточки.
- Секреты подставлять через `kit secret-exec`; сырые данные хранить вне Git.
- Истечение access не доказывает отказ refresh. Перед новым запуском проверить
  штатное обновление одним последовательным вызовом продукта и read-back
  сохранённой пары. Второй слот со старой копией refresh не запускать;
  согласованность двух слотов проверить до параллельного допуска.

## 1. Причина и минимальный ремонт

- [x] Зафиксировать первую ошибку LAB-1564, последние Save/SaveAs и tool errors,
  `saved-package-cleanup.json`, `resource-close.jsonl`, `runtime-close-*.json`,
  ACK и фактический exit/signal. Проверить, был ли артефакт готов до ошибки.
- [x] Независимо проверить диагностический план до изменения исходников.
- [x] Проверить применимость известных кандидатов `757af77ded`, `6469b0deef`,
  `feaff89177` к воспроизведённому отказу. Выбирать только необходимые hunks
  и регрессию, а не весь набор или ветку. Для LAB-1564 post-ACK вариант
  опровергнут: Loginom runtime вернул `closed_ack=false`, cleanup error и exit 1.
- [x] Исправить подтверждённую причину: существующий автономный JS-источник
  открывает пятистраничный wizard с пустой Input-страницей. Старый адаптер
  читает Columns schema до Input→Columns, получает отсутствие
  `settings.generation_checked` и оставляет source read неопределённым.
  Защитные `sourceReads.unsettled`, Host ACK и package cleanup сохраняются.
- [x] Перенести связные необходимые hunks `5a02b6c811` и `d000cd0a04` в
  `packages/loginom-runtime/client/lib/javascript-managed-source-adapter.mjs`,
  `javascript-managed-next.mjs`, `javascript-managed-opening.mjs`,
  `javascript-managed-generation.mjs`, `javascript-managed-code-next.mjs`,
  `javascript-managed-done.mjs`. Публичный API и обычный четырёхстраничный
  маршрут не меняются. Внутренний `inputPage` доходит до Code/Done и убирается
  перед строгим dispose исходной selection lease.
- [x] Первый RED→GREEN: в `client/test/javascript-managed-source-adapter.test.mjs`
  воспроизвести `generation.checked` отсутствующим на Input, затем проверить
  пятистраничное source/context read с одним собственным Close и одним dispose.
  Выполнить минимальную часть исправления, необходимую этому пути.
- [x] Второй RED→GREEN: в `client/test/javascript-managed-next.test.mjs` проверить
  один Input Next только при полных пустых stores и правильном владельце;
  довести mutation path через generation/Code/Done с неизменными guards.
  Отклонять непустые/неполные stores, чужой owner, повторный или неизвестный Next.
- [x] TDD: воспроизвести исходное нарушение одним поведенческим тестом,
  выполнить минимальное исправление и проверить отрицательные ACK/exit cases.
  Использовать закреплённый Node; не повышать лимиты ради зелёного результата.

## 2. Проверенная поставка

- [x] Прогнать относящиеся runtime/Host/standalone тесты и package typecheck;
  организовать независимое ревью точного diff.
- [x] Собрать отдельный prod CLI из чистого `05cc4f8a812dccdbe33cbec556fd2ada833fec1f`
  штатным build; проверить manifest, закреплённые Node/Chromium и хеши ресурсов.
  Версия `0.3.9-eval.20261116.05cc4f8a81`, SHA-256 бинарника
  `dc6bea6ecd50575af88f4af89ba2e4c87bfa565e4ef952c002f575ce5cddff90`.
  Все шесть исправленных runtime-модулей в поставке совпадают с исходниками.
- [x] Разместить CLI отдельно и проверить транспортный SHA, 6184 записи внешнего
  manifest и 5160 записей ресурсов, права и ссылки. Старые кампании сохранены.
- [x] Оставить harness `ab66bfd0cfed503204e88479e6d79f8261cf3a37`: diff до
  нового CLI source содержит runtime, тесты и документы; код evals не изменён.
  CLI source и harness закрепляются отдельно.
- [x] Немодельная проверка новой CLI в отдельной nondelegated unit: точная
  версия, Loginom check, настоящий изолированный браузер и подтверждённая
  очистка. Собственная история архивирована, профиль снова clean.
- [x] Проверить будущие pins CLI/harness/корпуса и фактическую ревизию Dock
  из EnvironmentFile новой службы. Старые 147 файлов и 5 чужих reservations
  сохранены; новая конфигурация применяется только к экземпляру LAB-1713.
- [x] В выделенном состоянии проверить cleanup немодельной проверки новой CLI
  и реальное короткое задание EvalOps: completed/error=null, подтверждены
  harness, CLI source/version и доступ к слотам. Авторизация продукта готова;
  отдельный профиль судьи сохранён. Исторические guard/reservation и pins
  завершённых кампаний не изменены. Модельные admissions проверяет сама batch.

## 3. Новая карточка

- [x] Создать in_progress/unassigned карточку с `calc-data-double`,
  `filter-active-rows`, `local-lgp-edit` и прежними параметрами. Настроить один
  прежний контролируемый отказ до admissions с новой issue UUID.
- [x] До назначения проверить источник, pins, свободное владение, отсутствие
  request/manifest/wakeup, native READY и ожидаемый единственный вызов EvalOps.
- [x] Назначить EvalOps ровно один раз. Request, manifest, два wakeup, reserve
  с исходным created_at, prepare/verify и controller создаёт сам EvalOps.
- [x] После назначения только читать фактический прогресс. Не менять кейсы,
  артефакты, вердикты, модель, бюджет или окружение для получения результата.

## 4. Приёмка

- [x] Все три ключа имеют настоящий артефакт и судейский verdict; quality FAIL
  сохраняется. Внешних вмешательств после назначения ноль.
- [x] Подтверждены native repair/resume, один controller, загрузка/очистка LGP,
  сохранность артефактов, полный читаемый архив с совпадающими размером и SHA.
- [x] EvalBaseline ответил в исходную ветку отчёта с правильным marker;
  карточка in_review, оба её правила выключены, владелец освобождён.
- [x] Сохранены прежние кампании и чужие reservations. Результат независимо
  проверен, канонический checkpoint обновлён.
- [x] Подготовленный diff проверен штатным сканером секретов перед коммитом.

## Checkpoint

- Ветка autonomy-pilot; fix 05cc4f8a81; исходный LAB-1564 сохранён.
- Причина Host cleanup: пустая Input-страница JS wizard, ошибка context read
  и удержанный browser lease. Guards ACK/exit/Close/package cleanup сохранены.
- Три RED→GREEN; runtime 525 PASS, Host 41 PASS, typecheck PASS, review ACCEPT.
- Новая prod CLI05cc: manifest/resources, Loginom и реальный Chromium проверены.
- Harness ab66 и корпус29ea сохраняются; CLI source закреплён отдельно manifest.
- Штатный refresh A и синхронизация A.openai→B проверены; новый login не нужен.
- Native EvalOps READY — LAB-1712. LAB-1713 назначена один раз 11:17 UTC.
- Native launcher восстановился через verify после POOL_POLICY_ACTIVE;
  затем EvalOps сам снял контрольный hold с admissions=0 и возобновил службу.
- LAB-1713: три настоящих LGP, три verdict 100 PASS, по одному judge call,
  CLI exit0 и environment cleanup confirmed; 3 начатые попытки из лимита4.
- После назначения внешних вмешательств ноль; обычные партии ведёт служба.
- Независимый аудит ACCEPT: runtime ACK true/exit0, исходный LGP неизменён,
  upload/cleanup совпали; old147/foreign5 и future pins/source/env сохранены.
- Сдача in_review/published: единственный финальный ответ EvalBaseline,
  оба правила off, owner отсутствует, own units inactive, все native tasks completed.
- Архив 751028 байт, SHA 95f94df8f0a271e701946e7c33bf0329e070ebca75bad19ad62fa84c53d44f39.
- Проверен малый пилот; полный корпус и общий выпуск не выполнялись.
