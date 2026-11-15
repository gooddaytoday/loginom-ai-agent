# Dashboard M5 — checkpoint

- Исходная принятая M4 основа M5: `77c275a68f9152efd7f5203b0f6643f11923a8ef`, ветка `dashboard-m5`; Tasks 0–2 приняты: Spec Approved / Quality Approved, mandatory 0.
- Первый установленный Desktop HTTPS main path PASS: native snapshot → real model draft → Allow once → Host JSON → ready.
- `.lgp` до/после побайтно одинаков; JSON v1 без sample, hash совпал с ready.
- Финальные server/shell равны dist во всех ролях; новая публикация/sourceHash/build/ready и native4 PASS.
- Docker install HTTP-only/HTTP+HTTPS PASS; vendor index/client.json не изменены.
- Apache TLS app 8444, private API/app HTTP listeners; app-origin не обслуживает dashboard API.
- Task1: Dashboard typecheck/build/package tests/full browser245/size15590 из15600 PASS; CLI fixture6/typecheck PASS.
- Native Close/Logout подтверждены отдельно; runtime ACK+actual exit0/no signal, own Desktop/Host/Xvfb завершены.
- VM оставлена в HTTPS режиме с готовой собственной публикацией и отдельным Task1 analyst profile/config.
- Обе собственные VM/данные сохранены; NAT/start/stop и raw evidence — private OPERATIONS и scratch/task1–3.
- Task2 принят: обязательное isolation-замечание закрыто, mandatory 0; focused5/5 и current server probe/cleanup PASS, HTTPS client PASS.
- Planned failures/concurrency/client negatives PASS; .lgp/прежние публикации сохранены, own probe/job residue отсутствует.
- Task2 TLS hang и Task3 первые login/cleanup FAIL сохранены; причины остатков неизвестны, финальные exact server/client PASS.
- Task3 execution PASS: lifecycle/ownership/Apache rollback, exact archive offline load/install/probe+cleanup и отдельный client4/Close/Logout; review pending.
- Следующий шаг после принятия Task3: Task4; Tasks4–5 не начинались, M5 не завершён.
- Пины, команды, ограничения и evidence map — [runbook M5](dashboard-m5.md).
- HTTP-only и strict separate domain/cert server-config + HTTPS client4/Close/Logout PASS; M6 security, нижние версии/rootless/SELinux/upgrade ещё не проверены.
- Push/PR/merge/release и изменение прежних стендов не выполнялись.
