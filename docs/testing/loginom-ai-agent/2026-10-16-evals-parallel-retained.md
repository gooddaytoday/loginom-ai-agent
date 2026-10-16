# Удержанные стенды и инциденты parallel evals

Сверка на чтение: 2026-10-16T11:18:53.494172+00:00. Источники: текущие `docker ps/inspect`,
labels `loginom.evals.purpose=research`, existence корней, global reservations,
сохранённые private evidence и прежние записи из единого архива.
Это операторский перечень, не новая опись процессов и не разрешение на удаление.

## Владение и использование

У перечисленных 12 пар происхождение — эта цель parallel evals; это подтверждено
research labels/nonces и сохранёнными записями. Во всех парах Server/Studio сейчас
`running`. Чтение Docker state не доказывает отсутствие живого другого controller:
текущий активный владелец процессов здесь не устанавливался. Новая сессия не
использует эти пары, не посылает сигналов и не меняет reservations/данные.
Факты старого cleanup не переписываются как успех по исчезновению PID/root.
У всех incident-пар статус использования — сохранены для разбора; для нового
сквозного run не нужны. Постоянный research стенд также сохраняется.

## 12 сохранённых исследовательских пар

1. **evals-agent-bff562d7-server / evals-agent-bff562d7-studio** — оба `running`.
   Server `48e14d5f710d1a15441c248085ea61719a8bae74d33f883469ac8f0845fc2ea2`; Studio `e896b1acaac3c45db36bf65969bc34c2a9dbccbc2b684fc599c040591ef3d67f`.
   Network `evals-agent-bff562d7`; nonce `0fc3ad78-6399-45d3-9528-7c1b7ec0ea13`.
   Источник/данные: native-agent-replay-44875d4e…; root evals-native-agent-YRV2I1 существует.
   Состояние: sandbox отказ до process proof; admin закрыт, CLI settlement не подтверждён. Владелец происхождения — эта цель; сейчас не используем.

2. **evals-agent-28e5f0c3-server / evals-agent-28e5f0c3-studio** — оба `running`.
   Server `747465344a21c622499841d4bc9750d0f719e34570fbd238380243fb08cf265c`; Studio `2763f8af2df2caf5c35bd75c1a5550e49d4e0f3f74294511599259580dd82cb3`.
   Network `evals-agent-28e5f0c3`; nonce `2d5819e0-6cb6-4399-bb32-c7a1b7a228d7`.
   Источник/данные: native-agent-replay-bd6e…; root evals-native-agent-bKNVO2 существует.
   Состояние: ранний отказ до finally; исходный admin finalization не подтверждён. Владелец происхождения — эта цель; сейчас не используем.

3. **evals-two-a9c812f9-server / evals-two-a9c812f9-studio** — оба `running`.
   Server `f36e216c34e29c6934f35e9ae3283564a969f05a4650619fee3c242835513d10`; Studio `f87fb14926b6dd891de72d1d82765a361f7875de6e139ff4c08ff1597e1e881a`.
   Network `evals-two-a9c812f9`; nonce `6648414e-dd88-47b4-9910-3072697d5103`.
   Источник/данные: native-two-users-eeba0d80…; root evals-two-users-eR7Snq существует.
   Состояние: UID-change observation не атрибутирован; исходный incident unresolved. Владелец происхождения — эта цель; сейчас не используем.

4. **evals-cli-5dbfdb57-server / evals-cli-5dbfdb57-studio** — оба `running`.
   Server `2a3fb5698f038f86478b3a5d5c9e406c597b38f78ce487d0de1e7e4238a1e612`; Studio `07169c9dd729f15a434fb296065cde626d6d58ac8952efaa0882d2d6c00b6bd1`.
   Network `evals-cli-5dbfdb57`; nonce `eaf68d07-28ba-40e6-a226-f5c9eac601a2`.
   Источник/данные: native-cli-sessions-b8a7aba3…; root evals-cli-sessions-LQKvkl существует.
   Состояние: Writer owner unavailable; management result unconfirmed. Владелец происхождения — эта цель; сейчас не используем.

5. **evals-cli-c4bfabf1-server / evals-cli-c4bfabf1-studio** — оба `running`.
   Server `6c165db687399ab27d81bdbadb82f8dd68233c898a2840490cbb5d684fd5792d`; Studio `d2f64573b00a4781eab8cd14e1a0937496853d0519241d69c136307bde783846`.
   Network `evals-cli-c4bfabf1`; nonce `930bbeb6-91a2-4648-8988-46ce11e81eb4`.
   Источник/данные: native-cli-sessions-f0c6bd9e…; root evals-cli-sessions-MKHklA существует.
   Состояние: admin EACCES process proof; другой admin закрыт; release не подтверждён. Владелец происхождения — эта цель; сейчас не используем.

