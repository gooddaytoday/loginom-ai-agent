# Node17: первый Hermes FAIL сохранён, исправлен конфликт имён

Полный прогон `20260913-191856-fd729ed8` завершился exit0, timeout=false;
процессы Hermes и собственной браузерной сессии закрылись. Слот
`node17-hermes-20260913-bdaea73b` освобождён координатором. **Полное задание FAIL**:
запущены 6 node.apply из 22; сохранение и независимое повторное открытие
итогового пакета ещё не выполнены. Exit0 не трактовался как приёмка.

Подтверждённая причина: helper входных fixtures назначал Typed путь
`/test-2/Dock-export-20260913-191856-fd729ed8-typed.csv`. Тот же путь требовался
для первого ExportTyped. Доставка входа и чтение Typed3×5 прошли, затем
Loginom корректно отказал по reject, cleanup=true, без execution экспорта.
Hermes затем запросил replace Typed, но observer отклонил неподходящий путь
до product dispatch; вход не перезаписан. Эти ошибки публичных инструментов
сохранены. Аудитор полного задания честно вернул FAIL `user_mixed_result_profile`
из-за error envelopes; это не успешная смешанная выдача. Неполнота goal также
подтверждена прямым подсчётом исходных node_apply_prepared. Аудитор не ослаблялся.

Исправлен только `text_export_upload_probe.py`: имена трёх входов получили
`-input-` перед main.csv/typed.csv/wide.csv. Goal использует уже существующие
подстановки имён, выходные пути и исходные bytes/settings не изменены.
Регрессия проверяет отсутствие пересечений всех трёх входов со всеми 12
уникальными выходными путями goal, полноту подстановки и сохранение ожидаемых
выходов. **21 Python PASS**. Runtime/observer не менялись; их ранее выполненные
Node30 и live user-v1 replace проверки сохраняют область применимости.
Дополнительный browser probe для детерминированного конфликта строк не нужен.

Снова проверены runtime155/harness281 и штатный preflight с существующей
ChatGPT-подпиской: openai-codex/gpt-5.6-sol/low, Hermes0.21.0, model_started=false.
Manifest `993a3ed4707964280331caaf80766428276d295dafd2eaedfcecd86990bfe33c`.
Исходная цель 22/3/all save-reopen сохранена. Подтверждённая component-проверка
не перенесена на полный goal: полный PASS возможен лишь после полного прогона
и независимого fresh-session аудита. Старые FAIL/evidence не переписаны.

## Обоснованный повтор после выделения нового слота

Команда та же, изменены только pinned входные имена в helper:

```sh
python3 /Users/kartamyshev/Git/loginom-dock/.worktrees/node-17-text-export/tools/loginom-acceptance/run.py --run --goal text-export-node-complete --model-profile chatgpt-sol --runs-root /Users/kartamyshev/Git/loginom-dock/.worktrees/node-17-text-export/.dock/node17/acceptance/runs --node /Users/kartamyshev/.loginom-dock/releases/0.1.0-dev.20260910.3-80ca61417ec7/runtime/node --hermes-home /Users/kartamyshev/.hermes --hermes /Users/kartamyshev/.local/bin/hermes --hermes-python /Users/kartamyshev/.hermes/hermes-agent/venv/bin/python --hermes-source /Users/kartamyshev/.hermes/hermes-agent --dock-config /Users/kartamyshev/.loginom-dock/config.json --browsers /Users/kartamyshev/.loginom-dock/runtime/browsers --loginom-user test-2 --loginom-url 'http://logi-test-plan.bg.local/app/?testable=true' --storage-directory /test-2 --manifest-uri viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.13-node11.2-candidate/manifest.json --manifest-sha256 bb2fe2207e01d594108efb591d1c25036adc12f67168ef895dfde755d391ac2a --timeout 3600 --max-turns 100
```

Рабочая директория — текущий node17 worktree. Будет новый run/package/profile
и новый уникальный префикс файлов. Следующий владелец действия — координатор:
выделить свободный Hermes-слот и продолжить эту задачу. До этого модель не
перезапускается. После полного сценария я выполняю отдельное переоткрытие,
четыре destination-only экспорта и inventory отсутствия Done/Close, затем
независимый итоговый `text_export_acceptance.py`.

[Машинный отчёт, pins, команда и SHA исходного FAIL](17-text-export-hermes-retry-ready.json).
