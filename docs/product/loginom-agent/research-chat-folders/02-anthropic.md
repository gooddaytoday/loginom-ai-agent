# How Anthropic products organise conversations and their files outside a project

Date checked: 2026-11-18.
Versions: Claude Desktop changelog top entry v6.6395.0 (2026-11-17, "Bundled Claude Code version: 2.1.326"). Agent SDK code at `anthropics/claude-agent-sdk-python@cd08fa0`.

How the sources were read:
- I downloaded every page as raw Markdown with `curl` (the `.md` variant of each URL). The links below point to the canonical pages.
- Help-center and privacy articles were read in full. So were the Cowork docs overview and projects pages, and the 3P local-access page.
- The long pages were keyword-searched with `grep`, and I read the matching sections. These are: the Desktop changelog, the Claude Code desktop, sessions, `.claude` directory, worktrees, cloud and Projects docs, and the 3P data-storage page.
- The SDK file was fetched with `gh` at the pinned SHA.
- Every **[NS]** below means not found in what I read or searched, not proven absent.

Tags on each claim:
- **[S]**: Anthropic states it on the linked page.
- **[C]**: I read it in public Anthropic code.
- **[O]**: I observed it on this machine.
- **[I]**: my own inference.
- **[NS]**: not stated in sources read.

Scope warning: some storage details come only from the **Claude Desktop on third-party (3P)** docs. That is Desktop set up for a third-party inference provider; the page mentions Amazon Bedrock and Google Cloud's Agent Platform. It "keeps conversations, settings, and credentials on the device" ([User identity and local data](https://claude.com/docs/third-party/claude-desktop/data-storage)). Other details come only from **Enterprise** admin articles. Each such claim is labelled with its scope. Don't read them as consumer claude.ai behaviour.

---

## 1. Claude apps (claude.ai web, Desktop, mobile)

