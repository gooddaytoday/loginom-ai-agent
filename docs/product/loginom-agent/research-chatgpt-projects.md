# Как в ChatGPT организованы проекты и чаты

Собрано 17.11.2026 для решения В-16. Версии: desktop-приложение ChatGPT после слияния с Codex (июль 2026)
и обновления панели 26.924 (сентябрь 2026); веб — по справке на ту же дату. Справка help.openai.com из этой
среды не открывается (HTTP 403), поэтому её содержание взято из выдержек поисковой выдачи. Это слабее, чем
чтение страницы.

Метки: **[справка]** — официальная справка или release notes OpenAI (по выдержкам); **[learn]** — страница
learn.chatgpt.com, прочитана; **[форум]** — сообщения пользователей community.openai.com или GitHub, не
официально; **[вывод]** — моё заключение.

## Панель

- Закреплять можно и чаты, и проекты; раздел «Pinned» содержит и те и другие (веб, 18.06.2026) [справка]
  ([release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes)).
- «Recents» можно показывать одним списком или группировать по проектам (веб, 18.06.2026) [справка] (там же).
- Desktop, 16.07.2026: чаты Chat и Work — в общем «Recents», их можно сортировать, фильтровать и закреплять;
  Codex — отдельный вид со своей историей [справка]
  ([ChatGPT Work and Codex](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex)).
- Desktop 26.924 (Windows, 27.09.2026): чаты проектов видны в общем списке недавних; скрыть их можно в
  «Organize sidebar → Show → Projects». Сортировка: «Last updated» или «Manual order». При наведении на
  заголовок «Projects» появляются свернуть/развернуть, «…» и создание проекта. Меню проекта: «Pin project»,
  «Project settings», «Section», «Delete project» [форум]
  ([тред 1401386](https://community.openai.com/t/chatgpt-desktop-26-924-sidebar-redesign-some-missing-features-are-still-there-just-moved/1401386)).
- **Опровергнуто владельцем по самому приложению (скриншот Codex desktop, 17.11.2026):** разговоры проекта
  лежат в панели внутри папки проекта; папки раскрываются, у открытой — значок открытой папки. Строки ниже о
  «Recents» описывают отдельные сборки и сообщения с форума — для прототипа эталон скриншот.
- Чаты проекта под проектом в панели не вкладываются; в недавних они без указания проекта, и пользователи на это
  жалуются [форум, опровергнуто для Codex desktop — см. выше] ([тред 1387183](https://community.openai.com/t/macos-web-project-hierarchy-missing-in-the-desktop-app-while-hidden-work-chats-remain-partially-discoverable-via/1387183),
  [тред 1396709](https://community.openai.com/t/windows-desktop-26-903-61454-chats-created-inside-a-local-project-appear-in-recents-but-not-under-the-project/1396709)).
- Что видно в свёрнутой панели и полный порядок разделов — не нашёл.

## Проект

- Создание: «New project» в панели → название, значок и цвет; память — «Default» или «Project-only» [справка]
  ([Projects in ChatGPT](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)).
- У проекта разделы «Chats» и «Sources»; инструкции проекта действуют во всех его чатах; новый чат начинают
  из проекта и потом находят в «Chats» [learn] ([Projects and chats](https://learn.chatgpt.com/docs/projects?surface=app)).
- Закрепление проекта или чата меняет только место в панели, не контекст [learn] (там же).
- Удаление проекта в desktop оставляет его чаты без проекта (август 2026) [форум]
  ([тред 1388981](https://community.openai.com/t/exploring-chatgpt-projects-why-do-web-and-desktop-feel-like-different-products/1388981)).
- Жалоба: при создании чата из проекта непонятно, куда он попадёт; просят видимое место назначения до создания,
  постоянную метку проекта и одинаковый «Move to project» [форум]
  ([тред 1403786](https://community.openai.com/t/creating-a-chat-from-a-project-does-not-make-its-destination-clear/1403786)).

## Чат

- Перенос в проект: перетащить чат на проект или «Move to project» в меню чата; обратно — «Remove from
  project»; чаты, созданные с GPT, переносить нельзя [справка] (Projects in ChatGPT).
- В desktop (август 2026) чаты вне проектов перетаскиванием в проект не переносились [форум] (тред 1388981).
- Архив скрывает чат из панели, без подтверждения; удаление — навсегда, с подтверждением; архив
  восстанавливают в настройках [справка]
  ([Deleting and archiving chats](https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt)).

## Поиск

- Поиск начинается из панели и ищет по чатам, проектам, изображениям и документам; фильтры All, Chats, Images,
  Documents, Projects (14.07.2026) [справка]
  ([Finding your chats, projects, and files](https://help.openai.com/en/articles/10056348-finding-your-chats-projects-and-files-in-chatgpt)).

## Что взято в прототип

[вывод] Панель «Закреплённые → Проекты (папки с разговорами внутри) → Разговоры без проекта», меню
проекта и чата, страница проекта с полем ввода, инструкциями, разговорами и источниками, удаление проекта вместе
с его разговорами (В-17). Место назначения видно в поле ввода и в верхней строке разговора.
Не взято: поиск (решение владельца В-6, вынесено вопросом), архив, перетаскивание, ручной порядок, память.
