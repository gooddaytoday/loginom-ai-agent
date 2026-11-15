# Dashboard M5 — checkpoint

- Основа checkout: `77c275a68f9152efd7f5203b0f6643f11923a8ef`, ветка `dashboard-m5`.
- Task 0 принят: Spec Approved / Quality Approved, обязательных замечаний нет; Tasks 1–5 не начинались.
- Из предоставленного release подготовлен самодостаточный комплект штатными Dockerfile; происхождение клиента раскрыто.
- Payload bytes/modes сохранены; образы не содержат собственных лицензий/config/CA keys.
- Собственная KVM VM: HTTP/HTTPS, Apache config/modules, штатный CA trust и WSS/Login/Logout PASS.
- Server использует разрешённый существующий внутренний license service; новой активации нет.
- Integrator: успешное соединение с Server в журнале, REST help и SOAP WSDL PASS; публикаций нет.
- Установленные Desktop/CLI на собственных нормальных профилях: подключение PASS, повторено после repeat setup.
- Приватная поправка installer сохраняет существующую конфигурацию Integrator; независимое ревью Approved.
- Тот же repeat setup: конфигурация, Users.cfg и синтетические UserStorage bytes/UID/GID/modes сохранены.
- Все клиентские runtime штатно закрыты; прежние контейнеры/стенды сохранены. VM оставлена для Task 1.
- Следующий шаг: Task 1 — первый release dashboard по плану.
- Предыдущий контейнерный выпуск отдельно нужен для update; rootless/SELinux/minimums и Tasks 1–5 не проверены.
- Пины, команды, ограничения и private evidence — [runbook M5](dashboard-m5.md).
- Push/PR/merge/release и изменение прежних стендов не выполнялись.
