# Dashboard M5 — checkpoint

- Ветка `m5-acceptance`; Tasks 0–4 и source/CI/build-context Task 5a приняты. Task 5b и M5 целиком не завершены.
- Контракт — [план M5](../../superpowers/plans/2026-11-15-dashboard-m5.md); единственные точные source/archive/pins и результаты — [runbook M5](dashboard-m5.md).
- Домашний стенд — независимая native-копия. Исходные диски и исторические VM сохранены; ограничения проверки production — в runbook. Точные Task5b inputs исходной машины не перенесены, её SSH ранее недоступен.
- Текущий source/TLS guard принят: mismatch/unparseable сохранили стенд, valid strict server PASS. Современные минимумы Docker/Podman приняты владельцем; политика в runbook.
- Оригинальная fixture становится modified=true после adapter и обычного Native Run. Одна отдельная копия после Native Save As прошла fresh parameters/execute/table, строгие Close/Logout и snapshot; saved bytes/metadata прежние. Это подготовка fixture, не product fix.
- Installed `.3` CLI: normal catalog refresh → новый snapshot → реальный `gpt-6.1-sol` draft, изменения двух own src и успешная самопроверка PASS; review Approved, mandatory0. Runtime ACK/actual exit0, процессы0 и сохранность данных подтверждены. Предыдущий GPT-5.5 account refusal сохранён как FAIL.
- Installed `.3` Desktop: fresh CREATE/strict Native Close/Logout → local draft restore → один actual UI Send → real `gpt-6.1-sol` draft/self-check PASS; scoped review Approved. Runtime ACK/exit0, процессы0, original/copy данные сохранены. Прежние UI-caller failures и ранний ACK timeout не объявлены исправленными.
- Whole checker новой копии FAIL на iframe: новому пути нужна обычная публикация. Этот неизменённый gate сохранён после model/publication, ручного seed или ослабления guards нет.
- Далее: Desktop Deny/Allow once → actual Host JSON/ready/full iframe → остальной full M4 Docker+Podman → Compose failure/оставшиеся CA/Host → uninstall/whole-branch review. Исторические ограничения и ошибки — в runbook; не выдавать их за исправленные.
- Решений владельца сейчас не требуется. M6 implementation не начинать; push/PR/merge/release — отдельная команда. Секреты, VM/архивы и raw evidence вне Git; SDD ledger сохраняется до завершения.
