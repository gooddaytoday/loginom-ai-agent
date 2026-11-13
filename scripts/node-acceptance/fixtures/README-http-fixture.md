# HTTP fixture для JavaScript Fetch (#69)

Код: `http_fixture.py` (только стандартная библиотека Python 3.12). Маршруты и
ledger: [спецификация](../../../docs/node-development/nodes/programming-javascript/fetch-fs-http-fixture.md).
Тесты из корня репозитория:

```sh
python3 -I -m unittest discover -s scripts/node-acceptance/tests -p test_http_fixture.py
```

## Схема

| Listener | Порт в контейнере | Доступ |
|---|---|---|
| data | 18080 | только сеть `loginom-app-private`: `http://loginom-http-fixture:18080/runs/{run_id}/…` |
| TLS на прогон | 18443–18462, по одному на `run_id` | только сеть `loginom-app-private`; не публикуется |
| admin | 18090 | `-p <LAN-адрес VM>:18090:18090`, каждый запрос с `Authorization: Bearer $FIXTURE_ADMIN_TOKEN` |

Состояние (ledger, счётчики, draft, журнал handshake) хранится только в памяти
процесса. Перезапуск контейнера всё стирает и создаёт новый самоподписанный
сертификат, поэтому ledger сохраняйте до перезапуска.

Переменные окружения: `FIXTURE_ADMIN_TOKEN` (обязательна, ≥16 символов),
`FIXTURE_DATA_PORT=18080`, `FIXTURE_ADMIN_PORT=18090`,
`FIXTURE_TLS_PORTS=18443-18462`, `FIXTURE_PUBLIC_HOST=loginom-http-fixture`
(хост в `tls_base_url` и SAN сертификата), `FIXTURE_IO_TIMEOUT=30`,
`FIXTURE_RESET_TIMEOUT=10`, `FIXTURE_MAX_SLOW_MS=60000`, `FIXTURE_BIND=0.0.0.0`.

## Развёртывание на VM `loginom-app`

Используется образ `python:3.12-slim`, который уже есть на VM: ничего не
скачивается и не собирается. `VM_LAN_IP` — LAN-адрес VM, на котором проверяющие
с mas/mas2/mas3 откроют admin-порт.

```sh
sudo install -d -m 0755 /opt/loginom-http-fixture
sudo install -m 0644 scripts/node-acceptance/fixtures/http_fixture.py /opt/loginom-http-fixture/http_fixture.py
( umask 077; printf 'FIXTURE_ADMIN_TOKEN=%s\n' "$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')" \
  | sudo tee /opt/loginom-http-fixture/admin.env >/dev/null )

docker run -d --name loginom-http-fixture --restart unless-stopped \
  --network loginom-app-private \
  -p "$VM_LAN_IP:18090:18090" \
  --env-file /opt/loginom-http-fixture/admin.env \
  -e FIXTURE_PUBLIC_HOST=loginom-http-fixture \
  -e FIXTURE_TLS_PORTS=18443-18462 \
  -v /opt/loginom-http-fixture/http_fixture.py:/fixture/http_fixture.py:ro \
  --read-only --tmpfs /tmp:size=4m \
  --user 65534:65534 --cap-drop ALL --security-opt no-new-privileges \
  --pull never \
  python:3.12-slim python3 -I -u /fixture/http_fixture.py
```

Data-порт 18080 и TLS-порты не публикуются (`-p` только для 18090). `--env-file`
убирает токен из истории shell и `ps`; в `docker inspect` он всё равно виден,
поэтому доступ к Docker на VM приравнивается к знанию токена. Токен передаётся
проверяющим отдельно и никогда не попадает в задачу или к модели.
Остановка: `docker rm -f loginom-http-fixture`.

## Готовность

```sh
docker logs loginom-http-fixture 2>&1 | grep READY
# READY data=18080 admin=18090 tls=18443-18462 host=loginom-http-fixture

# data-порт из той же сети, что loginom-app-server (/healthz не пишется в ledger):
docker run --rm --pull never --network loginom-app-private python:3.12-slim \
  python3 -I -c "import urllib.request as u; print(u.urlopen('http://loginom-http-fixture:18080/healthz', timeout=5).read().decode())"
# {"ok":true}
```

С машины проверяющего (заголовок с токеном лежит в файле с правами 0600, строка
`Authorization: Bearer <токен>`, чтобы токен не попадал в `ps`):

```sh
A=http://$VM_LAN_IP:18090
curl -sS -H @"$FIXTURE_AUTH_HEADER_FILE" "$A/admin/health"   # {"ok":true,"tls_slots_free":20}
curl -sS -o /dev/null -w '%{http_code}\n' "$A/admin/health"  # 401
```

TLS-порты в проверку готовности не входят: любое TCP-подключение с ClientHello
к TLS-listener записывается в журнал handshake этого прогона.

## Прогон: команды проверяющего

```sh
RUN=<новый run_id: [A-Za-z0-9][A-Za-z0-9._-]{0,63}>
H=(-H @"$FIXTURE_AUTH_HEADER_FILE")
curl -sS "${H[@]}" -X DELETE "$A/admin/runs/$RUN"                 # {"reset":true}
curl -sS "${H[@]}" -X POST "$A/admin/runs/$RUN/tls-listener"       # нужен только для TLS-проверки
# {"run_id":"…","listener_id":"tls-…","port":18443,"tls_base_url":"https://loginom-http-fixture:18443/runs/…"}
```

В задачу прогона: `FIXTURE_BASE_URL=http://loginom-http-fixture:18080/runs/$RUN`,
`FIXTURE_TLS_BASE_URL=<tls_base_url из ответа>`. До и после каждого действия
(Code/Next/Done/Preview/Execute, cold) снимайте ledger и сравнивайте дельту:

```sh
curl -sS "${H[@]}" "$A/admin/runs/$RUN/ledger"          > ledger-<шаг>.json
curl -sS "${H[@]}" "$A/admin/runs/$RUN/tls-handshakes"  > tls-handshakes.json
curl -sS "${H[@]}" "$A/admin/runs/$RUN/state"           # registrations, draft_hex, inflight, tls_listener
```

После прогона сохраните ledger и журнал handshake как артефакт проверки, затем
`curl -sS "${H[@]}" -X DELETE "$A/admin/runs/$RUN"` и убедитесь, что
`…/ledger` возвращает `[]`. Reset ждёт завершения обработчиков этого run до
`FIXTURE_RESET_TIMEOUT` и иначе отвечает 409 `{"error":"run_busy"}`; он
закрывает TLS-listener прогона и освобождает его порт.

Положительная TLS-контрольная проба (сертификат не отключается, а доверяется явно):
`curl -sS "${H[@]}" "$A/admin/tls-certificate" > fixture-ca.pem` и подключение с
этим файлом как CA даёт запись `"failed":false`.
