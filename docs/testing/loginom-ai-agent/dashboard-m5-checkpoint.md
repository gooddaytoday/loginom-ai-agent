# Dashboard M5 — checkpoint

- Исходная принятая M4 основа M5: `77c275a68f9152efd7f5203b0f6643f11923a8ef`, ветка `dashboard-m5`; Tasks 0–3 приняты: Spec Approved / Quality Approved, mandatory 0.
- Первый установленный Desktop HTTPS main path PASS: native snapshot → real model draft → Allow once → Host JSON → ready.
- `.lgp` до/после побайтно одинаков; JSON v1 без sample, hash совпал с ready.
- Финальные server/shell равны dist во всех ролях; новая публикация/sourceHash/build/ready и native4 PASS.
- Docker install HTTP-only/HTTP+HTTPS PASS; vendor index/client.json не изменены.
- Apache TLS app 8444, private API/app HTTP listeners; app-origin не обслуживает dashboard API.
- Task1: Dashboard typecheck/build/package tests/full browser245/size15590 из15600 PASS; CLI fixture6/typecheck PASS.
- Native Close/Logout подтверждены отдельно; runtime ACK+actual exit0/no signal, own Desktop/Host/Xvfb завершены.
- VM оставлена в HTTPS режиме с готовой собственной публикацией и отдельным Task1 analyst profile/config.
- Прежние две VM/данные сохранены; новая rootless VM штатно остановлена. NAT/start/stop/evidence — private OPERATIONS и scratch/task1–4.
- Task2 принят: обязательное isolation-замечание закрыто, mandatory 0; focused5/5 и current server probe/cleanup PASS, HTTPS client PASS.
- Planned failures/concurrency/client negatives PASS; .lgp/прежние публикации сохранены, own probe/job residue отсутствует.
- Task2 TLS hang и Task3 первые login/cleanup FAIL сохранены; причины остатков неизвестны, финальные exact server/client PASS.
- Task3 принят: lifecycle/ownership/Apache rollback, exact archive offline load/install/probe+cleanup и отдельный client4/Close/Logout PASS.
- Task4 BLOCKED: прежний Guardant TCP недоступен с host/guest; shared server/client PASS, private server/MCS PASS, private client отказал во входе.
- Пины, команды, ограничения и evidence map — [runbook M5](dashboard-m5.md).
- Возобновить после восстановления прежнего лицензирования: private client, reboot/cron, точные минимумы, один пересобранный архив на обоих движках. Task5/M6 не начинались.
- Push/PR/merge/release и изменение прежних стендов не выполнялись.
