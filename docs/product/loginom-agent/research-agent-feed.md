# Лента разговора настольных AI-агентов: как показан ход работы

Исследование 17.11.2026 для дизайна ленты Loginom AI Agent (агент собирает сценарии, документирует и проверяет пакеты, запрашивает права).

**На что опирается**
- OpenAI: документация learn.chatgpt.com (страницы недатированы, прочитано 17.11.2026); changelog по последнюю запись Codex app 26.1111 от 2026-11-12 ([changelog](https://learn.chatgpt.com/docs/changelog#codex-2026-11-12-app)) и Codex CLI 0.169.0 от 2026-11-13.
- Исходники Codex: github.com/openai/codex, коммит `8011b92bc82d4cc1b6dc3f35c0cd28768c797c97` (main, 2026-11-17). Ниже ссылки вида `codex@8011b92:<путь>#L…`.
- Anthropic: code.claude.com/docs (прочитано 17.11.2026), Claude Code 2.1.326 от 16.11.2026 по [changelog](https://code.claude.com/docs/en/changelog). Desktop-приложение — версии 2.x–4.x, по issues.

**Метки**
- [док] — официальная документация или changelog;
- [док, по макету] — вывод по иллюстрации в документации. У OpenAI это почти всегда HTML-макеты, а не снимки продукта;
- [код] — прочитано в исходниках;
- [форум] — наблюдение пользователя (GitHub issue, community.openai.com);
- [вывод] — моё заключение;
- «по выдержке» — текст из поисковой выдачи, страница не открывалась.
- «CL v2.1.N» — запись официального changelog Claude Code для этой версии, https://code.claude.com/docs/en/changelog#2-1-N (это [док]).

---

## Короткий ответ

Это сводка; ссылки на источники каждого утверждения — в разделах 1–6 ниже.

1. В **настольных** поверхностях (Codex/ChatGPT desktop, Codex IDE, Claude Code Desktop в режиме Normal) ход работы по умолчанию **свёрнут в строки-сводки** («Worked for 2m 30s», «Ran 2 commands», «Edited 3 files»). Текст ответа остаётся виден, детали раскрываются щелчком или режимом подробности. Исключения: в Codex CLI с 0.153.0 команды снова показываются по одной, а в Claude VS Code шаги развёрнуты, пока не включён Focus view (по умолчанию выключен).
2. **Изменения файлов** вынесены в отдельную карточку со счётчиками +X −Y и кнопками «Undo» / «Review» (макеты OpenAI desktop и IDE [док, по макету]; «Edited N files» в Claude Desktop [форум]).
3. **Запрос разрешения** — блокирующая карточка с явными вариантами: один раз / всегда (с названной областью) / отклонить / сказать, что делать вместо. Место зависит от поверхности:
   - в Codex CLI окно заменяет поле ввода [код];
   - в Claude VS Code карточка стоит на месте поля ввода [док, по скриншоту];
   - в Claude Desktop карточка стоит в ленте, над списком задач [форум];
   - в Codex/ChatGPT desktop место не документировано; в issues это «approval card» [форум].

   Строка-след решения в ленте («✔ You approved…») подтверждена только для Codex CLI [код]. **Вопрос агента** устроен как такая же форма: заголовок, варианты, свой ответ.
4. **Во время работы** видны строка статуса со временем, план с тремя состояниями шага, кнопка стоп и явный выбор Steer/Queue для сообщения, посланного на ходу. Steer/Queue документированы для Codex desktop и IDE, в Claude — очередь и «Send now».
5. **Слабое место у всех** — точность. В issues обоих поставщиков жалуются, что свёртка прячет команды и прозу агента, что approval «теряется» или устаревает. У OpenAI ещё жалоба, что вопрос сам закрывается по таймеру (226 реакций).

**Главное ограничение.** Код настольных приложений закрыт. Раскладку Codex/ChatGPT desktop мы знаем по HTML-макетам документации и по issues, а Claude Desktop — только по прозе документации (скриншотов там нет) и по issues. Открытый код есть только у терминального Codex CLI. Его поведение переносить на desktop можно лишь с меткой [вывод].

## Поверхности и что о них известно

| Поверхность | Что это | Источники |
|---|---|---|
| **Codex в ChatGPT desktop** («Codex desktop») | С 2026-07-09 Codex — часть ChatGPT desktop app: «Codex is now part of the ChatGPT desktop app on macOS and Windows» [док] [changelog 26.707](https://learn.chatgpt.com/docs/changelog#codex-2026-07-09-app) | документация, макеты, changelog, issues |
| **ChatGPT desktop: Chat / Work** | Переключатель «Chat or Work» над полем ввода [док] [app](https://learn.chatgpt.com/docs/app) | документация (по Chat почти ничего), форум |
| **Codex IDE-расширение** | VS Code и др. | документация, интерактивный макет, issues |
| **Codex CLI** | терминальный интерфейс (TUI), открытый код | код, changelog |
| **Claude Code Desktop** | вкладка Code в Claude desktop app | документация без скриншотов, issues |
| **Claude Code в VS Code** | графическая панель | документация со скриншотами, changelog |
| **Claude Code CLI / JetBrains** | JetBrains запускает CLI в терминале IDE [док] [jetbrains](https://code.claude.com/docs/en/jetbrains#installation) | для сравнения |

## Сводная таблица

| | Codex / ChatGPT desktop | Codex CLI (код) | Claude Code Desktop | Claude Code VS Code |
|---|---|---|---|---|
| **1. Шаги** | Свёрнуты под «Worked for …» над ответом [док, по макету]; группы «Ran 2 commands», «Edited 3 files, explored 2 files…» [форум]; карточка изменений с «Undo»/«Review» [док, по макету] | `• Ran <cmd>`, вывод 3 строки + «+N lines»; группа «Explored»; «Worked for 2m 5s • время» после ответа [код] | Normal: «Tool calls collapsed into summaries, with full text responses» [док]; «Ran N commands», карточка «Edited N files» [форум] | строки «Read file └ Read 256 lines» [док, по скриншоту]; «Thought for 12s» [док] |
| **2. Approval** | Enter — принять, Esc — отклонить [док]; карточка «Always allow \| Deny \| Allow once» [форум]; место не документировано | нижняя панель вместо поля ввода; 4–5 вариантов с клавишами; после решения строка «✔ You approved…» [код] | карточка в ленте над списком задач [форум]; «Allow once / Always allow / Deny» для сайтов [док] | карточка на месте поля ввода: «Make this edit to utils.py?» 1 Yes / 2 Yes, and don't ask again / 3 No + «Tell Claude what to do instead» [док, по скриншоту] |
| **3. Вопрос** | не описан в документации desktop; поля ответа «for questions from Codex» [док, changelog]; жалобы на автозакрытие [форум] | «Question 1/1», варианты с описаниями, «None of the above» + заметки; поле ввода заблокировано [код] | без таймаута [док]; карточка переехала из «поверх поля ввода» в ленту [форум] | вопрос заменяет поле ввода; после ответа строка «Questions» с выбором [док, changelog] |
| **4. Подробность** | главный рычаг — режим Work («Hide technical details…») или Codex («See developer details…») [док]; настройка объёма вывода команд [док] | `collapse_turn_details` (по умолчанию выкл.); размышления — заголовком в строке статуса, полностью по Ctrl+T [код] | Normal / Thinking / Verbose на сессию, Ctrl+O [док] | Focus view, глобально, по умолчанию выкл. [док] |
| **5. Действия** | fork от раннего сообщения [док]; Copy по наведению [форум]; в IDE по наведению Copy / Edit Message / Fork Message [форум] | `/copy`, Esc Esc — правка с откатом, `/fork` [код]; общей команды «повторить ответ» нет, повтор есть только у хода, задержанного проверкой безопасности [док, 0.145.0] | «Copy», рядом «Rewind to here» [форум] | по наведению: «Fork conversation from here», «Rewind code to here», «Copy response» [док] |
| **6. Прогресс** | Steer/Queue, очередь над полем ввода [док]; строка цели над полем ввода [док]; план в боковой панели [док]; статусы Running / Needs input / Ready / Blocked [док] | «Working (0s • esc to interrupt)»; «Updated Plan» ✔/□; ошибка — красная «■ …» [код] | стоп сразу, Enter досылает поправку после текущего действия [док]; список задач под последним сообщением [форум] | Stop/Esc; «Message queued.»; to-do виден даже в Focus view [док] |

---

## 1. Шаги работы агента в ленте

### Codex в ChatGPT desktop и ChatGPT Work

- **Одна строка-сводка над ответом, шаги под ней скрыты** [док, по макету].
  - Work: «Worked for 2m 30s ›» — [use-chatgpt#what-chatgpt-work-can-do](https://learn.chatgpt.com/docs/use-chatgpt#what-chatgpt-work-can-do).
  - desktop, режим не уточнён: «Worked for 13m 9s ⌄» — [artifacts-viewer?surface=app](https://learn.chatgpt.com/docs/artifacts-viewer?surface=app); «Worked for 27s ⌄» — [browser?surface=app](https://learn.chatgpt.com/docs/browser?surface=app).
  - Все страницы прочитаны 17.11.2026. Это HTML-макеты, а не снимки продукта.
- **IDE: сводка раскрывается в список шагов** [док, по макету]. Кнопка «Worked for 6m 53s» (`aria-expanded="false"`) раскрывается в строки прошедшим временем: «Read retry.ts», «Updated retryOperation», «Ran focused tests». Ниже ответ и карточка «Edited retry.ts +2 −2» с кнопками «Undo» и «Review» — [codex/ide](https://learn.chatgpt.com/docs/codex/ide).
- **Изменения файлов — отдельной карточкой после ответа** [док, по макету]: «2 files changed +32 -3» с «Undo» и строками по файлам; длинная история свёрнута в «37 previous messages» — [browser?surface=app](https://learn.chatgpt.com/docs/browser?surface=app).
- **Work и Codex различаются глубиной показа** [док]. Таблица сравнения: Work — «Hide technical details like Git or shell commands», Codex — «See developer details, including diff and review views» — [use-chatgpt#compare-chatgpt-work-and-codex-on-desktop](https://learn.chatgpt.com/docs/use-chatgpt#compare-chatgpt-work-and-codex-on-desktop).
- **Объём вывода команд настраивается (Codex-desktop)** [док]: «Choose … how much command output appears in chats…» — [developer-settings?surface=app#project-and-terminal-behavior](https://learn.chatgpt.com/docs/developer-settings?surface=app#project-and-terminal-behavior). Название и значения настройки не даны.
- **Поиск** [док]: «ChatGPT records search activity with the other tool calls in the transcript.» — [web-search?surface=app](https://learn.chatgpt.com/docs/web-search).
- **Из чего состоит лента Codex-desktop** [док]. Снимок-ссылка на чат включает «user-visible messages, reasoning summaries, … file changes, including paths and diffs», но не «tool calls, shell commands, or tool input or output» — [use-chatgpt#share-a-read-only-snapshot-of-a-codex-thread](https://learn.chatgpt.com/docs/use-chatgpt#share-a-read-only-snapshot-of-a-codex-thread).
- **Субагенты** [док]: «Open a subagent thread from the activity shown in the main thread» — [subagents?surface=app#managing-subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents?surface=app#managing-subagents).
- **Changelog** [док]:
  - 26.609 (2026-06-11): «Made command, browser, integration, and source activity summaries easier to understand» — [changelog](https://learn.chatgpt.com/docs/changelog#codex-2026-06-11-app);
  - 26.707 (2026-07-09): «Made task and subagent activity easier to follow while Codex works» — [changelog](https://learn.chatgpt.com/docs/changelog#codex-2026-07-09-app).
- **Что видят пользователи** [форум]:
  - группы по типу действия «Edited 3 files, explored 2 files, 2 searches» и «Ran 2 commands»; автор считает регрессией, что имена файлов скрыты — [#19891](https://github.com/openai/codex/issues/19891) (Codex app 26.422, 2026-04-27);
  - настройка «Thread detail» со значением «Steps with code output» — [#16415](https://github.com/openai/codex/issues/16415) (2026-04-01);
  - «the exact commands being run is not displayed anymore», 43 реакции — [#37213](https://github.com/openai/codex/issues/37213) (26.730, 2026-08-06);
  - IDE: финальный ответ спрятан под свёрнутым «Worked for 12s» — [#47494](https://github.com/openai/codex/issues/47494) (2026-09-23).
- **«Thought for …»**: в документации и в changelog OpenAI этой строки нет. По наблюдениям она есть в ChatGPT desktop Chat: «Thought for 41s» — [#52403](https://github.com/openai/codex/issues/52403) (macOS 26.1002, 2026-10-09); «Thought for 2m 11s», «Searched 52 websites» — [форум 1411296](https://community.openai.com/t/1411296) (2026-10-31) [форум].

### Codex CLI (открытый код, коммит 8011b92)

- **Команда**: `• Running <cmd>` → `• Ran <cmd>`; маркер зелёный при успехе, красный при ошибке [код] [exec_cell/render.rs#L503-L526](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/exec_cell/render.rs#L503-L526).
  - Вывод обрезан до 3 строк и подсказки «+N lines (⌃t to view transcript)» [код] [tool_output.rs#L113-L125](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/tool_output.rs#L113-L125).
- **Чтение и поиск файлов** склеиваются в группу `• Exploring` → `• Explored` со строками `Read a, b`, `List <path>`, `Search <q> in <path>` [код] [exec_cell/render.rs#L362-L446](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/exec_cell/render.rs#L362-L446).
- **Правка**: `• Edited N files (+a -r)`, по строке на файл, затем полный diff с номерами строк [код] [diff_render.rs#L459-L497](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/diff_render.rs#L459-L497).
- **MCP**: `• Calling server.tool(…)` → `• Called …` с превью результата или `└ Error: …` [код] [снимок](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/history_cell/snapshots/codex_tui__history_cell__tests__active_mcp_tool_call_snapshot.snap#L5-L6).
- **Сводка хода**: после ответа тусклая строка «Worked for 2m 5s • <время завершения> • Local tools: N calls…» [код] [separators.rs#L106-L139](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/history_cell/separators.rs#L106-L139). Подписи «Thought for» в TUI нет [код] (поиск по `tui/src`).
- **Полноэкранная лента** (по умолчанию): у шагов кнопки «+ Show details» / «− Hide details» [код] [transcript_view/layout.rs#L23-L60](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/transcript_view/layout.rs#L23-L60). Opt-in «Collapse turn details» сворачивает ход в строку «Explored files · ran N commands» или «N tool calls · <последний вызов>» [код] [turn_details.rs#L30-L63](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/transcript_view/turn_details.rs#L30-L63).
- **История спора о свёртке в CLI** [док + форум]:
  1. 0.149.0 (2026-08-20) — «Compact successful command activity in the TUI»: шаги стали «Ran N commands».
  2. Жалобы, 83 реакции — [#39903](https://github.com/openai/codex/issues/39903). Мейнтейнер: изменение было вызвано «strong user feedback that the TUI output was too verbose»; затем «we've decided to revert this change».
  3. 0.153.0 (2026-09-03): «TUI history shows … individual completed commands» — [changelog](https://learn.chatgpt.com/docs/changelog#github-release-381669913).
  4. 0.169.0 (2026-11-13): opt-in «Collapse turn details» — [changelog](https://learn.chatgpt.com/docs/changelog#github-release-443990865).

### Claude Code

- **Desktop: режимы ленты** [док] — [desktop#switch-view-modes](https://code.claude.com/docs/en/desktop#switch-view-modes):
  - «Normal — Tool calls collapsed into summaries, with full text responses»;
  - «Thinking — … plus Claude's thinking»;
  - «Verbose — Every tool call, file read, and intermediate step…».
- **Элементы ленты по поверхностям** [док] — [plugins/mods/reference#render-sites](https://code.claude.com/docs/en/plugins/mods/reference#render-sites): `ToolGroup` («a collapsed group of calls») есть в Terminal, Desktop и VS Code; `TurnDuration` («the line that closes a turn») — только в Terminal.
- **Desktop: правки** [док]: индикатор вида `+12 -1`, щелчок открывает diff view — [desktop-quickstart](https://code.claude.com/docs/en/desktop-quickstart#start-your-first-session).
- **Desktop: что видят пользователи** [форум]:
  - «Ran 2 commands, used 2 tools >» — [#90425](https://github.com/anthropics/claude-code/issues/90425) (2026-08-28);
  - «Used N tools» — [#103281](https://github.com/anthropics/claude-code/issues/103281);
  - карточка «Edited N files» в конце хода — [#99762](https://github.com/anthropics/claude-code/issues/99762);
  - просьба сворачивать ход в «Worked for 4m 12s · 23 tool calls», «like Codex» — [#96497](https://github.com/anthropics/claude-code/issues/96497) (2026-09-23).
- **VS Code** [док, по скриншоту]: строки «Read localizationUtils.ts / └ Read 256 lines», «Write (…)» с превью кода, спиннер «Pondering...» — [vs-code](https://code.claude.com/docs/en/vs-code). Размышления: «A thinking block that shows only a label, such as `Thought for 12s`…» — [vs-code#use-the-prompt-box](https://code.claude.com/docs/en/vs-code#use-the-prompt-box).
- **CLI**: «Cooked for 1m 6s · done 6:05 PM» после ответа [док] [settings-reference#showturnduration](https://code.claude.com/docs/en/settings-reference#showturnduration). Во время работы «Reading», «Searching for», после — «Read», «Searched for» ([CL v2.1.20](https://code.claude.com/docs/en/changelog#2-1-20)).

## 2. Запрос разрешения (approval)

### Codex в ChatGPT desktop и ChatGPT Work

- **Где и как выглядит запрос на команду — не документировано.** Есть только косвенное:
  - горячие клавиши «Approve request (When an approval request is open) | ⏎» и «Decline request … | Esc» [док] [reference/commands#keyboard-shortcuts](https://learn.chatgpt.com/docs/reference/commands#keyboard-shortcuts);
  - области одобрения: «such as approving once or for the session, choose the narrowest scope…» [док] [sandboxing?surface=app#how-permissions-work](https://learn.chatgpt.com/docs/sandboxing?surface=app#how-permissions-work).
- **Политика разрешений выбирается под полем ввода** [док, по макету] — [permission-modes#choose-a-mode](https://learn.chatgpt.com/docs/permission-modes#choose-a-mode). Заголовок «How should ChatGPT actions be approved?», варианты:
  - «Ask for approval» — «Always ask to edit external files and use the internet»;
  - «Approve for me» — «Only ask for actions detected as potentially unsafe»;
  - «Full access» (выделен оранжевым);
  - «Custom (config.toml)».
- **Computer Use** [док, по макету]: «Allow Codex to use Calculator?», флажок «Always allow», кнопки «Cancel» (Esc) и «Allow» (↵) — [computer-use#permissions-and-approvals](https://learn.chatgpt.com/docs/computer-use#permissions-and-approvals).
- **Единственная полная карточка одобрения команды в документации — мобильная** [док, по макету]: «Permission requested» / «Do you want to allow Codex to run this command?» / команда / «Approve», «Always approve» / поле «Tell Codex what to do» / «Deny» — [mobile](https://learn.chatgpt.com/docs/mobile). Для desktop переносить её можно только как [вывод].
- **Changelog** [док]:
  - 26.422 (2026-04-23): авто-ревьюер одобрений; приложение «shows an automatic review item with the review status and risk level» — [changelog](https://learn.chatgpt.com/docs/changelog#codex-2026-04-23);
  - 26.609 (2026-06-11): «Cmd+Enter and Ctrl+Enter as shortcuts for submitting custom approval feedback» — [changelog](https://learn.chatgpt.com/docs/changelog#codex-2026-06-11-app);
  - 26.1007 (2026-10-08): «clearer recovery guidance when a tool call needs approval but the chat's permissions prevent approval requests» — [changelog](https://learn.chatgpt.com/docs/changelog#codex-2026-10-08-app).
- **Что видят пользователи** [форум]:
  - до июля 2026 — модальный диалог «Yes / Yes, and don't ask again... / No, and tell Codex what to do differently» — [#12304](https://github.com/openai/codex/issues/12304) (2026-02-20);
  - после 26.707 — «approval card»:
    ```
    Allow ChatGPT to use GitHub?
    Creates a GitHub issue in openai/codex ...
    Always allow | Deny | Allow once
    ```
    — [#37184](https://github.com/openai/codex/issues/37184) (macOS 26.730, 2026-08-06);
  - пропал отказ с объяснением («No, and tell Codex what to do differently») — [#32116](https://github.com/openai/codex/issues/32116) (2026-07-10);
  - Work: после «Allow once» появляется «That approval request is no longer active. Please retry the action…» — [#60139](https://github.com/openai/codex/issues/60139), [#61693](https://github.com/openai/codex/issues/61693) (ноябрь 2026);
  - «потерянный» запрос: в боковой панели бейдж «Waiting for approval», а кнопок и поля ввода нет — [#48930](https://github.com/openai/codex/issues/48930) (2026-09-28);
  - запрос на GitHub «above the composer» с «Continue» / «Not now», режим не указан — [#56226](https://github.com/openai/codex/issues/56226).
- Если чат «завис», сначала проверить, не ждёт ли он одобрения [док] — [reference/troubleshooting#stuck-states-and-recovery-patterns](https://learn.chatgpt.com/docs/reference/troubleshooting#stuck-states-and-recovery-patterns). [вывод] Ожидающий запрос бывает незаметен.

### Codex CLI и протокол app-server

- **Место**: модальное окно в нижней панели **заменяет поле ввода** [код] [bottom_pane/mod.rs#L1-L6](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/bottom_pane/mod.rs#L1-L6). Если пользователь печатал меньше секунды назад, показ откладывается на 1 с, чтобы нажатие не попало в окно [код] [bottom_pane/mod.rs#L810-L817](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/bottom_pane/mod.rs#L810-L817).
- **Описание действия** [код] [approval_overlay.rs#L728-L835](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/bottom_pane/approval_overlay.rs#L728-L835):
  - заголовок по типу: «Would you like to run the following command?», «Do you want to approve network access to "<host>"?», «Would you like to make the following edits?»;
  - строки `Thread:`, `Reason:`, `Permission rule:`, `$ <команда>`;
  - Ctrl+A открывает полную команду или diff — [approval_overlay.rs#L560-L571](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/bottom_pane/approval_overlay.rs#L560-L571).
- **Варианты для команды** [код] [approval_overlay.rs#L873-L960](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/bottom_pane/approval_overlay.rs#L873-L960):
  - «Yes, proceed» (y);
  - «Yes, and don't ask again for commands that start with `<prefix>`» (p);
  - «Yes, and don't ask again for this command in this session» (a);
  - «No, continue without running it» (d) — отказ, ход продолжается;
  - «No, and tell Codex what to do differently» (esc) — отказ с прерыванием хода.
  - Для сети: «Yes, just this once» / «…allow this host for this conversation» / «…in the future» / «No, and block this host in the future».
- **След в ленте после решения** [код] [history_cell/approvals.rs#L230-L265](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/history_cell/approvals.rs#L230-L265): «✔ You approved codex to run <cmd> this time», «✗ You did not approve…»; при авто-ревью вместо «You» — «Auto-reviewer».
- **Протокол, через который получают события и клиенты** [код] [item.rs#L67-L89](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/app-server-protocol/src/protocol/v2/item.rs#L67-L89):
  - решения `accept`, `acceptForSession`, `acceptWithExecpolicyAmendment`, `applyNetworkPolicyAmendment`, `decline` («The agent will continue the turn»), `cancel` («The turn will also be immediately interrupted»);
  - сервер присылает `availableDecisions` — «Ordered list of decisions the client may present» [код] [item.rs#L1673-L1755](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/app-server-protocol/src/protocol/v2/item.rs#L1673-L1755);
  - ожидание видно в статусе потока: `activeFlags: ["waitingOnApproval" | "waitingOnUserInput"]` [код] [thread.rs#L1753-L1770](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L1753-L1770).

### Claude Code

- **Desktop** [док]:
  - Manual: «You see a diff and can accept or reject each change» — [desktop#choose-a-permission-mode](https://code.claude.com/docs/en/desktop#choose-a-permission-mode);
  - сайт: «a permission card appears…: **Allow once**, **Always allow**, or **Deny**» — [desktop#approve-claude's-actions-on-a-site](https://code.claude.com/docs/en/desktop#approve-claude%E2%80%99s-actions-on-a-site);
  - приложение (computer use): «**Allow for this session** or **Deny**», с уровнем доступа View only / Click only / Full control — [desktop#app-permissions](https://code.claude.com/docs/en/desktop#app-permissions).
- **Desktop, что видят пользователи** [форум]:
  - карточка Allow/Deny рисуется в ленте, «above the task list», пользователь просит «directly above the input box» — [#104426](https://github.com/anthropics/claude-code/issues/104426) (2026-10-22);
  - основная кнопка «Always allow» (⇧⌘↵), «Allow once» спрятан за шевроном — [#102136](https://github.com/anthropics/claude-code/issues/102136) (2026-10-14);
  - в боковой панели значок «Needs your input» — [#108064](https://github.com/anthropics/claude-code/issues/108064).
- **VS Code** [док, по скриншоту]: на месте поля ввода карточка «Make this edit to utils.py?» с вариантами «1 Yes / 2 Yes, and don't ask again / 3 No» и полем «Tell Claude what to do instead» — [vs-code](https://code.claude.com/docs/en/vs-code#get-started). Изменения после скриншота [док, changelog]:
  - [CL v2.1.0](https://code.claude.com/docs/en/changelog#2-1-0): описательные подписи вроде «Yes, allow npm for this project»;
  - [CL v2.1.3](https://code.claude.com/docs/en/changelog#2-1-3): выбор, куда сохранить разрешение («this project, all projects, shared with team, or session only»);
  - [CL v2.1.261](https://code.claude.com/docs/en/changelog#2-1-261): кнопка сворачивания карточки, чтобы читать ленту за ней;
  - вкладка сессии синяя, пока ждёт разрешения — [vs-code#run-multiple-conversations](https://code.claude.com/docs/en/vs-code#run-multiple-conversations).
- **CLI** [док, по скриншоту] — [permissions#permission-system](https://code.claude.com/docs/en/permissions#permission-system):
  - заголовок «Bash command», описание «Run the test suite», `npm test`, вопрос «Do you want to proceed?»;
  - варианты «1. Yes / 2. Yes, and don't ask again for: npm test * / 3. Yes, and switch to auto mode / 4. No», подвал «Esc to cancel · Tab to amend»;
  - «No» без комментария останавливает ход — [permissions#add-a-comment-when-you-answer-a-permission-prompt](https://code.claude.com/docs/en/permissions#add-a-comment-when-you-answer-a-permission-prompt).

## 3. Вопрос агента пользователю с вариантами

- **ChatGPT/Codex desktop** — в документации интерфейс вопроса не описан. Есть только косвенное [док]:
  - статус «Needs input — A chat needs your approval, answer, or another decision» — [pets#understand-pet-status](https://learn.chatgpt.com/docs/pets?surface=app#understand-pet-status);
  - отдельные уведомления о вопросах — [notifications?surface=app](https://learn.chatgpt.com/docs/notifications?surface=app#configure-desktop-notifications).

  Changelog [док]:
  - 26.317 (2026-03-18): «notifications for plan mode questions» — [changelog](https://learn.chatgpt.com/docs/changelog#codex-2026-03-18-app);
  - 26.911 (2026-09-16): «Improved focus and alignment in answer fields for questions from Codex» — [changelog](https://learn.chatgpt.com/docs/changelog#codex-2026-09-16-app);
  - iOS: «Unanswered questions remain available after a turn finishes» — [changelog](https://learn.chatgpt.com/docs/changelog#codex-2026-10-22-mobile).
- **Жалобы** [форум]:
  - автоответ по таймеру через 60 с в Plan mode, 226 реакций — [#28969](https://github.com/openai/codex/issues/28969); мейнтейнер: «147.0 should no longer auto resolve in plan mode»;
  - desktop: «auto-dismiss countdown» — [#31651](https://github.com/openai/codex/issues/31651); просьба «Always wait for my answer» — [#43759](https://github.com/openai/codex/issues/43759);
  - структурный вопрос доступен только в Plan mode — [#30150](https://github.com/openai/codex/issues/30150);
  - текст вопроса обрезан многоточием — [#30353](https://github.com/openai/codex/issues/30353).
- **Протокол Codex: два механизма** [код]:
  - блокирующий `item/tool/requestUserInput`: `questions[{id, header, question, isOther, isSecret, options[{label, description}]}]`, `isBlocking` — [item.rs#L1863-L1945](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/app-server-protocol/src/protocol/v2/item.rs#L1863-L1945);
  - неблокирующие вопросы внутри ответа агента (`agentMessage.questions`). Ответ уходит обычным сообщением в обёртке, которую код называет «the desktop's existing async-question reply envelope» — [async_question_reply.rs#L1-L2](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/async_question_reply.rs#L1-L2). [вывод] Desktop задаёт вопросы и так, не останавливая работу.
- **Codex CLI** [код]:
  - «Question 1/1 (1 unanswered)», варианты `1. Option  описание`, подвал «tab to add notes | enter to submit answer | esc to interrupt» — [снимок](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/bottom_pane/request_user_input/snapshots/codex_tui__bottom_pane__request_user_input__tests__request_user_input_options.snap#L6-L14);
  - поле ввода заблокировано подсказкой «Answer the questions to continue.» — [bottom_pane/mod.rs#L2147-L2175](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/bottom_pane/mod.rs#L2147-L2175);
  - после ответа в ленте «• Questions 1/1 answered» с ответом и заметкой — [history_cell/request_user_input.rs#L79-L87](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/history_cell/request_user_input.rs#L79-L87);
  - CLI 0.154.0: «Answer questions inline while Codex continues working, using suggested choices or custom text without losing your main draft» [док] — [changelog](https://learn.chatgpt.com/docs/changelog#github-release-385887902).
- **Claude Code** [док]:
  - `AskUserQuestion`: 1–4 вопроса, у каждого `header` (≤12 символов), 2–4 варианта с `label` и `description`, `multiSelect`, свой ответ через «Other» — [agent-sdk/user-input#question-format](https://code.claude.com/docs/en/agent-sdk/user-input#question-format), [tools-reference#askuserquestion-tool-behavior](https://code.claude.com/docs/en/tools-reference#askuserquestion-tool-behavior);
  - в Desktop таймаут не действует: «a question from Claude stays open for a user to answer» — [desktop#claude-code-settings-that-behave-differently-in-the-code-tab](https://code.claude.com/docs/en/desktop#claude-code-settings-that-behave-differently-in-the-code-tab);
  - Desktop [форум]: карточка вопроса раньше открывалась «over the composer» ([#99338](https://github.com/anthropics/claude-code/issues/99338), 2026-10-03), потом «renders inline in the transcript» ([#102432](https://github.com/anthropics/claude-code/issues/102432), 2026-10-15);
  - VS Code: «the question panel replaces the normal message input box» [форум] [#101820](https://github.com/anthropics/claude-code/issues/101820);
  - [CL v2.1.286](https://code.claude.com/docs/en/changelog#2-1-286) [док], VS Code: после ответа строка «Questions» показывает выбранное; у вариантов бывает превью.

## 4. Режимы подробности, размышления, сворачивание

- **ChatGPT/Codex desktop.**
  - Главный рычаг — режим: Chat, Work («Hide technical details…») или Codex («See developer details…») [док] [use-chatgpt](https://learn.chatgpt.com/docs/use-chatgpt#compare-chatgpt-work-and-codex-on-desktop).
  - В Codex — настройка объёма вывода команд [док] (см. п. 1). Пользователи называют её «Thread detail» и «For coding» [форум] [#16415](https://github.com/openai/codex/issues/16415), [#19891](https://github.com/openai/codex/issues/19891).
  - Размышления: мейнтейнер, 2026-08-05: «Desktop supports live and retained reasoning summaries» [форум] [#10723](https://github.com/openai/codex/issues/10723). Как они свёрнуты, в документации не описано.
  - Регулятор «reasoning effort» под полем ввода управляет глубиной размышлений, а не показом — [models#choose-a-model](https://learn.chatgpt.com/docs/models?surface=app#choose-a-model) [док].
- **Codex CLI** [код]:
  - кратко или подробно — два представления каждой ячейки; полный журнал по Ctrl+T — [history_cell/mod.rs#L253-L266](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/history_cell/mod.rs#L253-L266);
  - заголовок текущего размышления заменяет «Working» в строке статуса — [streaming.rs#L428-L471](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/chatwidget/streaming.rs#L428-L471);
  - полный текст размышления виден только в транскрипте — [messages.rs#L870-L885](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/history_cell/messages.rs#L870-L885);
  - протокол задаёт подробность сводок размышлений на ход: `summary = auto | concise | detailed | none` — [turn.rs#L283-L285](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/app-server-protocol/src/protocol/v2/turn.rs#L283-L285).
- **Claude Code** [док]:
  - Desktop: Normal / Thinking / Verbose на сессию, Ctrl+O — [desktop#switch-view-modes](https://code.claude.com/docs/en/desktop#switch-view-modes);
  - VS Code: Focus view «hides tool calls, tool results, and thinking behind expandable rows, leaving your prompts and Claude's responses», глобально, по умолчанию выключен — [vs-code#use-the-prompt-box](https://code.claude.com/docs/en/vs-code#use-the-prompt-box);
  - CLI: `viewMode` = default / verbose / focus — [settings-reference#viewmode](https://code.claude.com/docs/en/settings-reference#viewmode);
  - [форум] в Desktop отдельную группу в Verbose не свернуть ([#105281](https://github.com/anthropics/claude-code/issues/105281)); в Normal свёртка прячет и прозу агента между вызовами ([#90425](https://github.com/anthropics/claude-code/issues/90425)).
- **Сквозное наблюдение** [форум]. Одни просят меньше шума, другие — полной видимости для аудита: [#39903](https://github.com/openai/codex/issues/39903) против [#12482](https://github.com/openai/codex/issues/12482). Чаще всего просят держать видимыми команды и имена файлов, а вывод сворачивать: [#19891](https://github.com/openai/codex/issues/19891), [#37213](https://github.com/openai/codex/issues/37213), [#26107](https://github.com/openai/codex/issues/26107).

## 5. Действия над сообщением

- **Codex в ChatGPT desktop** [док]:
  - fork есть с 26.212 (2026-02-12) — [changelog](https://learn.chatgpt.com/docs/changelog#codex-2026-02-12-app); «fork a conversation from an earlier message, not just the latest turn» — с 26.317 (2026-03-18) — [changelog](https://learn.chatgpt.com/docs/changelog#codex-2026-03-18-app);
  - `/fork`: «Copy a local chat into a new local chat or worktree»; `/side`: «Start a temporary side chat without interrupting the main chat» — [reference/slash-commands](https://learn.chatgpt.com/docs/reference/slash-commands#available-slash-commands);
  - отмена правок — кнопка «Undo» на карточке изменений, а не на сообщении [док, по макету] (п. 1).
- **Codex desktop, что видят пользователи** [форум]:
  - иконка «Copy» у ответа «appears on hover» — [#10561](https://github.com/openai/codex/issues/10561) (2026-02-03);
  - просьба «Allow edit on any message, not just the last one» — [#18708](https://github.com/openai/codex/issues/18708).
- **Codex IDE** [форум]: по наведению на сообщение пользователя — «Copy», «Edit Message», «Fork Message». Edit и Fork временно пропадали — [#41796](https://github.com/openai/codex/issues/41796), [#42505](https://github.com/openai/codex/issues/42505).
- **Макеты Work** [док, по макету]: под ответом ряд значков без подписей, видимых без наведения ([вывод]: копировать, лайк, дизлайк, поделиться) — [use-chatgpt](https://learn.chatgpt.com/docs/use-chatgpt#what-chatgpt-work-can-do).
- **Codex CLI** [код]:
  - Esc Esc — выбрать свою реплику и откатиться к ней (`thread/revert`, «It doesn't revert local file changes» [док] app-server) — [app_backtrack.rs#L1-L22](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/app_backtrack.rs#L1-L22);
  - `/copy` («copy the last response or part of it»), `/fork` («fork the current chat») — [slash_command.rs#L107-L111](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/slash_command.rs#L107-L111);
  - общей команды, клавиши или метода протокола «повторить ответ» в коде нет (искали `Retry`, `Regenerate`, `Try again`).
  - Исключение [док]: CLI 0.145.0 — «Editing an earlier prompt or retrying a safety-buffered turn now creates a contextual branch» — [changelog](https://learn.chatgpt.com/docs/changelog#github-release-357545274). Повтор есть только у хода, задержанного проверкой безопасности.
- **Claude Code VS Code** [док]:
  - «Hover over any message to reveal the rewind button»: «Fork conversation from here», «Rewind code to here», «Fork conversation and rewind code» — [vs-code#rewind-with-checkpoints](https://code.claude.com/docs/en/vs-code#rewind-with-checkpoints);
  - по наведению на ответ: «Copy response», «Bookmark response» — [vs-code#use-the-prompt-box](https://code.claude.com/docs/en/vs-code#use-the-prompt-box);
  - Retry и Edit набранного сообщения существуют как минимум в облачных сессиях вкладки Web: «Retry or Edit of a typed prompt» — [CL v2.1.319](https://code.claude.com/docs/en/changelog#2-1-319). На странице VS Code они не описаны.
- **Claude Code Desktop** [форум]:
  - «Copy» и рядом «Rewind to here», откат без подтверждения — [#99611](https://github.com/anthropics/claude-code/issues/99611), [#106904](https://github.com/anthropics/claude-code/issues/106904);
  - правка сообщения реализована как откат с форком — [#108942](https://github.com/anthropics/claude-code/issues/108942);
  - побочный чат `Cmd+;` / `/btw` [док] — [desktop#ask-a-side-question-without-derailing-the-session](https://code.claude.com/docs/en/desktop#ask-a-side-question-without-derailing-the-session).
- **Claude Code CLI** [док]: меню `/rewind` — «Restore code and conversation», «Restore conversation», «Restore code», «Summarize from here» — [checkpointing#rewind-and-summarize](https://code.claude.com/docs/en/checkpointing#rewind-and-summarize).

## 6. Прогресс во время работы: план, текущий шаг, остановка, ошибки

- **Codex в ChatGPT desktop** [док]:
  - Steer или Queue: «**Steer** adds the message to the current run.», «**Queue** saves the message for the next run.»; выбор по умолчанию в «Settings > General > Follow-up behavior»; «Queued messages appear above the composer, where you can edit, reorder, send, or delete them» — [prompting#steering-and-queuing](https://learn.chatgpt.com/docs/prompting#steering-and-queuing);
  - 26.1023 (2026-10-27): «keeps the interrupted reply above your message and shows the revised reply below it» — [changelog](https://learn.chatgpt.com/docs/changelog#codex-2026-10-27-app);
  - патч 8 ноября: «made the Send, Queue, and Steer buttons appear dimmed when they're unavailable» — [changelog](https://learn.chatgpt.com/docs/changelog#codex-2026-11-05-app);
  - строка цели: «When a goal is active, the app shows its progress above the composer», кнопки pause/resume, edit, clear — [reference/slash-commands#set-or-manage-a-goal-with-goal](https://learn.chatgpt.com/docs/reference/slash-commands#set-or-manage-a-goal-with-goal). На макете — «Paused goal», «10h 9m», квадратная кнопка стоп на месте «Отправить» [док, по макету];
  - план — в боковой панели: «It can surface the agent's plan, sources, generated files, and chat summary» — [artifacts-viewer?surface=app#review-and-refine-files](https://learn.chatgpt.com/docs/artifacts-viewer?surface=app#review-and-refine-files);
  - статусы чатов: «Running», «Needs input», «Ready», «Blocked» («A chat failed or encountered a system error»), приоритет показа «need input, followed by blocked, ready, and running» — [pets#understand-pet-status](https://learn.chatgpt.com/docs/pets?surface=app#understand-pet-status); Activity view с 26.727 — [changelog](https://learn.chatgpt.com/docs/changelog#codex-2026-07-30-app);
  - ошибки:
    - 26.313 «resume and thread error toasts with clearer details» — [changelog](https://learn.chatgpt.com/docs/changelog#codex-2026-03-16-app);
    - 26.609 «usage-limit errors with inline plan and workspace guidance, including reset timing» — [changelog](https://learn.chatgpt.com/docs/changelog#codex-2026-06-11-app);
    - после сбоя «Resume» или «Keep paused» (26.1027) — [changelog](https://learn.chatgpt.com/docs/changelog#codex-2026-10-29-app);
    - как ошибка выглядит в самой ленте, документация не показывает.
- **Codex desktop, что видят пользователи** [форум]:
  - «Working for 5h 23m 7s», «Step 1 / 3» и нет кнопки Stop — [#53838](https://github.com/openai/codex/issues/53838);
  - «I cannot tell whether Codex is still reasoning, waiting for a command, experiencing a connection issue, or stalled» — [#58006](https://github.com/openai/codex/issues/58006);
  - todo обновляется только в конце — [#42179](https://github.com/openai/codex/issues/42179);
  - пропал индикатор контекста, 253 реакции — [#23794](https://github.com/openai/codex/issues/23794).
- **Codex CLI** [код]:
  - строка статуса `• Working (0s • esc to interrupt)` — [status_indicator_widget.rs#L255-L263](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/status_indicator_widget.rs#L255-L263);
  - план «• Updated Plan»: ✔ — выполнено (зачёркнуто), □ жирным — в работе, □ тускло — ожидает; компактно «Updated Plan · 1/4 complete» — [plans.rs#L264-L370](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/history_cell/plans.rs#L264-L370);
  - Enter — steer, Tab — в очередь; блок «Messages to be submitted after next tool call (press esc to interrupt and send immediately)» — [pending_input_preview.rs#L14-L31](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/bottom_pane/pending_input_preview.rs#L14-L31);
  - прерывание: «■ Conversation interrupted - use /feedback if something went wrong» — [notices.rs#L347-L361](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/history_cell/notices.rs#L347-L361);
  - временная ошибка с повтором пишется в строку статуса («Server is busy, reconnecting…»), окончательная — красной строкой `■ <message>` в ленте — [turn_runtime.rs#L413-L425](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/chatwidget/turn_runtime.rs#L413-L425);
  - протокол:
    - `turn/plan/updated` (`pending | inProgress | completed`) — [turn.rs#L637-L660](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/app-server-protocol/src/protocol/v2/turn.rs#L637-L660);
    - `turn/interrupt` — [turn.rs#L368-L371](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/app-server-protocol/src/protocol/v2/turn.rs#L368-L371);
    - `turn/steer` — [turn.rs#L328-L363](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/app-server-protocol/src/protocol/v2/turn.rs#L328-L363);
    - `error {willRetry, codexErrorInfo}` — [notification.rs#L62-L69](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/app-server-protocol/src/protocol/v2/notification.rs#L62-L69), с типами `usageLimitExceeded`, `contextWindowExceeded`, `serverOverloaded`… — [shared.rs#L76-L132](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/app-server-protocol/src/protocol/v2/shared.rs#L76-L132).
- **Claude Code Desktop** [док]:
  - «click the stop button to interrupt immediately, or type a correction and press **Enter** to send it without stopping the running action. Claude reads the correction as soon as the current action completes» — [desktop#use-the-prompt-box](https://code.claude.com/docs/en/desktop#use-the-prompt-box);
  - панели «Plan» и «Background tasks» — [desktop#watch-background-tasks](https://code.claude.com/docs/en/desktop#watch-background-tasks);
  - ошибки в чате: «`API Error: 500`, `529 Overloaded`, `429`, or `Prompt is too long`» — [desktop#troubleshooting](https://code.claude.com/docs/en/desktop#troubleshooting).
- **Claude Code Desktop, что видят пользователи** [форум]: список задач под последним сообщением — галочка, пунктирный кружок, кольцо-спиннер — [#106895](https://github.com/anthropics/claude-code/issues/106895); при работе — спиннер и счётчик «11m 43s · 5.2k tokens» — [#98720](https://github.com/anthropics/claude-code/issues/98720).
- **Claude Code VS Code** [док]:
  - Stop/Esc завершает ход, фоновые агенты продолжают — [vs-code#use-the-prompt-box](https://code.claude.com/docs/en/vs-code#use-the-prompt-box);
  - сообщение во время работы: «the extension announces "Message queued."» — [vs-code#use-a-screen-reader](https://code.claude.com/docs/en/vs-code#use-a-screen-reader);
  - «Claude's latest to-do list stays visible» даже в Focus view — [vs-code#extension-settings](https://code.claude.com/docs/en/vs-code#extension-settings);
  - [CL v2.1.83](https://code.claude.com/docs/en/changelog#2-1-83): спиннер «turns red with "Not responding"» через 60 с без ответа сервера.
- **Claude Code CLI** [док]: во время повторов «Retrying in Ns · attempt x/y»; сообщения в очереди серые, пока Claude их не взял — [errors](https://code.claude.com/docs/en/errors#what-you-see-while-claude-code-retries-or-waits), [interactive-mode#queue-messages-while-claude-works](https://code.claude.com/docs/en/interactive-mode#queue-messages-while-claude-works).

---

## Закономерности, общие для Codex, ChatGPT и Claude, — что стоит взять

Каждый пункт ниже подтверждён минимум на двух продуктах разных поставщиков. На каких именно, сказано в скобках; ссылки — в разделах 1–6.

1. **Завершённая работа свёрнута в сводку, ответ всегда виден.** Строка «Worked for 2m 30s» или группа по типу действия («Ran 2 commands», «Explored», «Edited 3 files»). Пока шаг идёт, глагол в настоящем времени, после — в прошедшем; раскрытие щелчком на месте.
   - Где: макеты Codex/ChatGPT desktop и IDE [док, по макету], Codex CLI [код], Claude Desktop в режиме Normal [док].
   - Предостережение: OpenAI откатил свёртку в CLI после жалоб ([#39903](https://github.com/openai/codex/issues/39903), 83 реакции). Пользователи Claude Desktop жалуются, что свёртка прячет прозу агента ([#90425](https://github.com/anthropics/claude-code/issues/90425)).
   - [вывод] Для Loginom: в свёрнутой строке называть объекты («изменён узел „Фильтр“, проверен пакет X»), а не только счётчик.
2. **Изменения — отдельная карточка результата.** Счётчик +X −Y, строка на объект, действия «Undo» и «Review».
   - Где: OpenAI IDE и desktop [док, по макету], Claude Desktop «Edited N files» [форум] и `+12 -1` с переходом в diff [док].
   - [вывод] Аналог в Loginom: карточка «изменено N узлов / связей» с действиями «Открыть в сценарии» и «Отменить».
3. **Approval — блокирующая форма, отдельная от текста ленты.** В ней описано действие: команда, хост, файл, параметры, причина. Варианты: один раз / всегда, с названной областью (сессия, проект, хост) / отклонить / «сказать, что делать вместо».
   - Где: Codex CLI [код], Claude VS Code и CLI [док, по скриншоту], Claude Desktop [док], Codex desktop [форум].
   - Отказ с объяснением ценят: его исчезновение в Codex desktop вызвало жалобу [#32116](https://github.com/openai/codex/issues/32116).
   - Место различается: вместо поля ввода (Codex CLI, Claude VS Code) или в ленте (Claude Desktop [форум]); для Codex/ChatGPT desktop не документировано. [вывод] Для Loginom безопаснее держать запрос у поля ввода и дублировать его статусом «Нужно ваше решение» в списке чатов. Ожидание дублируется статусом чата и в Codex desktop («Needs input») [док], и в Claude Desktop («Needs your input») [форум].
   - Строку-след решения в ленте («✔ You approved … this time») ставит Codex CLI [код]; для других поверхностей не подтверждено. [вывод] Для аудита прав в Loginom её стоит взять.
4. **Вопрос агента — структурированная форма.** Заголовок, 2–4 варианта с описанием, свой ответ («Other» или «None of the above» + заметка); поле ввода занято вопросом; ответ остаётся в ленте.
   - Где: Codex CLI и протокол [код], Claude `AskUserQuestion` [док], VS Code «Questions» после ответа [док].
   - Не закрывать вопрос по таймеру: самая заметная жалоба у OpenAI ([#28969](https://github.com/openai/codex/issues/28969), 226 реакций). В Claude Desktop таймаут вопроса не действует [док].
5. **Подробность — настройка пользователя на уровне ленты, 2–3 ступени**, а не решение агента: Normal / Thinking / Verbose (Claude Desktop), Focus view (Claude VS Code), Collapse turn details (Codex CLI), режимы Work и Codex (ChatGPT desktop) [док].
   - Детали всегда достижимы: раскрытие на месте или полный транскрипт (Ctrl+O, Ctrl+T).
   - Размышления показаны свёрнутой меткой «Thought for Ns» в Claude VS Code [док] и в ChatGPT Chat [форум]; в Codex CLI — заголовком в строке статуса [код].
6. **Во время работы:**
   - строка статуса с текущим шагом и временем (Codex CLI [код], Claude [форум]);
   - план с тремя состояниями шага (выполнено / в работе / ожидает) у поля ввода или в боковой панели (Codex CLI и протокол [код], Codex desktop — в боковой панели [док], Claude Desktop [форум]);
   - стоп одной кнопкой;
   - сообщение на ходу: Steer или Queue, очередь видна над полем ввода и редактируется (Codex desktop [док]); в Claude Desktop поправка доходит после текущего действия [док];
   - различимые состояния чата — работает / ждёт вас / ошибка / готово (Codex desktop [док]). Пользователи прямо просят отличать «думает» от «завис» ([#58006](https://github.com/openai/codex/issues/58006)).
7. **Действия над сообщением.**
   - На ответе — «Копировать»: по наведению в Codex app [форум] и Claude VS Code [док]; на макетах Work значки видны без наведения [док, по макету].
   - На своём сообщении — «Изменить» и «Ответвить отсюда», fork сохраняет исходную ветку (Codex desktop [док], Codex IDE [форум], Claude VS Code [док]).
   - Откат разговора отделён от отката изменений: Codex `thread/revert` файлы не трогает [док]; в Claude VS Code «Rewind code» — отдельный пункт [док].
   - Общего «Повторить ответ» в Codex не найдено. Есть только повтор хода, задержанного проверкой безопасности (CLI 0.145.0), и Retry/Edit в облачных сессиях Claude ([CL v2.1.319](https://code.claude.com/docs/en/changelog#2-1-319)).

## Неизвестно / не удалось проверить

- **Codex/ChatGPT desktop, место запроса на команду и правку.** Где появляется (в ленте или над полем ввода) и с какими точными текущими подписями, официально не описано. Есть только Enter/Esc, «once or for the session», карточка Computer Use, мобильная карточка и issues.
- **Desktop-строки OpenAI.** «Worked for …» подтверждено только HTML-макетами документации (не снимками) и issues. «Thought for …» для Codex-desktop не найдено.
- **ChatGPT desktop Chat** почти не описан. Release notes на help.openai.com отдают 403; поиск не дал подписей ленты.
- **Наведение.** Появляются ли действия по наведению в ChatGPT desktop (Chat, Work) и в Claude Desktop, не установлено. Для Claude VS Code это документировано, для Codex IDE и Codex app — только по [форум].
- **Ошибки в ленте OpenAI desktop.** Как выглядят (баннер, карточка, кнопка «Retry»), не документировано.
- **Одобрение вызова MCP-инструмента.** Страница app-server говорит про `requestUserInput` (Accept / Decline / Cancel), код CLI — про `mcpServer/elicitation/request` («Allow / Allow for this session / Always allow / Cancel»). Что видит desktop, неизвестно.
- **Claude Desktop.** В документации нет ни одного скриншота ленты. Место карточек известно по issues, и оно менялось (вопрос: над полем ввода → в ленте, сентябрь–октябрь 2026).
- **JetBrains.** Есть ли у Claude Code графическая панель: документация описывает CLI в терминале, а changelog пишет «VS Code and JetBrains panels».
- **Возраст скриншотов.** Подписи на скриншотах Claude VS Code, вероятно, старше CL v2.1.0.

## Выборочная проверка ссылок (17.11.2026)

1. [changelog#codex-2026-10-27-app](https://learn.chatgpt.com/docs/changelog#codex-2026-10-27-app) и [#codex-2026-11-05-app](https://learn.chatgpt.com/docs/changelog#codex-2026-11-05-app). Якоря есть в HTML, тексты «keeps the interrupted reply above your message…» и «Send, Queue, and Steer buttons appear dimmed…» совпадают.
2. [openai/codex#37184](https://github.com/openai/codex/issues/37184). В теле issue есть «Allow ChatGPT to use GitHub?» и «Always allow | Deny | Allow once».
3. [code.claude.com/docs/en/desktop#switch-view-modes](https://code.claude.com/docs/en/desktop#switch-view-modes). Таблица Normal / Thinking / Verbose дословно совпадает.
4. [approval_overlay.rs#L873-L960](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/bottom_pane/approval_overlay.rs#L873-L960) на raw.githubusercontent.com. Подписи «Yes, proceed», «No, continue without running it», «No, and tell Codex what to do differently» на месте. В [bottom_pane/mod.rs#L1-L6](https://github.com/openai/codex/blob/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs/tui/src/bottom_pane/mod.rs#L1-L6) — «views … that temporarily replace the composer».
5. [changelog#codex-2026-07-09-app](https://learn.chatgpt.com/docs/changelog#codex-2026-07-09-app). Есть «Codex is now part of the ChatGPT desktop app on macOS and Windows».

## Источники

**OpenAI, официальные.** Прочитано 17.11.2026; Markdown-версия страницы — суффикс `.md`.
- https://learn.chatgpt.com/docs/app, /use-chatgpt, /get-started-with-work, /working-with-agents, /long-running-work
- https://learn.chatgpt.com/docs/permission-modes, /sandboxing, /sandboxing/auto-review, /agent-approvals-security, /computer-use, /mobile
- https://learn.chatgpt.com/docs/codex/ide, /developer-commands, /developer-settings, /reference/commands, /reference/slash-commands, /reference/settings, /reference/troubleshooting
- https://learn.chatgpt.com/docs/prompting, /artifacts-viewer, /browser, /web-search, /notifications, /pets, /features/codex-micro, /agent-configuration/subagents, /models
- https://learn.chatgpt.com/docs/changelog (HTML; 206 записей, 2025-05-19…2026-11-17), https://learn.chatgpt.com/docs/whats-new.md и подстраницы
- https://learn.chatgpt.com/docs/app-server.md
- help.openai.com (release notes ChatGPT, macOS app, Windows app, Business): 403, только по выдержке, новых фактов нет.

**Исходники.** https://github.com/openai/codex/tree/8011b92bc82d4cc1b6dc3f35c0cd28768c797c97/codex-rs: `tui/src/**` (снимки `*.snap`), `app-server-protocol/src/protocol/**`, `protocol/src/**`, `config/src/types.rs`.

**Anthropic, официальные.** Прочитано 17.11.2026.
- https://code.claude.com/docs/en/desktop, /desktop-quickstart, /vs-code, /jetbrains
- https://code.claude.com/docs/en/interactive-mode, /permissions, /permission-modes, /checkpointing, /tools-reference, /settings-reference, /errors
- https://code.claude.com/docs/en/plugins/mods/reference, /plugins/mods/interface, /agent-sdk/user-input
- https://code.claude.com/docs/en/changelog (до 2.1.326, 16.11.2026)

**Наблюдения [форум].** Полные списки с датами, версиями и числом реакций — в заметках.
- GitHub openai/codex: #10561, #10723, #12304, #16415, #18708, #19891, #23794, #28969, #30150, #30353, #31651, #32116, #37184, #37213, #39903, #41796, #42179, #42505, #43759, #47494, #48930, #52403, #53838, #56226, #58006, #60139, #61693 и др.
- community.openai.com: темы 1411296, 1404680, 1400676, 1377757 и др.
- GitHub anthropics/claude-code: #90425, #96497, #98720, #99338, #99611, #99762, #101820, #102136, #102432, #103281, #104426, #105281, #106895, #106904, #108064, #108942 и др.

## OpenCode 2.3.0 — как показан разговор (прочитано в коде, тег v2.3.0 в этом репозитории)

Пути — от корня репозитория по тегу `v2.3.0` (`git show v2.3.0:<путь>`). Метка всех строк — [код].
- Ход = сообщения Assistant (один шаг каждое), content: text / reasoning / tool{state: streaming|running|completed|error}; конец хода — Idle{succeeded|failed|interrupted}. SM = packages/schema/src/session-message.ts:171-299.
- reasoning: свёрнутая строка «Thinking…» → «Thought · 12s» (session-ui/src/message/message-content.tsx:1276).
- Инструменты группируются: «Used {count} {tools}» (tools/tool-renderer.tsx:422). Ошибка инструмента — карточка «Failed» + «Copy error», показывается раскрытой даже если скрыта.
- ToolRegistry.register({name, render}) — tool-renderer.tsx:1162-1184; ToolProps:1136; не экспортирован из session-ui → свой отрисовщик = правка upstream.
- Разрешение: док ВМЕСТО поля ввода (session-permission-dock.tsx:52-99): «Permission required», Deny / Allow always / Allow once; описание действия, message, аргументы key: value, resources.
- Вопрос: форма (schema/form.ts) string/number/boolean/multiselect, варианты {value,label,description}, свой ответ; док вместо поля ввода: «Question», «N of M», «Type your own answer…», Dismiss/Back/Next/Submit; в ленте после — «Questions · N answered».
- Режимы: пресеты everything/detailed/compact/quiet/text-only (session-ui/src/timeline/detail.ts:24-72), по умолчанию compact (shell/edit/thinking/tools свёрнуты в группы).
- Итог хода: футер — агент, модель, длительность, Interrupted, tok/s, «Copy response» (message-content.tsx:1200-1260). Эксп.: «Worked {duration}».
- Действия: у сообщения пользователя по наведению — Copy, Fork from here, Revert to here/Undo; у ответа — Copy response. «Повторить/редактировать» нет.
- Стоп: «Stop» вместо «Send» (composer/editor/editor.tsx:541). Прерывание — разделитель «Interrupted». Ошибка хода — красная карточка; retry — «Attempt N - retrying in Ns».
- Прогресс: строка «Working» под лентой; todo-плашка над полем ввода «{done} of {count} todos done» (region.tsx:474-594).
