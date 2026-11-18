# OpenCode 2 (v2.3.0): how chats map to folders

Source: `spike/oc2/opencode` at tag v2.3.0 (local spike worktree, `spike/oc2/opencode`).
All paths below are relative to that root. I only read code; nothing was run.
**[inferred]** marks a conclusion drawn from code paths rather than a line that states it.

Terms: "hidden root" is the hidden default project's folder. "Chat folder" is a per-chat folder.

---

## 1. Session and folder

**Storage.** `session_v2` has these columns (`packages/core/src/session/sql.ts:28-47`):
- `project_id`: NOT NULL, FK to `project.id`, `onDelete: "cascade"`;
- `workspace_id`: nullable;
- `directory`: NOT NULL;
- `path`: the subpath of the directory under the project root.

`fromRow` maps them to `location: { directory, workspaceID }` plus `subpath` (`packages/core/src/session/info.ts:43-47`).

**The Location type.**
- `Location.Ref = { directory, workspaceID? }` (`packages/schema/src/location.ts:8-12`).
- `PublicRef`, the shape the HTTP API accepts, **omits `workspaceID`** (`packages/schema/src/location.ts:14-16`).
- `Location.Info` adds `project: { id, directory, canonical }` (`packages/schema/src/location.ts:19-27`).

**Where the project comes from: it is derived from the directory, never assigned.**
- On create, the handler passes `payload.location`, or `process.cwd()` when it is absent (`packages/server/src/handlers/session.ts:114`).
- Core takes the location from the parent or the input, calls `projects.resolve(location.directory)`, and stores `projectID` and `subpath = relative(project.directory, location.directory)` (`packages/core/src/session.ts:296-310`).
- The create endpoint accepts `location: PublicRef` and per-session `permissions` (`packages/protocol/src/groups/session.ts:167-179`). It has no `projectID` field.

`Project.resolve` (`packages/core/src/project.ts:426-459`) works as follows:
- It walks up from the directory looking for `.git` or `.hg`, with **no stop** (`packages/core/src/project.ts:429`).
- **git:** the ID comes from the normalized remote, then a cached `<gitdir>/opencode` file, then the root commit (`packages/core/src/project.ts:364-367`). If none of these exists, the ID is **`ID.global`** (`packages/core/src/project.ts:377`). The project directory is the repo worktree; `canonical` is the main checkout (`packages/core/src/project.ts:368-380`).
- **No VCS:** `id = hash("directory:" + dir)` and `directory = canonical = dir` (`packages/core/src/project.ts:453-458`). **Every distinct non-VCS directory is its own project.**
- Resolving persists a project row (`packages/core/src/project.ts:141-148`). `Location` persists only when the directory exists (`packages/core/src/location.ts:28-29`).

**Working directory = `session.location.directory`.**
- Per-session services are provided by `session.location` (`packages/core/src/effect/app-node-builder.ts:15`, `packages/core/src/location-services.ts:116`). The Location service is built from that ref (`packages/core/src/location.ts:20-35`).
- Each distinct location is a full service graph: config, plugins, MCP, file watcher, snapshot and so on (`packages/core/src/instance.ts:64-122`).
- The system prompt states it: `Working directory: ${location.directory}`, `Workspace root folder: ${location.project.directory}`, `Is directory a git repo` (`packages/core/src/instructions/builtins.ts:38-41`).
- The shell `cwd`, glob, grep and the file tools resolve relative to `location.directory` (`packages/core/src/tool/plugin/shell.ts:293`, `packages/core/src/file-access.ts:91`).
- The directory must already exist. FileSystem boot fails with `DirectoryNotFoundError` (`packages/core/src/filesystem.ts:120-127`).

**Can two sessions of one project have different working directories?**
- **Yes, for git and hg projects.** Subdirectories of the repo get the same ID and a different `subpath` (`packages/core/src/session.ts:310`). Git worktrees get the same ID because it comes from the remote or root commit, with `directory != canonical` (`packages/core/src/project.ts:368-380`).
- **No, for a non-VCS project.** Any other directory, including a subfolder of the project folder, hashes to a different project ID (`packages/core/src/project.ts:454`).
- Session listing filters by exact `directory`, or by `project` plus an exact `subpath`. There is no prefix filter (`packages/core/src/session/store.ts:158-161`; `packages/schema/src/session.ts:104-109`).

