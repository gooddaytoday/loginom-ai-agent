# Git-based extension stores end to end: Obsidian, Raycast, Zed, Homebrew taps

Checked on 2026-11-18. The notes use primary sources only: operator docs, guidelines and blogs, the stores' own repositories, and public client or server code.

## How to read these notes

Each bullet carries one tag:

- **[claimed]**: the operator states it in its docs, guidelines or blog.
- **[repo]**: I read it in the store's repository (CI workflow, script, data file, client or server code).
- **[observed]**: my own request to a live endpoint, or a count I made on 2026-11-18. It is a single check, not monitoring.
- **[inference]**: my own conclusion from the tagged facts. No source states it.

Repository links are pinned to the commits I read:

| Repository | Commit read |
| --- | --- |
| `obsidianmd/obsidian-releases` | `2512b11d937f22a1d98c041d7ff9e35763cf0f3c` |
| `obsidianmd/obsidian-developer-docs` | `1c26772ac13d6e9870c865936d389fdfe694e742` |
| `obsidianmd/obsidian-help` | `cbe447c1a46d3f522bdc3b0fd81dfb9df3e7f5bf` |
| `raycast/extensions` | `7aed2b9403a2b7e40694d686da74ba5a5ff0f672` |
| `raycast/github-actions` (tag `v1.18.0`) | `12c8fe884f1e0bd1a06afee44ec92e7c1dd9d9f6` |
| `zed-industries/extensions` | `bfa28dc77e250b3f930515bfd64609b2d15f126a` |
| `zed-industries/zed` | `e944cfa2fe622a7a15041b9dfc7770933792857c` |
| `Homebrew/brew` (docs) | `923f19762b78c858f136f5ef4a4a3bdd76dae7f4` |
| `Homebrew/formulae.brew.sh` | `060a6979774f75123d6e02ea4326c3ef5aefdb1a` |

## Short answer

- **Of the three app stores, only Zed still uses a pull request to a git repo as the only way to submit and update.** Even there the catalog is a server database, not the repo. Homebrew taps are the one model here where the git repo itself is the catalog.
  - **Obsidian left that model in May 2026.** Pull requests on `obsidian-releases` are now disabled. Authors submit on `community.obsidian.md` with an Obsidian account, and an automated scanner reviews every release. `community-plugins.json` is now an hourly mirror of the directory's own JSON.
  - **Raycast keeps the pull request as the review gate**, but the merge triggers a build in Raycast's CI and an upload to Raycast's own store backend. The repo holds the source; it is not the catalog.
- **Who builds:**
  - Obsidian installs files the author built, straight from the author's GitHub release.
  - Raycast and Zed build from source in their own CI and host the result.
  - `homebrew/core` builds bottles in Homebrew's CI.
  - A third-party tap builds and hosts whatever its owner chooses.
- **Install integrity:** Obsidian and Raycast document no signature check on install. I could read only Zed's client: its only check is that the download size matches `Content-Length`.
  - Obsidian scores GitHub artifact attestations on its scorecard but does not say the app verifies them.
  - Homebrew is the only one with pinned `sha256` checksums, JWS-signed metadata and opt-in verification of provenance attestations.
- **Disabling copies users already have installed:**
  - Obsidian documents a remote per-version disable list that the app polls every 12 hours.
  - Raycast's Enterprise allow-list stops installed extensions for one organisation. In practice Raycast also ships a stub update that replaces an extension's commands with a deprecation notice.
  - Zed has only a suppression list compiled into the client.
  - After Homebrew's `disable!`, actions on the formula fail with an error ([lifecycle](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/Deprecating-Disabling-and-Removing.md?plain=1#L7-L13)).
- **Private catalogs:** Homebrew supports them fully (private taps, API and bottle mirrors). Raycast offers a paid private store hosted by Raycast. Obsidian and Zed have no supported private catalog: you install manually into a folder, or as a dev extension.

---

## 1. Obsidian community plugins (`obsidian-releases`, `community-plugins.json`)

### The submission model has changed

