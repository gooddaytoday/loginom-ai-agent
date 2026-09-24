> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-a4e131534176` и изменения: [происхождение](../../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../../docs/node-development/README.md).

# Узел11: candidate v2 preflight — 13 сентября 2026

**candidate_preflight_passed / awaiting_hermes_slot**.

Новый серверный candidate `2026.09.13-node11.2-candidate` закреплён для следующей
приёмки: manifest SHA256 `bb2fe2207e01d594108efb591d1c25036adc12f67168ef895dfde755d391ac2a`.
Stage/readback четырёх файлов подтверждён квитанцией координатора; свежая локальная
сессия независимо загрузила закреплённый каталог. Candidate не активирован.

Источник `b05715340937f9c828e03bc6ec7a88f3adf086da`, runtime
`8d6d4b3cd7f5d19a3ac1e9ac6537ff8219f97f9898326227df3f3ae55dcb1380` не изменились.
Проверены 253 входных файла harness и goal SHA256
`d283e683fe61298a9273365ca485d63e16fb582d08b45d42dfefb70c65952a9c`.
Штатный preflight с явно переданными URI/SHA candidate прошёл без модели:
openai-codex / gpt-5.6-sol / low, Node24.19.0, собственные test-2 и /test-2.
Ветка `replacement_launch.py --preflight` не передаёт candidate pin; поэтому
использован её неизменённый `command(pin)` с `run.py --preflight --output`.

Свежая сессия `8d0c37ed-22e9-4469-b7eb-201252c4200a` выполнила `dock_prepare`: READY,
Loginom7.4.2, собственный черновик, verified ownership. Проверены фактическая
геометрия развёрнутого окна 1508×949 при доступной 1512×949 и viewport:null,
полный хеш skill bundle, обе save revision=2 и allowed_roots=[/test-2].
Черновик закрыт; наблюдалась страница «Начало», bridge завершился кодом0,
процессов собственного профиля не осталось. Первая попытка вспомогательного
закрытия встретила форму ответа pagination без ui до действия; после нового
наблюдения повторное закрытие успешно. Эта ошибка сохранена в отчёте.

[Закреплённые pins](../../loginom-dock/node11-candidate-v2-pin-2026-09-13.json).
[Машинный отчёт и SHA доказательств](../../loginom-dock/node11-candidate-v2-preflight-2026-09-13.json).

## Следующая полная приёмка

Команда подготовлена, **не выполнена**. `COORDINATOR_ASSIGNED_SLOT` ниже —
обязательное место для будущего явно назначенного слота, сейчас слот не назначен.

```sh
python3 packages/loginom-runtime/tools/loginom-acceptance/replacement_launch.py --run --candidate-pin services/loginom-ai/docs/loginom-dock/node11-candidate-v2-pin-2026-09-13.json --slot-id COORDINATOR_ASSIGNED_SLOT
```

Hermes11 не запускался; слот остаётся node14. Полная автономная приёмка ещё не
пройдена. Предыдущие focused audit и suites не повторялись. Исходный FAIL и
его доказательства сохранены. VPS, current, main, push, общий plugin и routing
не менялись. Изменены только собственные отчёт и pins.
