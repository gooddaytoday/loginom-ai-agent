# LAB-262: исправление двух ложных отказов оценщика

- База: `lab262-analysis` от `60a82320a9837b284b7c2a359d47c33040dc0282`; Import fix — `6d7614544b`.
- Восстановлены optional bytes/hash assertions из `68686f224a`; неверные значения и неподтверждённая доставка по-прежнему FAIL.
- XML inspector передаёт явный AutoSync; mapping validator учитывает неизменённые сохранённые row keys, не дублируя собственные names/sources.
- Никаких подстановок из oracle/readback и обязательного отключения AutoSync продуктом; оба mapping validator используют одну эффективную схему.
- TDD: отсутствие Import metadata воспроизвело input FAIL; отсутствие output Region при AutoSync воспроизвело persisted mapping FAIL; после исправлений адресные тесты зелёные.
- Отрицательные тесты сохраняют FAIL при отключённом/отсутствующем AutoSync, неправильных name/type/source, повторном source, лишней колонке и пропущенном числовом override.
- `bun typecheck` из `evals/` — exit 0; все node/text-import/campaign-admission тесты: 334 PASS, 5 SKIP, 0 FAIL, 2036 assertions / 31 files, exit 0.
- Replay всех 27 completed node attempts LAB-262: 11 → 24 PASS, ровно 13 исправленных FAIL, 0 регрессий; 3 string-counts-null остаются FAIL.
- При replay SHA events/native/result/package/unpacked XML не изменились; исходные campaign verdict не переписывались.
- Evidence: `/home/kiselev/storage/tmp/lab122-lab262-analysis/fix-validator-replay.json`, `fix-affected-tests.log`, `fix-full-tests.log`, `fix-full-tests-stop.json`.
- В публичном LAB-122 нет полных events/result/native attempts; полный replay старой кампании не заявляется. Явная форма проверяется существующими reference fixtures.
- Live/model/Export не запускались; прежняя cold-проверка 4/4 остаётся отдельным свидетельством. UI-сбой не входит в это исправление.
- Независимые review плана и diff — ACCEPT; посторонний `offline-admission > run admission` FAIL воспроизведён на базе (FAIL/PASS/PASS), current PASS/PASS/PASS: прежняя гонка version probe, без правок.
- Широкий suite не пройден: остановлен после прежнего flaky; SIGINT вызвал отдельный interruption FAIL, своё дерево процессов затем завершено и отсутствие подтверждено.
- Результат: оба дефекта оценщика исправлены и проверены. Следующий шаг при необходимости — использовать эту ветку harness; слияние, публикация и выпуск отдельно.
