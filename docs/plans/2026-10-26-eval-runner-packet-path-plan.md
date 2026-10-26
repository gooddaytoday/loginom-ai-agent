# Один paired packet trace runner2→runner3 — Implementation Plan

> Статус: план независимо принят; оба capture подтвердили READY около01:47UTC и продолжают работу. Server keepalive0, kernel7200с; тихое окно допустимо после01:53:58UTC. Наблюдается существующая штатная попытка около01:57UTC. Результата ещё нет; native команды/расписание не меняются.

**Goal:** на одной следующей штатной native попытке отделить R2 egress от hypervisor ingress и получить проверяемую локализацию либо INCONCLUSIVE, без попытки ремонта.
**Гипотеза наблюдения:** SYN фактической попытки покидает R2, но не достигает hypervisor; наличие host SYN или отсутствие R2 SYN опровергнет именно эту границу для данного потока, не установит первопричину.
**Основание:** private `turn21-collector-result-state.json`: task `01a175c4-3504-7a19-ba75-f9d63143d6b7`, timeout до dispatch, result01:13:17UTC26.10. Это сохранённый срез, не утверждение о текущем состоянии.
**Architecture / Tech Stack:** одна held strict SSH к R2 и два foreground timeout/tcpdump child; существующие sudo/Python/OpenSSH, без установки и нового production-механизма.
**Spec:** [сетевой план](2026-10-25-eval-runner-network-plan.md); private deferred draft `eval-runner-packet-path-plan-deferred.md`, `r2-quiet-tcp-20261025*`, `quiet-probe-local-policy-independent-readback.json`.
**Первый proof:** один actual native call/outcome и сопоставленные SYN/SYNACK на двух точках с UTC, интерфейсами, direction, обеими 4-tuple и TCP sequence/ACK.
**Цена / diffstat:** сейчас только этот новый документ ≈45 строк; execution reuse ad-hoc collectors ≤80 новых временных строк, без коммита. Capture каждый ≤1200с, held SSH ≤1440с, вся работа ≤25мин.

## Границы
- Никаких ручных TCP/SSH-проб к R3, новых native задач/поручений, wakeup/timer, пакетов-инъекций, retry loop, detached job, services или network/config/code trials. Общие Happ/office VPN, keys/routes/endpoints не менять.
- Сохранить native C5 quiet: нет root R3 SSH, VM/guest UID1000 observer и VM `/proc`/unit/controller/Results-чтений. Наблюдатели — только R2 root и hypervisor root.
- Если authoritative job уже идёт и точного состояния нет, не устанавливать setup transport и не вмешиваться; использовать только уже доступные пассивные данные. Job не задерживать/останавливать/повторять.
- Private каталоги0700, текстовые headers/metadata/stderr0600; без payload, pcap и чтения VPN-секретов. Успех native workflow не зависит от диагностики.

## Один ограниченный проход
- [x] **1. Revalidate need до любых effects.** Root сначала продолжает текущую proc-диагностику и сверяет последний authoritative native collector outcome; если collector прошёл или сетевой барьер больше не подтверждается, отменить trace как NOT NEEDED, не открывая SSH/capture.
  После ревью выбрать уже существующий enabled wakeup T с запасом на setup и ≥400с до actual попытки; начать примерно T−9мин. Старые00:27/00:42 окна не использовать; новую task/wakeup не создавать и расписание не сдвигать.
  Если окно или наблюдение более не нужны/не доступны, NOT RUN и stop. Проверяемый результат — актуальная необходимость и одно подходящее штатное окно.
- [x] **2. Подготовить единственный control transport.** Literal R2 `10.200.9.134:22`, прежняя auth через защищённый ENV, pinned known_hosts и `StrictHostKeyChecking=yes`, без multiplexing, `ServerAliveInterval=0`, `TCPKeepAlive=no`.
  В том же SSH проверить effective server `ClientAliveInterval=0` для его user/client context и kernel TCP keepalive **>1440с**, покрывающий всю held-сессию24мин; раньше наблюдались7200с. Неподходящие gates/ошибка sudo: NOT RUN, без sysctl/config-правок и слепого повтора.
  Remote foreground parent запускает собственный `sudo timeout --kill-after=2s 1200s tcpdump`, выводит в local private files, подтверждает listening и печатает единственный READY с UTC/gates/PID/PGID/путями.