---

## 2. Workspaces and worktrees

These are two unrelated things that share the word "workspace".

### 2a. UI "Рабочие пространства" = git worktrees
- English label: "Worktrees" (`packages/app/src/runtime/i18n/en.ts:1314`). Russian: `packages/app/src/runtime/i18n/ru.ts:646`.
- The delete warning says the directory and branch are removed (`packages/app/src/runtime/i18n/ru.ts:655`, `packages/app/src/runtime/i18n/en.ts:1337`), and that linked sessions stay but lose their directory (`packages/app/src/runtime/i18n/ru.ts:660`, `packages/app/src/runtime/i18n/en.ts:1341`).
- The settings page calls `vcs.status`, `vcs.diff` and `worktree.remove` (`packages/app/src/settings/workspaces/workspaces.tsx:208-212, 258-262`).
- The new-session picker is visible only for git (`packages/app/src/new-session/workspace/controller.ts:39-41, 129-134`). The new worktree is created from `project.canonical` (`packages/app/src/workspaces/create.ts:11-17`). The new session is then created with `location.directory` set to that worktree (`packages/app/src/new-session/composer-adapter.ts:195-214`, the `location` field at `:207`).
- What creates one: `Worktree.create` (`packages/core/src/worktree.ts:204-255`):
  - it loads the project's strategy set;
  - the parent directory defaults to `global.data/worktree/<first 6 chars of project ID>` (`packages/core/src/worktree/strategies.ts:51`);
  - the name is a slug; it calls `strategy.create`, records a `worktree` row, and runs the project's `commands.start` if one is set.
  - HTTP: `packages/protocol/src/groups/worktree.ts:23-65` (list, create, remove, refresh).
- **Git-specific by default.** The only built-in strategy is `git` (`packages/core/src/worktree/strategies.ts:52-53`), and it requires a git repo (`packages/core/src/worktree/git.ts:17-18`).
  - Plugins can add a strategy; the newest one becomes selected (`packages/core/src/plugin/host.ts:554-564`, `packages/core/src/worktree/strategies.ts:58-63`).
  - **[inferred]** A custom non-git strategy still does not give a non-VCS project per-session directories. `Project.resolve` ignores the `worktree` table for non-VCS directories (`packages/core/src/project.ts:426-459`), so the new directory would resolve to a new hashed project.

### 2b. `Location.workspaceID` = remote or sandbox execution placement
- The `Workspace` service and driver: create, provision, connect, destroy (`packages/core/src/workspace.ts:36-53`; `packages/core/src/workspace/driver.ts:26-62`).
- When `workspaceID` is set, Environment binds to the driver; otherwise it uses the local driver (`packages/core/src/environment/environment.ts:24-32`).
- The default driver registry is empty (`packages/core/src/workspace/driver.ts:88`). Only the embedded SDK can inject providers (`packages/sdk/src/internal/host.ts:21, 43-44`).
- It is **not reachable over HTTP**: `PublicRef` omits it (`packages/schema/src/location.ts:14-16`), the move handler does not pass it (`packages/server/src/handlers/session.ts:266-273`), and there is no workspace group in `packages/protocol/src/groups/`.
- It is not git-specific. It is not a folder mechanism either: it moves execution to another machine or sandbox. Worktree adoption skips workspace sessions (`packages/schema/src/worktree.ts:82`).

**Answer.** A session can run in its own directory inside a project without becoming its own project **only when the project root carries a `.git` or `.hg` marker**, as a subdirectory or a git worktree. A non-VCS hidden project cannot do this. `workspaceID` does not apply.

---

## 3. Moving a session

**An API exists.**
- Endpoint: `POST /api/session/:id/move` with `{ directory, delivery? }` (`packages/protocol/src/groups/session.ts:328-340`). Handler: `packages/server/src/handlers/session.ts:266-287`.
- Core: `SessionMove.move` (`packages/core/src/session/move.ts:40-159`).
  - The destination must exist and be a directory (`packages/core/src/session/move.ts:82-84`).
  - The project is **re-resolved from the destination** and the subpath is recomputed (`packages/core/src/session/move.ts:85-89`). The destination Location is booted to check it (`packages/core/src/session/move.ts:91-100`).
  - A `move` inbox item is admitted (`packages/core/src/session/move.ts:124-155`). The runner applies it at the next safe boundary (`packages/core/src/session/runner/llm.ts:107-113`). If the source is unavailable and the session is idle, the move applies immediately (`packages/core/src/session/move.ts:133-146`).
