# How AI assistants outside OpenAI and Anthropic organise chats and agent-created files

Research date: 2026-11-18. Sources were read on that date, and each one has a link. Pinned code and docs revisions:

- VS Code source: `microsoft/vscode` `main` @ `36e8c0289a5f29eae15a933263220d9895302ff6`. This is `main`, not a stable release. The code may not have shipped yet.
- VS Code docs source: `microsoft/vscode-docs` @ `c70b98c6db768eceb7c2a233f0d281ce5f6973ed`. Most pages I read show `DateApproved: 11/18/2026`. The key sentences were rechecked on the live code.visualstudio.com pages (see "Link check").

Evidence tags used below:

- **[docs]**: the vendor's own documentation, help center or release notes. This is what the vendor claims.
- **[code]**: something I read in the vendor's own repository.
- **[staff]**: a post by a vendor employee on the vendor's own forum. It is vendor-owned but is not documentation.
- **[user report]**: a user's post on the vendor's forum. It is not a vendor claim.
- **[inference]**: my own conclusion. No source states it.

Nothing here was tested on a running product. Everything is read, not observed.

---

## 1. Cursor

### Chats and the workspace folder

- **[docs]** Cursor 3 (released 2026-04-02) adds an **Agents Window** that works "across all your projects from one place" (multi-workspace). It also supports local, cloud and remote SSH agents and worktrees. The editor's agent side pane is still available. ([Agents Window](https://cursor.com/docs/agent/agents-window))
- **[docs]** Conversation search in the Agents Window searches past agent transcripts. "Cursor builds a local search index." ([Conversation search](https://cursor.com/help/ai-features/conversation-search))
- **[docs]** Side chats are "durable child conversations" and stay "attached to its parent and workspace". Closing a side chat archives it and does not delete it. ([Side chats](https://cursor.com/help/ai-features/side-chats))
- **[docs]** Checkpoints of agent edits are "stored locally and separate from Git" ([Agent overview, Checkpoints](https://cursor.com/docs/agent/overview)).

### Can a chat exist without a folder?

- **Local chats: yes.** The docs do not describe this. The vendor forum does:
  - **[staff]** In the Agents Window picker, a chat can be started under **No Repo** / **This Mac**. Such chats are grouped in a "No Repo" sidebar section. A staff post on 2026-10-02 says "a recent Cursor update" made that section impossible to hide. ([forum thread, CursorStaff posts #6 and #9](https://forum.cursor.com/t/chats-with-agents-picker-no-repo-this-mac-not-listed-in-sidebar-only-findable-via-search/167134/9))
  - **[staff]** History "is tied to where the chat was created". A chat started from the Welcome screen with no folder open "belongs to the no folder context" and does not show in a project window's History ([forum thread, CursorStaff post #4, 2026-08-24](https://forum.cursor.com/t/cannot-delete-a-single-no-repo-agent-conversation-history-ui-empty-no-delete-archive-option/169316/4)).
  - **[staff]** The sidebar chat list "is tied to an internal workspace identifier". Opening the same folder a different way can change that identifier and hide older chats. The data stays on disk. ([forum thread, CursorStaff post #8, 2026-04-13](https://forum.cursor.com/t/open-a-new-folder-my-chat-history-lost/157435/8))
  - **[user report]** Transcripts of No Repo chats are stored in `~/.cursor/projects/empty-window/agent-transcripts/`. Project chats are stored in `~/.cursor/projects/<slug>/agent-transcripts/`. ([bug report #1](https://forum.cursor.com/t/chats-with-agents-picker-no-repo-this-mac-not-listed-in-sidebar-only-findable-via-search/167134), [bug report #1](https://forum.cursor.com/t/open-a-new-folder-my-chat-history-lost/157435)). Staff did not dispute these paths, but no staff post or doc confirms them.
- **Where a local No Repo agent writes files: not documented.** I found no doc or staff post that gives the working directory of a local No Repo chat.
- **[docs]** Generated images go to "your project's `assets/` folder by default" ([Agent overview, Image generation](https://cursor.com/docs/agent/overview)). The behaviour with no project is not documented.
- **[docs]** Each canvas "appears in your workspace's canvas list". The storage location is not documented. Publishing a canvas creates a shared snapshot that you manage on the dashboard. ([Canvases](https://cursor.com/docs/agent/tools/canvas))
- **Cloud agents without a repo: yes, and each gets its own repository.**
  - **[docs]** "Start from scratch" starts a cloud agent "without a repository". "Cursor creates a draft Origin repository for the agent in the background, and the agent works in it from the first turn."
  - **[docs]** **Create repo** publishes the draft under a name, and it then appears at cursor.com/codebase.
  - **[docs]** If Origin is turned off for the team, "the agent starts without a repository". ([Cloud agent setup, Start from scratch](https://cursor.com/docs/cloud-agent/setup#start-from-scratch))
  - **[docs]** Each cloud agent "runs on its own dedicated virtual machine" ([Background agents](https://cursor.com/help/ai-features/background-agents)).
  - **[docs]** Artifact paths are "relative to the workspace's `artifacts/` directory". The older v0 API used absolute paths under `/opt/cursor/artifacts/...`. ([Cloud Agents API, List Artifacts](https://cursor.com/docs/cloud-agent/api/endpoints#list-artifacts))
  - **[docs]** Encrypted repository copies are "stored temporarily while the agent runs" and "deleted after the agent completes" ([Privacy and data governance](https://cursor.com/docs/enterprise/privacy-and-data-governance)).

### Per-chat folder

- **[docs]** Worktrees give one checkout per agent. In the Agents Window you can start an agent in a worktree or move it into one. In the IDE, `/worktree` runs the rest of the chat in a separate checkout, and `/best-of-n` gives each model its own worktree. ([Worktrees](https://cursor.com/docs/configuration/worktrees))
- **[docs]** The CLI puts worktrees in `~/.cursor/worktrees/<reponame>/<name>`, "alongside worktrees created from the editor" ([CLI, worktrees](https://cursor.com/docs/cli/using#cli-worktrees)).
- **[docs]** Worktree cleanup is count-based, with a default cap of 25 per machine (`cursor.worktreeMaxCount`). It can also delete worktrees that Cursor did not create. ([Worktrees, cleanup](https://cursor.com/docs/configuration/worktrees#worktrees-cleanup))
- **[docs]** Cursor **Projects** (cloud) keep a shared store. The Project store is mounted at `/cursor/stores/self` and the personal store at `/cursor/stores/user`. These are per Project, not per chat. ([Projects](https://cursor.com/docs/agent/projects), [Help: Projects](https://cursor.com/help/ai-features/projects))
- A Start-from-scratch cloud agent gets a per-agent draft Origin repo (see above).

### Delete

- **[staff]** For local chats, "permanent Delete … is not in the History UI right now by design. The main way to remove a chat is Archive." ([CursorStaff post #4](https://forum.cursor.com/t/cannot-delete-a-single-no-repo-agent-conversation-history-ui-empty-no-delete-archive-option/169316/4))
- **[docs]** For cloud agents, the API has **Archive** ("soft delete", reversible) and **Delete An Agent Permanently** ("irreversible") ([Cloud Agents API, Agent Lifecycle](https://cursor.com/docs/cloud-agent/api/endpoints#archive-an-agent)).
- What happens on delete to the agent's draft Origin repo, worktree or `assets/` files: **not documented**.

### Move

- **[docs]** An eligible top-level **cloud** chat can be added to a Project by drag-and-drop or **Add to Project**, and removed with **Remove from Project**. A local chat is first converted to Remote Control. ([Projects, Add and remove chats](https://cursor.com/docs/agent/projects#add-and-remove-chats))
- **[docs]** **Move to Cloud** "transfers your conversation history and context, but not dirty files or uncommitted edits". The cloud agent "starts from a clean git state". ([Cloud Agents help](https://cursor.com/help/ai-features/cloud-agents))
- **[docs]** An agent can be moved into a worktree from the Agents Window ([Worktrees](https://cursor.com/docs/configuration/worktrees)).
- Moving a local chat from one local folder to another: **not documented**. Staff say history is keyed to a workspace identifier ([CursorStaff post #8](https://forum.cursor.com/t/open-a-new-folder-my-chat-history-lost/157435/8)).

---

## 2. GitHub Copilot in VS Code

### Sessions, chats and the workspace

- **[docs]** "A session is the unit of work with an agent… It brings together the workspace and code changes for a task. A chat is a conversation within that session." A session can contain several chats. ([Understand sessions and chats](https://code.visualstudio.com/docs/agents/concepts/sessions))
- **[docs]** "Separate conversations don't guarantee separate files". Chats that use the same folder or worktree edit the same files. ([same page](https://code.visualstudio.com/docs/agents/concepts/sessions#chats-within-a-session))
- **[docs]** The sessions list in the Chat view "shows sessions for the current workspace". "With no workspace open, it shows sessions across workspaces." The Agents window groups sessions by workspace by default. ([Manage agent sessions](https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions#find-and-resume-a-session))
- **[docs]** There are several harnesses: Copilot (Agent Host), Local (to be removed in February 2027), Claude, Codex, and a Cloud target ([Choose an agent harness](https://code.visualstudio.com/docs/agents/run/agent-harnesses#compare-agent-harnesses)).

### Chats with no folder ("quick chats")

- **[docs]** "Quick chats aren't scoped to a project." They appear in a **Chats** group at the top of the sessions list (Agents window). With **No Workspace** selected, "each nested session uses its own temporary folder." ([Agents window, Start a quick chat](https://code.visualstudio.com/docs/agents/run/agents-window#start-a-quick-chat))
- **[docs]** "Select **No Workspace** for a separate temporary folder. This is preselected for quick chats. Temporary files aren't shared between workspace-less chats." ([Manage sessions, Run multiple chats in a session](https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions#run-multiple-chats-in-a-session))
- **[docs]** A chat without a workspace can also be started on a remote host by choosing **Chat** in the workspace picker ([Remote agent sessions](https://code.visualstudio.com/docs/agents/run/remote-agent-sessions#start-a-chat-without-a-workspace-on-a-remote-host)).
- **[code]** The helper that builds the scratch directory for a workspace-less chat returns `<userHome>/.copilot/chats/<sessionId>`. The only caller I found of `ensureWorkspacelessScratchDir` is the **Claude** harness. For the **Copilot** harness, the same path rests on two code comments ("shared across agent harnesses", "shared with the Copilot agent"), not on a call site I read.
  - In the source it is `workspacelessChatsRoot()` = `~/.copilot/chats` and `workspacelessScratchDir()` = `…/<sessionId>` ([common/workspacelessScratchDir.ts L14-L20](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/agentHost/common/workspacelessScratchDir.ts#L14-L20)).
  - It is described as "shared across agent harnesses" ([node/workspacelessScratchDir.ts L10-L15](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/agentHost/node/workspacelessScratchDir.ts#L10-L15)).
  - The Claude harness falls back to this directory and says it is "shared with the Copilot agent" ([claudeAgent.ts L1566-L1571](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/agentHost/node/claude/claudeAgent.ts#L1566-L1571)).
  - A code comment says other Copilot clients, such as the GitHub Copilot app, "nest theirs differently, such as `<date>/<name>`" ([same file L9-L13](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/agentHost/common/workspacelessScratchDir.ts#L9-L13)).
- **[code]** The agent is told: "This lightweight chat has a SCRATCH working directory, not a project or repository". Outputs there are "throwaway/exportable". The agent should use `set_workspace` only to change a repository. ([workspacelessInstructions.ts L9-L17](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/agentHost/node/shared/workspacelessInstructions.ts#L9-L17))
- **Classic Chat view with no folder open:** apart from the sessions list scope above, the docs give **no file destination** for agent-created files.

### Per-chat folder and worktrees

- **[docs]** In a Git workspace you choose **Branch** (edit the current folder) or **New Worktree** (a separate Git worktree from committed files; uncommitted and untracked files are not copied) ([Agents window, Choose where an agent makes changes](https://code.visualstudio.com/docs/agents/run/agents-window#choose-where-an-agent-makes-changes)).
- **[docs]** Managed session worktrees live in a `<repository>.worktrees` directory ([Manage sessions, Clean up session worktrees](https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions#clean-up-session-worktrees)).
- **[docs]** Nested sessions use the parent's folder or worktree by default, or "Supported nested sessions can use a different folder or worktree" ([Sessions concept](https://code.visualstudio.com/docs/agents/concepts/sessions#chats-within-a-session)).
- **[docs]** Cloud sessions (`feature(cloud-sessions)`, setting `chat.agentHost.cloudSandbox.enabled`) use "a managed environment running the Copilot runtime". In the Agents window they replace the Copilot cloud agent workflow on GitHub Actions for new Cloud sessions. ([Agent harnesses, Cloud sessions](https://code.visualstudio.com/docs/agents/run/agent-harnesses#cloud-sessions))
- **[docs]** In the Chat view, if no workspace repository is available, you can "start a cloud session without a repository" ([Run cloud sessions](https://code.visualstudio.com/docs/agents/run/cloud-sandbox-sessions#start-a-cloud-session)).
- **[docs]** On GitHub, GitHub Actions-based sessions "require a repository", and their chat data "is retained for 28 days". Cloud sandbox sessions "can span across repositories in one organization", and their data "is retained for the life of the account". ([GitHub Docs, Copilot on GitHub](https://docs.github.com/en/copilot/concepts/copilot-surfaces/copilot-on-github). The old `…/cloud-agent/about-cloud-agent` URL redirects there.)

### Delete

- **[docs]** For Copilot harness sessions, Delete "also removes associated worktrees created for the session". A shared worktree is removed only after the last linked session is deleted or archived. "Uncommitted files that exist only in a removed worktree can be lost." ([Manage sessions, Delete sessions](https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions#delete-sessions))
- **[docs]** Archiving or marking a session done commits uncommitted changes to the session branch and then removes the worktree folder. Restoring the session re-creates it. ([Manage sessions, Archive sessions](https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions#archive-sessions))
- **[docs]** Deleting a cloud session "deletes the cloud task. This doesn't confirm whether the underlying compute environment was deleted." ([Run cloud sessions, Review work and finish](https://code.visualstudio.com/docs/agents/run/cloud-sandbox-sessions#review-work-and-finish-a-session))
- **[docs]** Removing an artifact record "doesn't delete a file or website" ([Artifacts](https://code.visualstudio.com/docs/agents/run/artifacts)).
- **[code]** Deleting (tombstoning) a chat marks its recorded scratch folders `removing` ([agentHostDatabase.ts L4179-L4188](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/agentHost/node/agentHostDatabase.ts#L4179-L4188), [agentHostScratchFolderDatabase.ts L30-L34, L80-L85](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/agentHost/node/agentHostScratchFolderDatabase.ts#L30-L85)).
- **[code]** A cleanup pass then runs `fs.rm(path, { recursive: true, force: true })` on such folders. It keeps any folder that a live chat still lists, and archived chats count as live. ([agentHostWorktreeCleanupService.ts L137, L662-L695](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/agentHost/node/agentHostWorktreeCleanupService.ts#L662-L695))
- **Unverified:** whether the default per-session directory `~/.copilot/chats/<sessionId>` always gets a `scratch_folders` row, and so is removed on delete. The movability code treats "recorded as a scratch folder" and "the default scratch folder … of a workspace-less session" as separate cases ([agentHostChatMovability.ts L95-L98](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/agentHost/node/agentHostChatMovability.ts#L95-L98)). I did not find the call site that inserts rows.

### Move

- **[docs]** A quick chat can be continued in a workspace "without losing its conversation history". The agent asks for confirmation, and then "the chat moves to the workspace's group". This is supported for the Copilot and Codex harnesses. ([Agents window, Continue a quick chat in a workspace](https://code.visualstudio.com/docs/agents/run/agents-window#continue-a-quick-chat-in-a-workspace))
- **[docs]** A chat can be moved to another folder or a new worktree by asking the agent. This needs "a single-chat Agent Host session with one local folder", the Copilot harness or the experimental Codex integration, and a destination on the same host. "A folder move uses the destination's existing files, without moving or copying the original files." "Uncommitted changes stay in the original folder." ([Manage sessions, Move a chat to another folder or worktree](https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions#move-a-chat-to-another-folder-or-worktree))
- **[code]** The `set_workspace` tool description says "files are not moved or copied to the selected folder" ([sessionServerTools.ts L306](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/agentHost/node/shared/sessionServerTools.ts#L306)).
- **Unverified:** whether the old scratch folder is released after `set_workspace`.
- **[docs]** **Move chats between sessions (Experimental)** is controlled by `chat.agentHost.moveChats.enabled`, which is on by default in Insiders. "These moves change how conversations are grouped, not where they work. History and working folders are preserved, including worktrees and temporary folders." ([Organize sessions](https://code.visualstudio.com/docs/agents/run/sessions/organize-sessions#move-chats-between-sessions-experimental))
- **[docs]** Cloud sessions "don't receive local-session handoffs" ([Sessions concept, Hand off](https://code.visualstudio.com/docs/agents/concepts/sessions#hand-off-a-session)).

---

## 3. Microsoft 365 Copilot

### Chats

- **[docs]** Chats appear in the **Chats** list of the Copilot app. The **… More** menu offers **Rename**, **Move to notebook** ("Adds the chat conversation to Copilot Notebooks") and **Delete** ("Deletes the conversation from chat history"). A banner says **Home**, where "Chat and Cowork come together", is still rolling out. ([How Microsoft Copilot Chat history works](https://support.microsoft.com/en-us/microsoft-365-copilot/how-microsoft-365-copilot-chat-history-works), updated 2026-11-06)
- **[docs]** Prompts and responses are stored in "a hidden folder in the user's mailbox" (Exchange Online) ([Data protection and auditing](https://learn.microsoft.com/en-us/copilot/plan/architecture-data-protection-auditing), updated 2026-11-10).

### Where generated files are stored

- **[docs]** Uploaded files: "This folder in the user's OneDrive stores files that users upload to Copilot Chat" ([Data protection and auditing](https://learn.microsoft.com/en-us/copilot/plan/architecture-data-protection-auditing)). Also: "uploaded files are stored in a user's OneDrive for Business" ([Copilot Chat privacy and protections](https://learn.microsoft.com/en-us/copilot/plan/privacy-and-protections), updated 2026-11-03). Neither page gives the folder name.
- **[docs]** Generated Office files: "PowerPoint presentations generated by Copilot Chat are stored in the user's OneDrive if storage is available. Copilot-generated Word documents and Excel workbooks are available for download by the user." ([Copilot Chat privacy and protections](https://learn.microsoft.com/en-us/copilot/plan/privacy-and-protections)). No folder is named.
- **[docs]** Pages and Notebooks: "Pages and Notebooks are stored in OneDrive for Business". They count against the user's OneDrive quota, and deleted items go to the OneDrive recycle bin. Pages and Notebooks "created before November 2025 continue to be stored in the user-owned SharePoint Embedded container" (named "Pages" or "My workspace", shared with Loop). For those legacy notebooks there is "no end-user recycle bin". ([Overview of Copilot Pages and Copilot Notebooks storage](https://learn.microsoft.com/en-us/microsoft-365/loop/cpcn-storage), updated 2026-11-14)
  - **Conflict:** three other Microsoft sources still say SharePoint Embedded only, with no OneDrive split:
    - the [Data protection and auditing](https://learn.microsoft.com/en-us/copilot/plan/architecture-data-protection-auditing) page (2026-11-10);
    - the [Copilot Pages FAQ](https://support.microsoft.com/en-us/microsoft-365-copilot/frequently-asked-questions-about-microsoft-365-copilot-pages) (2026-11-06): "A Copilot Page is saved as a .page file in a new user-owned SharePoint Embedded container";
    - the public GitHub source of the storage page (`ms.date 03/13/2026`).

    I treat the live storage page as current because it is the newest and is the page that owns storage.
- **[docs]** Cowork (agentic):
  - "You can also access files that Cowork creates directly in your OneDrive Cowork folder at any time." The session side panel has an **Input folder** and an **Output folder**. ([Use Copilot Cowork](https://learn.microsoft.com/en-us/copilot/cowork/use-cowork), updated 2026-11-17)
  - "Files that Cowork creates are saved to your OneDrive and SharePoint workspace." ([Cowork FAQ](https://learn.microsoft.com/en-us/copilot/cowork/cowork-faq), updated 2026-11-17)
  - Files Cowork created are "Documents, decks, PDFs, and images saved to the user's OneDrive" ([Purview for Cowork](https://learn.microsoft.com/en-us/purview/ai-copilot-cowork)).
  - Custom skills go in `/Documents/Cowork/skills/`. That path is for skills, not outputs. ([Use Copilot Cowork](https://learn.microsoft.com/en-us/copilot/cowork/use-cowork))
  - "Cowork can't access or edit files stored locally on your device. It works with files in OneDrive and SharePoint." "Cowork can't delete files or folders in OneDrive or SharePoint." ([Cowork FAQ](https://learn.microsoft.com/en-us/copilot/cowork/cowork-faq)). The personal-account preview page says the same ([What Cowork uses and stores](https://support.microsoft.com/en-us/microsoft-365-copilot/cowork-uses-stores)).
- **Per-task subfolder inside the OneDrive Cowork folder: not documented.** The side panel's "Output folder" is a per-session view. Whether it maps to a per-session OneDrive folder is unverified.

### Delete

- **[docs]** Deleting **all** Copilot activity history (work account, My Account) sends a deletion request. "Any content that Copilot helped you with, and that you've saved in your file, won't be removed." ([Delete your Microsoft Copilot activity history](https://support.microsoft.com/en-us/privacy/delete-your-microsoft-365-copilot-activity-history)). This covers bulk history deletion, not a single chat.
- What deleting **one** chat does to a Page, an uploaded file or a generated PowerPoint: **not documented**.
- **[docs]** "Removing a reference doesn't delete the original file or content. It only removes it from your notebook." ([Remove a reference from your Copilot Notebook](https://support.microsoft.com/en-us/microsoft-365-copilot/remove-a-reference-from-your-microsoft-365-copilot-notebook))

### Move

- **[docs]** **Move to notebook** adds a chat to a Copilot Notebook ([Chat history](https://support.microsoft.com/en-us/microsoft-365-copilot/how-microsoft-365-copilot-chat-history-works)).
- **[docs]** On iOS, notebooks let users "organize related chats, output creations, and references into a persistent AI workspace" ([Release notes, New Copilot Notebooks design (iOS)](https://learn.microsoft.com/en-us/microsoft-365/copilot/release-notes?tabs=all)).
- What happens to files when a chat is moved: **not documented**. Files live in OneDrive or SharePoint Embedded, not in a chat folder, so a move most likely changes grouping only **[inference]**.

---

## 4. Google Gemini (consumer Gemini Apps)

### Chats

- **[docs]** When History is on, "Google stores your Gemini history in your Google Account". It is auto-deleted after 18 months by default; you can set 3 or 36 months, or turn auto-delete off. ([Manage & delete your history](https://support.google.com/gemini/answer/13278892?hl=en))
- **[docs]** "If you delete a chat in pinned and recent chats, it also deletes any content created in that chat (like Canvas docs and apps)". "If you're using Gemini Apps with a work or school account … you can't delete chats." ([Find & manage your recent chats](https://support.google.com/gemini/answer/13666746?hl=en&co=GENIE.Platform%3DDesktop))

### Canvas

- **[docs]** Canvas content lives in the chat ("Open the chat with the doc you want to share"), and changes are auto-saved. **Share & export** offers Export to Docs or Slides, or to Colab for Python. ([Create docs, apps & more with Canvas](https://support.google.com/gemini/answer/16047321?hl=en&co=GENIE.Platform%3DDesktop))
- **[docs]** Export to Docs "saves a new doc in Google Drive". Export to Sheets and Colab also save new files in Drive. ([Export responses](https://support.google.com/gemini/answer/14184041?hl=en&co=GENIE.Platform%3DDesktop))
- **[docs]** Canvas app data can be stored in Firebase. "Once you share any data with a Canvas app, you do not have the option to delete it, but the app creator does." ([Gemini Apps Privacy Hub](https://support.google.com/gemini/answer/13594961?hl=en))

### Gems

- **[docs]** A Gem's **Knowledge** files are uploaded or added from Drive. A Drive file stays live ("If you make changes to the file, these changes will be reflected in your Gem"). ([Use Gems](https://support.google.com/gemini/answer/15146780?hl=en&co=GENIE.Platform%3DDesktop)). Where uploaded knowledge files are stored is not documented.
- **[docs]** Gems from Google Labs (Opal), a different product from ordinary Gems, "are stored in the 'Opal' folder in your Google Drive". Deleting one there or in the Gems manager also deletes its interaction history. ([Privacy Hub](https://support.google.com/gemini/answer/13594961?hl=en))

### Notebooks (Gemini's project feature)

- **[docs]** Notebooks give "a continuous chat experience that remembers your sources, instructions, and ongoing discussions". They sync with the Gemini Notebook app. ([Organize your projects with notebooks](https://support.google.com/gemini/answer/16972047?hl=en&co=GENIE.Platform%3DDesktop))
- **[docs]** "Add an existing chat to a notebook" (More > Add to notebook) needs Keep Activity on ([same page](https://support.google.com/gemini/answer/16972047?hl=en&co=GENIE.Platform%3DDesktop)).
- **[docs]** "If you delete a notebook, any sources or chats that you added to that notebook will also be deleted." ([same page](https://support.google.com/gemini/answer/16972047?hl=en&co=GENIE.Platform%3DDesktop))
- Whether "add" moves or copies the chat, and whether a chat can be taken out of a notebook again: **not documented** on that page.

### Tasks (agent) and the files they create

- **[docs]** Tasks can "package results into downloadable files, like PDFs, documents, spreadsheets, and presentations". "When Gemini creates files as part of your task, you can access them directly in the task thread". Markdown and text files open in Canvas and can be exported as .txt, .md or to Drive. Tasks are currently for personal accounts only. ([Manage your tasks & workflows](https://support.google.com/gemini/answer/17094507?hl=en&co=GENIE.Platform%3DDesktop))
- **[docs]** No per-chat folder: "Your tasks share one computer. Gemini uses the same remote computer across all your tasks." That computer stores "tool login tokens, command history, and files". You can delete "all saved remote code execution files and data" in Task settings. ([Monitor & manage the remote computer](https://support.google.com/gemini/answer/18789153?hl=en))
- **[docs]** Turning off task mode deletes remote browser and code execution data. "Your tasks, threads, schedules, or any related files that Gemini updated or created will not be deleted." ([Manage your tasks](https://support.google.com/gemini/answer/17094507?hl=en&co=GENIE.Platform%3DDesktop))
- **[docs]** Gemini "can also create Google documents, presentations, and spreadsheets" through Workspace actions ([same page](https://support.google.com/gemini/answer/17094507?hl=en&co=GENIE.Platform%3DDesktop)). The Drive folder for these files is **not documented**.

---

## 5. Windsurf (now Devin Desktop) and JetBrains AI Assistant (quick)

Windsurf docs URLs (`docs.windsurf.com/windsurf/...`) now redirect to `docs.devin.ai/desktop/...`. The editor is documented as **Devin Desktop**.

- **[docs]** Cascade is now legacy: "Devin Desktop no longer starts new Cascade conversations and no longer opens old ones. New conversations start with Devin Local." ([Cascade (legacy)](https://docs.devin.ai/desktop/cascade))
- **[docs]** The Agent Command Center sidebar "lists every session in the workspace". You can "Filter, sort, and group sessions per workspace" and "Right-click a session to rename, organize into folders, or start child sessions". These folders group sessions in the list; they are not file folders. ([Agent Command Center](https://docs.devin.ai/desktop/agent-command-center))
- **[docs]** Devin Local worktrees live in `~/.windsurf/worktrees/<repo_name>` with random names. "You can only pick a worktree at the beginning of a session. Conversations cannot be moved to a different worktree once started." "When you delete a session, Devin Desktop keeps the worktree of that session." ([Devin Local Worktrees](https://docs.devin.ai/desktop/devin-local/worktrees))
- **[docs]** Legacy Cascade did the opposite: "if you manually delete a Cascade conversation, Devin Desktop will automatically delete the associated worktree". It also capped worktrees at 20 per workspace. ([Cascade (legacy), Worktrees > Cleanup](https://docs.devin.ai/desktop/cascade))
- **[docs]** By default the Devin Local agent "can only read/edit files within the workspace" ([Devin Local](https://docs.devin.ai/desktop/devin-local/overview)).
- Chats with no folder open: **not documented**.
- **[docs]** JetBrains AI Assistant "stores chat history separately for each project across IDE sessions". Chats can be renamed or deleted. ([AI Assistant 2026.3 Help, Chat with AI](https://www.jetbrains.com/help/ai-assistant/chat-mode.html)). Moving chats, folderless use and where agent files go are not covered there. Junie was not researched.

---

## Patterns across vendors [inference, not findings]

- **IDE agents (Cursor, VS Code, Devin Desktop)** key chat history to a workspace. Cursor (staff posts) and VS Code (docs) have a "no folder" chat mode; for Devin Desktop it is not documented. Only VS Code documents a **per-chat temporary folder** for it. The path `~/.copilot/chats/<sessionId>` comes from code and is confirmed for the Claude harness only.
- **Worktree-per-session** is now standard in Cursor, VS Code and Devin Desktop. They disagree on delete: VS Code deletes the worktree with the session, Devin Local keeps it, and legacy Cascade deleted it.
- **Cloud assistants (Microsoft 365 Copilot, Gemini)** keep no documented per-chat file folder. Files go to the user's general cloud storage (OneDrive, or Drive on export) or stay inside the chat (Gemini Canvas). Gemini Canvas content is deleted with its chat. For Microsoft 365, no source says that deleting one chat deletes its files.
- **Moving a chat** never moves or copies its files in any product where moving is documented. A VS Code folder move does change the chat's working directory. Moving a chat between sessions or notebooks changes only how it is grouped.

## Unverified or not found

- Cursor: working directory and file destination of a local **No Repo** chat; storage location of canvases; what happens to a Start-from-scratch draft Origin repo when the agent is deleted; the transcript paths (user reports only).
- VS Code: whether the Copilot harness (not only the Claude harness) uses `~/.copilot/chats/<sessionId>`, since I found no Copilot-harness call site; whether that folder is always recorded and removed on delete; whether `set_workspace` releases the scratch folder; file destination of the classic Chat view with no folder. The code is on `main` and may be newer than the stable release.
- Microsoft 365 Copilot: name of the OneDrive folder for uploaded or generated files (a search snippet mentioned "Microsoft Copilot Chat Files", but I did not find it on any fetched page); effect of deleting one chat on its Pages and files; whether Cowork creates a subfolder per task; the conflict between Microsoft sources on Pages and Notebooks storage (see §3).
- Gemini: Drive folder for files created through Workspace actions; whether "Add to notebook" moves or copies a chat; where uploaded Gem knowledge files are stored. Work and school (Gemini Enterprise) behaviour was not researched.
- JetBrains Junie: not researched.

## Link check

I reopened these pages on 2026-11-18 with curl and searched them for the claimed text (HTTP 200 alone was not counted):

1. https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions contains "separate temporary folder", "also removes associated worktrees" and "without moving or copying the original files". https://code.visualstudio.com/docs/agents/run/agents-window contains "Quick chats aren't scoped to a project", "own temporary folder" and "Continue a quick chat in a workspace". For these six sentences, the live VS Code site (Microsoft-owned) matches the repo source I read. I did not compare the rest of the pages.
2. https://docs.github.com/en/copilot/concepts/copilot-surfaces/copilot-on-github (where the old cloud-agent URL redirects) contains "Sessions require a repository", "Data is retained for 28 days" and "Data is retained for the life of the account", in the GitHub Actions versus cloud sandbox comparison table. This is the GitHub-owned page.
3. Also checked: https://www.jetbrains.com/help/ai-assistant/chat-mode.html contains "stores chat history separately for each project".

## Summary table

| Product | File location without a project | Per-chat folder | Move | Delete |
|---|---|---|---|---|
| **Cursor** (local IDE / Agents Window) | Local "No Repo" chats exist ([staff](https://forum.cursor.com/t/chats-with-agents-picker-no-repo-this-mac-not-listed-in-sidebar-only-findable-via-search/167134/9)). Their working directory is **not documented**. Transcripts are in `~/.cursor/projects/empty-window/…` (user report only). | Optional worktree per agent, in `~/.cursor/worktrees/<repo>/<name>` ([docs](https://cursor.com/docs/cli/using#cli-worktrees)). No per-chat temp folder is documented. | Into a worktree, or to Cloud: history moves, uncommitted files do not ([docs](https://cursor.com/help/ai-features/cloud-agents)). Between local folders: **not documented**. | Archive only; no permanent delete in the History UI "by design" ([staff](https://forum.cursor.com/t/cannot-delete-a-single-no-repo-agent-conversation-history-ui-empty-no-delete-archive-option/169316/4)). Worktrees are cleaned up by count, not by chat delete ([docs](https://cursor.com/docs/configuration/worktrees#worktrees-cleanup)). |
| **Cursor** (cloud agent) | "Start from scratch" creates a **draft Origin repo** for the agent; **Create repo** publishes it ([docs](https://cursor.com/docs/cloud-agent/setup#start-from-scratch)). | Yes: one VM per agent, artifacts in `artifacts/` ([docs](https://cursor.com/docs/cloud-agent/api/endpoints#list-artifacts)). | Add to or remove from a Project ([docs](https://cursor.com/docs/agent/projects#add-and-remove-chats)). | API Archive (soft) or permanent Delete ([docs](https://cursor.com/docs/cloud-agent/api/endpoints#archive-an-agent)). Fate of the draft repo: **not documented**. |
| **GitHub Copilot in VS Code** | Quick chat / **No Workspace**: "a separate temporary folder" per chat ([docs](https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions#run-multiple-chats-in-a-session)). The path is `~/.copilot/chats/<sessionId>` in code ([code](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/agentHost/common/workspacelessScratchDir.ts#L14-L20)); a call site was found for the Claude harness, and for the Copilot harness the path rests on code comments only. Classic Chat view with no folder: **not documented**. | Yes: a temporary folder for workspace-less chats. Optional worktree per session in `<repo>.worktrees` ([docs](https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions#clean-up-session-worktrees)). Cloud sessions use a managed environment. | A quick chat can move into a workspace with history kept ([docs](https://code.visualstudio.com/docs/agents/run/agents-window#continue-a-quick-chat-in-a-workspace)). Moving to another folder or worktree needs a single-chat Agent Host session with one local folder (Copilot or experimental Codex, same host), and does not move or copy files ([docs](https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions#move-a-chat-to-another-folder-or-worktree)). Moving between sessions (Experimental) keeps folders ([docs](https://code.visualstudio.com/docs/agents/run/sessions/organize-sessions#move-chats-between-sessions-experimental)). | Delete removes the session's worktrees; uncommitted files can be lost ([docs](https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions#delete-sessions)). Recorded scratch folders are `rm -rf`'d by a cleanup pass ([code](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/agentHost/node/agentHostWorktreeCleanupService.ts#L662-L695)). Whether the default scratch folder is always included: unverified. Cloud: deleting the task does not confirm the compute is deleted ([docs](https://code.visualstudio.com/docs/agents/run/cloud-sandbox-sessions#review-work-and-finish-a-session)). |
| **Microsoft 365 Copilot** | User's **OneDrive**: uploads ([docs](https://learn.microsoft.com/en-us/copilot/plan/architecture-data-protection-auditing)); generated PowerPoint (Word and Excel are download only) ([docs](https://learn.microsoft.com/en-us/copilot/plan/privacy-and-protections)); Pages and Notebooks since November 2025, earlier ones in SharePoint Embedded ([docs](https://learn.microsoft.com/en-us/microsoft-365/loop/cpcn-storage); other Microsoft pages conflict); Cowork outputs in the "OneDrive Cowork folder" ([docs](https://learn.microsoft.com/en-us/copilot/cowork/use-cowork)). | No per-chat folder is documented. Cowork shows a per-session Input/Output view; a per-session OneDrive subfolder is not documented. | **Move to notebook** ([docs](https://support.microsoft.com/en-us/microsoft-365-copilot/how-microsoft-365-copilot-chat-history-works)). Effect on files: not documented; files stay in OneDrive [inference]. | Deleting all activity history keeps saved file content ([docs](https://support.microsoft.com/en-us/privacy/delete-your-microsoft-365-copilot-activity-history)). Effect of deleting one chat on its files or Pages: **not documented**. Deleted Pages and Notebooks go to the OneDrive recycle bin, except legacy notebooks, which have no recycle bin ([docs](https://learn.microsoft.com/en-us/microsoft-365/loop/cpcn-storage)). |
| **Google Gemini** | Canvas content lives **inside the chat** ([docs](https://support.google.com/gemini/answer/16047321?hl=en&co=GENIE.Platform%3DDesktop)). Exports are new files in **Google Drive** ([docs](https://support.google.com/gemini/answer/14184041?hl=en&co=GENIE.Platform%3DDesktop)). Task files are in the task thread ([docs](https://support.google.com/gemini/answer/17094507?hl=en&co=GENIE.Platform%3DDesktop)). Gems from Google Labs are in the Drive "Opal" folder ([docs](https://support.google.com/gemini/answer/13594961?hl=en)). | No: "Your tasks share one computer" ([docs](https://support.google.com/gemini/answer/18789153?hl=en)). | **Add to notebook** (needs Keep Activity) ([docs](https://support.google.com/gemini/answer/16972047?hl=en&co=GENIE.Platform%3DDesktop)). Move versus copy: not documented. | Deleting a chat also deletes Canvas docs and apps created in it ([docs](https://support.google.com/gemini/answer/13666746?hl=en&co=GENIE.Platform%3DDesktop)). Deleting a notebook deletes its chats and sources ([docs](https://support.google.com/gemini/answer/16972047?hl=en&co=GENIE.Platform%3DDesktop)). Work and school users can't delete chats. Exported Drive files are separate files and are not deleted with the chat [inference]. |
| **Windsurf / Devin Desktop** | **Not documented**. The agent is limited to the workspace by default ([docs](https://docs.devin.ai/desktop/devin-local/overview)). | Optional worktree per session in `~/.windsurf/worktrees/<repo>` ([docs](https://docs.devin.ai/desktop/devin-local/worktrees)). | Cannot move to another worktree after the session starts ([docs](https://docs.devin.ai/desktop/devin-local/worktrees)). Sidebar "folders" group sessions only ([docs](https://docs.devin.ai/desktop/agent-command-center)). | Devin Local keeps the worktree on session delete ([docs](https://docs.devin.ai/desktop/devin-local/worktrees)). Legacy Cascade deleted it ([docs](https://docs.devin.ai/desktop/cascade)). |
| **JetBrains AI Assistant** | Not documented. History is per project ([docs](https://www.jetbrains.com/help/ai-assistant/chat-mode.html)). | Not documented. | Not documented. | A chat can be deleted from Chat History ([docs](https://www.jetbrains.com/help/ai-assistant/chat-mode.html)). Effect on files: not documented. |
