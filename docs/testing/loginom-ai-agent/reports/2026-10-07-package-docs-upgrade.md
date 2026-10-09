# Сохранность профилей при обновлении Linux Desktop и CLI

Установленные Desktop и CLI прошли замену payload на чистый кандидат
`669822296615accbd6579c09244dacb24f77a056`, версия `0.1.17`. Настройки,
история, тестовая запись авторизации и пользовательский skill сохранились.
Проверки выполнены в собственных контейнерах Ubuntu 24.04 с `network=none`,
от UID1200. Внешняя модель, Help и Loginom не вызывались. Установка пользователя,
её launcher и профили не менялись. Контейнеры удалены; оставшихся собственных
процессов нет.

Это проверка замены payload при неизменной версии. Она не доказывает миграцию
между release-версиями, живой выбор skill или одновременную независимую работу
двух продуктов с браузерными сценариями. Соответствующие пункты этапа 8 открыты.

## Входы и воспроизведение

Evidence root вне Git:
`/home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006`.

| Вход | Закреплённое значение |
| --- | --- |
| Новый CLI tar.gz | `79c287c4cc70f8c62fd33353f1cd0699b3d8d870f31234cb6cf05b74cc8fb4b0` |
| Новый CLI manifest | `74a70dc771399a7edfe4936b8bb40388c44bd0ebca8dbe1fff64a9e48a7e709f` |
| Новый Desktop DEB | `ee8efecc6bbd2a23c25444f8db1f3672206c45733c757c92f6912a559481f42d` |
| CLI base image | `sha256:f703f3f41f4de5c26a941f0d3a3bf19b57f9df66299d43d97dd0a77d00b5bd12` |
| Старый Desktop image | `sha256:a7a875ca0f9f1ed9dfc7c95b9eaa0b8188185f42f1de1f91ef24cbe576c1998a` |

В том же root находятся приватные внешние контроллеры:

```sh
python3 /home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006/run-cli-upgrade-669822296-v4.py
python3 /home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006/run-desktop-upgrade-669822296-v2.py
```

Они намеренно отказываются переиспользовать evidence-каталог. Повторный запуск
требует нового root и не заменяет сохранённый результат. Контроллеры/сырые логи
и тестовые профили остаются вне Git; в отчёте нет секретов пользователя.

## CLI

Публичные install/status/run/uninstall выполнены для полного старого архива
`bc6e7e1648e211bcf411fbfd86564b950a2aaf75`. Собственный HTTP provider возвращал
заранее заданный текст, не выбирал skill и не вызывал инструментов. Пока первый
ответ удерживался, второй CLI получил `PROFILE_BUSY`, exit3; nonce владельца
`.writer` не изменился. После первого штатного завершения guard отсутствовал.

Сохранённый sessionID продолжен новым процессом ещё на старой сборке. Затем
старый payload штатно удалён, новый установлен и проверен публичным status.
На новой сборке выполнено ещё одно продолжение того же sessionID. Исходное
сообщение, ответы и новое сообщение присутствуют в сохранённой истории;
инструментов и activation metadata нет. Config, синтетическая auth fixture и
пользовательский `upgrade-check` имеют одинаковые SHA до/после удаления и
установки. Каталог содержит оба bundled skills и пользовательский skill;
default не рекламирует prepare и `package_docs_run`. Новое удаление штатное.

`cli-669822296-upgrade-v4/result.json`: PASS, exit0, containerRemoved=true,
processesRemaining=[]. Driver SHA256
`cff4992b1fe2b222e61245a8998d561a86ecaa90cd888b645e9fa312650c3493`;
controller SHA256
`141d4ecccb8ab2c6e3c58dfb053071f9d4eb73758eac20b1c5b19942bc318e2d`.

### Сохранённые отказы драйвера

- v1 остановился до установки кандидата: config без `$schema` был штатно
  нормализован загрузчиком. Это доказано точным восстановлением обоих SHA;
  ошибка момента фиксации baseline в драйвере сохранена в `diagnosis.json`.
- v2 остановился на продолжении после установки; v3 воспроизвёл такое же
  ожидание на старой сборке до удаления payload. Оба сохранили исходный timeout.
- Причина v2/v3: `execFile` оставлял stdin pipe открытым. Production
  `readPromptStdin(true)` ждёт EOF до первого SDK GET. Минимальная проверка
  воспроизвела ожидание 3/3 и штатное завершение после `child.stdin.end()` 3/3.
  Отдельный холодный GET сохранённой сессии в новых source-процессах дал HTTP200
  3/3. Узкий существующий SDK lifecycle test также PASS.
- v4 меняет только оформление stdin внешнего драйвера; продукт и deadline180s
  не менялись. Installed продолжение до/после замены подтвердило устранение
  причины. Исходные v1/v2/v3 FAIL и диагностические файлы сохранены.

Материалы диагноза: `cli-resume-signal-collector/{stdin-framing-results,
fresh-get-results}.json`. Это стабильный дефект тестового оформления ввода;
регрессия SDK GET или продукта не подтверждена.

## Desktop

Старый установленный DEB из immutable image запущен в обычном собственном
HOME/XDG. Onboarding test mode не использовался: его in-memory DB не доказывает
сохранение истории. Настройка записана через native store API, тестовая auth
fixture и пользовательское сообщение — через настоящий backend API. Сообщение
добавлялось с `noReply:true`, поэтому модель не вызывалась.

После штатного закрытия приложения `dpkg -i` заменил payload. Новый Desktop
прочитал прежнюю настройку и историю, затем сохранил второе сообщение в том же
чате. Config, auth fixture и user skill сохранили точные SHA. В обоих запусках
каталог содержал verified bundled skills из установленного resource root.
Новый ASAR равен кандидату; runtime manifest совпал побайтно и полная проверка
установленных ресурсов прошла. Tool parts/activation metadata отсутствуют.

`desktop-669822296-upgrade-v2/result.json`: обе фазы PASS, exit0,
containerRemoved=true, remaining=[]. Driver SHA256
`ac05dbc4872d7bde048aef24f36d23a1e0ce7ed5c97806c500f603be88ea4f32`;
controller SHA256
`77c894af9235f337d13c5feeb62437c8b7aa94fc09ade29e04d95e9cbc129983`.
Исходный v1 отказал на ошибочном bind mount имени manifest до запуска контейнера;
этот FAIL125 сохранён отдельно, продукт/модель тогда не запускались.

Данные подтверждают сохранность профиля на отдельном обновлении каждого
продукта. Независимость одновременных Desktop/CLI browser sessions и полный
installed lifecycle требуют оставшейся приёмки замороженного плана.
