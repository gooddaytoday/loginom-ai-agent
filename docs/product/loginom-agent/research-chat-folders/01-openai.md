# OpenAI: where conversations and their files live when a chat is not in a project

Research date: 2026-11-18. Primary sources only: OpenAI Help Center, OpenAI product docs (learn.chatgpt.com), the ChatGPT release notes, and the openai/codex repository at commit [`df97585`](https://github.com/openai/codex/commit/df975851bf906d71e5a1ead04f1eaec41d26ca16) (2026-11-18).

## How the sources were read

- **Help Center.** Live `help.openai.com` returned HTTP 403 (a Cloudflare bot check) to WebFetch, curl and a headless browser on 2026-11-18. I did not try to get past the human-verification checkbox. I read each article from its most recent Internet Archive snapshot instead. Every Help Center link below is the canonical `help.openai.com` URL; the snapshot timestamps are listed in [Source list](#source-list). All snapshots except canvas (2026-07-20) are from 2026-10-28 to 2026-11-17.
- **Product docs.** `developers.openai.com/codex/*` now answers with a 308 redirect to `learn.chatgpt.com/docs/*`; for example, `/codex/app` goes to `https://learn.chatgpt.com/docs/app`. I read those pages live as Markdown (`<page>.md`). Many of them have per-surface tabs (`app`, `web`, `cli`, `ide`). I name the tab when it matters.
- **Code.** I read a sparse checkout of openai/codex at `df97585`. Claims taken from code are marked **[code]**. Everything else is something OpenAI states. My own inferences are marked **[inference]**.
- **Desktop app code.** The Codex/ChatGPT desktop app's UI is not in openai/codex. The repo has the Rust core, CLI/TUI, app-server and thread store that the app uses. Desktop-only behaviour is therefore known only from the docs.

**The product landscape has changed.** OpenAI's docs now describe a single "ChatGPT desktop app" that contains both ChatGPT (Chat / Work) and Codex ([desktop app](https://learn.chatgpt.com/docs/app); [glossary: "Desktop app with ChatGPT and Codex"](https://learn.chatgpt.com/docs/glossary)). Its Projects view "includes ChatGPT projects and local projects that connect to folders on your computer" ([Projects and chats, app tab](https://learn.chatgpt.com/docs/projects)). ChatGPT chats and Codex chats keep separate histories: "ChatGPT chats don't appear in the Codex sidebar" ([Projects and chats, Quick chat](https://learn.chatgpt.com/docs/projects)).

---

## 1. ChatGPT (web and desktop)

### 1.1 What a project holds (OpenAI states)

- **Contents.** "Projects keep related chats, files, and instructions together" ([Projects in ChatGPT](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)). On the web, a project has a **Chats** section and a **Sources** section "for uploaded files and connected context". "Project instructions apply across its chats." A ChatGPT project "doesn't provide direct access to a folder on your computer" ([Projects and chats, web tab](https://learn.chatgpt.com/docs/projects)).
- **Sources.** Sources can be uploaded files, pasted text, and links from Google Drive and Slack. A chat response can be saved with **Add to project sources** ([Projects in ChatGPT](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)).
- **File limits.** Free: 5 files per project; Go and Plus: 25; Edu, Pro, Business and Enterprise: 40 ([Projects in ChatGPT, Plans and limits](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)).
- **Instructions.** Project instructions "apply only within that project and override your global custom instructions" ([Projects in ChatGPT](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)).
- **Memory.** A project uses either *default memory* or *project-only memory*. With project-only memory, chats "can reference other conversations within the same project" but not outside it, and outside chats cannot reference the project. Shared projects are always project-only ([Projects in ChatGPT, Memory in projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)). Project-only memory launched on 2025-08-22 ([release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes)).

### 1.2 Chats outside projects (OpenAI states)

- **When to use one.** "Start a chat from ChatGPT Home when the chat doesn't need shared project files, instructions, or sources." OpenAI says to move the chat into a project "if the work grows" ([Projects and chats, web tab](https://learn.chatgpt.com/docs/projects#start-without-a-project)).
- **Where they appear.** These chats live in the account's regular chat history. Archived chats leave the sidebar but stay searchable ([Deleting and archiving chats](https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt); [Finding your chats, projects, and files](https://help.openai.com/en/articles/10056348-finding-your-chats-projects-and-files-in-chatgpt)).
- **Locked chats.** A locked chat is kept out of normal history; it is opened from **Projects > Locked chats**. "Locking a project chat removes it from the project, so the chat no longer has access to project instructions, files, or memory" ([Projects and chats, locked chats](https://learn.chatgpt.com/docs/projects)).

### 1.3 Where files that ChatGPT creates live

**Library and Space: one account-level store.**
- "The files you upload to and create in ChatGPT are saved to your Library." ChatGPT "automatically saves uploaded and created files, including files uploaded in chats (for example: documents, spreadsheets, presentations, and images) in a dedicated, secure location." Library has filters for **Uploaded** and **Generated** ([Using Library](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt)).
- **Storage limits.** Free 500 MB, Go 4 GB, Plus and Business 20 GB, Pro 100 GB ([Using Library](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt)).
- **Reusing files.** You can add a saved file to any chat with **Add from library** ([Using Library](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt)).
- **History.** The file Library launched on 2026-03-23 ("When you upload or create a file … it's automatically saved to your Library"). It expanded to Free and Go on 2026-05-14, adding Settings > Storage ([release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes)).
- **Space.** Space replaces Library "for accounts with access to Space", and "Projects remain separate". Creating and editing in Space requires Pro, Business or Enterprise. Space holds pages, folders, uploaded files and an Images view ([Getting started with Space](https://help.openai.com/en/articles/20001549-getting-started-with-space-in-chatgpt)). Space launched on 2026-09-29 ([release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes)).
- **Exceptions.** Files uploaded in Temporary Chat or in ChatGPT Health are not saved to Library ([Using Library](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt)).

**Generated images.**
- "Generated images will continue to appear in the Images tab" ([Using Library](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt)).
- "All images you create with ChatGPT are automatically saved under Images" ([Images in ChatGPT](https://help.openai.com/en/articles/11084440-images-in-chatgpt)).

**Code interpreter / data analysis downloads.**
- ChatGPT "writes and runs Python code in a stateful Jupyter notebook environment. The environment can use files made available to the session" ([Data analysis with ChatGPT](https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt)).
- The troubleshooting article says, under "Download failed / File Not Found": "files generated by ChatGPT expire quickly" ([Troubleshooting error messages](https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages)).
- For Enterprise, "Files that are not saved to Library can expire separately from chat-retention settings … some transient files can expire after 48 hours" ([Chat and file retention](https://help.openai.com/en/articles/8983778-chat-and-file-retention-in-chatgpt)).
- **Conflict.** [Library](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt) says created files are saved automatically, while [troubleshooting](https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages) says generated files expire quickly. OpenAI does not say which sandbox outputs are copied to Library. **Unverified.**

**Canvas.**
- Canvas opens inside the conversation and keeps version history. **Download** exports to PDF, .md or .docx, or to a code file extension ([canvas article](https://help.openai.com/en/articles/9930697-what-is-the-canvas-feature-in-chatgpt-and-how-do-i-use-it), snapshot 2026-07-20).
- The [canvas article](https://help.openai.com/en/articles/9930697-what-is-the-canvas-feature-in-chatgpt-and-how-do-i-use-it) does not say whether canvas documents appear in Library, and neither does the [Library article](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt). **Not stated.**
- The newer "writing blocks" feature (2026-06-08) can "save your document to the Library" ([release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes)).

**ChatGPT Work.**
- In ChatGPT Work on the web, you "review the generated file in the chat, download it when needed" ([Work with files, web tab](https://learn.chatgpt.com/docs/artifacts-viewer)).
- On the desktop app, Work "can also use local files" ([Get started with ChatGPT Work](https://learn.chatgpt.com/docs/get-started-with-work)). The docs I read do not say where a local Work chat with no project saves its files. **Not stated.** The desktop "projectless workspace root" setting (section 2.2) may also apply to it, but the docs do not say so.

### 1.4 Per-chat file space or shared?

- **No per-chat folder is documented.** OpenAI documents three scopes:
  - **Account-wide** Library or Space. Any chat can reuse its files ([Using Library](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt)).
  - **Project-wide** Sources. "A ChatGPT project gives its chats access to the same uploaded files, project instructions, and connected sources" ([Projects and chats, web tab](https://learn.chatgpt.com/docs/projects)).
  - **Per-chat attachments.** "Attach files … directly to a chat when they apply only to that chat" ([Projects and chats, web tab](https://learn.chatgpt.com/docs/projects)).
- **Files stay linked to their originating chat.** Files from a locked chat "can be opened only in that chat. They are not available in other chats … or in Library or Space" ([Finding your chats, projects, and files](https://help.openai.com/en/articles/10056348-finding-your-chats-projects-and-files-in-chatgpt)).
- **[inference]** The data-analysis sandbox is session-scoped: it uses "files made available to the session" ([Data analysis with ChatGPT](https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt)). OpenAI does not say whether it is one sandbox per chat or how long it lives. **Unverified.**
- **Where Library and Space are available.**
  - Library: "Library is available on web" ([Using Library](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt)). The 2026-05-14 release note says Library and "Recent files" are supported on web, iOS and Android ([release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes)).
  - Space: pages can be created and edited "on the web or in the ChatGPT desktop app"; mobile is read-only ([Getting started with Space](https://help.openai.com/en/articles/20001549-getting-started-with-space-in-chatgpt)).
  - No source says whether Library is shown in the desktop app. **Not stated.**

### 1.5 Moving a chat into or out of a project

- **Into a project.** Drag the chat onto a project, or use **Move to project**. "After moving, the chat inherits the project's instructions and file context." Chats created with a GPT cannot be moved ([Projects in ChatGPT](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)).
- **Out of a project.** **Remove from project** moves the chat "back to your chat history" ([Projects in ChatGPT](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)).
- **Restrictions.** Memory settings and workspace rules "can limit which chats can be moved" ([Projects in ChatGPT](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)).
- **Locking.** Locking a project chat removes it from the project and cuts access to project files and instructions ([Projects and chats](https://learn.chatgpt.com/docs/projects)).
- **What happens to the chat's own files is not stated.** No source says whether a moved chat's attachments or generated files become project Sources, stay in the chat, or are affected at all. **[inference]** Library and Space are account-level and survive chat deletion, so a move most likely leaves them untouched. Files reach project Sources only through **Add to project sources** or an upload. **Unverified.**

### 1.6 Delete and archive

- **Deleting a chat.** The chat is removed from view immediately and scheduled for deletion within 30 days. It cannot be restored. "Deleting a chat does not delete files saved separately in Library or Space" ([Deleting and archiving chats](https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt); also [Chat and file retention](https://help.openai.com/en/articles/8983778-chat-and-file-retention-in-chatgpt), [Uploading files](https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt), [Using Library](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt)).
- **Deleting a Library file.** Delete it in Library. It can be restored from **Recently deleted**, where available, and is purged within 30 days ([Using Library](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt)).
- **Deleting a project.** This "permanently removes its chats and instructions, along with files stored only in the project. Files saved separately in Library or Space are not deleted." Files added to a project are retained until the project or file is deleted ([Projects in ChatGPT](https://help.openai.com/en/articles/10169521-projects-in-chatgpt); [Chat and file retention](https://help.openai.com/en/articles/8983778-chat-and-file-retention-in-chatgpt)).
- **Archiving.** The chat leaves the sidebar but stays searchable, with the same retention. It can be unarchived from Settings > Data controls. "Archive all" and "Delete all" also affect chats in projects ([Deleting and archiving chats](https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt)).
- **Conflict for images.** The Images article says "To delete an image from My images, delete the conversation where the image was created" ([Images in ChatGPT](https://help.openai.com/en/articles/11084440-images-in-chatgpt), updated about 2026-11-06). The Library article says deleting a chat does not delete the separately saved file, and that generated images can be favorited in Library ([Using Library](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt)). Whether a Library copy of an image survives deleting its chat is **unresolved**.
- **Older text now superseded.** An August 2026 version of the uploads FAQ said a chat's files are deleted with the chat. The 2026-11-17 version says the opposite ([Uploading files](https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt)). Only the newer text is used here.

---

## 2. Codex (desktop app, CLI, IDE extension)

### 2.1 How a chat (thread) relates to a folder

- **Desktop app.** "A local project gives chats access to one or more folders on your computer." "Projects don't need a folder, but you can attach folders as needed." One folder is the primary one: "New chats start in the primary folder", and Codex uses it for Git, `AGENTS.md`, skills and `config.toml` discovery. Remote projects support one folder ([Projects and chats, app tab](https://learn.chatgpt.com/docs/projects)). The glossary defines a project as "a group of related chats and shared sources, or a local folder used for file-based work" ([glossary](https://learn.chatgpt.com/docs/glossary)).
- **CLI.** It "treats the directory where you start it as the project for the chat", or the directory given with `--cd`/`-C`. "The chat keeps its transcript and recorded working directory, while Codex reads files from the current working tree." The CLI does not show the Projects view ([Projects and chats, cli tab](https://learn.chatgpt.com/docs/projects)).
  - On resume from a different directory, Codex asks which directory to use; `tui.resume_cwd` can preset the answer ([CLI commands, `codex resume`](https://learn.chatgpt.com/docs/developer-commands?surface=cli)).
  - `codex exec` requires a Git repository unless `--skip-git-repo-check` is passed ([Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)).
- **IDE extension.** "The IDE extension treats the folder or workspace open in your IDE as the local project." "Chats in the same project can work with the same files, while each chat keeps its own transcript" ([Projects and chats, ide tab](https://learn.chatgpt.com/docs/projects)).
- **Where to run.** A Codex chat runs **Local** ("work directly in your current project directory"), in a **Worktree**, or in the **Cloud**. "Each Cloud task has its own working files" ([Codex environments](https://learn.chatgpt.com/docs/environments/modes)).
- **[code] Every thread records a working directory.** In the app-server protocol, `cwd` is optional in `thread/start` params ([thread.rs L84](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L84)). The response always carries an absolute `cwd: AbsolutePathBuf` ([thread.rs L191-L199](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L191-L199)). `thread/list` can filter by "session current working directory" ([App Server docs](https://learn.chatgpt.com/docs/app-server)).
- **[code] Transcripts are stored separately from the working directory.**
  - Location: `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<timestamp>-<thread-id>.jsonl` ([recorder.rs L1700-L1721](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/rollout/src/recorder.rs#L1700-L1721); [lib.rs L88-L89](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/rollout/src/lib.rs#L88-L89)).
  - `CODEX_HOME` defaults to `~/.codex` ([Advanced Configuration, "Config and state locations"](https://learn.chatgpt.com/docs/config-file/config-advanced)).
- **[code] A project is metadata, not a folder.**
  - A stored project has `roots: Vec<StoredProjectRoot>`, which can be zero or more paths ([thread-store projects.rs L11-L19](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/thread-store/src/projects.rs#L11-L19)).
  - A thread points to it through a `threads.project_id` column ([state projects.rs L26-L60](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/state/src/runtime/projects.rs#L26-L60)).
  - `thread/start.projectId` and `thread/metadata/update.projectId` are marked experimental ([thread.rs L128-L132](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L128-L132), [L1069-L1073](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L1069-L1073)).

### 2.2 Can a thread exist without a folder, and where does it write?

- **Desktop app (OpenAI states).** "In Codex, select **New chat** beside **Recents** to start without a project. Use this for self-contained work that doesn't need shared project files, instructions, or folder access" ([Projects and chats, app tab](https://learn.chatgpt.com/docs/projects#start-without-a-project)). Since Codex app 26.415 (2026-04-16): "Chats are threads you can start without choosing a project folder first" ([Codex changelog](https://learn.chatgpt.com/docs/changelog)).
- **Where projectless chats write (OpenAI states, partly).** The managed requirement `application.storage.projectless_workspace_root` is described as "Root directory for new chats created without a project". The parent table `application.storage` will "pin storage locations for newly created work … Each path independently overrides the local preference" ([Configuration Reference, requirements.toml](https://learn.chatgpt.com/docs/config-file/config-reference)).
  - So the desktop app creates new projectless chats under an on-disk root that admins can pin.
  - **[inference]** "Overrides the local preference" suggests users can also set the root themselves.
  - The [description](https://learn.chatgpt.com/docs/config-file/config-reference) says "new chats", not "new Codex chats". The docs do not say whether it also covers local ChatGPT Work chats.
  - **[code]** The value is passed to the desktop as `desktop.projectlessWorkspaceRoot` ([application_storage_requirements.rs L1-L56](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/config/src/application_storage_requirements.rs#L1-L56)).
  - **Not found anywhere.** I extracted the full commit tarball and grepped it for `projectlessWorkspaceRoot`, `projectless_workspace_root` and `Documents/Codex`. The only hits are:
    - the requirement struct and its passthrough to the desktop;
    - the protocol type;
    - tests whose fixture uses a temp directory named `chats` ([config_manager_service_tests.rs L3420](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/app-server/src/config_manager_service_tests.rs#L3420)).

    No default path is defined in the open-source code, and nothing there creates per-chat folders under the root. The desktop UI that applies the setting is not open source. The default path and whether each chat gets its own subfolder are therefore **unverified**. Do not assume a path.
- **[code] "Projectless" describes a directory, not a thread without one.** A cwd counts as projectless when it has no project-root marker, is not inside a Git checkout, and has no project `.codex` config layers ([config loader mod.rs L423-L425](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/config/src/loader/mod.rs#L423-L425); test "unmarked_directory_is_projectless_even_with_saved_trust", [projectless_directory_tests.rs L73-L75](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/config/src/loader/projectless_directory_tests.rs#L73-L75)).
  - For such directories the TUI applies "desktop-like execution defaults", i.e. a workspace-write profile ([tui projectless.rs L1-L2](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/tui/src/projectless.rs#L1-L2)).
  - Matching changelog entry: "Start sessions outside a project with workspace defaults when policy permits" (Codex CLI 0.160.0, 2026-10-01; [changelog](https://learn.chatgpt.com/docs/changelog)).
  - **[inference]** Even a "projectless" Codex chat runs in some real working directory and writes files there.
- **CLI and IDE.** The docs describe no folderless mode. The CLI uses the start directory and the IDE uses the open workspace ([Projects and chats](https://learn.chatgpt.com/docs/projects)). Files are created "in the working directory" (CLI) or "in the workspace" (IDE) ([Work with files](https://learn.chatgpt.com/docs/artifacts-viewer)).
- **Cloud.** A cloud task runs in its own workspace with its own working files ([Codex environments](https://learn.chatgpt.com/docs/environments/modes)).

### 2.3 A separate folder or worktree per thread?

- **Local mode.** Chats share the project folder; there is no per-chat folder ([Codex environments](https://learn.chatgpt.com/docs/environments/modes); [Projects and chats, ide tab](https://learn.chatgpt.com/docs/projects)).
- **Worktree mode (desktop, Git only).** "Codex creates a Git worktree based on the branch you selected", in detached HEAD.
  - "A Codex-managed worktree is typically dedicated to one chat", and Handoff moves a chat between Local and its worktree.
  - Location is `$CODEX_HOME/worktrees` by default, changeable in **Settings > Worktrees > Worktree root**. Codex keeps the 15 most recent managed worktrees by default.
  - ([Worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees).)
- **[code] Layout and cleanup.** Managed worktrees are allocated at `<root>/<4 hex chars>/<repo-name>` ([worktree paths.rs L13-L40](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/worktree/src/paths.rs#L13-L40)). The default root is `codex_home.join("worktrees")` and `DEFAULT_WORKTREE_KEEP_COUNT = 15`. The CLI "shares Desktop's allocation root while leaving CLI cleanup disabled" ([worktree settings.rs L1-L51](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/worktree/src/settings.rs#L1-L51)). The CLI creates one with `codex exec --worktree` ([CLI commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli)).
- **Projectless chats.** Whether each gets its own directory is unknown (see 2.2).

### 2.4 Archive and delete

**Desktop app (OpenAI states).**
- "**Archive a chat** when you finish the work"; restore it from **Settings > Archived chats** ([Projects and chats, app tab](https://learn.chatgpt.com/docs/projects); [Settings](https://learn.chatgpt.com/docs/reference/settings)).
- "You must first archive a chat prior to deleting it." You delete from Settings > Archived chats. The chat is "immediately removed from your Codex chat history" and "scheduled for permanent deletion from OpenAI's systems within 30 days." Archiving "stops a running chat and removes any scheduled task attached to it" ([Archiving and deleting Codex chats in the ChatGPT app](https://help.openai.com/en/articles/20001333-archiving-and-deleting-codex-chats-in-the-chatgpt-app)).
- **Worktrees.** "Codex-managed worktrees are deleted automatically when: You archive the associated chat", or when the keep limit is reached. They are not auto-deleted while a pinned chat is tied to them or a chat is still running. "Before deleting a Codex-managed worktree, Codex saves a snapshot", and you can restore it when you reopen the chat ([Worktrees, cleanup](https://learn.chatgpt.com/docs/environments/git-worktrees)).
- **Removing a project.** Removing a project from the sidebar is undone by re-adding the folder ([Troubleshooting](https://learn.chatgpt.com/docs/reference/troubleshooting)). The docs do not say whether files in the folder are touched. **[inference]** They are not.

**CLI (OpenAI states).**
- `codex archive` cleans up the session picker "without deleting the transcript". `codex delete` / `/delete` "permanently deletes the transcript, its saved side chats, and spawned descendant sessions" ([CLI commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli)).
- `codex exec --ephemeral` does not persist rollout files ([Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)).
- Codex CLI 0.155.0 (2026-09-17) "Added task hiding, archiving, and deletion in the agents overview, plus worktree ownership details and confirmed deletion of clean managed worktrees" ([Codex changelog](https://learn.chatgpt.com/docs/changelog)).
  - **[code]** In the TUI, removing a worktree is a separate user action. The worktree browser calls `WorktreeManager::remove` with the CLI settings ([tui worktree_browser.rs L150-L168](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/tui/src/worktree_browser.rs#L150-L168); [worktree lib.rs L285](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/worktree/src/lib.rs#L285)).
  - **[code]** Archiving a CLI session does not delete its worktree, because CLI auto-cleanup is off ([worktree settings.rs L27-L35](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/worktree/src/settings.rs#L27-L35)).

**App-server (OpenAI states).**
- `thread/archive` "moves the thread's persisted JSONL log into the archived directory". `thread/delete` "permanently deletes a persisted active or archived thread and its spawned descendant threads" ([App Server](https://learn.chatgpt.com/docs/app-server)).

**[code] What the open-source thread store actually does.**
- **Archive** renames the rollout file from `$CODEX_HOME/sessions/...` to `$CODEX_HOME/archived_sessions/` ([archive_thread.rs L67-L125](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/thread-store/src/local/archive_thread.rs#L67-L125)).
- **Delete** removes rollout files from both directories, state DB rows and thread-name index entries. It also runs an optional "host-owned data" cleanup hook ([delete_thread.rs L1-L8](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/thread-store/src/local/delete_thread.rs#L1-L8), [L248-L349](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/thread-store/src/local/delete_thread.rs#L248-L349)).
  - The app-server's hook deletes only the thread's agent message boards and Guardian evidence boards, which live in SQLite ([message_processor.rs L332-L349](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/app-server/src/message_processor.rs#L332-L349)).
- **No worktree or cwd cleanup in the open-source code path.** I found no reference to worktrees or the thread's cwd in non-test files under `thread-store/src` and `app-server/src`. The tarball-wide search found worktree removal only in two places: rollback when worktree creation fails, and the TUI's explicit "remove" action.
  - So worktree removal on archive is desktop-app behaviour, known from the docs only.
  - The closed desktop UI may do more on delete. **Not verified.**
- **Deleting a project** sets `project_id = NULL` on its active and archived threads, then deletes the project row. Threads become projectless and no files are deleted ([state projects.rs L340-L375](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/state/src/runtime/projects.rs#L340-L375)).

### 2.5 Moving a Codex chat between projects

- **OpenAI states.** Only Local and Worktree **Handoff** is documented. It "moves your chat _and_ code" using Git operations, and ignored files do not move unless they are listed in `.worktreeinclude` ([Worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)).
- **[code] Project reassignment.** Moving a thread to another project is a single `UPDATE threads SET project_id = ?`, with no file operations ([state projects.rs L26-L60](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/state/src/runtime/projects.rs#L26-L60)). It is exposed as the experimental `thread/metadata/update.projectId`. Whether the desktop UI offers "move to project" for Codex chats is **not stated** in the docs I read.

---

## Contradictions and open items

1. **Images and chat deletion.** The Images article says deleting the chat removes the image. The Library article says deleting a chat does not delete separately saved files. Unresolved (section 1.6).
2. **Generated files saved or expiring.** Library says created files are saved automatically; troubleshooting says generated files "expire quickly". The relationship between sandbox outputs and Library copies is not documented (section 1.3).
3. **Effect of a ChatGPT move on the chat's files.** Not stated (section 1.5).
4. **Projectless workspace root (desktop).** The setting exists. Its default path and whether there is one folder per chat are not stated in the docs or defined in the open-source code. The desktop code is closed (section 2.2).
5. **Worktree removal on archive.** Documented for the desktop app. Absent from the open-source thread store and app-server. The CLI has only explicit worktree removal, and its auto-cleanup is off (section 2.4).
6. **Search scope.** The negative findings about the projectless root, the default path and the cleanup hook come from a grep of the full commit tarball. The negative findings about worktree and cwd cleanup in `thread-store` and `app-server` come from reading those crates. Neither covers the closed desktop app.
7. **Canvas article snapshot** is from 2026-07-20, the newest available. Canvas storage in Library is not stated.

## Summary table

| Product | Where files go for a chat with no project | Per-chat folder | On move | On delete |
|---|---|---|---|---|
| ChatGPT web / desktop (Chat and cloud Work; local Work on desktop: **not stated**) | In the chat as attachments and outputs. Uploaded and created files are also saved to the account-wide **Library** (or **Space**), except Temporary Chat and Health. Images go to **Images**. Sandbox downloads "expire quickly" ([Library](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt), [Images](https://help.openai.com/en/articles/11084440-images-in-chatgpt), [errors](https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages)) | No; none documented. Scopes are account (Library/Space), project (Sources) and chat (attachments) | Into a project: the chat "inherits the project's instructions and file context". Out of a project: it returns to history. Effect on the chat's own files is **not stated** ([Projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)) | The chat is purged within 30 days. Library/Space copies **stay**; delete them separately. Deleting a project deletes files "stored only in the project". Images article conflicts ([Deleting and archiving](https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt), [Projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)) |
| Codex in the ChatGPT desktop app | A directory under the desktop's configurable "projectless workspace root" ("Root directory for new chats created without a project"; not scoped to Codex in the docs). Default path **not stated**. Transcript in `$CODEX_HOME/sessions` [code] ([Config reference](https://learn.chatgpt.com/docs/config-file/config-reference), [recorder.rs](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/rollout/src/recorder.rs#L1700-L1721)) | Projectless: **not stated**. Local: no, chats share the project folder. Worktree mode: yes, a managed worktree "typically dedicated to one chat" ([Worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)) | Handoff Local/Worktree moves chat and code through Git. Project reassignment is a metadata update only [code]; the UI is **not stated** ([Worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees), [state projects.rs](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/state/src/runtime/projects.rs#L26-L60)) | You must archive first. Archive moves the transcript to `archived_sessions` [code] and auto-deletes the managed worktree after a snapshot (docs). Delete removes the chat from history and from OpenAI's systems within 30 days (docs). The open-source thread store deletes transcripts and DB rows only; I found no cwd or folder cleanup [code]. The closed desktop UI is **not verified** ([Codex chats article](https://help.openai.com/en/articles/20001333-archiving-and-deleting-codex-chats-in-the-chatgpt-app), [Worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees), [delete_thread.rs](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/thread-store/src/local/delete_thread.rs#L248-L349)) |
| Codex CLI | The directory where `codex` starts (or `-C`). No folderless mode. `exec` requires a Git repo unless `--skip-git-repo-check` ([Projects, cli tab](https://learn.chatgpt.com/docs/projects), [Non-interactive](https://learn.chatgpt.com/docs/non-interactive-mode)) | No. Optional `--worktree` creates `$CODEX_HOME/worktrees/<id>/<repo>` with auto-cleanup off [code] ([settings.rs](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/worktree/src/settings.rs#L1-L51)) | Not applicable (no Projects view). On resume from another directory it asks which cwd to use ([commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli)) | `codex archive` keeps the transcript. `codex delete` / `/delete` removes the transcript, side chats and descendants (docs). I found no cleanup of working-tree files in the thread store [code]. Managed worktrees are removed only by an explicit "confirmed deletion" in the agents overview, never on archive ([commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli), [changelog, CLI 0.155.0](https://learn.chatgpt.com/docs/changelog), [worktree_browser.rs](https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/tui/src/worktree_browser.rs#L150-L168)) |
| Codex IDE extension | The open folder or workspace. Files are created "in the workspace" ([Projects, ide tab](https://learn.chatgpt.com/docs/projects), [Work with files](https://learn.chatgpt.com/docs/artifacts-viewer)) | No. "Chats in the same project can work with the same files, while each chat keeps its own transcript" ([Projects, ide tab](https://learn.chatgpt.com/docs/projects)) | Not stated | Not stated for the IDE. It probably uses the same local thread store as the CLI and app-server, but I read no IDE code. **[inference], unverified** |
| Codex Cloud task | Its own cloud workspace ("Each Cloud task has its own working files") ([environments](https://learn.chatgpt.com/docs/environments/modes)) | Yes, per task | Not stated | Not researched in depth |

## Link spot-check (2026-11-18)

- [x] `https://learn.chatgpt.com/docs/environments/git-worktrees` re-opened live with HTTP 200. It still contains "Codex-managed worktrees are deleted automatically when" and "Codex creates worktrees in `$CODEX_HOME/worktrees`". This is the owning OpenAI docs page.
- [x] `https://github.com/openai/codex/blob/df975851bf906d71e5a1ead04f1eaec41d26ca16/codex-rs/worktree/src/settings.rs#L1-L51` re-opened: the blob page returned HTTP 200, and the raw file at the same commit has the doc comment "Shares Desktop's allocation root while leaving CLI cleanup disabled" on line 27, `for_cli` on line 28, `auto_cleanup_enabled: false` on line 33 and `codex_home.join("worktrees")` on line 44.
- [x] Help Center `https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt`: the live request still returns 403. I re-checked the 2026-11-16 Internet Archive snapshot of that URL instead, which still contains "does not delete a separate file that remains saved in Library".

## Source list

Help Center (canonical URL; read from the Internet Archive snapshot shown, because the live site returned 403):
- Projects in ChatGPT: https://help.openai.com/en/articles/10169521-projects-in-chatgpt (read from the 2026-11-16 snapshot; re-checked against the 2026-11-17 17:35 UTC snapshot, which changes only Enterprise sharing permissions)
- Using Library to manage files in ChatGPT: https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt (2026-11-16)
- Getting started with Space in ChatGPT: https://help.openai.com/en/articles/20001549-getting-started-with-space-in-chatgpt (2026-11-10)
- Chat and file retention in ChatGPT: https://help.openai.com/en/articles/8983778-chat-and-file-retention-in-chatgpt (2026-11-10)
- Finding your chats, projects, and files: https://help.openai.com/en/articles/10056348-finding-your-chats-projects-and-files-in-chatgpt (2026-11-10)
- Uploading files and audio to ChatGPT: https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt (2026-11-17)
- Deleting and archiving chats in ChatGPT: https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt (2026-11-05)
- Archiving and deleting Codex chats in the ChatGPT app: https://help.openai.com/en/articles/20001333-archiving-and-deleting-codex-chats-in-the-chatgpt-app (2026-10-28)
- Images in ChatGPT: https://help.openai.com/en/articles/11084440-images-in-chatgpt (2026-11-15)
- Troubleshooting ChatGPT error messages: https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages (2026-11-13)
- Data analysis with ChatGPT: https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt (2026-11-10)
- Canvas: https://help.openai.com/en/articles/9930697-what-is-the-canvas-feature-in-chatgpt-and-how-do-i-use-it (2026-07-20, newest available)
- ChatGPT release notes: https://help.openai.com/en/articles/6825453-chatgpt-release-notes (2026-11-17)

Product docs (live, 2026-11-18): https://learn.chatgpt.com/docs/app, /projects, /environments/git-worktrees, /environments/modes, /artifacts-viewer, /glossary, /reference/settings, /reference/troubleshooting, /developer-commands?surface=cli, /non-interactive-mode, /config-file/config-reference, /config-file/config-advanced, /app-server, /changelog.

Product docs also used (live, 2026-11-18): https://learn.chatgpt.com/docs/get-started-with-work.

Code: https://github.com/openai/codex at `df975851bf906d71e5a1ead04f1eaec41d26ca16`. I read a sparse checkout, then grepped the full commit tarball from codeload.github.com. File permalinks are inline above.
