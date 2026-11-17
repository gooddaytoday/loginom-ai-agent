# Исследование: интерфейс, который раскрывается по мере нужды

Дата: 17.11.2026. Повод — видение владельца (decisions.md, «Видение интерфейса агента»): при первом запуске
интерфейс не перегружен и учит работе с собой без обзорного тура; элементы появляются, когда пользователь наводит
мышь или собирается выполнить действие; интерфейс работает быстро. Источники открыты 16–17.11.2026; интерфейсы
продуктов меняются, поэтому факты о них верны на эту дату.

Метки: **[И]** — эксперимент или измерение; **[З]** — заявлено в руководстве или документации; **[В]** — наш вывод.

## Коротко

Обзорные туры почти не помогают: в эксперименте NN/g успешность у читавших и пропустивших тур одинакова, а
читавшие сочли задачи труднее. Руководства Apple, Microsoft и Material советуют короткие подсказки в момент нужды —
по одной, не при запуске, не тем, кто функцией уже пользовался. Элементы, которые появляются после действия
пользователя, работают хорошо; интерфейс, который сам перестраивается по статистике, теряет доверие (меню Office
2000 выключили). По наведению можно прятать только второстепенное, и оно должно открываться с клавиатуры. Цена
урезанного старта — пользователь хуже знает о продвинутых функциях, поэтому вход к ним должен быть виден всегда.

## 1. Раскрытие по мере нужды, без тура