- **[observed]** Pull requests are disabled on `obsidianmd/obsidian-releases`. The GitHub API reports `has_pull_requests: false` and `pull_request_creation_policy: collaborators_only` ([API](https://api.github.com/repos/obsidianmd/obsidian-releases)).
  - The last commit to `community-plugins.json` before the mirror started was pull request #11271 on 2026-04-23 ([commit](https://github.com/obsidianmd/obsidian-releases/commit/fad31d08084672df56f21751c50d43db7f44c6e7)).
- **[repo]** A workflow added on 2026-05-12 ([commit](https://github.com/obsidianmd/obsidian-releases/commit/652de396e9)) runs every hour ([cron](https://github.com/obsidianmd/obsidian-releases/blob/2512b11d937f22a1d98c041d7ff9e35763cf0f3c/.github/workflows/mirror-community-json.yml#L6)). It does the following:
  - downloads `https://community.obsidian.md/assets/community-plugins.json` and the themes file ([L18-L19](https://github.com/obsidianmd/obsidian-releases/blob/2512b11d937f22a1d98c041d7ff9e35763cf0f3c/.github/workflows/mirror-community-json.yml#L18-L19));
  - checks the shape, the `owner/name` repo format and duplicate IDs;
  - refuses the update if it keeps fewer than 95% of the previous entries, or fewer than 1,500 plugins ([L21-L26](https://github.com/obsidianmd/obsidian-releases/blob/2512b11d937f22a1d98c041d7ff9e35763cf0f3c/.github/workflows/mirror-community-json.yml#L21-L26));
  - commits the result as "Obsidian Bot" ([L212](https://github.com/obsidianmd/obsidian-releases/blob/2512b11d937f22a1d98c041d7ff9e35763cf0f3c/.github/workflows/mirror-community-json.yml#L212)).
- **[repo]** Download stats are mirrored daily from `community.obsidian.md` in the same way ([plugin-stat.yml L17](https://github.com/obsidianmd/obsidian-releases/blob/2512b11d937f22a1d98c041d7ff9e35763cf0f3c/.github/workflows/plugin-stat.yml#L17)).
- **[claimed]** On 2026-05-12 Obsidian launched "Obsidian Community, the new directory and developer dashboard for Obsidian plugins and themes" ([blog](https://obsidian.md/blog/future-of-plugins/)).
- **[inference]** The source of truth is now the directory service at `community.obsidian.md`. The git file is a downstream copy.

### Submission

- **[claimed]** You need a GitHub account and an Obsidian account ([Submit your plugin L15-L17](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Plugins/Releasing/Submit%20your%20plugin.md?plain=1#L15-L17)).
- **[claimed]** The flow:
  1. Sign in to `community.obsidian.md`.
  2. Connect GitHub. The directory gets read-only access to your public profile "to verify that you own the repositories you submit" ([Set up and claim L36](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Community%20directory/Set%20up%20and%20claim.md?plain=1#L36)).
  3. Submit the repository URL and agree to the developer policies.
- **[claimed]** What is submitted is a pointer to a repository plus a built release:
  - The directory reads `manifest.json` at HEAD of the default branch. The ID must be unique and must not contain `obsidian` ([Submit L57](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Plugins/Releasing/Submit%20your%20plugin.md?plain=1#L57)).
  - A GitHub release whose tag equals the manifest version must carry `main.js`, `manifest.json` and an optional `styles.css` ([Submit L40-L47](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Plugins/Releasing/Submit%20your%20plugin.md?plain=1#L40-L47)).
- **[repo]** The repo has no submission CI: its only workflows are the two mirrors ([.github/workflows](https://github.com/obsidianmd/obsidian-releases/tree/2512b11d937f22a1d98c041d7ff9e35763cf0f3c/.github/workflows)).
- **[claimed]** The directory runs its own checks. After each release it scans the manifest, the release assets and the source, "and verifies that the build matches what's committed". Each result is an error, a warning, a recommendation or a pass ([Manage L21](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Community%20directory/Manage%20your%20plugin%20or%20theme.md?plain=1#L21)).
  - The scanner runs the first script it finds among `build`, `build:plugin` and `compile` ([FAQ L70](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Community%20directory/Frequently%20asked%20questions.md?plain=1#L70)).
  - Errors block installation from the app ([Submit L65](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Plugins/Releasing/Submit%20your%20plugin.md?plain=1#L65)).
  - Authors can run the checks locally with the official ESLint plugin ([FAQ L106](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Community%20directory/Frequently%20asked%20questions.md?plain=1#L106)).
- **[claimed]** The public scorecard shows checks such as "no known vulnerable dependencies, no obfuscated code, verified GitHub artifact attestations", the Obsidian APIs used, and disclosures such as clipboard or network access ([help: Community directory L32](https://github.com/obsidianmd/obsidian-help/blob/cbe447c1a46d3f522bdc3b0fd81dfb9df3e7f5bf/en/Extending%20Obsidian/Community%20directory.md?plain=1#L32)).

### Review

- **[claimed]** Review is automated: "Typically, you will see the results of your review within a few minutes. If your project passes, it will be available to search and download in the app within 24 hours" ([blog](https://obsidian.md/blog/future-of-plugins/)).
- **[claimed]** "Manual reviews continue for popular, featured, and flagged plugins" ([Plugin security L39](https://github.com/obsidianmd/obsidian-help/blob/cbe447c1a46d3f522bdc3b0fd81dfb9df3e7f5bf/en/Extending%20Obsidian/Plugin%20security.md?plain=1#L39)).
- **[claimed]** The switch cleared the old manual queue: "we were able to process over 2,300 queued submissions in the last few days" ([blog](https://obsidian.md/blog/future-of-plugins/)).
- **[observed]** Entries in `community-plugins.json` over time:

  | Date | Entries | Source |
  | --- | --- | --- |
  | 2026-05-12 | 2,750 | at commit [`652de396e9`](https://github.com/obsidianmd/obsidian-releases/commit/652de396e9) |
  | 2026-06-10 | 4,623 | at commit [`838ff51515`](https://github.com/obsidianmd/obsidian-releases/commit/838ff51515) |
  | 2026-11-18 | 10,542 | [current file](https://github.com/obsidianmd/obsidian-releases/blob/2512b11d937f22a1d98c041d7ff9e35763cf0f3c/community-plugins.json) |

  **[inference]** Automated admission has made the listing about 3.8 times larger in six months.

### Build and hosting

- **[claimed]** The author builds and hosts the plugin. The app downloads `main.js`, `manifest.json` and `styles.css` from the author's GitHub release tagged with the manifest version ([Submit L59](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Plugins/Releasing/Submit%20your%20plugin.md?plain=1#L59); [README L22-L25](https://github.com/obsidianmd/obsidian-releases/blob/2512b11d937f22a1d98c041d7ff9e35763cf0f3c/README.md?plain=1#L22-L25)).
  - If the app is too old for the latest version, it consults the author's `versions.json` ([README L23](https://github.com/obsidianmd/obsidian-releases/blob/2512b11d937f22a1d98c041d7ff9e35763cf0f3c/README.md?plain=1#L23)).
- **[claimed]** The source can live in a private repository. A GitHub App reads it, and the directory "verifies that your public release's build output matches what it reads from the private repository" ([Manage L41-L43](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Community%20directory/Manage%20your%20plugin%20or%20theme.md?plain=1#L41-L43)).

### Catalog in the app and on the website

- **[claimed]** The repo README describes the app's flow ([README L19-L21](https://github.com/obsidianmd/obsidian-releases/blob/2512b11d937f22a1d98c041d7ff9e35763cf0f3c/README.md?plain=1#L19-L21)):
  - the app reads the list in `community-plugins.json`;
  - it searches by name, author and description;
  - when a detail page opens, it pulls `manifest.json` and `README.md` from the author's repo.
- **[claimed]** The app talks to `github.com` and `raw.githubusercontent.com` ([Teams security L44](https://github.com/obsidianmd/obsidian-help/blob/cbe447c1a46d3f522bdc3b0fd81dfb9df3e7f5bf/en/Teams/Security%20considerations%20for%20teams.md?plain=1#L44)).
- **[claimed]** There is a public website at `community.obsidian.md`. Each plugin has a listing page with screenshots, an excerpt of its README, a scorecard, downloads and payment type ([help: Community directory](https://github.com/obsidianmd/obsidian-help/blob/cbe447c1a46d3f522bdc3b0fd81dfb9df3e7f5bf/en/Extending%20Obsidian/Community%20directory.md); [Community plugins L21](https://github.com/obsidianmd/obsidian-help/blob/cbe447c1a46d3f522bdc3b0fd81dfb9df3e7f5bf/en/Extending%20Obsidian/Community%20plugins.md?plain=1#L21)).
- **[observed]** `https://community.obsidian.md/assets/community-plugins.json` returns 200 behind Cloudflare with an `x-nextjs-cache` header.
- **[inference]** The website is a server application with its own data: accounts, organisations, scan results, screenshots and payment labels ([Organizations](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Community%20directory/Organizations.md)). It is not generated from the repo; the repo is generated from it, as the mirror workflow shows.

### Accounts

- **[claimed]** An author needs a GitHub account and an Obsidian account ([Submit L15-L17](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Plugins/Releasing/Submit%20your%20plugin.md?plain=1#L15-L17); [FAQ L15](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Community%20directory/Frequently%20asked%20questions.md?plain=1#L15)).
- **[claimed]** Organisations on the directory can own entries ([Organizations](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Community%20directory/Organizations.md)).

### Updates and removal

- **[claimed]** To publish an update, the author makes a new GitHub release. Nothing is resubmitted ([FAQ L17-L19](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Community%20directory/Frequently%20asked%20questions.md?plain=1#L17-L19)).
- **[claimed]** Each new version is scanned; "if it fails to pass review, the plugin is removed from search within 24 hours". Previously approved plugins "will continue to be available for now, even if they fail the automated review" ([blog](https://obsidian.md/blog/future-of-plugins/)).
- **[claimed]** The app does not update plugins on its own: "For security purposes, community plugins don't update automatically" ([Community plugins L41](https://github.com/obsidianmd/obsidian-help/blob/cbe447c1a46d3f522bdc3b0fd81dfb9df3e7f5bf/en/Extending%20Obsidian/Community%20plugins.md?plain=1#L41)).
- **[claimed]** Removal policy ([Developer policies L75-L81](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Community%20directory/Developer%20policies.md?plain=1#L75-L81)):
  - immediate removal if the plugin "appears to be malicious", the developer is uncooperative, or the violation is repeated;
  - possible removal if the plugin is unmaintained or severely broken.
- **[claimed]** Users can flag a plugin from its directory page ([Plugin security L42](https://github.com/obsidianmd/obsidian-help/blob/cbe447c1a46d3f522bdc3b0fd81dfb9df3e7f5bf/en/Extending%20Obsidian/Plugin%20security.md?plain=1#L42)). Authors can archive an entry, which "removes the entry from the directory and prevents new installations" ([Manage L59](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Community%20directory/Manage%20your%20plugin%20or%20theme.md?plain=1#L59)).
- **[repo]** [`community-plugins-removed.json`](https://github.com/obsidianmd/obsidian-releases/blob/2512b11d937f22a1d98c041d7ff9e35763cf0f3c/community-plugins-removed.json) lists removed plugins as id, name and reason.
  - **[observed]** It has 175 entries. The top reasons are: repository archived (95, in two spellings), repository deleted (10), developer banned from GitHub (9) and account deleted (9).
- **Kill list for installed copies:**
  - **[claimed]** "A check is performed once every 12 hours from the app's startup time to fetch a file hosted on GitHub used for 'plugin deprecations.' This file helps remotely disable specific versions of plugins known to malfunction, cause data loss, or potentially be vulnerable or malicious" ([Teams security L48](https://github.com/obsidianmd/obsidian-help/blob/cbe447c1a46d3f522bdc3b0fd81dfb9df3e7f5bf/en/Teams/Security%20considerations%20for%20teams.md?plain=1#L48)).
  - **[repo]** [`community-plugin-deprecation.json`](https://github.com/obsidianmd/obsidian-releases/blob/2512b11d937f22a1d98c041d7ff9e35763cf0f3c/community-plugin-deprecation.json) maps a plugin ID to a list of versions. It has 7 plugins today.
  - **[inference]** That file is the "plugin deprecations" file. The help page does not name it.

### Signatures

- **[claimed]** The docs recommend GitHub artifact attestations made with `actions/attest` in the release workflow, "recommended when you submit a plugin". They are not required ([Release with GitHub Actions L33-L53](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Plugins/Releasing/Release%20your%20plugin%20with%20GitHub%20Actions.md?plain=1#L33-L53)).
- **[claimed]** The scorecard shows whether attestations are verified ([help: Community directory L32](https://github.com/obsidianmd/obsidian-help/blob/cbe447c1a46d3f522bdc3b0fd81dfb9df3e7f5bf/en/Extending%20Obsidian/Community%20directory.md?plain=1#L32)).
- **Not documented:** any signature or checksum check by the app at install time.
- **[inference]** On the client side, integrity rests on HTTPS to GitHub. On the directory side it rests on the scanner's build-match check.

### Private catalogs and offline install

- **[claimed]** Plugins "can be installed manually" into `.obsidian/plugins` ([Deploy L34](https://github.com/obsidianmd/obsidian-help/blob/cbe447c1a46d3f522bdc3b0fd81dfb9df3e7f5bf/en/Teams/Deploy%20Obsidian%20across%20your%20team.md?plain=1#L34)).
- **[claimed]** To lock configuration, block edit access to `.obsidian` ([Deploy L52](https://github.com/obsidianmd/obsidian-help/blob/cbe447c1a46d3f522bdc3b0fd81dfb9df3e7f5bf/en/Teams/Deploy%20Obsidian%20across%20your%20team.md?plain=1#L52)).
- **[claimed]** Restricted mode is on by default ([Plugin security L8](https://github.com/obsidianmd/obsidian-help/blob/cbe447c1a46d3f522bdc3b0fd81dfb9df3e7f5bf/en/Extending%20Obsidian/Plugin%20security.md?plain=1#L8)).
- **[claimed]** Team tools are only announced: "In the coming months we will make it easier for teams to manage which community plugins are allowed, and distribute private plugins to team members" ([blog](https://obsidian.md/blog/future-of-plugins/), 2026-05-12).
  - **[observed]** The help docs at `cbe447c` contain no such feature.
- **[claimed]** For beta testing, the docs point to BRAT, a community plugin ([README L32](https://github.com/obsidianmd/obsidian-releases/blob/2512b11d937f22a1d98c041d7ff9e35763cf0f3c/README.md?plain=1#L32)).
- **Not documented:** any setting that points the app at a different catalog.

### Contradictions

- **Repo README is out of date.** It still describes the pull-request-era flow ([README L17-L25](https://github.com/obsidianmd/obsidian-releases/blob/2512b11d937f22a1d98c041d7ff9e35763cf0f3c/README.md?plain=1#L17-L25)), but the repo no longer accepts pull requests.
- **Closed-source plugins: three sources disagree.**
  - Developer policies list "Close sourced code" as a disclosure handled "case by case" ([L40](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Community%20directory/Developer%20policies.md?plain=1#L40)).
  - The May blog says "we are not accepting new closed source plugins".
  - The current docs allow a private source repository with build verification ([Manage L41-L43](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Community%20directory/Manage%20your%20plugin%20or%20theme.md?plain=1#L41-L43)).
  - **[inference]** Today a closed-source plugin gets in by keeping its source private but verified, not by shipping unverifiable code.

### Not verified

- Which URL the current, closed-source app uses for the list: the GitHub mirror or `community.obsidian.md`.
- What the app does with already installed plugins that appear in `community-plugins-removed.json` or were archived.
- Whether the app checks attestations or hashes at install time.

---

## 2. Raycast Store (`raycast/extensions`)

### Submission

- **[claimed]** `npm run publish` signs you in to GitHub and "will automatically open a pull request" in `raycast/extensions`. You can also fork the repo and open a pull request by hand ([Publish an extension L27](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/docs/basics/publish-an-extension.md?plain=1#L27)).
- **[claimed]** The author submits **source**: a TypeScript/React extension with `package.json` as its manifest and `package-lock.json` ([Prepare L10-L16](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/docs/basics/prepare-an-extension-for-store.md?plain=1#L10-L16)). The license must be MIT ([L13](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/docs/basics/prepare-an-extension-for-store.md?plain=1#L13)).
- **[claimed]** Policies:
  - "Extensions requesting Keychain Access will be rejected" ([L239](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/docs/basics/prepare-an-extension-for-store.md?plain=1#L239)).
  - Binaries must be downloaded from a server the author does not control and checked with hashes ([L228](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/docs/basics/prepare-an-extension-for-store.md?plain=1#L228)).
- **[repo]** The CI that runs on a pull request:
  - **`Extensions` workflow** on `macos-26` for changed extensions ([L21, L34](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/.github/workflows/extensions_build_publish.yml#L21-L34)). It runs:
    - `ray validate` against `https://www.raycast.com/schemas/extension.json`, then `ray build -e dist` ([ray_cli.sh L48, L69](https://github.com/raycast/github-actions/blob/12c8fe884f1e0bd1a06afee44ec92e7c1dd9d9f6/ray-cli/ray_cli.sh#L48-L69));
    - a check that `package-lock.json` exists and `yarn.lock` does not ([L87-L94](https://github.com/raycast/github-actions/blob/12c8fe884f1e0bd1a06afee44ec92e7c1dd9d9f6/ray-cli/ray_cli.sh#L87-L94));
    - a block on the `owner` field (organisation extensions) except for an allowlist ([L106](https://github.com/raycast/github-actions/blob/12c8fe884f1e0bd1a06afee44ec92e7c1dd9d9f6/ray-cli/ray_cli.sh#L106)).
  - **Other pull-request workflows:**
    - [changelog enforcer](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/.github/workflows/changelog_enforcer.yml);
    - [metadata image enforcer](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/.github/workflows/metadata_image_enforcer.yml);
    - [duplicate-extension check](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/.github/workflows/duplicate-extension-check.yml);
    - [`npm-check`](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/.github/workflows/npm_check.yml), which only warns.
  - **Greptile AI code review** runs on every push ([.greptile/config.json L4](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/.greptile/config.json#L4)).
- **[claimed]** CI checks the manifest schema, asset formats, a valid author, and build and type errors. "More CI pipeline tooling for automated static security analysis is planned" ([Security L13](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/docs/information/security.md?plain=1#L13)).
- **[claimed]** "Raycast performs automated vulnerability scanning on this repository" ([SECURITY.md L13](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/SECURITY.md?plain=1#L13)).

### Review

- **[claimed]** "The Community Managers review extensions first-in, first-out. You can expect first contact within a week, subject to Community Manager availability" ([Extension guidelines](https://manual.raycast.com/extensions-guidelines)).
- **[claimed]** The security page says "members from Raycast and the community collaboratively review" ([Security L13](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/docs/information/security.md?plain=1#L13)).
- **[repo]** The merge workflow requires an effective approval from a user with admin or write access ([pull_request_merge.yml L21](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/.github/workflows/pull_request_merge.yml#L21)).
- **Contradiction on stale pull requests:**
  - The guidelines say a pull request is marked stale after 14 days and closed after 21 days ([Extension guidelines](https://manual.raycast.com/extensions-guidelines)).
  - `stale.yml` sets 25 days to stale plus 7 days to close ([L48-L49](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/.github/workflows/stale.yml#L48-L49)).
- **No published median review time.**

### Build and hosting

- **[repo]** On a push to `main` (the merge), the same workflow publishes the extension:
  - it runs `ray publish --skip-validation --skip-notify-raycast` with the secret `RAYCAST_CLI_ACCESS_TOKEN` ([workflow L25, L64](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/.github/workflows/extensions_build_publish.yml#L25-L64); [ray_cli.sh L53](https://github.com/raycast/github-actions/blob/12c8fe884f1e0bd1a06afee44ec92e7c1dd9d9f6/ray-cli/ray_cli.sh#L53));
  - it posts `https://raycast.com/<owner|author>/<name>` back to the pull request ([L191](https://github.com/raycast/github-actions/blob/12c8fe884f1e0bd1a06afee44ec92e7c1dd9d9f6/ray-cli/ray_cli.sh#L191)).
- **[claimed]** "The built extension is then archived and uploaded to the Raycast Store, and eventually published for a registered user account. When an extension is installed or updated, the extension is downloaded from the store, unarchived to disk" ([Security L13](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/docs/information/security.md?plain=1#L13)).
- **[inference]** Raycast builds from source and hosts the artifact. The author never produces a distributable.

### Catalog in the app and on the website

- **[claimed]** Users install from the in-app Store command or the web store at `raycast.com/store` ([Install an extension L7-L17](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/docs/basics/install-an-extension.md?plain=1#L7-L17)).
- **[inference]** The catalog lives in Raycast's store backend, since builds are "uploaded to the Raycast Store … for a registered user account" ([Security L13](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/docs/information/security.md?plain=1#L13)). The website is not generated from the repo.
- **[observed]** `raycast.com/store` is served by Vercel/Next.js. That says nothing about the data store behind it.
- **[observed]** The repo has 3,602 extension folders under `extensions/`.

### Accounts

- **[claimed]** An author needs a GitHub account (for the pull request) and a Raycast account: "Ensure you use your Raycast account username in the `author` field" ([Prepare L12](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/docs/basics/prepare-an-extension-for-store.md?plain=1#L12)).
- **[claimed]** Private extensions need you to be logged in and to belong to an organisation ([Publish a private extension L9-L15](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/docs/teams/publish-a-private-extension.md?plain=1#L9-L15)).

### Updates and removal

- **[claimed]** An update is another reviewed pull request. There is "only one implicit latest version", and "Extensions are automatically updated for end users" ([Versioning L3](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/docs/information/versioning.md?plain=1#L3); [Security L29-L31](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/docs/information/security.md?plain=1#L29-L31)).
- **[claimed]** If an extension is abandoned, Raycast may "write and approve fixes without the extension Author's consent". Abandoned means it "no longer functions" or the author does not answer 3 or more contact attempts ([Extension guidelines](https://manual.raycast.com/extensions-guidelines)).
- **[repo]** How deprecation works in practice: pull request [#32258](https://github.com/raycast/extensions/pull/32258) ("deprecate m3o", merged 2026-10-12) replaced the extension's commands with a screen that says "M3O is deprecated and is being removed from the Raycast Store. You can uninstall this extension in Raycast Settings."
  - **[inference]** Because updates are automatic, the stub reaches copies users already have installed.
- **[claimed]** Under the Enterprise allow-list, "Extensions already installed but not on the allow-list stop working" ([Extensions allow-list](https://manual.raycast.com/enterprise/extensions-allow-list)). This applies to one organisation, not globally.
- **[claimed]** Security reports go to `security@raycast.com` ([SECURITY.md](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/SECURITY.md)).

### Signatures

- **[claimed]** The Raycast app is signed and notarised, and Raycast verifies the Node binary it downloads ([Security L9, L17](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/docs/information/security.md?plain=1#L9-L17)).
- **Not documented:** signing or checksums for extension archives.
- **[claimed]** Extensions "are not further sandboxed" ([L23](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/docs/information/security.md?plain=1#L23)).

### Private catalogs and offline install

- **[claimed]** Raycast for Teams provides "a private store. The store is only accessible to members of your organization" ([Teams getting started L7](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/docs/teams/getting-started.md?plain=1#L7)).
  - You set `owner` to the organisation handle, then `npm run publish` "verifies, builds and publishes" to that store ([Publish a private extension L9](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/docs/teams/publish-a-private-extension.md?plain=1#L9)).
  - Raycast hosts this store. You cannot self-host it.
- **[claimed]** The Enterprise allow-list limits which public-store extensions members can install. An empty list blocks all of them, and it is not yet supported on Windows ([Extensions allow-list](https://manual.raycast.com/enterprise/extensions-allow-list)).
- **[claimed]** For local development, `npm run dev` loads an extension into the Development section ([Teams getting started](https://github.com/raycast/extensions/blob/7aed2b9403a2b7e40694d686da74ba5a5ff0f672/docs/teams/getting-started.md)).
- **Not documented:** an offline catalog or a custom store URL.

### Not verified

- How Raycast removes an extension from the store: whether deleting its folder delists it, or an admin action does. What happens to installed copies of a delisted extension, outside the stub-update pattern.
- Any global, non-Enterprise kill switch for a malicious extension.
- Integrity checks on extension archives in the client.

---

## 3. Zed extensions (`zed-industries/extensions`)

### Submission

- **[claimed]** The author opens a pull request that does two things ([Publishing guide](https://zed.dev/docs/extensions/publishing/publishing-guide)):
  1. adds the extension's own repository as a **git submodule** under `extensions/<id>`. The submodule must use HTTPS, the repository must be public, and the pinned commit must be on a branch;
  2. adds an entry with a `version` to `extensions.toml`.
- **[claimed]** Pull request rules ([L16-L18](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/docs/src/extensions/publishing/publishing-guide.md?plain=1#L16-L18)):
  - each pull request adds or updates exactly one extension;
  - an author may have at most three open pull requests;
  - the author must respond to feedback within 3 weeks.
- **[claimed]** Requirements:
  - An accepted license is required, otherwise the pull request "will fail CI" ([License L21-L22](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/docs/src/extensions/publishing/license-requirements.md?plain=1#L21-L22)).
  - New MCP-server extensions are not accepted, and agent-server and slash-command extensions are deprecated in favour of the ACP registry ([Prerequisites L70, L76](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/docs/src/extensions/publishing/prerequisites.md?plain=1#L70-L76)).
  - "Autonomous agents are not allowed to be used for contributing to this project" ([AI_POLICY.md L17](https://github.com/zed-industries/extensions/blob/bfa28dc77e250b3f930515bfd64609b2d15f126a/AI_POLICY.md?plain=1#L17)).
- **[repo]** CI on a pull request ([ci.yml](https://github.com/zed-industries/extensions/blob/bfa28dc77e250b3f930515bfd64609b2d15f126a/.github/workflows/ci.yml)):
  - installs Rust with `wasm32-wasip2` ([L43](https://github.com/zed-industries/extensions/blob/bfa28dc77e250b3f930515bfd64609b2d15f126a/.github/workflows/ci.yml#L43));
  - downloads a `zed-extension` CLI pinned by SHA ([L56](https://github.com/zed-industries/extensions/blob/bfa28dc77e250b3f930515bfd64609b2d15f126a/.github/workflows/ci.yml#L56));
  - runs `pnpm package-extensions` ([L73](https://github.com/zed-industries/extensions/blob/bfa28dc77e250b3f930515bfd64609b2d15f126a/.github/workflows/ci.yml#L73)), which validates the following and then compiles the extension with `zed-extension` ([package-extensions.js L184](https://github.com/zed-industries/extensions/blob/bfa28dc77e250b3f930515bfd64609b2d15f126a/src/package-extensions.js#L184)):
    - ID rules and SemVer in `extensions.toml`;
    - HTTPS submodules ([validation.js L152](https://github.com/zed-industries/extensions/blob/bfa28dc77e250b3f930515bfd64609b2d15f126a/src/lib/validation.js#L152));
    - the license ([L181](https://github.com/zed-industries/extensions/blob/bfa28dc77e250b3f930515bfd64609b2d15f126a/src/package-extensions.js#L181));
    - a version that does not decrease ([L351](https://github.com/zed-industries/extensions/blob/bfa28dc77e250b3f930515bfd64609b2d15f126a/src/package-extensions.js#L351));
  - enforces sorted files and no Git LFS ([L82-L90](https://github.com/zed-industries/extensions/blob/bfa28dc77e250b3f930515bfd64609b2d15f126a/.github/workflows/ci.yml#L82-L90)).
- **[repo]** Danger fails any pull request that does not touch `extensions.toml` ([dangerfile.ts L25](https://github.com/zed-industries/extensions/blob/bfa28dc77e250b3f930515bfd64609b2d15f126a/dangerfile.ts#L25)).

### Review

- **[claimed]** Zed maintainers review by hand: "most submissions get their first feedback within a few weeks; for some extensions it might take us longer - up to one or two months", and a "large backlog" is acknowledged ([FAQ L14](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/docs/src/extensions/publishing/faq.md?plain=1#L14)).

### Build and hosting

- **[repo]** On `main`, `SHOULD_PUBLISH` is true ([ci.yml L77](https://github.com/zed-industries/extensions/blob/bfa28dc77e250b3f930515bfd64609b2d15f126a/.github/workflows/ci.yml#L77)).
  - The script packages every version not yet in the "Zed extension blob store" ([L41](https://github.com/zed-industries/extensions/blob/bfa28dc77e250b3f930515bfd64609b2d15f126a/src/package-extensions.js#L41)).
  - It uploads to an S3-compatible bucket, by default DigitalOcean Spaces `nyc3`, under `extensions/<id>/<version>/` ([L78](https://github.com/zed-industries/extensions/blob/bfa28dc77e250b3f930515bfd64609b2d15f126a/src/package-extensions.js#L78), [L235-L237](https://github.com/zed-industries/extensions/blob/bfa28dc77e250b3f930515bfd64609b2d15f126a/src/package-extensions.js#L235-L237)).
- **[claimed]** The license rule exists because "This allows us to distribute the resulting binary produced from your extension code" ([License L21](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/docs/src/extensions/publishing/license-requirements.md?plain=1#L21)).
- **[repo]** Zed's open-source `collab` server:
  - polls the blob store every 5 minutes ([L128](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/crates/collab/src/api/extensions.rs#L128));
  - reads each new `manifest.json` and inserts the version into its database ([L241](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/crates/collab/src/api/extensions.rs#L241));
  - serves downloads as redirects to presigned blob URLs that live for 3 minutes ([L20-L29](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/crates/collab/src/api/extensions.rs#L20-L29), [L121-L129](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/crates/collab/src/api/extensions.rs#L121-L129)).

### Catalog in the app and on the website

- **[repo]** The client calls these endpoints on `https://api.zed.dev` ([extension_host.rs L661-L684, L703, L984, L1029](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/crates/extension_host/src/extension_host.rs#L661-L684); [http_client.rs L277-L280](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/crates/http_client/src/http_client.rs#L277-L280)):
  - `/extensions`, filtered by schema and WASM API version;
  - `/extensions/updates`;
  - `/extensions/<id>/download`.
- **[repo]** The listing endpoints moved out of `collab` into Zed "Cloud": `GET /extensions` in [#48827](https://github.com/zed-industries/zed/commit/0821d6fb73) (February 2026), and `/extensions/updates` and `/extensions/:id` in [#66308](https://github.com/zed-industries/zed/commit/d401423073) (October 2026). Cloud's code is not public, and I did not read it.
- **[observed]** `zed.dev/extensions` is a Next.js page.
- **[inference]** Both the app and the website read Zed's server database, which is filled from the blob store. Neither reads the git repo.
- **[observed]** `extensions.toml` has 1,590 entries.

### Accounts

- **[claimed]** Authors work through a GitHub fork and a pull request. The docs prefer a fork on a personal account so staff can push fixes ([Publishing guide L26](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/docs/src/extensions/publishing/publishing-guide.md?plain=1#L26)).
- **[inference]** No Zed account is required. The docs mention none.

### Updates and removal

- **[claimed]** An update is a pull request that moves the submodule commit and bumps the `version` ([Updating L14](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/docs/src/extensions/publishing/updating-and-maintenance.md?plain=1#L14)).
- **[claimed]** "By default, every installed extension is auto-updated when Zed starts". The `auto_update_extensions` setting pins an extension ([All settings L392-L400](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/docs/src/reference/all-settings.md?plain=1#L392-L400)).
- **[claimed]** Removal paths ([FAQ L67-L81](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/docs/src/extensions/publishing/faq.md?plain=1#L67-L81)):
  - the owner can ask for removal in an issue or pull request;
  - if the owner has not responded for 6 weeks, a contributor can propose a fork, or Zed staff can fork the extension into the `zed-extensions` organisation.
- **[repo]** Maintainers have a manual "Remove extension" workflow. It opens a pull request that deletes the `extensions.toml` entry and the submodule ([remove-extension.yml L5, L47, L52](https://github.com/zed-industries/extensions/blob/bfa28dc77e250b3f930515bfd64609b2d15f126a/.github/workflows/remove-extension.yml#L5-L52)).
  - Recent examples: [#8260](https://github.com/zed-industries/extensions/pull/8260) removed `xmake` (2026-11-06) and [#7599](https://github.com/zed-industries/extensions/pull/7599) removed `rego` (2026-09-14).
- **[repo]** `package-extensions.js` only uploads. Nothing in the public code deletes from the blob store or the database.
- **[observed]** On 2026-11-18, `api.zed.dev/extensions?filter=xmake` returned `xmake 0.1.0` and `?filter=rego` returned `rego 0.0.2`. Both IDs are gone from `extensions.toml`, and `zed.dev/extensions` still shows both.
  - **[inference]** Removing an extension from the repo does not delist it from the catalog, at least not automatically or quickly.
- **Kill list:**
  - **[repo]** `SUPPRESSED_EXTENSIONS` is compiled into the client: "Extensions that should no longer be loaded or downloaded" ([extension_host.rs L105-L127](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/crates/extension_host/src/extension_host.rs#L105-L127)). The client filters them out of API results ([L845](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/crates/extension_host/src/extension_host.rs#L845)), never auto-installs them ([L762](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/crates/extension_host/src/extension_host.rs#L762)), and uninstalls them if they are already installed ([L1270-L1273](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/crates/extension_host/src/extension_host.rs#L1270-L1273), [L1316-L1320](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/crates/extension_host/src/extension_host.rs#L1316-L1320)).
  - Its comment says the reason is functionality now built into the editor. It also lists several ACP agents.
  - It is not a remote list: changing it needs a Zed release.

### Signatures

- **[repo]** The client downloads a `.tar.gz`, checks only that the byte count equals `Content-Length`, then unpacks it ([extension_host.rs L907-L908](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/crates/extension_host/src/extension_host.rs#L907-L908)).
  - A TODO mentions a checksum file "that we'll create when downloading normal extensions" ([L1814](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/crates/extension_host/src/extension_host.rs#L1814)). That check does not exist yet.
- I found no signature verification, and the docs do not mention signing.
- **[claimed]** What exists instead is runtime capability limits: `granted_extension_capabilities` restricts `process:exec`, `download_file` and `npm:install` ([Capabilities L14-L16](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/docs/src/extensions/capabilities.md?plain=1#L14-L16)).

### Private catalogs and offline install

- **[claimed]** A "dev extension" installs from a local directory and overrides the published one ([Developing extensions L33-L39](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/docs/src/extensions/developing-extensions.md?plain=1#L33-L39)). This is the documented offline path.
- **[claimed]** `server_url`, or the `ZED_SERVER_URL` environment variable, sets the "URL of the Zed service" ([All settings L4378-L4384](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/docs/src/reference/all-settings.md?plain=1#L4378-L4384)).
  - **[repo]** Any value other than the known Zed hosts is used as the API base unchanged ([http_client.rs L277-L290](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/crates/http_client/src/http_client.rs#L277-L290)).
  - **[inference]** In theory this could point at a self-hosted compatible API. But it also redirects every other Zed service, and the listing API is closed source. It is not a documented private-catalog feature.

### Not verified

- How the Cloud listing API decides what to list, and whether a manual delisting step exists.
- Any remote kill switch beyond the compiled-in list.

---

## 4. Homebrew taps: the static-index model

### Submission

- **[claimed]** A third-party tap is just a git repository. `brew tap user/repo` clones `https://github.com/user/homebrew-repo`, and the two-argument form "accepts any URL supported by Git" ([Taps L8, L25](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/Taps.md?plain=1#L8-L25)). Nothing is submitted to Homebrew.
- **[claimed]** `brew tap-new` creates GitHub Actions that build bottles. The owner publishes them with `brew pr-pull` ([How to create and maintain a tap L41-L67](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/How-to-Create-and-Maintain-a-Tap.md?plain=1#L41-L67)).
- **[claimed]** For `homebrew/core`, the author forks `Homebrew/homebrew-core` and opens a pull request with a Ruby formula ([How to open a Homebrew pull request L11, L41-L45](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/How-To-Open-a-Homebrew-Pull-Request.md?plain=1#L41-L45)). `brew test-bot` "runs Homebrew's formula checks, builds bottles and tests affected dependents in GitHub Actions" ([BrewTestBot L11](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/BrewTestBot-For-Maintainers.md?plain=1#L11)).

### Review

- **[claimed]** In core, maintainers approve. "Passing checks are not a substitute for reviewing the formula file, its test and the generated bottle checksums" ([BrewTestBot L19-L23](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/BrewTestBot-For-Maintainers.md?plain=1#L19-L23)), and "The PR review process is primarily a security measure" ([Maintainer guidelines L47](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/Maintainer-Guidelines.md?plain=1#L47)).
- **No published review-time numbers found.**
- **[claimed]** Third-party taps get no Homebrew review: "Trusting a tap means accepting that its code may run with your user's privileges" ([Tap trust L23](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/Tap-Trust.md?plain=1#L23)).

### Build and hosting

- **[claimed]** For core, Homebrew builds bottles "in its own controlled, ephemeral CI" and hosts them on GitHub Packages ([Security and supply chain L138, L210](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/Homebrew-Security-and-Supply-Chain.md?plain=1#L138-L210)). The default bottle domain is `https://ghcr.io/v2/homebrew/core` ([Manpage L4551](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/Manpage.md?plain=1#L4551)).
- **[claimed]** For a tap, bottles are built by the tap's GitHub Actions and uploaded to GitHub Releases, or to GitHub Packages with `--github-packages` ([How to create and maintain a tap L41, L67](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/How-to-Create-and-Maintain-a-Tap.md?plain=1#L41-L67)).

### Catalog in the client and on the website

- **[claimed]** For core and cask, the client reads a JSON API at `https://formulae.brew.sh/api` and refreshes it every 450 seconds by default ([Manpage L4486-L4500](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/Manpage.md?plain=1#L4486-L4500)).
- **[claimed]** `formulae.brew.sh` is static. "A GitHub Action is run periodically which pulls changes from each tap and deploys the site to GitHub Pages" ([formulae.brew.sh README L5](https://github.com/Homebrew/formulae.brew.sh/blob/060a6979774f75123d6e02ea4326c3ef5aefdb1a/README.md?plain=1#L5)).
- **[claimed]** For a third-party tap, the catalog is the git clone itself, updated during `brew update` ([Taps L26](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/Taps.md?plain=1#L26)). Taps have no website.

### Accounts

- **[inference]** Contributing to core needs a GitHub account. A tap needs nothing beyond a git host, since the two-argument form takes any URL ([Taps L8](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/Taps.md?plain=1#L8)).

### Updates and removal

- **[claimed]** Packages move through three stages ([Deprecating, disabling and removing L7-L13](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/Deprecating-Disabling-and-Removing.md?plain=1#L7-L13)):
  - **Deprecated:** the user sees a warning and the action proceeds.
  - **Disabled:** the user sees an error and the action fails.
  - **Removed:** disabled core formulae are "automatically removed one year after their disable date".
  - Outstanding CVEs and upstream abandonment are reasons to deprecate.
- **[claimed]** Administrators can block packages and taps with `HOMEBREW_FORBIDDEN_FORMULAE`, `HOMEBREW_FORBIDDEN_CASKS`, `HOMEBREW_FORBIDDEN_TAPS` and `HOMEBREW_FORBIDDEN_LICENSES` ([Manpage L4829-L4852](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/Manpage.md?plain=1#L4824-L4853)).
- **[claimed]** Since Homebrew 6.0.0, non-official taps require explicit `brew trust` ([Tap trust L11](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/Tap-Trust.md?plain=1#L11)).

### Signatures

- **[claimed]** Every download is pinned to a `sha256` in the reviewed formula ([Security and supply chain L96](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/Homebrew-Security-and-Supply-Chain.md?plain=1#L96)).
- **[claimed]** The API files are "JWS-signed and verified by Homebrew before use" ([L105](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/Homebrew-Security-and-Supply-Chain.md?plain=1#L105)).
- **[claimed]** Bottle provenance attestations are emitted with `actions/attest`, but verified only if `HOMEBREW_VERIFY_ATTESTATIONS` is set ([L127-L129](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/Homebrew-Security-and-Supply-Chain.md?plain=1#L127-L129); [Manpage L5197](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/Manpage.md?plain=1#L5197)).
- **[claimed]** Casks rely on Apple's Developer ID signing and notarisation ([Security and supply chain](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/Homebrew-Security-and-Supply-Chain.md?plain=1#L208-L232)).

### Private catalogs and offline install

- **[claimed]** The docs describe private taps for internal tools ([Fleet management L144-L148](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/Homebrew-Fleet-Management.md?plain=1#L144-L148)).
- **[claimed]** Mirrors are configured through `HOMEBREW_API_DOMAIN`, `HOMEBREW_ARTIFACT_DOMAIN` and `HOMEBREW_BOTTLE_DOMAIN` ([Manpage L4494-L4560](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/Manpage.md?plain=1#L4494-L4560)).
- **[claimed]** `HOMEBREW_NO_INSTALL_FROM_API` switches to local git checkouts of core and cask ([L5066](https://github.com/Homebrew/brew/blob/923f19762b78c858f136f5ef4a4a3bdd76dae7f4/docs/Manpage.md?plain=1#L5066)).

### Not verified

- Whether `disable!` affects binaries of a formula that is already installed, beyond blocking actions.
- Review-time statistics.
- `HOMEBREW_ALLOWED_TAPS`: it is not in the current manpage, so I do not cite it.

---

## Comparison table (as of 2026-11-18)

| | Obsidian | Raycast | Zed | Homebrew (core / third-party tap) |
| --- | --- | --- | --- | --- |
| **What the author submits** | Repo URL on `community.obsidian.md` plus a built GitHub release ([Submit](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Plugins/Releasing/Submit%20your%20plugin.md)) | Source in a pull request to the monorepo ([Publish](https://developers.raycast.com/basics/publish-an-extension)) | Pull request with a submodule and an `extensions.toml` entry ([Guide](https://zed.dev/docs/extensions/publishing/publishing-guide)) | Core: pull request with a Ruby formula. Tap: just commits to your own repo ([Taps](https://docs.brew.sh/Taps)) |
| **Pull requests to the git repo** | Disabled; the repo is an hourly mirror ([mirror workflow](https://github.com/obsidianmd/obsidian-releases/blob/2512b11d937f22a1d98c041d7ff9e35763cf0f3c/.github/workflows/mirror-community-json.yml)) | Yes | Yes | Yes / not applicable |
| **Automated checks** | Directory scanner: manifest, assets, source, build matches source, vulnerabilities, obfuscation ([Manage L21](https://github.com/obsidianmd/obsidian-developer-docs/blob/1c26772ac13d6e9870c865936d389fdfe694e742/en/Community%20directory/Manage%20your%20plugin%20or%20theme.md?plain=1#L21)) | `ray validate` and build, changelog, metadata, duplicates, Greptile AI review ([ray_cli.sh](https://github.com/raycast/github-actions/blob/12c8fe884f1e0bd1a06afee44ec92e7c1dd9d9f6/ray-cli/ray_cli.sh)) | Compile to WASM, license, ID and version rules, sorting, no LFS ([ci.yml](https://github.com/zed-industries/extensions/blob/bfa28dc77e250b3f930515bfd64609b2d15f126a/.github/workflows/ci.yml)) | `brew test-bot`: audit, build bottles, test dependents ([BrewTestBot](https://docs.brew.sh/BrewTestBot-For-Maintainers)) / none |
| **Who reviews** | Automated; manual for popular, featured and flagged plugins ([Plugin security L39](https://github.com/obsidianmd/obsidian-help/blob/cbe447c1a46d3f522bdc3b0fd81dfb9df3e7f5bf/en/Extending%20Obsidian/Plugin%20security.md?plain=1#L39)) | Raycast Community Managers and the community ([Guidelines](https://manual.raycast.com/extensions-guidelines)) | Zed maintainers ([FAQ](https://zed.dev/docs/extensions/publishing/faq)) | Homebrew maintainers / nobody |
| **Published review time** | Minutes for the scan; listed within 24 hours ([blog](https://obsidian.md/blog/future-of-plugins/)) | First contact within a week ([Guidelines](https://manual.raycast.com/extensions-guidelines)) | First feedback in a few weeks, up to 1–2 months ([FAQ L14](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/docs/src/extensions/publishing/faq.md?plain=1#L14)) | None published |
| **Who builds** | The author | Raycast CI (macOS) | Zed CI (Rust to WASM) | Homebrew CI / the tap owner |
| **Where the artifact lives** | The author's GitHub release | Raycast Store backend ([Security](https://developers.raycast.com/information/security)) | Zed blob store on DigitalOcean Spaces ([package-extensions.js](https://github.com/zed-industries/extensions/blob/bfa28dc77e250b3f930515bfd64609b2d15f126a/src/package-extensions.js#L78)) | `ghcr.io` / the tap's GitHub Releases or Packages |
| **How the app gets the list** | `community-plugins.json`, per the repo README. Which host the current app uses is unverified | Raycast backend (inferred) | `api.zed.dev/extensions`, served by closed-source Cloud ([#48827](https://github.com/zed-industries/zed/commit/0821d6fb73)) | Signed JSON API on `formulae.brew.sh` / the git clone |
| **Public website** | `community.obsidian.md`: its own server and data; the repo is generated from it | `raycast.com/store`: its own server | `zed.dev/extensions`: its own server and database | `formulae.brew.sh`: static, generated from the repos on GitHub Pages / none |
| **Accounts beyond GitHub** | Obsidian account required | Raycast account (`author` field) | None documented | None |
| **How updates ship** | New GitHub release, scanned automatically | Another reviewed pull request | Pull request bumping the submodule and version | Pull request bumping version and `sha256` / tap commit |
| **Client auto-update** | No, manual ([Community plugins L41](https://github.com/obsidianmd/obsidian-help/blob/cbe447c1a46d3f522bdc3b0fd81dfb9df3e7f5bf/en/Extending%20Obsidian/Community%20plugins.md?plain=1#L41)) | Yes ([Versioning](https://developers.raycast.com/information/versioning)) | Yes, at startup; can be pinned ([settings](https://zed.dev/docs/reference/all-settings)) | On `brew upgrade` |
| **Removal from the catalog** | Policy-based removal, archive, `community-plugins-removed.json` | Stub "deprecated" update ([#32258](https://github.com/raycast/extensions/pull/32258)); the stub was still on `main` on 2026-11-18, and how delisting happens is unverified | Pull request removes the toml entry; the API still listed removed items on 2026-11-18 | `deprecate!`, then `disable!`, then removal ([Lifecycle](https://docs.brew.sh/Deprecating-Disabling-and-Removing)) |
| **Disabling installed copies** | Yes: remote per-version deprecation file, polled every 12 hours ([Teams security L48](https://github.com/obsidianmd/obsidian-help/blob/cbe447c1a46d3f522bdc3b0fd81dfb9df3e7f5bf/en/Teams/Security%20considerations%20for%20teams.md?plain=1#L48)) | Per organisation via the Enterprise allow-list; otherwise only through a stub auto-update | Only a list compiled into the client ([L105-L127](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/crates/extension_host/src/extension_host.rs#L105-L127)) | After `disable!`, actions on the formula fail with an error; the effect on installed binaries is unverified |
| **Signatures** | Attestations recommended and scored; app-side check not documented | Not documented for extensions | None. The client checks only `Content-Length` ([L907](https://github.com/zed-industries/zed/blob/e944cfa2fe622a7a15041b9dfc7770933792857c/crates/extension_host/src/extension_host.rs#L907-L908)) | `sha256` pinned, JWS-signed API, opt-in attestation check ([Security](https://docs.brew.sh/Homebrew-Security-and-Supply-Chain)) |
| **Private catalog** | Not yet ("coming months", May 2026 blog) | Teams private store, hosted by Raycast; Enterprise allow-list | Not documented; `server_url` points everything elsewhere (inference) | Private taps, API and bottle mirrors |
| **Offline or manual install** | Copy into `.obsidian/plugins` | `npm run dev` (development mode) | Dev extension from a local directory | Local tap or mirror, `HOMEBREW_NO_INSTALL_FROM_API` |

## Points that matter for designing a git-backed hub (inference)

- **The git repo is only the catalog in the static-index models.** Of the four, only Homebrew taps and the Homebrew JSON API turn the repo into the catalog without a server. Obsidian, Raycast and Zed all moved catalog state (accounts, scan results, download counts, delisting) into a server, and treat git as either the review channel (Raycast, Zed) or a public mirror (Obsidian).
- **Review throughput is the bottleneck operators admit to.**
  - Zed publishes a "few weeks to two months" estimate and asks for patience.
  - Obsidian cleared "over 2,300 queued submissions" by moving to automated scanning, and its listing grew from 2,750 to 10,542 entries in six months.
- **Delisting is not uninstalling.** Only Obsidian documents a remote switch that disables installed versions for everyone. Raycast's equivalent is per organisation and paid. Zed's needs a client release.
- **Signing is weak everywhere except Homebrew.** Obsidian and Raycast document no signature check on install, and Zed's client code performs none.

## Link re-check

I re-opened these two links after writing the notes:

1. [Obsidian Teams security L48](https://github.com/obsidianmd/obsidian-help/blob/cbe447c1a46d3f522bdc3b0fd81dfb9df3e7f5bf/en/Teams/Security%20considerations%20for%20teams.md?plain=1#L48). This is the kill-list claim.
2. [Zed `package-extensions.js` L235-L237](https://github.com/zed-industries/extensions/blob/bfa28dc77e250b3f930515bfd64609b2d15f126a/src/package-extensions.js#L235-L237). This is the claim that Zed builds and uploads to its own blob store.

Results:

1. **Link 1 confirmed.** Re-fetched through github.com, not the API. The page is `obsidianmd/obsidian-help`, file `en/Teams/Security considerations for teams.md`, commit `cbe447c`. It contains "A check is performed once every 12 hours from the app's startup time to fetch a file hosted on GitHub used for 'plugin deprecations.'" This is Obsidian's own help source.
2. **Link 2 confirmed.** The page is `zed-industries/extensions`, file `src/package-extensions.js`, commit `bfa28dc`. It contains "Package extensions and publish them to the Zed extension blob store.", the default endpoint `https://nyc3.digitaloceanspaces.com`, and the key template `${EXTENSIONS_PREFIX}/${extensionId}/${extensionVersion}/${filename}`. This is Zed's own publishing script.

The quotes from the two summarised pages, the Obsidian blog and the Raycast allow-list, were re-checked against the raw HTML or Markdown with curl before citing.
