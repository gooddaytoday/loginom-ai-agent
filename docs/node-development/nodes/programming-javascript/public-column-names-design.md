# E/J24: фактические имена через публичный JS lifecycle

Дата: 2026-10-01. Продолжение [плана](plan.md), после bounded G1/J22 на child8acf.
Все5 cases417–421 приняты independent audit v3/negative50 каждый/cleanup
на child`eed5760102`; knowledge1.1 source/direct delivery принята на`276c344820`:
client3189+10SKIP/operator126/addressed14 и actual bridge MCP budgets.
Legacy1.0 asset и examples unchanged; actual candidate/CLI delivery остаётся F.
Source96/T observations
остаются самостоятельными private свидетельствами, а не публичной приёмкой.

## Контракт и выбранный путь

Пять отдельных fixed Code cases: control, cyrillic, space, leading-digit,
unicode-label. Каждый использует неизменные bytes своего исходника из
`javascript-schema-telemetry-cases.mjs`: один `AssignColumns`, Integer и
`__JS_Metadata` String. Вход — integer-safe, четыре строки; выход — одна строка
с `-9007199254740991` и JSON реальных `GetColumn` до/после записи. Исторические
наблюдения задают проверяемую гипотезу конкретного результата, а не реализацию
общего алгоритма нормализации. `AddColumn`, пустые/omitted имена и коллизии
не объявляются проверенными этими cases.

Используется существующий `javascript-public-types-live.mjs` и фактические
`dock_node_apply`/wait/read на isolated injected JS support. Runtime получает
обычный source/request; operator cases и oracle не попадают в knowledge runtime.
Каждый случай создаёт новый узел, выполняет два fresh owned Execute по обычному
materialization/final lifecycle и полностью читает output0. Input native bytes
проверяются до JS; выход — full typed UI, не новая native-byte аттестация.
Бюджет исходного процесса 30 минут; неизвестный эффект не повторяется.

Новый bounded verifier сопоставляет три независимых представления: code API
JSON, source/target fields собственного native output mapping и schema/значения
физической таблицы. Native source Required=true, target Required=false,
autosync=true, reciprocal records/field IDs и port GUID проверяются полностью.
Публичный configuration readback обязан сохранить фактические `name`, `label`
и `source_name`; handler не подставляет запрошенное `Name`. Полный user-v1 ответ
и отдельное source-read подтверждают доставку схемы/данных и exact saved source.
Это observed source→physical contract, без server atomicity/ABA/full engine API.

## Приёмка и продолжение

До первого live: tests actual request admission/readback/verifier, negative
mutations всех полей/owner/port/source/JSON/coverage, full operator regression,
immutable child commit, source closure freeze, отдельный Python oracle/auditor
и host handoff с hashes. Выполненный G1/J22 не переигрывается.

Затем один ordinary headed control на свежем profile/evidence. Его независимый
audit, cleanup PackageClose/logout/browserClose, actual exit и отсутствие своих
процессов обязательны перед четырьмя следующими последовательными cases.
Auditor negative checks должны менять реальные данные, а не только ломать ACK.
При refusal исходный report сохраняется; recovery не переименовывается в PASS.
Новые e2e-пакеты не запускаются: их skipped name tests остаются источником гипотез.

После принятия cases записать правило Name/DisplayName в версионированные знания:
для authored code предпочитать допустимое ASCII Name, Unicode — в DisplayName;
после исполнения читать фактическую схему и обращаться по наблюдённым именам.
Только конкретные observed пары на 7.4.2/Linux; без обещания транслитерации любого
Unicode. Исторический knowledge1.0 и его exact example evidence сохранить.
Проверить actual describe/compact delivery новой knowledge и response budgets.
Actual model/candidate/CLI acceptance остаётся F; overall registry readiness
этой проверкой не повышается. Technical-name изменения входа/J19 проверяются
отдельно, а не выводятся из выходного AssignColumns.

Canonical docs — основной checkout; код — `.worktrees/node-javascript`.
Private scripts, source manifests, logs, screenshots и credentials — вне Git.
