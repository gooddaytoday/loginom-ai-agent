# Browser recovery: Host CI loader follow-up

**Результат:** штатная единая команда Host `bun test` с закреплёнными Bun/Node проходит без module-load FAIL; требования уведомления run-released, сохранения cleanup failure и ACK/clean exit остаются прежними. Это восстановление существующей обязательной проверки, не новый критерий продукта.

**Основание:** опубликованный cfa25ab5e3: Linux push/PR Host unit и macOS Source checks падают до выполнения одного test module. В macOS `effect/dist/index.js` получает TS-текст reservedSkillNames; есть EISDIR schema/product. Linux — тот же класс на saved-package-shutdown. Полные логи сохранены в workspace плана 5 (`ci-triage.md`). Смена имени упавшего модуля не устанавливает причину.

**Наблюдённый код:** browser-recovery-release и saved-package-shutdown вызывают buildNodeHost/Bun.build внутри test runner. connection-validation, node-host и browser-recovery-capability уже вызывают тот же существующий builder отдельным Bun-процессом; connection-validation документирует EISDIR при повторных in-process builds. Это конкретная проверяемая гипотеза, пока не установленная причина текущего FAIL.

**Первый проверяемый результат:** воспроизводящая команда на текущих исходниках и pins, показывающая тот же loader failure либо исключающая гипотезу на минимальной полезной комбинации. Не нужны Loginom, браузер или staging. Исторический RED CI/локальных прогонов сохраняется.

**Проверка плана:** независимое review — GO, обязательных замечаний нет.

## Ограничения и объём

- Рабочая ветка/worktree — из общего checkpoint. Одна implementation task; никаких параллельных implementation workers.
- Сначала локализация, затем минимальная правка в test/build-fixture границе. Существующие публичные тесты являются поведенческой проверкой; не добавлять зеркальные string/mocks tests.
- Предпочесть существующий builder и subprocess pattern. Если одинаковая реально сложная граница нужна двум callers, допустим один общий test helper; нового runner, пула, очереди, retry, настроек или runtime hook нет. Причина и стоимость выбранного механизма записываются в отчёте.
- Не менять production поведение/контракты, pins/dependencies/lockfile, workflow, таймауты и критерии cleanup. Не пропускать тесты и не объявлять разбиение на процессы PASS штатной полной команды.
- Ожидание: 3–5 файлов, около +45/−10 строк с тестами и документацией; при превышении ×2 пересмотреть подход до расширения. Новая production-механика или изменение гарантий требуют повторного plan review.
- Проверки только package-local с Node24.19.0 и Bun1.3.14; секреты/raw logs в Git не входят. Чужие процессы/профили и основной checkout не затрагиваются.
- Исключения: исправления стандартных Dock-процедур, native macOS acceptance, BR-S2/S4/S5/S6, packaged/model/release acceptance. CI-наблюдение подтверждает только реально завершившиеся runs.

### Task 1: Изолировать и устранить module-load failure

- [ ] **Step 1 — RED и локализация.** Использовать существующие логи и исходники. Начать с минимальной целевой комбинации/временной пробы для гипотезы in-process build → последующий import. Если она не воспроизводит проблему, одна штатная полная команда устанавливает текущий baseline. Зафиксировать точную команду, pins, ошибку и отличие от CI. Не перебирать полные suites/порядки вслепую; следующая попытка проверяет новую гипотезу.
- [ ] **Step 2 — минимальная правка и GREEN.** Только после конкретного доказательства изменить первую неверную test/build границу, используя существующий механизм. Пройти тот же воспроизводящий путь и исходные тесты обеих политик release/shutdown. Если гипотеза опровергнута, не сохранять precautionary fix; уточнить план перед иной механикой.
- [ ] **Step 3 — штатная проверка.** Одна единая `LOGINOM_AI_AGENT_TEST_NODE=<pinned Node> bun test` из packages/loginom-host, затем package-local `bun typecheck`, `git diff --check`. При новой ошибке сначала отделить дефект проверки/среды/продукта; не подменять ожидаемый результат. Наблюдения новых CI после push — отдельное свидетельство, local PASS не называется macOS PASS.
- [ ] **Step 4 — независимое task review и checkpoint.** Сохранить команды/RED→GREEN/ограничения в отчёте; commit кода, полный task-scoped diff на review spec+quality; обязательные замечания устранить. После принятия отметить шаги, обновить общий checkpoint и draft PR, сделать commit. Merge/release отдельно владельцем.
