# Evals late descendant adoption check

**Goal:** Устранить наблюдённую гонку проверки adoption, сохранив контракт запрета раннего proof, затем продолжить Task18 M3 с зелёным CI.
**Scope:** `evals/test/judge.test.ts` и этот план; результаты — в существующих checkpoint/runbook. Ожидается 4 файла, до 90 изменённых строк; production/runtime/dependencies — 0, тест — около 5 строк.
**First verifiable result:** существующий focused test проходит с ожиданием фактического перехода parent, сохраняя live child, birth identity, отсутствие раннего результата и natural-exit proof.

## Evidence and choice

CI8 упал на немедленном PPID assertion после `!active(parent)`. Helper считает Z/X неактивностью; это не гарантирует передачу ребёнка subreaper. Тот же неверный переход наблюдался ранее в browser helper test. Общая ошибка — ожидать один факт и сразу требовать другой. В этой проверке нужен существующий bounded `fixture.wait` фактической adoption и проверка неизменного starttime, без нового helper/framework, sleeps или расширения deadline.

Прежний CI RED — доказательство дефекта проверки; локальный PASS до изменения не опровергает гонку и не объявляется воспроизведением kernel interleaving. Рерун CI без исправления не обоснован. Production и продуктовые критерии не меняются. PPID assertion сохраняется: последующие proof assertions не заменяют наблюдение настоящей adoption живого child, что подтвердило независимое review.

## Steps

- [x] Независимое plan review: необходимость ожидания, отсутствие нового механизма, сохранение identity/cleanup/deadline и всех последующих assertions. Максимум три адресных раунда; новые обязательные замечания должны указывать конкретный риск.
- [x] Fresh implementer читает actual RED и запускает baseline из `evals`: `bun run test:unit ./test/judge.test.ts --test-name-pattern '^ordinary exec: late descendant adoption prevents early proof$'`. Затем заменяет прежний wait одним existing bounded wait: parent неактивен, в `/proc/<child>/stat` starttime совпадает и PPID равен fixture.launcher.pid. Повторяет ровно эту команду и package-local `bun typecheck`, diff/secrets/hooks; owned commit `test(evals): wait for late descendant adoption`. Никаких широких tests, stress/retries или соседних исправлений.
- [x] Независимое SPEC+QUALITY review diff и доказательств; все реальные проверки child/launcher/settled/proof/origin/no-signals/end timestamps/finally сохранены.
- [x] Дождаться terminal исходного CI8, изолировать дополнительные отказы, если появятся. После одобренного test fix — финальная чистая ревизия, нормальный push и текущий CI. Полная Desktop/CLI поставка из одной этой ревизии готовится параллельно, по прежнему approved Task18 recipe. Не скрывать старый RED отменой или повтором; перед исправляющей установкой нужны оба PASS. Релевантный runtime не изменён: native GREEN/S6 переиспользуются только после проверки фактической эквивалентности.

**Risks/cost:** `/proc` может исчезнуть или PID смениться — это остаётся отказом, не превращается в retry. До завершения adoption child должен оставаться живым, identity не переиспользуется. Полный CI занимает десятки минут; параллельная stock упаковка не задерживает его, но может оказаться напрасной при новом отказе.
**Excluded:** runtime supervisor, security/cleanup semantics, fixture lifetimes, таймауты, CI filters, требования M3, ручные patches artifacts, общие OS helpers и новые проверки вне Task18.