### Projects: what they hold
- "Projects allow you to create self-contained workspaces with their own chat histories and knowledge bases." You upload documents, text and code to the knowledge base and set project instructions. [S] [What are projects?](https://support.claude.com/en/articles/9517075-what-are-projects)
- Knowledge "will be used across all of your chats within that project", and instructions apply "for all the chats within the project". "Context is not shared across chats within a project unless the information is added into the project knowledge base." [S] [How can I create and manage projects?](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects)
- Each project has its own memory and also uses account memory from chats outside projects. [S] [same article, "Manage Claude's memory in projects"](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects)
- Project files are reachable from Claude's code-execution environment. [S] [Create and edit files, "Project files integration"](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude)
- **New projects (beta):** "a project is one conversation", and Claude splits the work into parallel cloud threads. "The project's Library collects the files you add and the files Claude produces." Moved projects bring "your instructions, files, full chat history, and scheduled tasks". [S] [What are projects?, "The new version of projects (beta)"](https://support.claude.com/en/articles/9517075-what-are-projects)
- Such a project "doesn't need a repository at all". Threads work "in their own sandbox" and "deliver files to the project's Library". Added files are readable under `/mnt/project-files`. [S] [Claude Code docs: Projects](https://code.claude.com/docs/en/claude-projects)

### Chats outside projects
- A standalone chat is moved into a project from its dropdown menu ("Add to project"). From the same menu it can be removed from a project or moved to another one. [S] [How to move chats into projects](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects)
- In the unified chat+Cowork experience, "your quick questions and longer tasks live together in Recents". Projects "work in every conversation". [S] [Claude Cowork and chat are one Claude](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude)

### Where files created in a chat live
- **Code execution / file creation:**
  - Claude works "within an isolated, sandboxed container".
  - You download the generated file "directly from the conversation" or save it to Google Drive. "Files remain available for download throughout your conversation."
  - Anthropic "limited … the length of time you can use a single sandbox container", and "no sandbox environments are ever shared between users".

  [S] [Create and edit files with Claude](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude)
- **Unified experience:** "Files Claude creates appear alongside the conversation." [S] [One Claude, "What's in a new place"](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude)
- **Per-conversation file space, Enterprise article on the unified experience:** "Each conversation that needs one gets its own virtual machine, managed by Anthropic. After a few minutes idle, the virtual machine is stopped and its disk is saved as an encrypted snapshot. The sandbox environment expires 30 days after it was created." [S, Enterprise article] [Set up the unified Claude experience for Enterprise, "How … works"](https://support.claude.com/en/articles/17444462-set-up-and-manage-the-new-unified-claude-experience-for-your-enterprise-organization)
- **Classic chat:** no page says outright that each chat has its own container. [NS] The per-conversation VM statement covers only the unified experience.
  - [I] The limited container lifetime and the per-conversation download wording suggest a per-chat, ephemeral sandbox.
- **Artifacts:** "Everything you make is saved to the Artifacts tab in your Claude sidebar, so you can find it again from any conversation." [S] [What are artifacts?](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them)
  - So artifacts are indexed at account level, not inside the chat. [I]
  - Legacy artifacts are those made before 2026-09-16. Publishing one "adds the artifact to Artifacts in your sidebar, so you can find it again outside the original chat". [S] [Share artifacts](https://support.claude.com/en/articles/9547008-share-artifacts)
- **Docs:** "A doc is a rich-text document saved to your Claude account." "Every doc you create is saved in the Artifacts tab". [S] [Get started with Claude Docs](https://support.claude.com/en/articles/16923645-get-started-with-claude-docs)
- **Chat files stay bound to the chat:** "When you share an artifact made in a chat, viewers also get access to the attachments and files in that chat." [S] (Team/Enterprise, legacy chat artifacts) [Share artifacts](https://support.claude.com/en/articles/9547008-share-artifacts)

### Moving a chat into a project
- What happens to the chat's generated files, sandbox or artifacts on a move: **[NS]**. The help center gives only the UI steps. [How to move chats into projects](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects)
- **Enterprise retention:** "Moving a chat into a project places it under the project's retention period". Moving it out makes it standalone again. Moving a cloud session into a project resets the project's retention period once. [S, Enterprise] [Custom data retention controls](https://support.claude.com/en/articles/10440198-configure-custom-data-retention-controls-for-enterprise-plans)
- Desktop v1.25927.0 (2026-08-04), Cowork section: "Added Projects for organizing Chat conversations: create a project, start a chat inside it, or move existing chats in." [S] [Claude Desktop changelog](https://claude.com/docs/cowork/changelog)

### Deleting a chat
- **Consumer:** "it's removed from your conversation history immediately and deleted from our back-end systems within 30 days. Other data associated with your account, like your projects and account information, is kept until you delete it or delete your account." [S] [Delete or rename a conversation](https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation), [How long do you store my data?](https://privacy.claude.com/en/articles/10023548-how-long-do-you-store-my-data)
  - What happens to that chat's artifacts or generated files: **[NS]** on the consumer pages.
- **Enterprise:**
  - "Artifacts are deleted under a retention period that covers artifacts, not with the chat or project they were made in." Research reports and artifacts in some older chats "are deleted with their chat". [S] [Custom data retention controls](https://support.claude.com/en/articles/10440198-configure-custom-data-retention-controls-for-enterprise-plans)
  - Files Claude gives you on or after 2026-10-08 are deleted with the conversation "unless another conversation or project in your organization uses them. Older files may remain after their conversation is deleted." [S] [Unified Enterprise article, "Data retention and deletion"](https://support.claude.com/en/articles/17444462-set-up-and-manage-the-new-unified-claude-experience-for-your-enterprise-organization)
  - "the cloud sessions Claude started in it are deleted too, including their transcripts". [S] [same section](https://support.claude.com/en/articles/17444462-set-up-and-manage-the-new-unified-claude-experience-for-your-enterprise-organization)
- **Docs:** deleting a doc is a separate act ("Only the owner can rename or delete a doc", "Deleting a doc is permanent"). [S] [Get started with Claude Docs](https://support.claude.com/en/articles/16923645-get-started-with-claude-docs)

### Claude Desktop on 3P: chat stored on the device (3P only)
- Each Chat conversation is "a session state file plus a working directory under `local-agent-mode-sessions/`". The working directory holds the transcript, `uploads/` (copies of attachments), `outputs/` ("files Claude creates during the conversation (its scratch space)") and the audit log. "Each conversation is isolated to its own directory." "Deleting a conversation's session state file and working directory removes all of this." [S, 3P] [User identity and local data, "Chat conversations"](https://claude.com/docs/third-party/claude-desktop/data-storage)
- Artifacts and scheduled-task results go to `~/Claude/` (legacy installs: `~/Documents/Claude/`). That folder "is not removed when you delete the application-data directory". [S, 3P] [same page](https://claude.com/docs/third-party/claude-desktop/data-storage)
- When a chat is deleted, "the app deletes a chat, its copies of attached files, its outputs, and the live artifacts (interactive pages) that Claude created in the chat". "Projects and memory stay." [S, 3P] [same page, "Automatic deletion of idle sessions"](https://claude.com/docs/third-party/claude-desktop/data-storage)

---

## 2. Claude Code

### Session and working directory
- "A session is a saved conversation tied to a project directory." [S] [Manage sessions](https://code.claude.com/docs/en/sessions)
- "Each Claude Code conversation is a session tied to your current directory." Parallel sessions use git worktrees, because "sessions are tied to directories". [S] [How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works)
- `/cd <path>`: "Move this session to a new working directory, keeping the conversation." Moving it "relocates it to the new directory's project storage". [S] [Commands](https://code.claude.com/docs/en/commands), [Manage sessions](https://code.claude.com/docs/en/sessions)

### Where transcripts are stored
- The default is `~/.claude/projects/<project>/<session-id>.jsonl`, where `<project>` is the working-directory path with non-alphanumerics replaced by `-`. Names longer than 200 characters are truncated and given a hash. `CLAUDE_CONFIG_DIR` and `CLAUDE_CODE_PROJECT_DIR_NAME` change this. [S] [Manage sessions, "Where transcripts are stored"](https://code.claude.com/docs/en/sessions)
- Related per-session data:
  - `projects/<project>/<session>/subagents/` and `tool-results/`
  - `file-history/<session>/` (checkpoint snapshots)
  - These are deleted after `cleanupPeriodDays`, 30 days by default.
  - Claude Desktop and Cowork transcripts are kept "at any age" unless `desktopSessionCleanupPeriodDays` is set.

  [S] [Explore the .claude directory](https://code.claude.com/docs/en/claude-directory)
- In the Agent SDK (not the CLI source), the module docstring says it "Scans ~/.claude/projects/<sanitized-cwd>/ for .jsonl session files". [C] [sessions.py L1-L5](https://github.com/anthropics/claude-agent-sdk-python/blob/cd08fa086187e7f938775621e39da7ec70995fae/src/claude_agent_sdk/_internal/sessions.py#L1-L5)
  - `_simple_hash` is documented as "matching the CLI's directory naming". [C] [L81-L82](https://github.com/anthropics/claude-agent-sdk-python/blob/cd08fa086187e7f938775621e39da7ec70995fae/src/claude_agent_sdk/_internal/sessions.py#L81-L82)
  - `_sanitize_path` replaces non-alphanumerics with `-` and truncates at 200 characters plus that hash. [C] [L104-L114](https://github.com/anthropics/claude-agent-sdk-python/blob/cd08fa086187e7f938775621e39da7ec70995fae/src/claude_agent_sdk/_internal/sessions.py#L104-L114)
- This session's transcript is at `~/.claude/projects/-root-git-loginom-ai-agent-test/<session-id>.jsonl`, with a same-named directory beside it. [O]
- `~/.claude/projects/` also holds a directory named `-`, which is consistent with sessions started in `/`. [O] [I]
- Desktop Code sessions keep records in `claude-code-sessions/`. "The conversation transcripts themselves are in Claude Code's own store at `~/.claude/projects/`". [S, 3P page] [User identity and local data](https://claude.com/docs/third-party/claude-desktop/data-storage)

### Do sessions without a directory exist?
- **CLI:** no directory-less mode was found. Every session is tied to the current directory (see above). [S] [O]
  - [I] The minimum is whatever directory you launched from, even `/` or `~`.
- **Desktop Code tab:** the docs say only that you pick the project folder before the first message. [S] [Desktop, "Start a session"](https://code.claude.com/docs/en/desktop)
  - The v6.6395.0 changelog (2026-11-17), **Code** section, says: "Fixed the app deleting the files a session with no folder left behind after it moved to a folder." [S, bug-fix note, not a spec] [Claude Desktop changelog](https://claude.com/docs/cowork/changelog)
  - [I] So folderless Code sessions exist in Desktop and can later be moved to a folder, and their files are now kept. How such sessions are created and where those files live: [NS].
- **Cloud sessions:** "Cloud sessions work with existing GitHub repositories." [S] [Web quickstart](https://code.claude.com/docs/en/web-quickstart)
  - "Each session runs in an isolated, Anthropic-managed VM", and the VM is reclaimed after inactivity. [S] [Use Claude Code in the cloud](https://code.claude.com/docs/en/claude-code-on-the-web)
  - Projects-beta threads need no repository. [S] [Projects](https://code.claude.com/docs/en/claude-projects)

### Per-session folders and worktrees
- **Scratchpad:** "a per-session directory that Claude Code gives Claude for temporary files", at `/tmp/claude-<uid>/<project>/<session-id>/scratchpad/` on Linux. It exists only with a claude.ai login on the Anthropic API and `enableArtifact` not false. The retention sweep deletes it together with the transcript. [S] [Explore the .claude directory, "Session scratchpad directory"](https://code.claude.com/docs/en/claude-directory)
  - This notes file sits in exactly such a directory. [O]
- **Worktrees are opt-in, not default:**
  - `claude --worktree <name>` creates `.claude/worktrees/<name>/` on branch `worktree-<name>`. [S] [Worktrees](https://code.claude.com/docs/en/worktrees)
  - Desktop: "By default, Worktree is off and Claude works in the project folder itself." Worktrees go to `<project-root>/.claude/worktrees/`. [S] [Desktop, "Run a session in its own worktree"](https://code.claude.com/docs/en/desktop)
  - The exception is background sessions (agent view, `claude --bg`): "Before editing files, Claude moves the session into an isolated git worktree under `.claude/worktrees/`". [S] [Agent view, "How file edits are isolated"](https://code.claude.com/docs/en/agent-view)
- **Worktree cleanup:**
  - On exit, a clean unnamed worktree is removed. A worktree with work in it prompts you. [S] [Worktrees, "Clean up worktrees"](https://code.claude.com/docs/en/worktrees)
  - Subagent and background worktrees are swept after `cleanupPeriodDays`. [S] [same page](https://code.claude.com/docs/en/worktrees)
  - An archived Desktop session's worktree with changes is removed "about 30 days after the session is archived" or last opened. [S] [Desktop](https://code.claude.com/docs/en/desktop)
- **Delete:**
  - `claude purge` deletes a project's transcripts sooner. A background session deleted with `claude rm` keeps its transcript. [S] [Manage sessions, "Delete session data"](https://code.claude.com/docs/en/sessions)
  - "Deleting a session permanently removes the session and its data" (cloud). [S] [Use Claude Code in the cloud, "Delete sessions"](https://code.claude.com/docs/en/claude-code-on-the-web)
  - Desktop deletion of a Code session removes the session, its conversation and, in most cases, its Git worktree. "Other files in the session's working folder stay". [S, 3P page] [User identity and local data](https://claude.com/docs/third-party/claude-desktop/data-storage)

---

## 3. Cowork

### Task and folder
- Cowork "brings Claude Code's agentic capabilities to knowledge work beyond coding". "Claude can only read and write files in folders you've connected". [S] [Get started with Claude Cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)
- **Since 2026-10-06 (Pro, Max, Ultra), new tasks run in the cloud.** "Your folders stay on your computer. Claude reaches only the folders you've connected, through the desktop app, and only while it's open. When a task needs a file in the cloud, Claude fetches a copy of just that file." Earlier local tasks stay local. [S] [Use Claude Cowork on web, desktop, and mobile](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile)
- Unified experience: "In Claude Desktop, give Claude access to a folder on your computer so it can read, organize, and create files there." [S] [One Claude](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude)
- **Cowork projects:**
  - The Cowork docs list "One or more local folders Claude can read and write inside this project's sessions" and say "Files Claude creates land in the project's folders". [S] [Cowork docs: Organize work with projects](https://claude.com/docs/cowork/guide/projects)
    - Caution: the same page conflicts with the help center on where projects live. See contradiction 2 below.
  - Archiving "does not touch the local folders you attached". [S] [same page](https://claude.com/docs/cowork/guide/projects), [Organize tasks with projects in Cowork](https://support.claude.com/en/articles/14116274-organize-your-tasks-with-projects-in-claude-cowork)

### Where outputs go when no folder is chosen
- Cloud: Claude "delivers finished outputs to your session, where you can preview and download them", and "your sessions and files are saved to your Claude account". [S] [Get started with Claude Cowork, "How Claude Cowork runs your tasks"](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)
- "Files Claude creates appear alongside the conversation. In Claude Desktop, the folder Cowork saved its work to is still there. Look for Storage folder in Settings." [S] [One Claude](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude)
- **Local or 3P sessions:**
  - Each session has a working directory with `uploads/` and an `outputs/` subdirectory "for files Claude creates". [S, 3P] [User identity and local data](https://claude.com/docs/third-party/claude-desktop/data-storage)
  - With no folders allowed, "The agent can still create files in its own sandbox scratch space". [S, 3P] [Desktop and filesystem access](https://claude.com/docs/third-party/claude-desktop/local-access)
  - Claude is told to save "in a writable connected folder or, if there is none, the outputs folder". [S, changelog v3.1623.0, 2026-10-20, Cowork section] [Claude Desktop changelog](https://claude.com/docs/cowork/changelog)
  - Artifacts, scheduled tasks and project files default to `~/Claude/`. **Settings > Cowork > Cowork files** moves them. [S, 3P] [User identity and local data](https://claude.com/docs/third-party/claude-desktop/data-storage)

### Move and delete
- **Move:**
  - A cloud session can be moved into a project. [S, Enterprise retention wording] [Custom data retention controls](https://support.claude.com/en/articles/10440198-configure-custom-data-retention-controls-for-enterprise-plans)
  - What happens to its outputs on that move: [NS].
  - For projects tied to a local folder, "Cowork won't change a project's contents, so add anything you want to keep to the project yourself". [S] [Use Cowork on web, desktop, and mobile](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile)
- **Delete:**
  - "Your Cowork task will be removed from your task history immediately, and deleted from our backend storage systems within 30 days". [S] [Get started with Claude Cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)
  - "When you delete a session, the copies Claude fetched are deleted too". [S] [Use Cowork on web, desktop, and mobile](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile)
  - Locally (3P), the app deletes "a task, its copies of attached files, and its outputs. The task's live artifacts stay". Files in connected folders stay. [S, 3P] [User identity and local data](https://claude.com/docs/third-party/claude-desktop/data-storage)
  - Enterprise: Cowork cloud sessions a member starts directly "are kept until the member deletes them" and fall outside custom retention. [S, Enterprise] [Unified Enterprise article](https://support.claude.com/en/articles/17444462-set-up-and-manage-the-new-unified-claude-experience-for-your-enterprise-organization)

---

## Contradictions between Anthropic sources
1. **Where Cowork runs:**
   - [Cowork docs overview](https://claude.com/docs/cowork/overview) says "Works directly on your computer".
   - The help center says "Cowork runs your tasks in the cloud" ([Get started](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)), from 2026-10-06 ([surfaces](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile)).
   - [I] The docs page predates the cloud move or describes local and 3P mode.
2. **Where Cowork projects live:**
   - [Cowork docs: projects](https://claude.com/docs/cowork/guide/projects) says "Projects live on your computer. They aren't synced to the cloud or shared with other people."
   - The [help center](https://support.claude.com/en/articles/14116274-organize-your-tasks-with-projects-in-claude-cowork) says "New projects you create in Cowork are saved to your Claude account", and that local projects move to the account while their folders and files stay on the computer.

## Not verified
- The Cowork architecture overview (`support.claude.com/en/articles/14479288`) redirected to the trust center, so I cite nothing from it.
- No consumer page states whether deleting a chat deletes its artifacts or generated files.
- Anthropic does not publish the Claude Code CLI source. The code claims come from the Agent SDK, whose own comment says it mirrors the CLI's directory naming.
- I found no source on what happens to files when a chat or Cowork session is moved into a project, for any product.

## Link re-check
I re-opened two canonical URLs on 2026-11-18 with WebFetch, separately from the curl copies. Every quoted span in these notes was also checked mechanically against the downloaded sources with `grep`-style matching; all of them match.
- [x] [Unified Enterprise article](https://support.claude.com/en/articles/17444462-set-up-and-manage-the-new-unified-claude-experience-for-your-enterprise-organization) is a Claude Help Center page.
  - It contains verbatim "Each conversation that needs one gets its own virtual machine, managed by Anthropic" and "The sandbox environment expires 30 days after it was created".
  - It contains "the cloud sessions Claude started in it are deleted too, including their transcripts".
  - WebFetch cut the "Files Claude gives you" quote short. The 2026-10-08 date is confirmed only from the curl copy.
- [x] [Artifacts article](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them) is a Claude Help Center page.
  - The older ID 9487310 redirects here (checked with `curl -IL`).
  - It contains verbatim "Everything you make is saved to the Artifacts tab in your Claude sidebar, so you can find it again from any conversation" and "before September 16, 2026".

## Summary table

| Product / variant | File location for a chat without a project | Per-chat folder | Behaviour on move | Behaviour on delete |
|---|---|---|---|---|
| Claude apps, classic chat (cloud) | Sandbox container. Files are downloaded from the conversation ([files](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude)). Artifacts and docs are indexed account-wide in the Artifacts tab ([artifacts](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them)) | [NS]. [I] likely yes, ephemeral | Files: [NS]. Enterprise: the chat takes the project's retention ([retention](https://support.claude.com/en/articles/10440198-configure-custom-data-retention-controls-for-enterprise-plans)) | The chat goes at once, and from the back end within 30 days. Projects are kept ([delete](https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation)). Artifacts: [NS] for consumers. Enterprise: artifacts follow their own retention, except Research reports and some older chats ([retention](https://support.claude.com/en/articles/10440198-configure-custom-data-retention-controls-for-enterprise-plans)) |
| Claude apps, unified chat+Cowork (cloud) | Files appear alongside the conversation ([One Claude](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude)) | **Yes**: one VM per conversation, sandbox expires 30 days after creation ([Enterprise article](https://support.claude.com/en/articles/17444462-set-up-and-manage-the-new-unified-claude-experience-for-your-enterprise-organization)) | [NS] | Enterprise: files from 2026-10-08 on and the cloud sessions it started are deleted with the conversation, artifacts are not ([Enterprise article](https://support.claude.com/en/articles/17444462-set-up-and-manage-the-new-unified-claude-experience-for-your-enterprise-organization)) |
| Claude Desktop on 3P, Chat/Cowork (on device) | `local-agent-mode-sessions/<session>/outputs/`. Artifacts in `~/Claude/` ([data storage](https://claude.com/docs/third-party/claude-desktop/data-storage)) | **Yes**: per-session working directory with `uploads/` and `outputs/` ([data storage](https://claude.com/docs/third-party/claude-desktop/data-storage)) | [NS] | The chat, its attachment copies, its outputs and its live artifacts are deleted. A Cowork task's live artifacts stay. Connected folders and the rest of `~/Claude/` stay ([data storage](https://claude.com/docs/third-party/claude-desktop/data-storage)) |
| Claude Code CLI | Working directory. Transcript in `~/.claude/projects/<cwd>/<id>.jsonl` ([sessions](https://code.claude.com/docs/en/sessions)) | Scratchpad: **yes** ([.claude dir](https://code.claude.com/docs/en/claude-directory)). Worktree: no, opt-in `--worktree` ([worktrees](https://code.claude.com/docs/en/worktrees)). Background sessions: automatic worktree ([agent view](https://code.claude.com/docs/en/agent-view)) | `/cd` moves the transcript to the new directory's storage ([sessions](https://code.claude.com/docs/en/sessions)) | Transcript and scratchpad swept after 30 days by default ([.claude dir](https://code.claude.com/docs/en/claude-directory)). `claude purge` on demand ([sessions](https://code.claude.com/docs/en/sessions)). A clean unnamed worktree is removed on exit ([worktrees](https://code.claude.com/docs/en/worktrees)) |
| Claude Code Desktop (Code tab) | Chosen project folder. Transcripts in `~/.claude/projects/` ([desktop](https://code.claude.com/docs/en/desktop), [data storage](https://claude.com/docs/third-party/claude-desktop/data-storage)) | Worktree off by default, toggle on, in `<project-root>/.claude/worktrees/` ([desktop](https://code.claude.com/docs/en/desktop)) | Bug-fix note: "Fixed the app deleting the files a session with no folder left behind after it moved to a folder" (v6.6395.0, Code section, [changelog](https://claude.com/docs/cowork/changelog)). [I] The files are now kept | Session and conversation removed with its worktree in most cases. Other files in the working folder stay ([3P data storage](https://claude.com/docs/third-party/claude-desktop/data-storage)) |
| Claude Code cloud sessions / Projects beta | Cloned repository in an isolated VM ([cloud](https://code.claude.com/docs/en/claude-code-on-the-web)). Projects: the Library ([projects](https://code.claude.com/docs/en/claude-projects)) | **Yes**: one VM per session, reclaimed when idle ([cloud](https://code.claude.com/docs/en/claude-code-on-the-web)) | [NS] | "permanently removes the session and its data" ([cloud](https://code.claude.com/docs/en/claude-code-on-the-web)) |
| Cowork, cloud (from 2026-10-06) | Outputs in the session, saved to the Claude account. Connected local folders only through Desktop ([get started](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork), [surfaces](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile)) | Isolated environment on Anthropic's servers ([get started, "Session isolation"](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)). Per session: [I], matching the unified per-conversation VM | A cloud session can be moved into a project ([retention](https://support.claude.com/en/articles/10440198-configure-custom-data-retention-controls-for-enterprise-plans)). Files: [NS] | History at once, back end within 30 days ([get started](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)). Fetched file copies deleted ([surfaces](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile)) |
| Cowork, local (pre-2026-10-06 tasks, 3P) | Connected folder, otherwise the session's `outputs/` folder ([changelog](https://claude.com/docs/cowork/changelog), [local access](https://claude.com/docs/third-party/claude-desktop/local-access)) | **Yes** (`outputs/`, `uploads/`) ([data storage](https://claude.com/docs/third-party/claude-desktop/data-storage)) | [NS] | Task, attachment copies and outputs deleted. Live artifacts and connected folders stay ([data storage](https://claude.com/docs/third-party/claude-desktop/data-storage)) |
