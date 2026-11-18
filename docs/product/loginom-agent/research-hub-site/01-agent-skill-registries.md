# How agent-skill and plugin catalogs publish and distribute

Research date: 2026-11-18. Every source was read on that date. Pages without a version are cited as they stood on that day. Code is cited by commit SHA:

| Repo | Commit (date) |
| --- | --- |
| `vercel-labs/skills` (CLI `skills` 1.9.0) | `57217cf` (2026-11-17) |
| `agentskills/agentskills` | `83021e2` (2026-11-04); PR #254 head `ab2ff8d` |
| `openclaw/clawhub` (0.27.0) | `bcb2592` (2026-11-18) |
| `openclaw/openclaw` | `20bc249` (main, 2026-11-18) |
| `anomalyco/opencode` (formerly `sst/opencode`) | `d412042` (dev, 2026-11-18); the core loader is identical at release `v2.3.2` (`c0ad18b`). The separate v1 loader was read at release `v1.19.6` (`f4e363c`). |

Labels used below:
- **[claim]**: what the operator says in its docs, blog or policy.
- **[code]**: what I read in source at the SHA above.
- **[observed]**: what I fetched or counted myself on 2026-11-18.
- **[third-party]**: a researcher's own report, not the operator's.
- **UNVERIFIED**: I could not confirm it at the source that owns it.

---

## 1. skills.sh (Vercel) and the `skills` CLI

**Short answer:** skills.sh hosts no skills. It indexes public sources (GitHub, plus `/.well-known/` endpoints) that people install with `npx skills add`. A skill enters the index when someone installs it with telemetry on. The only things with accounts and uploads are packs.