- The projector rewrites `directory`, `path`, `project_id` and `workspace_id` (`packages/core/src/session/projector.ts:896-907`).
- The model is told: "The working directory has been changed to …" (`packages/core/src/session/runner/to-llm-message.ts:257`).
- Other callers:
  - The app already uses move when a session's folder is missing (`packages/app/src/session/composer/location-missing.tsx:137`).
  - The agent has a pinned `session_move` tool, gated by `external_directory` (`packages/core/src/tool/plugin/opencode.ts:140-160`).

**What move does not do.**
- It moves **no files**. There are no file operations in `packages/core/src/session/move.ts`.
- Saved "always allow" approvals stay with the old project (`packages/core/src/permission.ts:159-166, 342`).
- Snapshot repos are per project and checkout (`packages/core/src/snapshot.ts:96`). A diff range across a location switch is rejected (`packages/core/src/session/diff.ts:35-36`).
- **[inferred]** Child sessions are not moved. `packages/core/src/session/move.ts` updates only one session, while children are created at the parent's location (`packages/core/src/session.ts:296`).

**What is missing for "the files move with the chat".** The app has to move the files itself, then call `session.move`.
- **The move destination decides the project.** For the chat to land in a non-VCS project, `session.move` must point at **exactly that project's folder**. A subfolder of it is a separate hashed project (`packages/core/src/project.ts:453-458`, `packages/core/src/session/move.ts:85`).
  - The chat's files may go into a subfolder, but the session directory must be the project folder itself. **[inferred]**
- With the shared folder, the app first has to work out which files belong to the chat. OC2 snapshots, which record per-turn file changes, run **only for git** (`packages/core/src/snapshot.ts:119`). A non-git shared folder therefore has no OC2 record of a chat's files beyond the tool calls in its transcript. **[inferred]**
- An OC2 patch is not needed for either case.

---

## 4. Deleting a session

`Session.remove` (`packages/core/src/session.ts:402-416`) does the following:
- interrupts and awaits idle, cancels jobs, closes the model transport, and clears in-memory env vars;
- publishes `Deleted`, deletes the session's event rows (`packages/core/src/bus.ts:685-697`), and recurses into children.

The projector deletes the row and its blob refs. Blobs live in the DB (`packages/core/src/session/projector.ts:963-967`; `packages/core/src/session/blob.ts:468-491, 502-503`), and messages cascade (`packages/core/src/session/sql.ts:90-93`).

Other subscribers to `Deleted`:
- PTY terminals of the session are removed (`packages/core/src/persistent-pty/index.ts:401-431`);
- websearch preferences (`packages/core/src/websearch.ts:96`), goal plugin storage (`packages/core/src/plugin/goal.ts:289`) and warming state (`packages/core/src/plugin/warming.ts:192, 202`) are cleared.

**Nothing on disk in the working directory is touched.**
- **[inferred]** No subscriber removes the snapshot repo under `global.data/snapshot/<project>/<hash>` (`packages/core/src/snapshot.ts:96`).
- `tool-output` files are age-based, not per session (`packages/core/src/tool-output.ts:40-50, 63`).
- The Location graph is evicted after 60 minutes idle (`packages/core/src/location-activity.ts:30, 86-115`; wired into the server at `packages/server/src/routes.ts:87`). Without it, graphs would stay forever (`packages/core/src/location-services.ts:58`).
- The project row stays. There is **no project delete API**; only list and update exist (`packages/protocol/src/groups/project.ts:17, 29`). The sweep archives a project only once all its directories are gone and it has been idle for an hour (`packages/core/src/project.ts:461-505`).
- Worktree deletion is a separate call (`packages/core/src/worktree.ts:257-271`).
- "Delete the chat's files too" is therefore app work: delete the chat folder, or work out the chat's files in the shared folder. **[inferred]**

---

## 5. Cost

