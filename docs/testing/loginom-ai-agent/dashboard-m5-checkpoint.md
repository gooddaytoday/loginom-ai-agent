# Dashboard M5 — checkpoint

- Исходная принятая M4 основа M5: `77c275a68f9152efd7f5203b0f6643f11923a8ef`, ветка `dashboard-m5`; Tasks 0–1 приняты: Spec Approved / Quality Approved, mandatory 0.
- Первый установленный Desktop HTTPS main path PASS: native snapshot → real model draft → Allow once → Host JSON → ready.
- Native Dashboard показал 4 живые строки после изменения CSV; sample preview содержал 3 строки.
- `.lgp` до/после побайтно одинаков; JSON v1 без sample, hash совпал с ready.
- Финальные server/shell равны dist во всех ролях; новая публикация/sourceHash/build/ready и native4 PASS.
- Docker install HTTP-only/HTTP+HTTPS PASS; vendor index/client.json не изменены.
- Apache TLS app 8444, private API/app HTTP listeners; app-origin не обслуживает dashboard API.
- Dashboard typecheck/build/package tests/full browser245/size15590 из15600 PASS; CLI fixture6/typecheck PASS.
- Native Close/Logout подтверждены отдельно; runtime ACK+actual exit0/no signal, own Desktop/Host/Xvfb завершены.
- VM оставлена в HTTPS режиме с готовой собственной публикацией и отдельным Task1 analyst profile/config.
- Текущие NAT/start/stop и raw evidence — только в private OPERATIONS и scratch/task1.
- Task2 execution PASS / review pending: real server probe/headers/isolation/cleanup и отдельный installed HTTPS client PASS.
- Planned failures/concurrency/client negatives PASS; .lgp/прежние публикации сохранены, own probe/job residue отсутствует.
- Первый прерванный package run FAIL с неизвестной причиной; focused и один точный полный повтор PASS.
- Следующий шаг: независимое ревью Task2; Tasks3–5 не начинались, M5 не завершён.
- Пины, команды, ограничения и evidence map — [runbook M5](dashboard-m5.md).
- Нижние версии/rootless/SELinux/upgrade/strict и автоматический release packaging не проверены.
- Push/PR/merge/release и изменение прежних стендов не выполнялись.