- [И] Туториал-карточки в мобильных приложениях: успешность 91% у читавших и 94% у пропустивших (различие
  незначимо), читавшие оценили задачи как более трудные. — [NN/g, 2020](https://www.nngroup.com/articles/mobile-tutorials/)
- [И] 45 000 игроков: туториалы и подсказки «ближе к моменту, когда они нужны» помогли только в самой сложной
  игре. — [Andersen et al., CHI 2012](https://grail.cs.washington.edu/projects/game-abtesting/chi2012/chi2012.pdf)
- [З] Учить через действие, набором контекстных советов вместо одного вводного потока; совет не показывать тем, кто
  функцией пользовался, не чаще раза в сутки. — [Apple HIG, Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding),
  [Offering help](https://developer.apple.com/design/human-interface-guidelines/offering-help)
- [З] Подсказку о функции показывать, когда она к месту («crop — после того, как добавили картинку»), не больше
  одной за сеанс. — [Material, Feature discovery (архив)](https://m2.material.io/archive/guidelines/growth-communications/feature-discovery.html)
- [З] Пустое состояние — место для объяснения и прямой кнопки к задаче. — [NN/g, 2021](https://www.nngroup.com/articles/empty-state-interface-design/)
- [З] Больше двух уровней раскрытия — люди теряются; часто нужное держать видимым. — [NN/g, Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
- [И] Урезанный стартовый интерфейс: базовое находят быстрее, но о продвинутых функциях знают меньше (3,1 против
  7,1 из 20 на тесте припоминания). — [Findlater & McGrenere, 2007](https://www.cs.ubc.ca/labs/edapt/papers/findlater2007.pdf)
- [И] Самоподстраивающиеся меню Word 2000: 13 из 20 предпочли меню, которое настраивают сами; 7 из 20 не
  заметили, что меню меняется. — [McGrenere et al., CHI 2002](https://www.dgp.toronto.edu/public_user/RMB/papers/p28.pdf);
  в Office 2007 такие меню выключены по умолчанию — [Microsoft, 2006](https://learn.microsoft.com/en-us/archive/blogs/jensenh/the-end-of-personalized-menus)
- [И] Менять можно момент появления, но не место: пункты, которые проявляются позже, но стоят на своих местах,
  не замедляют работу. — [Findlater et al., CHI 2009](https://www.cs.ubc.ca/labs/edapt/papers/findlater2009.pdf)
- [З] Содержимое по наведению: важное для задачи не прятать; открывать и с клавиатуры; можно закрыть, можно
  навести на него курсор, само не пропадает. — [NN/g, Tooltips](https://www.nngroup.com/articles/tooltip-guidelines/),
  [WCAG 1.4.13](https://www.w3.org/WAI/WCAG21/Understanding/content-on-hover-or-focus.html)
- [И] Скрытая навигация на десктопе: ею пользуются в 27% случаев против 48% у видимой, работа минимум на 39%
  медленнее. — [NN/g, 2016](https://www.nngroup.com/articles/hamburger-menus/)
- [З] Примеры: Notion показывает «+» и «⋮⋮» у блока при наведении — [Notion](https://www.notion.com/help/writing-and-editing-basics);
  VS Code показывает действия панели при наведении и даёт настройку «показывать всегда» —
  [исходник](https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/workbench/browser/workbench.contribution.ts);
  Figma показывает свойства, когда выделен слой — [Figma](https://help.figma.com/hc/en-us/articles/360039832014-Design-prototype-and-explore-layer-properties-in-the-right-sidebar).

## 2. Оболочка AI-приложений

- [З] Левая панель — список работы (проекты, закреплённое, недавние разговоры, задачи агента со статусом), а не
  меню функций: ChatGPT, Claude, Cursor, VS Code, Gemini. — [ChatGPT](https://learn.chatgpt.com/docs/projects),
  [Cursor](https://cursor.com/docs/release-notes), [VS Code](https://code.visualstudio.com/docs/agents/run/agents-window),
  [Gemini](https://support.google.com/gemini/answer/13666746?hl=en)
- [З] Свернуть панель — Ctrl/Cmd+B в ChatGPT, Claude Desktop и VS Code; у Claude ещё кнопка вверху панели. Cursor
  отказался от раскрытия наведением в пользу кнопки. — [ChatGPT](https://learn.chatgpt.com/docs/reference/commands),
  [Claude](https://claude.com/docs/cowork/changelog), [Cursor](https://cursor.com/docs/release-notes)
- [З] Модель видна и меняется в поле ввода, рядом с кнопкой отправки: Claude, ChatGPT, VS Code, Gemini. —
  [Claude](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings),
  [VS Code](https://code.visualstudio.com/docs/agent-customization/language-models),
  [Gemini](https://support.google.com/gemini/answer/18648722?hl=en)
- [З] Подключения настраиваются на отдельном экране, а в разговоре включаются через «+» или `@`. Постоянного
  индикатора связи нет: сбой показывают по событию — уведомлением, точкой, сообщением. —
  [Claude](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities),
  [Gemini](https://support.google.com/gemini/answer/13695044?hl=en), [ChatGPT](https://learn.chatgpt.com/docs/extend/mcp)
- [З] «Агент работает» — в самом разговоре, меткой у разговора в панели (идёт / ждёт ответа / ошибка) и общим
  счётчиком. — [ChatGPT](https://learn.chatgpt.com/docs/notifications), [VS Code](https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions)
- [З] Настройки и профиль — внизу левой панели; тема — в настройках (светлая / тёмная / как в системе). —
  [Claude](https://support.claude.com/en/articles/8887527-customizing-your-appearance-settings),
  [Gemini](https://support.google.com/gemini/answer/13542227?hl=en)

## 3. Примеры задач и подсказка в поле ввода

- [З] Показывать примеры запросов — способ объяснить, что умеет система; отбирать разнообразные и выполнимые. Риск:
  система плохо отвечает на собственный пример или обещает больше, чем умеет. —
  [Microsoft HAX G1](https://www.microsoft.com/en-us/haxtoolkit/pattern/g1-d-demonstrate-possible-system-inputs/),
  [Apple HIG, Generative AI](https://developer.apple.com/design/human-interface-guidelines/generative-ai)
- [З] 3–6 примеров; не везде; убирать те, которыми не пользуются; в сосредоточенной работе пустое поле лучше. —
  [Shape of AI, Suggestions](https://www.shapeof.ai/patterns/suggestions)
- [З] Примеры нужны прежде всего новичкам; их легко закрыть и они не бросаются в глаза; карточки подходят
  специализированному инструменту. — [NN/g, 2025](https://www.nngroup.com/articles/designing-use-case-prompt-suggestions/)
- [З] Когда исчезают: Microsoft Teams — после первого сообщения, дальше доступны через меню над полем ввода;
  пример вставляется в поле, а не отправляется. — [Microsoft Learn](https://learn.microsoft.com/en-us/microsoftteams/platform/bots/how-to/conversations/prompt-starters).
  Claude Code показывает подсказки реже, если ими раз за разом не пользуются. — [Claude Code](https://code.claude.com/docs/en/interactive-mode.md).
  Slackbot перешёл от одинаковых для всех примеров к подсказкам по работе пользователя. —
  [Salesforce, 2026](https://www.salesforce.com/blog/?p=145224). Правила «скрыть после N раз» нет ни в одном
  руководстве [В].
- [З] Подсказка в поле ввода — короткая фраза, предлагающая действие; не заменяет подпись (экранные чтецы её не
  читают); без точки в конце. — [HTML](https://html.spec.whatwg.org/multipage/input.html#the-placeholder-attribute),
  [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/placeholder),
  [Cloudscape](https://cloudscape.design/gen-ai/patterns/generative-ai-chat/). Сменяющиеся по кругу подсказки
  попадают под WCAG 2.2.2 и экранным чтецом не слышны [В] — [WCAG 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html).

## 4. Скорость

- [З] 0,1 с — отклик ощущается мгновенным, 1 с — мысль не прерывается, 10 с — предел внимания. —
  [NN/g, Response times](https://www.nngroup.com/articles/response-times-3-important-limits/)
- [З] Реакция на действие — до 100 мс, кадр анимации — до 10 мс; задача в главном потоке длиннее 50 мс блокирует
  ввод. — [web.dev, RAIL](https://web.dev/articles/rail), [Long tasks](https://web.dev/articles/optimize-long-tasks)
- [З] «Хорошо» для реальных пользователей (75-й перцентиль): INP (от нажатия до следующего кадра) ≤200 мс, CLS
  (сдвиги раскладки) ≤0,1. — [web.dev, INP](https://web.dev/articles/inp), [CLS](https://web.dev/articles/cls).
  Это метрики веб-страниц; переносить их на окно Electron — наш выбор [В].
- [З] Индикатор ожидания: короче 1 с — не показывать; 2–10 с — скелетон или спиннер; дольше 10 с — прогресс. —
  [NN/g, Progress indicators](https://www.nngroup.com/articles/progress-indicators/),
  [Cloudscape, загрузка в AI-чате](https://cloudscape.design/patterns/genai/genai-loading-states/)
- [З] Скрытое по наведению: отклик за 0,1 с, показ после паузы курсора 0,3–0,5 с (иначе случайные срабатывания),
  скрытие через 0,5 с после ухода. — [NN/g, Timing](https://www.nngroup.com/articles/timing-exposing-content/)
- [З] Анимации короткие; уход короче появления; анимировать только `transform` и `opacity`; движение можно
  отключить. — [Material 3](https://m3.material.io/styles/motion/easing-and-duration/applying-easing-and-duration),
  [Windows](https://learn.microsoft.com/en-us/windows/apps/design/motion/timing-and-easing),
  [Apple HIG, Motion](https://developer.apple.com/design/human-interface-guidelines/motion),
  [web.dev, Animations](https://web.dev/articles/animations-guide)
- [З] Сдвиги раскладки: резервировать место заранее, показывать новое поверх, а не вставлять в поток. —
  [web.dev, Optimize CLS](https://web.dev/articles/optimize-cls)
- [З] Потоковый вывод заметно улучшает ощущение отзывчивости. — [Anthropic, Reducing latency](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency).
  Порога «время до первого токена» в первичных источниках нет.
- [З] Electron числовой цели запуска не даёт: измерять, грузить код по мере нужды, не блокировать главный процесс,
  показывать окно по `ready-to-show`. — [Electron, Performance](https://www.electronjs.org/docs/latest/tutorial/performance)
- [З] «Порог Доэрти 400 мс» в первоисточнике (IBM, 1982) не найден: там только «меньше секунды». —
  [IBM, архив](https://web.archive.org/web/20110101110316/http://www.vm.ibm.com/devpages/jelliott/evrrt.html)

Предложение [В]: цель — видимая реакция на действие ≤100 мс; приёмка — INP ≤200 мс и CLS ≤0,1 на замерах в
установленной сборке; появление 150–250 мс, уход 100–200 мс; индикатор «агент думает» — только если ответа нет
дольше ~1 с, с текстом стадии; время запуска — замерить на 0.4 и задать цель по замеру.

## 5. Что из этого следует для Loginom AI Agent [В]

1. Видно всегда: поле ввода, «Новый разговор», настройки, тема. Остальное появляется **после действия
   пользователя** и потом не исчезает и не переезжает.
2. По наведению — только второстепенное (действия над сообщением, «свернуть» у блока), с тем же доступом с
   клавиатуры.
3. Вход к тому, что скрыто, виден всегда в одном месте — меню «+» у поля ввода; это снимает риск «не знают, что
   есть».
4. Подсказки о функции — по одной, в момент нужды, не при запуске, закрываются и больше не возвращаются.
5. Ничего не перестраивать по статистике использования.

## 6. Что не удалось проверить

- Вид панели у нового пользователя и вид свёрнутой панели в ChatGPT, Claude, Gemini официально не описан.
- Нет исследования, которое сравнивало бы «элементы по наведению» и «всегда видимые» в рабочем десктопном
  приложении; нет данных о турах и coach marks на десктопе.
- Стартовые экраны Claude.ai, Gemini, Perplexity, Cursor официально не описаны (только обзоры).

Рабочие заметки исследователей с полным списком источников не сохранены в репозитории; ключевые ссылки — выше.
