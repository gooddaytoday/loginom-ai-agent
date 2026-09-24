# Artifact Browser Downloads Implementation Plan

> **For agentic workers:** Execute sequentially in this task; the design review is delegated as required by brainstorming. Preserve unrelated changes. Steps use checkbox syntax for tracking.

**Goal:** Complete CSV delivery on secure Loginom origins with verified downloaded bytes in managed and MCP-owned browsers.

**Architecture:** Share one origin-scoped initialization script between MCP session configuration and the managed browser's pre-login context. Hide only `showSaveFilePicker` before application scripts; retain the existing native download, verification and cleanup pipeline.

**Tech Stack:** Node 24.19.0, Playwright MCP 0.0.80, Playwright 1.63.0-alpha-2026-08-31, Chromium 1243, Bun 1.3.14 for managed acceptance.

**Spec:** [design](../specs/2026-09-24-artifact-browser-downloads-design.md)

## Global Constraints

- Use the same authenticated context for MCP and execution; no second browser/CDP session.
- Preserve origin, filename, byte count, SHA-256 and cleanup checks.
- Keep browser sandbox and runtime version pins.
- Tests run from package directories with pinned Node, never from the repository root.
- Source acceptance does not certify installed applications or other operating systems.

## Task 1: Early browser download policy and regression coverage

**Files:** create `packages/loginom-runtime/client/lib/browser-downloads.mjs`, `client/test/browser-downloads.test.mjs`, `client/test/browser-downloads.integration.test.mjs`; modify `client/lib/session.mjs`, `src/connection-check.mjs`.

**Interface:** `browserDownloadScript(loginomUrl)` returns an initialization script string. A configured URL limits it to that exact origin; an omitted URL covers the dedicated legacy Dock context.

- [ ] Write ordinary Node tests executing the returned script in a VM: same origin disables save picker, another origin retains it, absent API is harmless, open picker remains, URL query is absent from code, repeated invocation is harmless.
- [ ] Write a real-browser regression using `LOGINOM_DOCK_TEST_BROWSER=/absolute/path/to/chrome`. A local HTTP fixture records API availability synchronously, provides a Blob download and file input, and exposes the identity needed by `loginBrowser`. Exercise both `createSession` → MCP-owned browser and `loginBrowser` → MCP `contextGetter`. Check downloaded bytes, actual file input contents, reload/new page, and another origin.
- [ ] Run regression before implementation and confirm failure at the missing early download policy, not a missing tool/browser.
- [ ] Implement the script builder, generated private `browser-downloads.js` (`mode: 0o600`) in the session, `browser.initScript: [absolutePath]`, and `context.addInitScript({content: browserDownloadScript(candidate.url)})` before `loginPage`.

```js
export function browserDownloadScript(loginomUrl) {
  const origin = loginomUrl ? new URL(loginomUrl).origin : null;
  return `if (${origin === null ? 'true' : `globalThis.location.origin === ${JSON.stringify(origin)}`}) delete globalThis.showSaveFilePicker;`;
}
```

- [ ] Run new unit/browser tests and artifact download, upload, delivery, verification, runtime pin and connection tests with `/home/kiselev/git/loginom-ai-agent/evals/.bundle/bin/node --test ...` from `packages/loginom-runtime/client`.

## Task 2: Live managed acceptance and durable result

**Files:** add a repeatable managed acceptance script under `packages/loginom-host/script/`; update `docs/testing/loginom-ai-agent/artifact-save-picker.md`, `packages/loginom-runtime/AGENTS.md` and this checklist.

**Interfaces:** use existing `stageResources`, `supervise`, `inputStore`, `dock_prepare`, `dock_artifact_deliver`, `dock_node_apply`, `dock_node_wait`, `dock_action_run`; credentials are read privately and sent through IPC only.

- [ ] Stage current runtime sources in a new isolated resource directory with the unchanged pinned Node/Chromium. Verify its resource manifest, without rewriting the user's eval bundle/profile.
- [ ] Through managed-entry, admit the original 23-byte sales CSV under a unique input identity. In both headless/headed, prepare a draft, deliver, check `SUCCEEDED`, expected hash and completed cleanup. Inspect the journal for real download/verification events and absence of the original error.
- [ ] In the acceptance session, also deliver TSV, import the CSV, execute a text export and check the actual output bytes/hash receipt, then save the package with `package.save_checkpoint`. Close the owned saved package and log out through the existing acceptance cleanup hook.
- [ ] Run the full Node client suite. Only broaden testing for a new change or unresolved failure.
- [ ] Record actual checks and limitations in the diagnosis, add the pre-navigation ownership rule to AGENTS, and mark completed checklist items. Review the final diff against the spec before claiming completion.
