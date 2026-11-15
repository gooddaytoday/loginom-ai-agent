# Dashboard M5 — checkpoint

- Реализация Task 1: `f99d3e53d8`; ветка `dashboard-m5`, независимое ревью ожидается.
- Task 0 принят; подготовленный release input и private installer patch сохранены.
- Первый установленный Desktop HTTPS main path PASS: native snapshot → real model draft → Allow once → Host JSON → ready.
- Native Dashboard показал 4 живые строки после изменения CSV; sample preview содержал 3 строки.
- `.lgp` до/после побайтно одинаков; JSON v1 без sample, hash совпал с ready.
- Финальные server/shell равны dist во всех ролях; новая публикация/sourceHash/build/ready и native4 PASS.
- Docker install HTTP-only/HTTP+HTTPS PASS; vendor index/client.json не изменены.
- Apache TLS app 8444, private API/app HTTP listeners; app-origin не обслуживает dashboard API.
- Host/runtime/Desktop CA fixes не потребовались; обычное доверие ОС/NSS сохранено.
- Dashboard typecheck/build/package tests/full browser245/size15590 из15600 PASS; CLI fixture6/typecheck PASS.
- Native Close/Logout подтверждены отдельно; runtime ACK+actual exit0/no signal, own Desktop/Host/Xvfb завершены.
- VM оставлена в HTTPS режиме с готовой собственной публикацией и отдельным Task1 analyst profile/config.
- Текущие NAT/start/stop и raw evidence — только в private OPERATIONS и scratch/task1.
- Следующий шаг: независимое ревью Task1 по полному диапазону; Tasks2–5 не начинались.
- Пины, команды, ограничения и evidence map — [runbook M5](dashboard-m5.md).
- Нижние версии/rootless/SELinux/upgrade/strict и автоматический release packaging не проверены.
- Push/PR/merge/release и изменение прежних стендов не выполнялись.