6. **evals-cli-48958a93-server / evals-cli-48958a93-studio** — оба `running`.
   Server `8e1d435a0c87955199ebe8239d01feba6f68ec4a9997790d2a29e052a630073a`; Studio `18625dd4d2b3c30e00e7730bbd8494cab0c80192fdff9e13780c30aba9f1ff4e`.
   Network `evals-cli-48958a93`; nonce `cc6c3b5b-2593-4e04-87d5-d3593c784c76`.
   Источник/данные: management-registry-20261015/accounting-writer-source.json; root evals-cli-sessions-aEnKx5 существует.
   Состояние: Writer owner unavailable; исходный cleanup unconfirmed. Владелец происхождения — эта цель; сейчас не используем.

7. **evals-cli-a9502f4d-server / evals-cli-a9502f4d-studio** — оба `running`.
   Server `3ecb5dd074e5ae6aed47d0b53cab27720ca89dd33f7e0172a88e5b86acc4d4c5`; Studio `19f5810b91735893c1d3952277da90078e5e5a7598fd8f759ac259b15385f69a`.
   Network `evals-cli-a9502f4d`; nonce `333b681d-70a2-41a9-89ae-ec70c540e110`.
   Источник/данные: native-cli-sessions-e585d09b…; прежний root /tmp/evals-cli-sessions-00q2hZ отсутствует.
   Состояние: admin process EACCES; исчезновение root не закрывает incident. Владелец происхождения — эта цель; сейчас не используем.

8. **evals-mixed-9d88eeeb-server / evals-mixed-9d88eeeb-studio** — оба `running`.
   Server `519370ff4b74aaf2bbbd350b2287e35a004d2069c4af047cc9f94cabd150b62b`; Studio `3cd5aba8e6c521b873cbf0b966f75eee10b4ce4f49cbd75628e9b0632a7d07e4`.
   Network `evals-mixed-9d88eeeb`; nonce `328b5bce-56ee-4392-ace4-d7c8b34baff4`.
   Источник/данные: native-mixed-red-resume-20261015; прежний root /tmp/evals-recover-mixed-dyI2ST отсутствует.
   Состояние: SIGKILL/peer overlap; три global reservations recovery-only сохраняются. Владелец происхождения — эта цель; сейчас не используем.

9. **evals-parent-18f6e22e-server / evals-parent-18f6e22e-studio** — оба `running`.
   Server `a4f9d2e0ade391b5caad83fe584b3c3a259ba7a55a879e9bbe671b83a3fd0490`; Studio `31ce622a1ea4da1890f971ad1c4188af497ec02ccc1de861a146a7c8b0302ca6`.
   Network `evals-parent-18f6e22e`; nonce `add08c97-e003-4fa9-997c-80e14739cc07`.
   Источник/данные: прежний root /tmp/evals-parent-prepare-jkdzDM отсутствует.
   Состояние: ENOTDIR исправлен в новых тестах; старый incident не освобождён. Владелец происхождения — эта цель; сейчас не используем.

10. **evals-parent-01b4de8d-server / evals-parent-01b4de8d-studio** — оба `running`.
   Server `722e3d356803392959624c9bab58d40e3e66b560660f8b6c957e095459321b83`; Studio `dcee92dd8842f85da5853b30557a1743180f50692882b8783bf4e6b7781232a7`.
   Network `evals-parent-01b4de8d`; nonce `910f1d39-4eb8-48d7-ab98-aff3c25897cc`.
   Источник/данные: прежний root /tmp/evals-parent-prepare-XnBhbF отсутствует.
   Состояние: root publication ordering исправлен в новых тестах; старый incident unresolved. Владелец происхождения — эта цель; сейчас не используем.

11. **evals-admin-user-e315c4d7-server / evals-admin-user-e315c4d7-studio** — оба `running`.
   Server `1790125f8e1408aca0312cc2db75c1214708d1cf198f70d98f3c8c44d4ed9ef0`; Studio `2d467bf07fddc87fff4a7418dee81f15681c0b67fe0b3118ff40a3c8e779776f`.
   Network `evals-admin-user-e315c4d7`; nonce `eddb11f2-bde0-4659-aba7-d6ff61201875`.
   Источник/данные: прежний root /tmp/evals-admin-user-e3H9B4 отсутствует.
   Состояние: ранний draft/createBlockedUser отказ; unused reservation incident сохранён. Владелец происхождения — эта цель; сейчас не используем.

12. **loginom-evals-research-users / loginom-evals-research-studio** — оба `running`.
   Server `6ae20e68318269f0c0838c410e701453a43804d1e57f646ddabde73f53d86075`; Studio `ff3ce5974e678dd2967261262b110c22023a11b2a680d2cf79dd8240a809ef95`.
   Network `loginom-evals-research-users`; nonce `e6799bc1-0e0d-4b44-88f5-7213279df442`.
   Источник/данные: private research/slots.json, controller и evidence.
   Состояние: постоянный research стенд; новая приёмка на нём не планируется. Владелец происхождения — эта цель; сейчас не используем.