### Options
- **(a)** One shared hidden folder. This is the current decision.
- **(b1)** A separate hidden project per chat. Create `<hidden root>/<chat-id>/` and call `session.create({ location: { directory } })`. Because the hidden root has no VCS marker, each chat folder **automatically** becomes its own hashed project (`packages/core/src/project.ts:453-458`).
- **(b2)** A per-chat subfolder inside one hidden project. This works only if the hidden root is a git repo with a commit or a remote.
  - **[inferred]** After a plain `git init` with no commit, the ID is `global` (`packages/core/src/project.ts:364-377`), and markerless sessions under that folder are adopted into `global` (`packages/core/src/project.ts:204-244`, `packages/core/src/session/projector.ts:911-960`).
- **(b3)** A git worktree per chat inside a git hidden project. This adds a branch per chat, and the folder lives in `global.data/worktree/...` (`packages/core/src/worktree/strategies.ts:51`), not next to the other folders. It is heavier than (b2) with no gain.
- **(b4)** `workspaceID`. Not applicable; see §2b.

**Caveat for every option: an ancestor VCS marker.** The marker walk has no stop (`packages/core/src/project.ts:429`). If the hidden root sits under any folder with `.git` or `.hg` (for example a home directory kept in git), (a) and (b1) become sessions of that repo's project. Then (b1) behaves like (b2). **[inferred]**

### Mechanisms that already exist; no OC2 patch needed for any option
- `session.create` with any existing directory (`packages/protocol/src/groups/session.ts:167-179`);
- automatic project resolution (`packages/core/src/project.ts:426-459`);
- `session.move` (`packages/protocol/src/groups/session.ts:328-340`);
- per-session permission rulesets at create (`packages/protocol/src/groups/session.ts:179`, `packages/core/src/session.ts:316`);
- `project.update` for a name (`packages/protocol/src/groups/project.ts:29`);
- idle Location eviction (`packages/core/src/location-activity.ts:30`).

### What needs work
- **(a)** No OC2 work. App: "move files with the chat" and "delete the files too" need per-chat file attribution, which a non-git shared folder does not give (§3). **[inferred]**
- **(b1)** No required OC2 patch. App work:
  1. `mkdir` the chat folder before `session.create`; a missing folder fails (`packages/core/src/filesystem.ts:120-127`).
  2. Hide N projects. The client lists every non-archived project (`packages/client/src/solid/data.ts:2075-2086`), and `ProjectTable` has no hidden flag (`packages/core/src/project/sql.ts:12-29`). The app would filter by `canonical` under the hidden root. **[inferred]**
  3. The "chats without a project" list spans N projects. There is no prefix filter (`packages/core/src/session/store.ts:158-161`), so the app either lists all sessions and filters on the client, or **patches** a directory-prefix filter into `packages/core/src/session/store.ts`, `packages/schema/src/session.ts:104-109` and the protocol, then regenerates the client. **[inferred]**
  4. Project rows accumulate. There is no delete API; rows are only archived after the folder is gone (`packages/core/src/project.ts:461-505`). A **patch** is needed only if rows must be removed for real.
  5. Moving into a real project:
     - move the chat's files into the project folder, either at its top level or into a subfolder;
     - call `session.move` with **the project folder itself** as the directory, so the project ID switches to that project (`packages/core/src/session/move.ts:85`, `packages/core/src/project.ts:453-458`);
     - delete the empty chat folder. Its project row is archived by the sweep. **[inferred]**
- **(b2)** No OC2 patch, but git brings side effects. App work:
  - `git init` and a first commit;
  - `mkdir` per chat;
  - hide the worktree UI, which shows up because `vcs` is git (`packages/app/src/new-session/workspace/controller.ts:39-41`);
  - accept that chats can see each other's files without any prompt (see below).
  - Gain: one project in the list, and `session.list({ project })` returns every hidden chat (`packages/core/src/session/store.ts:160`).
  - Gain: snapshots and revert work and are scoped to the chat subfolder (`packages/core/src/snapshot.ts:110-119`).

### Side effects

**Project list.**
- Stock app grouping:
  - Home groups a session under the project whose `worktree` (or a sandbox) **equals** the session directory, and falls back to `projectID` (`packages/app/src/home/sessions/records.ts:46-58`).
  - The session screen uses `projectID`, then containment (`packages/app/src/session/model.ts:129-136`).
- (a): one hidden project.
- (b1): one project per chat; the app filters them, and old rows linger.
- (b2): one project.