- [x] **3. Запустить paired host capture и тишину control SSH.** R2 capture `-i any`: BPF `tcp and host 172.16.0.29 and port 2223 and (tcp[tcpflags] & (tcp-syn|tcp-rst) != 0)`; ожидаемые source10.200.9.134/ens18 не превращать в фильтр интерфейса.
  Hypervisor: `sudo -n aa-exec -p unconfined -- timeout --kill-after=2s 1200s tcpdump -i any`; BPF **`tcp and port 2223 and (tcp[tcpflags] & (tcp-syn|tcp-rst) != 0)`**, без адресного фильтра, чтобы видеть translated destination/source.
  Оба collector: `TZ=UTC`, `-n -l -tttt -v -s 96`, только текстовые headers. Записать ready/listening UTC и локальное receive-UTC; если capture не готов, INCONCLUSIVE, без замещающей пробы.
  После READY до timeout control SSH не передаёт stdout/stderr, stdin-команды или streaming headers; parent только ждёт свой capture. Root tool yields1000мс, waits≤60с, без блокирующего ожидания400с.
- [ ] **4. Наблюдать одну actual native попытку.** Оба capture должны перекрывать её начало/конец; outcome берётся из штатного native evidence, не из новой observer-команды.
  `quietEligible=true` только при gates, непрерывном control SSH и actual start≥400с после последнего setup/READY; использовать R2 SYN/READY одного clock domain либо достоверные actual timestamps, не один wakeup timestamp.
  Setup SSH primed WG; даже quietEligible не означает cold/полный простой peer. Иной трафик возможен. Раннее/неизвестное начало или обрыв SSH исключают quiet-утверждение; не повторять тест и не продлевать bounds.
- [ ] **5. Получить один proof и убрать только свои процессы.** Дождаться штатных capture timeout; через ту же held SSH вернуть R2 logs/exits/own-PID cleanup facts. Отдельно записать remote event, local receive и file mtime, не подменяя одно другим.
  Сопоставить обе 4-tuple с учётом наблюдаемой трансляции по TCP sequence/ACK, interface/direction и UTC. Неоднозначные потоки, clock/window gap, неизвестная смена task port или drops, мешающие выводу отсутствия, — INCONCLUSIVE.
  Native success + matched handshake: observed path only, не fix. Timeout + R2 SYN без host SYN при полном окне: gap между точками наблюдения, не NAT/route diagnosis.
  Host SYN и исходящий SYNACK без его возврата на R2: наблюдение обратного gap. Actual timeout без R2 egress при полном `any` capture: sender-path gap, не обвинение native кода.
  Неполное окно, отсутствующий actual outcome/capture или потерянный R2 readback: INCONCLUSIVE с точным ограничением; никаких новых соединений или blind retry.
  Проверить exits и отсутствие orphan только по записанным own handles/PID/PGID, права0600; никаких broad kill. Если cleanup readback потерян, не объявлять no-orphan подтверждённым: сохранить blocker и известные timeout bounds.
  Финальный private JSON/read-back: актуальность, gates/READY, actual call/start/end, receive UTC, quietEligible, интервалы/exits/drops, packet correlation, cleanup и ограничения. Проверяемый результат — один перечитанный proof либо честный blocker.

## Завершение
- Один проход заканчивается наблюдением либо INCONCLUSIVE; без повторов, новой гипотезы ремонта и дополнительных observer-гейтов для native workflow.
- Ни packet gap, ни успех не доказывают NAT-причину, исправление, автономность или actual R3 unit result. Получение логов после окна само создаёт WG-трафик и учитывается в будущих quiet-утверждениях.
- Две точки capture — минимум для отсутствующего сравнения; существующие foreground timeout и held tool sessions достаточны, постоянный collector/monitor не нужен.

Checkpoint: точный private v2-план принят; fresh need подтверждён timeout01:42:56. Оба foreground capture READY, интервалы/handles/gates — private `paired-headers-live-state.json`; ждём одну штатную попытку и завершение capture около02:07UTC. Захваты имеют timeout1200+2с; для управляющего SSH записан операторский cutoff02:11UTC с проверкой прежнего local handle, автоматического outer timeout у него нет. Новых tasks, VM observers, настроек сети или расписания нет; результат/cleanup ещё не подтверждены.