## Остальные удержанные данные

- **Judge status A00yuH**: private
  `/home/kiselev/.local/state/loginom-evals/research/controller/judge-status-A00yuH/`.
  Происхождение — эта цель. Global reservation для
  `/home/kiselev/.local/state/loginom-evals/parallel/judge-codex` — `retained`,
  command `585940be-5c1b-4bff-a7c6-00459a4f7fa3`. Старый launcher подменял home;
  status не квалифицирует выделенный home. Владелец разрешил переиспользовать home и снять ровно эту бронь;
  A00yuH не удалять, проверка входа без модели через исправленную обёртку.
- **aeGGa8**: `/home/kiselev/storage/tmp/evals-agent-inventory-aeGGa8` существует.
  Старый process inventory отказ с неполной атрибуцией. Происхождение — эта цель;
  сохраняется для разбора, в новом пути не используется.
- **admin-fYV8vv**: незавершённый timeout/dispose incident прежних проб. Диагноз
  `evals/docs/2026-10-14-admin-design-capability-diagnosis.md`; текущая активность
  controller по этому перечню не устанавливалась. Происхождение — эта цель,
  сохраняем без признания cleanup; новый run на него не опирается.
- **Global lock root** `/var/lib/loginom-evals/locks`: 822 reservation-файла,
  из них 818 `released`, три `recovery-only` для mixed dyI2ST
  (server/profile/user), один `retained` для judge A00yuH. Это снимок состояния
  файлов, а не проверка свободного OS guard. Guard/reservation-файлы не удалять;
  released история сама по себе не является мусором или разрешением на takeover.
- **Research evidence** `/home/kiselev/.local/state/loginom-evals/research/evidence/`:
  379 каталогов. **Controller** `research/controller/`: 83 каталога.
  Происхождение — предыдущие этапы цели; неизменяемые доказательства и private
  служебные данные сохранены. Старые snapshots не дают нового admission.
- **Временные каталоги** `/home/kiselev/storage/tmp/evals-*`: 1018 существующих
  каталогов, включая 49 `evals-native-history-*`. Большая часть — unit fixtures;
  по имени нельзя доказать владельца или ненужность. Сохранены, автоматическое
  удаление не предлагается. Неатрибутированные каталоги считаем чужими до проверки.
- **Сохранённый helper** `/home/kiselev/storage/tmp/evals-accounting-writer-cleanup.ts`
  существует. Старый accounting incident; не запускался при этой сверке.

## Недавние завершённые fixtures и замороженная работа

- Native archive focused RED e183a9a4…, GREEN d9a1bf27…, FD/topology 1f474d72…
  и первый timeout 2203c0ce…: прежние записи сообщают retirement собственных
  fixtures; private sources/архивы сохраняются. Их дальнейшая разработка заморожена.
- Browser 721dbb5b…: сохранён FAIL на ожидании непустого root после `new_draft`.
  Handle80588 terminal exit1. `settlement.json` сохранён; его controller root
  `/home/kiselev/storage/tmp/evals-native-agent-r7CXN9` отсутствует. Перечень
  не подменяет этот FAIL на PASS; исправление теста по новой цели не выполняется.
- Незакоммиченные `evals/src/attempt-finalization.ts` и
  `evals/test/native-agent-run-integration.test.ts` относятся к server-storage
  archive. Единый diff сохранён private, обе правки откатаны до HEAD; модуль
  не подключён, его удаление — шаг7.
- Чужой `docs/2026-10-15-evals-parallel-overengineering-review.md` не изменён
  и не включается в коммит. Чужая текстовая правка старого плана сохранена
  verbatim внутри архивного снимка вместе с остальным старым планом.

## Ресурсы других задач

Dev `loginom-server-7.4.2-test`/`loginom-client-7.4.2-test`, legacy
`loginom-evals-isolated`, контейнеры/сети `loginom-skills-*`, `loginom-net` и
остальные сервисы Docker находятся вне этой цели. Не используем, не останавливаем,
не очищаем. Упомянутый владельцем чат `01a133e7-7e88-7ff3-b4ea-fd0f99885d3f`
не получал сообщений и не прерывался; его текущая работа здесь не инспектировалась.

В `~/git/codex-vpn-lockdown` уже есть чужие tracked/untracked изменения, включая
`bin/codex`. Будущий маленький wrapper commit должен содержать только собственный
проверенный hunk и его unit test; чужие изменения/файлы сохраняются.

## Предложение на следующий этап

Создать новую acceptance pair и private root
`/home/kiselev/.local/state/loginom-evals/acceptance-20261016/` по короткому плану.
На момент проверки root и имена контейнеров отсутствуют. Прежний judge home
переиспользуется после разрешённого снятия точной брони, A00yuH сохраняется. Для нового run
старые 12 пар не нужны, но их отключение/удаление сейчас не запрашивается.
Любая будущая очистка старого ресурса требует отдельного конкретного запроса.