**System prompt** (`packages/core/src/instructions/builtins.ts:38-41`).
- (a): every chat sees the same working directory.
- (b1): the working directory and the "Workspace root folder" are both the chat folder; git repo = no.
- (b2): the working directory is the chat folder, the root is the hidden root, and git repo = **yes**.

**File-tool scope** (`packages/core/src/file-access.ts:91-95`). A path is "internal", and so needs no `external_directory` check, when it is inside `location.directory` **or** inside `project.directory`, unless that directory is the filesystem root.
- (a): every chat shares one folder, so there is no isolation.
- (b1): other chats' folders are external.
- (b2): other chats' folders are **internal**. Inside a chat, the resource of a sibling's file is relative, such as `../other/x` (`packages/core/src/file-access.ts:99`).

**`external_directory` rules.**
- Stock agents start from `{"*","*","allow"}` (`packages/schema/src/agent.ts:46-51`, used at `packages/core/src/agent.ts:81`). With no config, external access is **allowed without a prompt**. `ask` applies only when no rule matches (`packages/core/src/permission.ts:94-103`).
- "Always allow" approvals are saved per project (`packages/core/src/permission.ts:159-166, 342`; `packages/core/src/permission/saved.ts:59-84`). In (b1) they do not carry over between chats; the saved pattern is the target's VCS root or its directory (`packages/core/src/file-access.ts:115`).
- Isolation therefore needs either config rules or per-session rules at create (`packages/protocol/src/groups/session.ts:179`). **[inferred]** In (b2) that would be a `read`/`edit` deny on `../*`. Wildcard matching of `../` was not checked.

**`AGENTS.md` lookup** (`packages/core/src/config/plugin/instruction.ts:36-58, 84-94`).
- The walk goes from `location.directory` up to **home** when the folder is under home, otherwise up to the project root (`packages/core/src/config/plugin/instruction.ts:40`).
- **[inferred]** An `AGENTS.md` in the hidden root or any ancestor up to home is found in (a), (b1) and (b2) alike.
- The read tool adds nested `AGENTS.md` files found below the location (`packages/core/src/tool/plugin/read.ts:129-145`).
- Config discovery (`.opencode`, `opencode.json`) walks every ancestor with no stop (`packages/core/src/config/discovery.ts:77-81`), so shared config in the hidden root applies to every chat folder.

**Resources.**
- Each distinct directory boots a full Location graph (`packages/core/src/instance.ts:64-122`), kept until 60 minutes idle (`packages/core/src/location-activity.ts:30`).
- A local stdio MCP server without an explicit `cwd` runs in the location directory (`packages/core/src/mcp/stdio.ts:43-44`), and the pool key includes the `cwd` (`packages/core/src/mcp/pool.ts:47, 71-74, 123`).
  - **[inferred]** (b1) and (b2) therefore run up to one MCP process per active chat. I did not check whether connections start at Location boot or on first use.
- **[inferred]** Setting an absolute `cwd` for the bundled MCP servers makes them shareable again.

**Project identity can change under a chat.** **[inferred]** If the agent runs `git init` and commits in a non-VCS folder, the next resolve adopts the sessions under it into the new git project (`packages/core/src/project.ts:186-245`; `packages/core/src/session/projector.ts:908-962`).
- (a): every chat moves at once.
- (b1): only that chat moves.

---

## Conclusion

- OC2 supports a per-chat folder with **no patch**: create the folder and pass it as `location.directory`.
- Because a non-VCS directory is its own project, **(b1) one hidden project per chat is what OC2 does by default**.
- **(b2), one hidden project with per-chat subfolders, needs the hidden root to be a git repo with a commit.** That turns on git behaviour (worktree UI, snapshots, "git repo: yes") and makes every chat's folder internal to every other chat. Not recommended.
- `workspaceID` is not a folder mechanism and is not exposed over HTTP.
- In OC2, neither move nor delete touches files, so in every option the file handling is app work. (b1) makes it simple, because the chat's files are exactly its folder.
  - Moving into a project means moving the files into the project folder, then `session.move` to **exactly** that folder.
- The real cost of (b1) is in the app:
  - hiding N projects and gathering the chats without a project across them;
  - stale project rows, which are archive-only;
  - one Location graph per active chat (60-minute idle eviction) plus local MCP processes for servers without an explicit `cwd`.
- The cost of (a) is losing per-chat file attribution, which "move files with the chat" and "delete with files" need.
