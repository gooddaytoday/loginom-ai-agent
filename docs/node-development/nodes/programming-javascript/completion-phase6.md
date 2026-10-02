# JavaScript: автономная CLI-приёмка pair13

- event_id: `javascript-phase6-pair13-20261002`; campaign_id: `javascript-20260926-ubuntu`.
- node_id: `component.programming.JavaScript`; attempt_id: `pair13`.
- phase: 6; outcome: completed (CLI-пара, не вся Goal).
- owner task: `01a0ddc9-3e19-75d3-a5c9-724783ed6c35`.
- Source: `6f6a66eb62c78ab2e8b10cd1bd7f38bcf931d8d6`, child `node-javascript`.
- Candidate15: `0.0.0-dev-202610022103`; Linux x64, Loginom Enterprise7.4.2/Linux,
  `http://logi-test-plan.bg.local/app/`, аккаунт `jsteach`, обычный headed Chromium.
- Модель обеих автономных попыток: `openai/gpt-6.1-sol`, variant `low`.
  Исходные лимиты: writer30 минут, отдельный technical cold10 минут.

## Результат и область проверки

Два normal standalone CLI writer получили только бизнес-задание, `sales.csv`
и разные уникальные пути пакетов. Код сформирован моделью; оба исходника
оператор прочитал целиком после завершения writer. Declared создаёт строки в
настроенной схеме; Code вызывает AssignColumns с четырьмя заданными типами,
затем вычисляет значения из каждой входной строки. Готовых ответов нет.

Original writer audit проверил фактическую модель/входы/knowledge/candidate,
public apply и исходник, настройки, свежие исполнения, полную typed6×4 таблицу,
последний Save и normal CLI Close/logout. Каждый отдельный path-only cold reader
открыл сохранённый пакет без ремонта, проверил source/settings/mappings/graph,
выполнил узел заново и подтвердил полные6×4 значения. Сумма не заменяла oracle.

Final pair audit выполнялся в исходном holder901704/startTicks22673967 над
двумя сохранёнными terminal objects. Он перечитал собственные SQLite projections,
CLI/cold captures и native/cold файлы; проверил разные sessions/runtime IDs,
package paths/leases, четыре process identities и четыре непересекающихся
профиля при одинаковых candidate/reader. `cli_acceptance_verified=true`.
Это не криптографическая аттестация эксклюзивности writer: соответствующий
флаг аудитора остаётся false. Освобождение lease проверено отдельно, а не
выведено из pair PASS.

## Идентичности и доказательства

Приватный корень: `~/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu`.
Raw evidence и секреты в Git не включены.

| Проверка | Declared13 | Code13 |
| --- | --- | --- |
| Session | `ses_f01836adbffeSJA5Jr4KKvbX4h` | `ses_f017c76a5ffeyjGdMSHaSTL5m3` |
| Writer/cold PID | 902200 / 910391 | 913402 / 928016 |
| Package | `/jsteach/JavaScript-declared-1f404942-53a5-4014-9fa0-973fb9d0df77.lgp` | `/jsteach/JavaScript-code-884178c2-a435-412b-8750-98e36edc5e16.lgp` |
| Source bytes | 546 | 756 |
| Source SHA256 | `e7eec954e56c5ce0b110cda5f027772fd833f64af70fd6863d98201fae4db769` | `7239254f4e819ada91ef617721c8556ab06d372c55f00f94b025f63b3cfc7026` |
| Writer audit SHA256 | `1180faae0146e924dbb08d9620681a1611b7fbae6efe77862fec86370050beb7` | `1b646a2a9d386d5492b088427736c3579d902fcd9c37e19c5d972a55ff38fb0c` |
| Full-source review SHA256 | `9d30d749df84a812387b82f34e77206d071dd70ed5954fef83b7d55b0d3ba46e` | `86d6be4fe08f502ec5249f54eb2bf2c071aab3fe06e41bd9dfa9d42948dd3b26` |
| Whole trial SHA256 | `5fce1e25344fa8cc97e735789625f67843a2a13511239f5376384443da8d782c` | `3844c92a7cb3659c1b30be48fe9cf59bb4d8365d00030a14f45f2e0160684b42` |
| Fresh cold execution | `1790976298750-1yxllpgv8zy:766:1` | `1790977022834-t8c7lvzqqce:767:1` |

Файлы находятся в `f-cli-autonomous-{declared,code}-13/`:
`collection.json`, `native-origin.json`, `source-review.json`, `writer-audit.json`,
`cold-collection.json`, `trial-audit.json`, `release.json`.
Общий `f-cli-pair-13-audit.json` SHA256:
`33d8c16431faa9a4b510e3bc090eaf9f415f9e03afda0c14391e9796fd26f39a`.
Исходный private driver `f-cli-pair-13.py` SHA256:
`b6be70066ec455e5f00e46a2e7af1a5a49ee58e11d48a74603e54f02e2f706e9`.

Immutable manifest SHA256:
`93f4ae54483433b6de17b98eca43c885b722cd917eeb4c1e877f32ad9947455b`.
Source tree SHA256:
`f024604bcb5d78d1e0a7f43e03e907a0a6ec16c3ba06096dec6f98904282d637`.
Frozen reader15 SHA256:
`4b2e4bb9f9bcc89d181e18bad3df9a7cc298e039297c0dd904d43cf18fbcc5b9`.
Bundle pins SHA256:
`0390878e14b45b020905a41d99ae70b5e25a38879043fb467b708ae2e5aae213`.
Delivered knowledge semantic SHA256:
`86506db742980407b41de7c042edcd622d4809b339141b2065e936f5803049c0`.

## Ресурсы и следующий этап

Оба original release повторно проверили process termination, native cleanup
и отсутствие `.writer`. После final pair PASS отдельно прочитан host registry:
acceptance_lease=null, acceptance.lock отсутствует. Holder получил FIFO exit;
после него `/proc/901704` и control FIFO отсутствуют, последнее событие `exited`.
Пакеты сохранены; принудительный discard вместо Save/Close не применялся.

Предыдущие failed trials не пересматривались. Две текущие успешные попытки
не доказывают точную причину прежнего shutdown hang. J21 read09 на том же
candidate15 отдельно подтвердил32KiB source delivery; он technical, не третий
автономный writer.

Следующий этап — полный аудит требований [плана](plan.md): G1–G7, J01–J27,
фазы0–6 и named deliverables, затем согласованные card/registry/discovery и
итоговый completion. Эта запись подтверждает фазу6 и не заменяет тот аудит.
Общая Goal активна. Integration, merge, push, release и обновление установленного
клиента не выполнены. Внешний TestCafe — not_run по принятому scope плана.