### Publication
- **[claim]** "Skills are hosted in GitHub repositories. Create a repository with a skill definition file…" ([FAQ](https://skills.sh/docs/faq)).
- **[claim]** Listing happens through telemetry, not through a submission: "Skills appear on the leaderboard automatically through anonymous telemetry when users run `npx skills add <owner/repo>`" ([FAQ](https://skills.sh/docs/faq)). The site "index[es] every public skill that ships through the open skills CLI" ([About](https://skills.sh/about)).
- **[claim]** The CLI installs from more than GitHub ([docs/commands.md L15-65](https://github.com/vercel-labs/skills/blob/57217cf86ba38148a57af9e90d14a4c049558330/docs/commands.md#L15-L65)):
  - GitHub shorthand or URL, GitLab, Azure Repos, any git URL, or a local path;
  - a direct `SKILL.md` or archive URL ([L111-113](https://github.com/vercel-labs/skills/blob/57217cf86ba38148a57af9e90d14a4c049558330/docs/commands.md#L111-L113)).
- **[code]** The parser matches this list: "Supports: local paths, GitHub URLs, GitLab URLs, Azure Repos URLs, GitHub shorthand, well-known URLs, hosted download URLs, and direct git URLs" ([source-parser.ts L339-340](https://github.com/vercel-labs/skills/blob/57217cf86ba38148a57af9e90d14a4c049558330/src/source-parser.ts#L339-L340)). The well-known provider tries `/.well-known/agent-skills/index.json` first and falls back to `/.well-known/skills/` ([wellknown.ts L98-119](https://github.com/vercel-labs/skills/blob/57217cf86ba38148a57af9e90d14a4c049558330/src/providers/wellknown.ts#L98-L119)).
- **[claim]** The API also lists "well-known" sources, for example `mintlify.com/mintlify` ([API docs](https://skills.sh/docs/api)). So a domain-hosted index can appear on skills.sh too.
- **[claim]** Repo owners can change only how their page looks, with a `skills.sh.json` file at the repo root. It is picked up "after the repository is installed with the skills CLI with telemetry enabled" ([Customize](https://skills.sh/docs/customize)).
- **[claim]** **Packs** are the one account-based feature ([Packs](https://skills.sh/docs/packs)):
  - you "Sign in with Vercel" and add public skills, private files, folders or zips, or GitHub repositories you can access;
  - a pack installs with `npx skills add https://skills.sh/p/<pack-id>`, with no sign-in;
  - packs are "unlisted, not access-controlled".

### Backend
- **[claim]** It has a server and a database: telemetry ingestion, hourly deduplication, a search API, and stored snapshots of each skill's files with a SHA-256 `hash` ([About](https://skills.sh/about); [API docs](https://skills.sh/docs/api), skill detail endpoint).
- **[claim]** The API needs a Vercel OIDC token and is limited to 600 requests per minute "per (team, project)" ([API docs](https://skills.sh/docs/api)). The [Terms](https://skills.sh/terms) instead say the API is "rate-limited per IP". The two pages disagree.
- **[code]** The CLI sends telemetry and audit lookups to `https://www.skills.sh/tele/t` and `/tele/audit` ([telemetry.ts L3-4](https://github.com/vercel-labs/skills/blob/57217cf86ba38148a57af9e90d14a4c049558330/src/telemetry.ts#L3-L4)).
- **[claim vs. what I found]** The About page says "The CLI, the ingestion pipeline, and this site are open source" ([About](https://skills.sh/about)).
  - **[observed]** I found only the CLI repository. A search of the `vercel-labs` and `vercel` GitHub orgs found no public repo for the site or the ingestion pipeline.
  - **UNVERIFIED** that the site and pipeline are open source.

### Moderation and trust
- **[claim]** "Every indexed skill goes through routine security audits performed by partner providers… Skills that fail every partner audit are excluded from the directory entirely" ([About](https://skills.sh/about)).
  - The partners are Gen Agent Trust Hub, Socket, Snyk, Runlayer and ZeroLeaks ([API docs](https://skills.sh/docs/api)).
  - Audits run "automatically after a skill is installed for the first time".
  - The public [Audits page](https://skills.sh/audits) shows Gen, Socket and Snyk columns.
- **[claim]** There is no review before listing, and no guarantee: "we cannot guarantee the quality or security of every skill" ([Docs overview](https://skills.sh/docs); [Terms](https://skills.sh/terms)).
- **[claim]** The only "verified publisher"-like signal is the **Official** list of curated first-party skills, "skills from companies… that build the technology the skill is about" ([API docs](https://skills.sh/docs/api), `/curated`). Forks and copies are flagged `isDuplicate`.
- **[code]** In the CLI, audit results are advisory. They are fetched only for confirmed-public GitHub repos ([add.ts L2869-2878](https://github.com/vercel-labs/skills/blob/57217cf86ba38148a57af9e90d14a4c049558330/src/add.ts#L2869-L2878)), displayed, and then "Silently skip — security info is advisory only" ([add.ts L3203-3224](https://github.com/vercel-labs/skills/blob/57217cf86ba38148a57af9e90d14a4c049558330/src/add.ts#L3203-L3224)). A `fail` verdict does not block `npx skills add`.
- **[code]** There are **no signatures**. A grep of `src/` finds no signature or sigstore verification. Signature verification is still an open request ([issue #617](https://github.com/vercel-labs/skills/issues/617), open).
- There are **checksums**, in two places:
  - **Lock file. [claim]** `skills-lock.json` v2 records a `computedHash` per skill, and for git sources the exact `commit`. `install --frozen-lockfile` fails when the files on disk differ ([README L87-112](https://github.com/vercel-labs/skills/blob/57217cf86ba38148a57af9e90d14a4c049558330/README.md#L87-L112)). **[code]** The lock entry has a `computedHash` field ([local-lock.ts L24, L72](https://github.com/vercel-labs/skills/blob/57217cf86ba38148a57af9e90d14a4c049558330/src/local-lock.ts#L24)). I did not trace the frozen-install comparison in code.
  - **Well-known v0.2.0 indexes. [code]** The CLI checks each entry's `digest` (`sha256:`) and rejects a mismatch ([wellknown.ts L505-520](https://github.com/vercel-labs/skills/blob/57217cf86ba38148a57af9e90d14a4c049558330/src/providers/wellknown.ts#L505-L520)).

### Removal
- **[claim]** There are several reporting and removal routes, and they differ:
  - **Malicious skill:** report it through [security.vercel.com](https://security.vercel.com) ([Contact](https://skills.sh/contact)).
  - **Ordinary problem:** "open an issue" on the skill author's repo ([FAQ](https://skills.sh/docs/faq)).
  - **Author's own listing:** to have it hidden or redirected, the author opens a PR against `vercel-labs/skills` ([Contact](https://skills.sh/contact)).
  - **Takedowns:** "We honor reasonable takedown requests" ([Terms](https://skills.sh/terms)).
- **[claim vs. code]** The Contact page says "The repository README documents the manifest format used to manage hidden and redirected skills."
  - **[observed]** A grep of README, `docs/` and `AGENTS.md` at `57217cf` found no such manifest.
  - **UNVERIFIED.**
- **[code]** Installed copies are not touched. The CLI has no revocation or blocklist check: grep for `blocklist`, `revok` and `malicious` found only a symlink-safety comment. A delisted skill stays installed until the user runs `skills remove`.
- **[claim]** A pack creator can delete the pack, "which disables its install link" ([Packs](https://skills.sh/docs/packs)). Already-installed skills from the pack are not described as affected.

### Private and offline use
- **[claim]** Private sources work with the user's own git credentials (credential helper, `gh`, SSH), on any git host ([docs/commands.md L44-65](https://github.com/vercel-labs/skills/blob/57217cf86ba38148a57af9e90d14a4c049558330/docs/commands.md#L44-L65)).
- An organisation can run its own catalog in two ways:
  - **[code]** host a `/.well-known/agent-skills/index.json` on its own domain (provider above);
  - **[code]** point `npx skills find` at its own search API with `SKILLS_API_URL` ([find.ts L13](https://github.com/vercel-labs/skills/blob/57217cf86ba38148a57af9e90d14a4c049558330/src/find.ts#L13)). The protocol behind that variable is not documented.
- **[claim]** Offline install works from a local path (`npx skills add ./dir`) ([docs/commands.md L15-42](https://github.com/vercel-labs/skills/blob/57217cf86ba38148a57af9e90d14a4c049558330/docs/commands.md#L15-L42)). I did not test it.
- **[claim, check before use]** Telemetry has privacy limits for private sources:
  - telemetry is **on by default** ([CLI docs](https://skills.sh/docs/cli)), while the About page says it is collected "when users opt in" ([About](https://skills.sh/about)), a contradiction;
  - for **non-GitHub** remote sources, install telemetry "may include source and skill identifiers", because visibility cannot be checked ([troubleshooting.md L40](https://github.com/vercel-labs/skills/blob/57217cf86ba38148a57af9e90d14a4c049558330/docs/troubleshooting.md#L40));
  - an internal deployment should set `DISABLE_TELEMETRY=1` or `DO_NOT_TRACK=1`.

---

## 2. Agent Skills open specification (agentskills.io)

**Short answer:** the ratified specification defines only the skill format (a `SKILL.md` folder). It defines **no registry, distribution, signing or revocation**. The one distribution proposal, a `.well-known/agent-skills/index.json` URI, is an **open, unmerged PR**, yet the `skills` CLI already implements it, and ClawHub serves a per-skill index of this shape (schema version unverified).

- **[claim]** The specification covers directory structure, frontmatter (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`), optional directories, progressive disclosure and validation. It has no section on distribution ([specification.mdx](https://github.com/agentskills/agentskills/blob/83021e2be457a9b6679148719c1f6074f0ad975e/docs/specification.mdx); live at [agentskills.io/specification](https://agentskills.io/specification)).
- **[claim]** The client guide only lists options: a cloud agent "will need an alternative discovery mechanism — an API, a remote registry, or bundled assets" ([adding-skills-support.mdx L11](https://github.com/agentskills/agentskills/blob/83021e2be457a9b6679148719c1f6074f0ad975e/docs/client-implementation/adding-skills-support.mdx#L11)).
- **[claim]** Governance:
  - the project became "a Series of LF Projects, LLC", with governance "Adopted November 4, 2026" ([GOVERNANCE.md L3-9](https://github.com/agentskills/agentskills/blob/83021e2be457a9b6679148719c1f6074f0ad975e/GOVERNANCE.md#L3-L9));
  - maintainers do run a reviewed **client showcase** listing, but that lists agent products, not skills ([GOVERNANCE.md L48](https://github.com/agentskills/agentskills/blob/83021e2be457a9b6679148719c1f6074f0ad975e/GOVERNANCE.md#L48)).
- **Proposed distribution, not adopted:**
  - [Issue #255](https://github.com/agentskills/agentskills/issues/255) (open since 2026-03-17) proposes `.well-known` discovery, which needs "no registry, no package manager", and builds on [Cloudflare's Agent Skills Discovery RFC](https://github.com/cloudflare/agent-skills-discovery-rfc).
  - [PR #254](https://github.com/agentskills/agentskills/pull/254) (open, unmerged, last updated 2026-09-17) holds the draft text ([well-known-uri.mdx @ ab2ff8d](https://github.com/agentskills/agentskills/blob/ab2ff8db3d5c9597985b06f94ea3caf1996ce82e/docs/well-known-uri.mdx)). The draft says:
    - **Publishing** means static files at `https://<domain>/.well-known/agent-skills/index.json` ([L8-17](https://github.com/agentskills/agentskills/blob/ab2ff8db3d5c9597985b06f94ea3caf1996ce82e/docs/well-known-uri.mdx#L8-L17)).
    - **Entries:** each has `name`, `description`, `type` (`skill-md` or `archive`), `url`, and a required `digest` `sha256:` that clients **must** verify ([L124-139](https://github.com/agentskills/agentskills/blob/ab2ff8db3d5c9597985b06f94ea3caf1996ce82e/docs/well-known-uri.mdx#L124-L139)).
    - **Trust** is left to the client: "Clients should only use skills from trusted origins" ([L176](https://github.com/agentskills/agentskills/blob/ab2ff8db3d5c9597985b06f94ea3caf1996ce82e/docs/well-known-uri.mdx#L176)). The draft has no signatures, publisher identity, revocation or registry. Integrity comes only from the digest in an index served from the same origin.
  - **[observed]** `https://agentskills.io/well-known-uri` returns 404. The `$schema` host `schemas.agentskills.io` does not resolve in DNS. The draft itself says the URI "is not guaranteed to be a resolvable URL" ([L69](https://github.com/agentskills/agentskills/blob/ab2ff8db3d5c9597985b06f94ea3caf1996ce82e/docs/well-known-uri.mdx#L69)).
  - It is already used in practice:
    - **[code]** the `skills` CLI hard-codes the draft's `https://schemas.agentskills.io/discovery/0.2.0/schema.json` ([wellknown.ts L10](https://github.com/vercel-labs/skills/blob/57217cf86ba38148a57af9e90d14a4c049558330/src/providers/wellknown.ts#L10));
    - **[claim]** ClawHub's docs say it proxies a per-skill `/{owner}/skills/{slug}/.well-known/agent-skills/index.json` ([http-api.md L2043-2045](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/docs/http-api.md#L2043-L2045)). The schema version is not stated, so it is **UNVERIFIED** that this follows the 0.2.0 draft.
- **Removal, moderation, private use:** nothing in the ratified spec. Under the draft, a publisher removes a skill by deleting it from its own `index.json`. An organisation can serve the same layout on an internal domain.

---

## 3. Claude Code plugin marketplaces

**Short answer:** a marketplace is a `.claude-plugin/marketplace.json` in a git repo, at a URL, or in a directory. Anyone can publish one with no submission, and there is no central server for third-party marketplaces. Anthropic runs three separate channels:
1. the **official** marketplace repo, which is being reduced to Anthropic's own plugins;
2. a **community** marketplace, a read-only mirror of a reviewed pipeline;
3. the claude.ai **directory**, which has a developer portal with accounts, scanning and human review.

Everything in this section is **[claim]** from Anthropic's documentation. I read no Claude Code client source. The marketplace counts are my only **[observed]** data.

### Publication
- **Own marketplace:**
  - Add `marketplace.json` with `name`, `owner`, and `plugins[]`, each entry with `name` and `source`, then push. "Once the file is in the repository, the plugin is published, with no submission form" ([Publish](https://code.claude.com/docs/en/plugins/publish); [Create a marketplace](https://code.claude.com/docs/en/plugin-marketplaces)).
  - Plugin sources can be a relative path, `github`, `git-subdir`, `url` (git), `archive` (zip over HTTPS), `npm`, or `command` ([Create a marketplace](https://code.claude.com/docs/en/plugin-marketplaces); [Marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference)).
  - Users run `claude plugin marketplace add <owner/repo | git URL | marketplace.json URL | path>`, then `claude plugin install <plugin>@<marketplace>` ([Host and maintain](https://code.claude.com/docs/en/plugins/host-marketplace)).
- **Anthropic's directory (claude.ai):**
  - Submit from the developer portal at `claude.ai/directory/manage`. This needs a paid plan (Pro, Max, Ultra, or an Owner on Team or Enterprise), and the plugin must come from a GitHub repo that "must be public before the listing goes live" ([Publish to the directory](https://claude.com/docs/directory/publish)).
  - After that, the directory follows a tracked branch or tag and picks up new commits ([Submit your plugin](https://claude.com/docs/plugins/submit)).
  - Directory plugins reach Claude Code as `<name>@synced` through account sync ([Publish](https://code.claude.com/docs/en/plugins/publish)).
- **Official marketplace `claude-plugins-official`, two framings:**
  - The Claude Code docs: it "doesn't take submissions through the directory portal. If you work with an Anthropic partner contact, ask them about an official-marketplace listing" ([Publish](https://code.claude.com/docs/en/plugins/publish)).
  - The repo README: "Submitting a plugin? Submit it at claude.ai/directory/manage… Pull requests to this repository are not monitored", and "`.claude-plugin/marketplace.json` is being phased out for third-party plugins" ([README](https://github.com/anthropics/claude-plugins-official)).
  - Reading them together: third parties submit to the *directory*. A listing in the official *marketplace file* goes through a partner contact or is legacy. The two pages frame this differently, and neither says the directory feeds the official file.
- **Community marketplace `claude-community`:** "a read-only mirror… synced nightly from Anthropic's internal review pipeline". Each entry has "been submitted via claude.ai, passed automated security scanning, and been approved". PRs to the repo "are closed automatically" ([README](https://github.com/anthropics/claude-plugins-community)).
- **[observed]** Marketplace sizes on 2026-11-18, counted from each repo's `.claude-plugin/marketplace.json`:
  - official: 317 entries (163 `url`, 98 `git-subdir`, 55 relative, 1 `command`), 261 pinned by `sha`;
  - community: 2,283 entries, 2,273 pinned by `sha`.

### Backend
- **Own marketplaces** have no server. They are a git repo, a static `marketplace.json` URL, or a shared directory ([Host and maintain](https://code.claude.com/docs/en/plugins/host-marketplace)).
- **Official and community** are GitHub repositories ([Anthropic's marketplaces](https://code.claude.com/docs/en/plugins/anthropic-marketplaces)). The web catalog at [claude.com/marketplace/plugins](https://claude.com/marketplace/plugins) shows install counts.
- **The directory** is a hosted service with accounts and organisations, a submission portal, a scan pipeline, review states and usage analytics ([Publish to the directory](https://claude.com/docs/directory/publish)).

### Moderation and trust
- **Directory:**
  - "every version gets automated validation and a security scan, and a person reviews a new listing before it goes live" ([Publish to the directory](https://claude.com/docs/directory/publish));
  - if a new version fails the scan, "later versions also wait until an Anthropic reviewer clears the plugin" ([Submit your plugin](https://claude.com/docs/plugins/submit));
  - Anthropic decides the "Verified" label during review, with no separate application;
  - listings are governed by the [Software Directory Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy).
- **Name-based trust tiers:**
  - official and community names are accepted "only for marketplaces sourced from `github.com/anthropics/`"; any other source is refused as "untrusted" ([Plugin security](https://code.claude.com/docs/en/plugins/security));
  - "Where the `claude-community` catalog pins a plugin to a commit SHA… Claude Code refuses to install a different commit" (same page);
  - "Anthropic doesn't review third-party marketplaces" ([Anthropic's marketplaces](https://code.claude.com/docs/en/plugins/anthropic-marketplaces)).
- **Checksums:**
  - an `archive` source can pin `sha256`, and a mismatch is refused ([Marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference));
  - git sources can pin `sha` or `ref` ([Host and maintain](https://code.claude.com/docs/en/plugins/host-marketplace));
  - **no publisher signatures** are documented.
- Every install shows a trust warning: "Anthropic does not control what MCP servers, files, or other software are included in plugins…" ([Plugin security](https://code.claude.com/docs/en/plugins/security)).

### Removal
- **Own marketplace:**
  - deleting an entry leaves installed copies in place, reporting "not found in marketplace";
  - `renames: {old: null}` drops the old key from users' settings;
  - with `"forceRemoveDeletedPlugins": true`, Claude Code uninstalls removed plugins at each session start, except plugins installed by managed settings ([Host and maintain](https://code.claude.com/docs/en/plugins/host-marketplace)).
- **Directory delist:** "People who already installed the plugin stop getting updates, and their copy may be removed" ([Submit your plugin](https://claude.com/docs/plugins/submit)). The wording is "may"; the mechanism and timing are not documented.
- **User side:** `claude plugin uninstall`. Cached files stay for 14 days. Removing a marketplace uninstalls everything installed from it ([Plugin security](https://code.claude.com/docs/en/plugins/security)).

### Private and offline use
- **Private catalog:** "if the repository is private, the marketplace is private too". Git hosts include GitLab, Bitbucket and GHES, and a hosted URL can use `headersHelper` auth ([Publish](https://code.claude.com/docs/en/plugins/publish); [Host and maintain](https://code.claude.com/docs/en/plugins/host-marketplace)).
- **Organisation sync:** Team and Enterprise can sync a private marketplace through claude.ai Organization settings ([Host and maintain](https://code.claude.com/docs/en/plugins/host-marketplace)).
- **Admin controls:** `extraKnownMarketplaces` and `enabledPlugins` require plugins; `strictKnownMarketplaces` (allowlist) and `blockedMarketplaces` (blocklist) restrict sources; `CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL` stops the official marketplace being added ([Manage plugins for your organization](https://code.claude.com/docs/en/plugins/org)).
- **Offline or air-gapped:**
  - pre-build a read-only seed and point `CLAUDE_CODE_PLUGIN_SEED_DIR` at it;
  - for fleets "with no outbound git access", combine the seed with `directory` or `file` marketplaces on a shared mount and set `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` ([Manage plugins for your organization](https://code.claude.com/docs/en/plugins/org), "Seed containers and CI").

---

## 4. ClawHub (the OpenClaw registry)

**Short answer:** ClawHub is a full registry service: GitHub OAuth accounts, CLI upload, a database and file storage. Every release passes a pre-publication scan gate. Moderators can hide, quarantine, revoke and ban. The OpenClaw client refuses to install or update a release that ClawHub marks as blocked. I found no mechanism that reaches copies already installed.

### Publication
- **[claim]** `clawhub login` (GitHub), then `clawhub skill publish <path>` or `clawhub package publish <source>`. ClawHub "checks that your token can publish for that owner, validates… then stores the release as pending and runs automated security checks on that exact artifact" ([docs/publishing.md L10-19](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/docs/publishing.md#L10-L19)).
- **[claim]** Packages can also use GitHub Actions OIDC trusted publishing, with no long-lived token ([publishing.md L252-303](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/docs/publishing.md#L252-L303)).
- **[claim]** "anyone can upload, but publishing requires a GitHub account old enough to pass the upload gate" ([docs.openclaw.ai/tools/clawhub](https://docs.openclaw.ai/tools/clawhub)).
- **[code]** The gate is 14 days: `MIN_ACCOUNT_AGE_MS = 14 * 24 * 60 * 60 * 1000` ([convex/lib/githubAccount.ts L9, L84-88](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/convex/lib/githubAccount.ts#L9)). The changelog says 0.5.0 (2026-02-02) introduced it at **7 days** ([CHANGELOG L715](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/CHANGELOG.md#L715)); it was raised later.

### Backend
- **[claim]** "Backend: Convex (DB + file storage + HTTP actions) + Convex Auth (GitHub OAuth)", with OpenAI-embedding vector search ([README L44-50](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/README.md#L44-L50)). Releases are immutable version records ([docs/how-it-works.md](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/docs/how-it-works.md)).
- **[claim]** Each package release carries `artifactSha256` and npm integrity fields, and a public endpoint gives install clients a per-version trust summary with `blockedFromDownload` ([http-api.md L1134-1210](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/docs/http-api.md#L1134-L1210)).
- **[claim]** `clawhub package verify` checks a local file's SHA-256 and npm integrity against the registry ([docs/cli.md L551-570](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/docs/cli.md#L551-L570)).

### Moderation and trust: timeline
| Date | Event | Source |
| --- | --- | --- |
| 2026-02-01 | **[third-party]** Koi Security audits all 2,857 skills on ClawHub and finds **341 malicious**, 335 of them one campaign ("ClawHavoc") delivering Atomic macOS Stealer (AMOS). Koi "reported our findings to ClawHub's security team and provided the full list of malicious skills for removal". A 2026-02-16 update raises it to 824 of more than 10,700 skills. | [Koi post, archived 2026-08-09](https://web.archive.org/web/20260809230724/https://www.koi.ai/blog/clawhavoc-341-malicious-clawedbot-skills-found-by-the-bot-they-were-targeting). The live URL now redirects to Palo Alto Networks. |
| 2026-02-02 | **[third-party, partner]** VirusTotal "has detected hundreds of OpenClaw skills that are actively malicious". Code Insight analysed "314 skills associated with this single user" (`hightower6eu`), "all of them identified as malicious". The payload is "a variant of Atomic Stealer (AMOS)". | [VirusTotal blog](https://blog.virustotal.com/2026/02/from-automation-to-infection-how.html) |
| 2026-02-02 | **[claim]** ClawHub 0.5.0: "auto-hide skills after 4 unique reports", moderators can ban users, "require GitHub accounts to be at least 7 days old". | [CHANGELOG L709-715](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/CHANGELOG.md#L709-L715) |
| 2026-02-07 | **[claim]** OpenClaw partners with VirusTotal. Every published skill is hashed and uploaded for Code Insight. "benign" is auto-approved, "suspicious" gets a warning, "malicious" is "instantly blocked from download", with daily re-scans. "this is not a silver bullet." | [OpenClaw blog](https://openclaw.ai/blog/virustotal-partnership) |
| 2026-02-10 | **[claim]** ClawHub 0.6.0: "quarantine skill publishes with VirusTotal scans". | [CHANGELOG L694](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/CHANGELOG.md#L694) |
| 2026-06-01 | **[claim]** ClawScan (an LLM judge) combines static analysis, VirusTotal and NVIDIA SkillSpector into a pre-catalog gate with the verdicts Clean, Suspicious or Malicious, and adds Skill Cards. The post looks back: "When we launched ClawHub… we partnered with VirusTotal to flag those skills and ban the publishers automatically." | [OpenClaw blog](https://openclaw.ai/blog/openclaw-nvidia-skill-security) |
| 2026-06-23 | **[third-party]** Unit 42: "We identified five unblocked skills"; "Each case passed existing detection tools at the time of our analysis" (February to May 2026); "OpenClaw banned the accounts mentioned and deleted all of the skills." Skills from the early campaigns "have since been removed from the marketplace or marked as malicious." | [Unit 42](https://unit42.paloaltonetworks.com/openclaw-ai-supply-chain-risk/) |
| 2026-10-02 | **[claim]** Tencent AI-Infra-Guard (A.I.G) joins ClawScan; ClawScan now runs A.I.G and SkillSpector, then an AI judge. | [OpenClaw blog](https://openclaw.ai/blog/tencent-aig-joins-clawscan) |
| 2026-11-12 | **[claim]** ClawHub 0.26.0: "retire VirusTotal entirely", and "remove the in-publish static scan". | [CHANGELOG L47-48](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/CHANGELOG.md#L47-L48) |

The February and June blog descriptions are therefore **historical**. The current state, in ClawHub's own docs at `bcb2592`, is:
- **Gate.** A pending release "stays out of search, install, and download surfaces until the security checks pass". Malicious, repeatedly failing or timed-out releases are not published ([publishing.md L15-19](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/docs/publishing.md#L15-L19)).
- **What the audit page shows.** It combines SkillSpector, A.I.G and ClawScan risk analysis, with the statuses `Pass`, `Review`, `Warn` and `Malicious` ([docs/security-audits.md L36-50, L117-125, L313-327](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/docs/security-audits.md#L36-L50)).
- **Exception for plugins.** Plugin Inspector "does not run during publish and never blocks it"; it monitors after acceptance and nightly ([publishing.md L188-194](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/docs/publishing.md#L188-L194)).
- **Moderation.** Signed-in users can report. Moderators place holds, hide, quarantine or revoke, and ban accounts. Publisher abuse signals are checked daily and can trigger automatic warnings and bans ([docs/moderation.md L26-111](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/docs/moderation.md#L26-L111)).
- **Verified publishers.**
  - **[code]** An admin-only `trustedPublisher` user flag exists at HEAD ([convex/schema.ts L196](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/convex/schema.ts#L196); [convex/users.ts L2176-2193](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/convex/users.ts#L2176-L2193)).
  - **[claim]** The 0.8.0 changelog (2026-03-13) says the flag bypasses pending-scan auto-hide ([CHANGELOG L563](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/CHANGELOG.md#L563)). I did not check whether it still does that after the ClawScan rework.
  - **[claim]** Higher trust tiers ("official packages, trusted publishers") are only being explored ([OpenClaw blog, 2026-05-15](https://openclaw.ai/blog/where-openclaw-security-is-heading)).
- **Signatures.** No publisher signatures. Integrity comes from SHA-256 and npm integrity fields only.

### Removal
- **[claim]** Owners, publisher admins, moderators and admins can soft-delete and restore. "Hard delete is admin-only (management tools / ban flows)". `clawhub uninstall` "only removes a local install on your machine" ([README L68-76](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/README.md#L68-L76)).
- **[code]** The OpenClaw client checks trust per version at **install and update**:
  - a release that is `blockedFromDownload`, `malicious`, or in a blocking moderation state ends with "ClawHub blocked this release; install/update was not started" ([clawhub-install-trust.ts L112-143, L543-550](https://github.com/openclaw/openclaw/blob/20bc249cae236a3c4492c027350fd0fd7554c5d0/src/infra/clawhub-install-trust.ts#L112-L143));
  - the disposition is recorded in the install record.
- **[code, negative finding]** I found no path that disables or removes a skill or plugin that is **already installed** when it is later revoked; the trust check runs only on install and update. **UNVERIFIED** that no such path exists elsewhere in OpenClaw. The blog sets the bar as "the ClawHub install path should refuse it" ([2026-05-15 post](https://openclaw.ai/blog/where-openclaw-security-is-heading)).

### Private and offline use
- **[observed]** The registry code is MIT-licensed ([LICENSE](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/LICENSE)).
- **[claim]** It can be self-hosted on your own Convex deployment ([specs/deploy.md L481-491](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/specs/deploy.md#L481-L491)).
- **[claim]** Clients find a registry through `/.well-known/clawhub.json`, `--registry`, or `CLAWHUB_REGISTRY` ([http-api.md L2047-2060](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/docs/http-api.md#L2047-L2060); [docs/cli.md L32-39](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/docs/cli.md#L32-L39)).
- **[claim]** OpenClaw plugins can also come from npm (`npm:<package>`) ([docs.openclaw.ai/tools/clawhub](https://docs.openclaw.ai/tools/clawhub)), or "from GitHub, a private registry, or a file someone sends you" ([2026-05-15 post](https://openclaw.ai/blog/where-openclaw-security-is-heading)).
- **[claim]** Installs are folders tracked in `.clawhub/lock.json`. `clawhub pin` freezes a skill against updates ([docs/cli.md L173-218](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/docs/cli.md#L173-L218)).
- An offline install procedure is not documented: **UNVERIFIED**.

---

## 5. OpenCode: skills loaded from a URL

**Repository.** `sst/opencode` now resolves to `anomalyco/opencode` ([GitHub API](https://api.github.com/repos/sst/opencode) returns `full_name: anomalyco/opencode`). **[observed]** On 2026-11-18 two release lines exist:
- **v2.x**, latest `v2.3.2` (2026-11-18, commit `c0ad18b`);
- **v1.19.x**, latest `v1.19.6` (2026-11-17, commit `f4e363c`), which GitHub currently marks as "latest" ([releases](https://github.com/anomalyco/opencode/releases)).

They load URL skills with **different code and different config keys**. Both versions are described below.

**Short answer:** in both lines a URL source is an **HTTP catalog**:
- the base URL serves `index.json` in the form `{"skills":[{"name", "files":[…], "version"?}]}`;
- OpenCode downloads `<base>/<name>/<file>` into its local cache;
- there is no registry, account, digest or signature;
- the publisher removes a skill by deleting it from the index.

The format is the legacy "v0.1" `.well-known/skills` index shape (name plus a file list) with an optional `version`. It is not the digest-bearing 0.2.0 draft from §2.

### Publication (index format)
- **v2 (current docs and dev):**
  - **[claim]** Config takes a flat `"skills": ["./team-skills", "~/shared/…", "/opt/company-skills", "https://example.com/opencode/skills/"]`. A catalog is "a base URL with an `index.json` file", for example `{"skills":[{"name":"git-release","version":"3","files":["git-release.md","references/release-policy.md"]}]}` ([opencode.ai/docs/skills](https://opencode.ai/docs/skills/), "Sources" and "Catalogs"). Rules from the same page:
    - "Paths: Must be safe, relative, and same-origin";
    - "Entry file: Include `SKILL.md` or `<name>.md`";
    - "Updates: Increment `version` when files change so OpenCode refreshes its cache".
  - **[code]** The schema is `IndexSkill { name; version?; files[] }` ([packages/core/src/skill/discovery.ts L48-56 @ d412042](https://github.com/anomalyco/opencode/blob/d412042beb9821ed61c73466406f7dbfdadc04e0/packages/core/src/skill/discovery.ts#L48-L56)). The file is identical at tag `v2.3.2`.
  - **[code]** Validation:
    - it skips entries whose `name` is not a safe single segment, or that list no `SKILL.md` or `<name>.md`;
    - it rejects file paths that are absolute, contain `..`, `?` or `#`, or resolve to another origin ([L92-145](https://github.com/anomalyco/opencode/blob/d412042beb9821ed61c73466406f7dbfdadc04e0/packages/core/src/skill/discovery.ts#L92-L145));
    - a URL entry is any `^https?:` item in `skills` ([config/plugin/skill.ts L93-96](https://github.com/anomalyco/opencode/blob/d412042beb9821ed61c73466406f7dbfdadc04e0/packages/core/src/config/plugin/skill.ts#L93-L96));
    - the old object form `skills: {paths, urls}` is still accepted and flattened ([config/normalize.ts L235-247](https://github.com/anomalyco/opencode/blob/d412042beb9821ed61c73466406f7dbfdadc04e0/packages/core/src/config/normalize.ts#L235-L247)).
- **v1.19.6 (shipped `opencode` binary from `packages/opencode`):**
  - **[code]** Config is `skills: { paths?: string[], urls?: string[] }`. The field description's example is `https://example.com/.well-known/skills/` ([v1/config/skills.ts @ v1.19.6](https://github.com/anomalyco/opencode/blob/v1.19.6/packages/core/src/v1/config/skills.ts)).
  - **[code]** The loader iterates `cfg.skills?.urls` ([skill/index.ts L222 @ v1.19.6](https://github.com/anomalyco/opencode/blob/v1.19.6/packages/opencode/src/skill/index.ts#L222)).
  - **[code]** It uses a **separate, weaker** discovery ([packages/opencode/src/skill/discovery.ts @ v1.19.6](https://github.com/anomalyco/opencode/blob/v1.19.6/packages/opencode/src/skill/discovery.ts)):
    - entries need `SKILL.md` in `files` ([L67-72](https://github.com/anomalyco/opencode/blob/v1.19.6/packages/opencode/src/skill/discovery.ts#L67-L72));
    - the cache is `<cache>/skills/<name>` and is **not** namespaced per catalog ([L79](https://github.com/anomalyco/opencode/blob/v1.19.6/packages/opencode/src/skill/discovery.ts#L79));
    - file paths go straight into `new URL(file, …)` and `path.join(root, file)` with **no same-origin or `..` checks** ([L88-92](https://github.com/anomalyco/opencode/blob/v1.19.6/packages/opencode/src/skill/discovery.ts#L88-L92)). A hostile index could therefore make v1 fetch from another origin or write outside the skill directory. This is my reading of the code; I did not test it.
  - **[observed]** The `v1.19.6` docs source does not document URL sources ([skills.mdx @ v1.19.6](https://github.com/anomalyco/opencode/blob/v1.19.6/packages/web/src/content/docs/skills.mdx)). The live docs page describes the v2 form.
- **[claim, v2]** A separate channel exists: "A connected OpenCode Console workspace can also share skills" ([docs/skills](https://opencode.ai/docs/skills/)).
  - **[code]** It fetches authenticated bundles from `<server>/api/v2/skills/{slug}` ([plugin/provider/opencode.ts L761-784](https://github.com/anomalyco/opencode/blob/d412042beb9821ed61c73466406f7dbfdadc04e0/packages/core/src/plugin/provider/opencode.ts#L761-L784)).
  - The [Console docs page](https://opencode.ai/docs/console/) does not describe skill sharing.

### Backend
- **[code]** It is a static file host and nothing more: GET `index.json`, then GET each file, with transient retries.
  - In the discovery files of both lines, the only header set on the request is `Accept: application/json` on the index request ([v2 L92-103](https://github.com/anomalyco/opencode/blob/d412042beb9821ed61c73466406f7dbfdadc04e0/packages/core/src/skill/discovery.ts#L92-L103); [v1 L56-63](https://github.com/anomalyco/opencode/blob/v1.19.6/packages/opencode/src/skill/discovery.ts#L56-L63)).
  - I did not check whether the shared HTTP client layer adds credentials, or whether credentials embedded in the URL work. So private-catalog authentication is **UNVERIFIED**, not ruled out.
- **[code]** The v2 cache is `<global cache>/skills/<hash(base)>/<name>/` ([L106](https://github.com/anomalyco/opencode/blob/d412042beb9821ed61c73466406f7dbfdadc04e0/packages/core/src/skill/discovery.ts#L106)).

### Moderation and trust
- **[code]** Neither line has a digest, signature or publisher identity. v2 adds only the same-origin and safe-path checks above.
- **[claim]** Per-agent skill **permissions** (`deny` hides and rejects a skill) are the user's control ([docs/skills](https://opencode.ai/docs/skills/), "Permissions").

### Updates and removal (both lines, from code)
- **Refresh depends on `version`:**
  - `download()` returns early if the file already exists ([v2 L78-80](https://github.com/anomalyco/opencode/blob/d412042beb9821ed61c73466406f7dbfdadc04e0/packages/core/src/skill/discovery.ts#L78-L80); [v1 L37-38](https://github.com/anomalyco/opencode/blob/v1.19.6/packages/opencode/src/skill/discovery.ts#L37-L38));
  - so **with no `version`, or with the same `version`, files already cached are never re-downloaded**, and only missing files are fetched ([v2 L149-156](https://github.com/anomalyco/opencode/blob/d412042beb9821ed61c73466406f7dbfdadc04e0/packages/core/src/skill/discovery.ts#L149-L156));
  - a changed `version` downloads into a staging directory and swaps it in atomically ([v2 L157-190](https://github.com/anomalyco/opencode/blob/d412042beb9821ed61c73466406f7dbfdadc04e0/packages/core/src/skill/discovery.ts#L157-L190)).
- **Removal takes effect at the next load:**
  - only directories returned by `pull()` are loaded ([v2 config/plugin/skill.ts L109-118](https://github.com/anomalyco/opencode/blob/d412042beb9821ed61c73466406f7dbfdadc04e0/packages/core/src/config/plugin/skill.ts#L109-L118));
  - so a skill removed from `index.json` **stops loading**, but its cached files stay on disk (I found no cleanup);
  - the same applies when the URL is removed from config.

### Private and offline use (both lines, from code)
- **Offline, a URL catalog does not load.** If `index.json` cannot be fetched, `pull()` logs an error and returns `[]`, and the cached copy is not used ([v2 L95-104](https://github.com/anomalyco/opencode/blob/d412042beb9821ed61c73466406f7dbfdadc04e0/packages/core/src/skill/discovery.ts#L95-L104); [v1 L56-65](https://github.com/anomalyco/opencode/blob/v1.19.6/packages/opencode/src/skill/discovery.ts#L56-L65)).
- For offline or private use, point the config at a local or shared **directory** path instead: `skills` entries in v2, `skills.paths` in v1 ([docs/skills](https://opencode.ai/docs/skills/)).
- An internal catalog reachable without authentication works in both lines.

---

## Comparison

| | skills.sh / `skills` CLI | Agent Skills spec | Claude Code marketplaces | ClawHub | OpenCode URL source |
| --- | --- | --- | --- | --- | --- |
| **Publication** | Push to GitHub, or host a `.well-known` index. Listed after a telemetry install. Packs need a Vercel sign-in. | Format only. A `.well-known` index is proposed (PR #254, unmerged). | Own: commit `marketplace.json`. Directory: portal submission. Official: partner contact. Community: reviewed pipeline. | CLI upload with a GitHub account at least 14 days old. | Host `index.json` and files at any URL. Config: `skills: [url]` in v2, `skills.urls` in v1.19. |
| **Backend** | Vercel service: telemetry, audits, API, snapshots. Content stays in source repos. | None | Own and official: git repo or static JSON. Directory: hosted service. | Convex DB, file storage, auth, vector search. | Static HTTP |
| **Review before listing** | No | n/a | Directory and community: yes. Third-party marketplaces: no. | Automated gate per release; human moderation afterwards. | No |
| **Automated scanning** | Partner audits after first install; advisory in the CLI. | n/a | Directory: every version. | ClawScan (A.I.G, SkillSpector, LLM judge). VirusTotal retired 2026-11-12. | No |
| **Verified publishers** | "Official" curated list | n/a | Reserved Anthropic names; "Verified" label in the directory. | `trustedPublisher` flag; tiers still being explored. | No |
| **Signatures / checksums** | No signatures. Lock-file hash, commit pin, well-known digest. | Draft: required `sha256` digest, no signatures. | No signatures. `sha256` on archives, `sha` pins on git. | No signatures. SHA-256 and npm integrity, `package verify`. | None. v1.19.6 also lacks path and origin checks. |
| **Removal** | Takedown request or PR. Installed copies untouched. | Publisher edits its own index. | `forceRemoveDeletedPlugins` uninstalls; directory delist "may" remove copies. | Soft or hard delete, quarantine, ban. Blocked at install and update; existing installs not reached (as far as I found). | Drop from index: stops loading next time; files stay cached. |
| **Private / offline** | Private git via your own credentials; own well-known index. Watch telemetry on non-GitHub sources. | Own domain | Private repos, org sync, allowlist, seed directory for air-gapped fleets. | Self-hostable (MIT) via `CLAWHUB_REGISTRY`. | Discovery code sets no auth header (shared client not checked). Offline means local directories only. |

## Link spot-check (2026-11-18)
I re-opened two links after writing. Both lead to the source that owns the claim:
- The [ClawHub CHANGELOG @ bcb2592](https://github.com/openclaw/clawhub/blob/bcb25920d7bf46881cbd911d71d6d2d26598d208/CHANGELOG.md) is `openclaw/clawhub/CHANGELOG.md`. Under 0.26.0 (2026-11-12) it reads "Security: retire VirusTotal entirely."
- [code.claude.com/docs/en/plugins/publish](https://code.claude.com/docs/en/plugins/publish) is Anthropic's Claude Code docs. It reads "Anthropic's official marketplace, `claude-plugins-official`, doesn't take submissions through the directory portal. If you work with an Anthropic partner contact, ask them about an official-marketplace listing."

## Not verified
- skills.sh: whether the site and ingestion pipeline are open source; the "hidden/redirect manifest" the Contact page promises.
- skills.sh: whether audit failures actually remove a skill from search and API results (the About page claim). I did not test it.
- Claude Code: how and when a delisted directory plugin is removed from installs ("may be removed"). I read no client source.
- ClawHub: whether any OpenClaw path revokes already-installed skills; an offline install procedure; whether its per-skill `.well-known` index follows the 0.2.0 draft.
- OpenCode: whether URL catalogs can carry authentication through the shared HTTP client or URL credentials; whether the v1.19.6 path handling is exploitable in practice.
- No behaviour above was observed in a running system. Code findings come from reading source, not from execution.
