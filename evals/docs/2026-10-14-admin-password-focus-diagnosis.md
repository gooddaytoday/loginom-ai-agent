# Native admin login: password focus

Первый положительный native test на новой research-паре падал
ADMIN_DISPOSE_UNKNOWN. Collector повторил узкий case 3/3: 33.641/32.980/32.620s,
без явных auth/licence denial. Native process cleanup confirmed, browser binding
присутствовал, final verification [0,0]; command outcome оставался unknown.

Это дефект ранее не квалифицированного browser init path. Known-good live commit
не было, bisect не применялся. Safe receipt diagnostics выявили исходный
ADMIN_DEADLINE на PASSWORD, DOM state READONLY. Pinned Studio Login.js:217–231
AutoCompleteOff ставит readonly и снимает его на focus/username keypress.
Playwright fill ждёт editable до focus, поэтому код не доходил до login.

Driver вызывает штатный password.focus перед fill. DOM attributes через JS не
меняются, credential/auth требования, timeouts и assertions сохранены. Receipt
содержит только проверенные diagnostic codes и фиксированные stages/password
states; raw message/credential/UI text в эти metadata не копируются.

Тот же test с закреплённым candidate: 1 PASS/7 assertions (6.22s), actual
username/admin role read-back, dispose confirmed, native proof confirmed.
Полная admin integration/unit/preflight серия:48 PASS/123 assertions (36.33s),
bun typecheck/git diff --check PASS. Full harness после интеграции не запускался.

Команда из evals/: EVAL_CLI_BIN=<candidate binary из private receipt>
EVAL_ADMIN_INTEGRATION=1 EVAL_ADMIN_LIVE_CONFIG=<research slots.json>
bun test test/loginom-admin-integration.test.ts test/loginom-admin.test.ts
test/preflight.test.ts.

Research factory сохранил полный ownership journal; dev/legacy не изменены.
Old quarantined receipts и process proofs сохранены. Confirmed process disposal
не доказывает server session close; session correlation/ACL/backup/licence
concurrency остаются отдельными gates. Generic inspect не выдаёт qualified session
ownership по одному username.

Позднее один запуск отказал на FORM (`admin-xpVeYw`), следующий прошёл
(`admin-skCUv9`); оба dispose/process cleanup confirmed. Три дополнительных
повтора: 3 PASS/78 assertions, 7.604/6.882/6.691s. FORM failure не воспроизведён;
серия не доказывает его причину. Источники: private collector report
`/tmp/evals-native-admin-form-signal-1vx9qlo0.json` и исходные receipts.

Код проверял count сразу после navigation, без ожидания асинхронной формы.
Добавлено ожидание visible для login/password/submit внутри прежнего request
deadline; exact count guard сохранён. Новые retry/sleep/deadline не добавлены.
Проверка после изменения: native admin/CRUD + codec/preflight 59 PASS/226
assertions (59.25s), без изменения dev/legacy или постоянного research account.
Это проверка текущего поведения; детерминированное воспроизведение FORM race
и full harness regression не заявлены.
