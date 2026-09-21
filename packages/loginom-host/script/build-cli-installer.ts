import { chmod } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"

// Build-time only. The installer and wrappers never download runtime resources.
export async function buildCliInstaller(artifact: string, platform: "linux" | "win32" | "darwin") {
  if (!isAbsolute(artifact)) throw Error("CLI_INSTALL_PATH_INVALID")
  if (platform !== "linux" && platform !== "win32" && platform !== "darwin")
    throw Error("CLI_INSTALL_PLATFORM_UNAVAILABLE")
  const installer = await Bun.build({
    entrypoints: [resolve(import.meta.dir, "../src/cli-install-entry.ts")],
    outdir: artifact,
    naming: "install.mjs",
    target: "node",
    packages: "bundle",
    splitting: false,
  })
  if (!installer.success) throw new AggregateError(installer.logs, "CLI_INSTALL_BUILD_FAILED")
  for (const action of ["install", "uninstall"]) {
    if (platform === "win32") {
      await Bun.write(
        join(artifact, action + ".cmd"),
        `@echo off\r\nsetlocal DisableDelayedExpansion\r\n"%~dp0resources\\loginom\\bin\\node.exe" "%~dp0install.mjs" ${action}\r\nexit /b %errorlevel%\r\n`,
      )
      continue
    }
    const script = join(artifact, action + ".sh")
    await Bun.write(
      script,
      '#!/bin/sh\nset -eu\nroot=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$root/resources/loginom/bin/node" "$root/install.mjs" ' +
        action +
        "\n",
    )
    await chmod(script, 0o755)
  }
  await Bun.write(
    join(artifact, "INSTALL.md"),
    platform === "win32"
      ? "# Windows user installation\n\nExtract the entire ZIP into a dedicated directory. Run install.cmd from that extracted directory. The installer uses the bundled Node and verifies the complete payload; no downloads occur.\n\nAdd %LOCALAPPDATA%\\Programs\\loginom-ai-agent-cli\\bin to your user PATH explicitly, then open a new terminal and run loginom-ai-agent-cli --version. Existing PATH entries are not edited by the installer.\n\nStop all CLI processes before running uninstall.cmd from the original extracted directory, outside the installed versioned payload. Uninstall preserves profiles, Desktop and PATH. To update, uninstall the old payload, then install the new archive. Existing launchers are never overwritten.\n"
      : platform === "darwin"
        ? `# macOS test installation

Requires macOS 14 or later on Apple Silicon (arm64). This dev candidate bundles its CLI, Node, Chromium and Keychain helper; Homebrew and a global Node installation are not required. Runtime installation performs no downloads. Loginom and model use still require the configured network services.

## Install

Verify the archive against its adjacent SHA256 file before extraction. Keep the original extracted directory for uninstalling or replacing this candidate:

\`\`\`sh
shasum -a 256 -c loginom-ai-agent-cli-<version>-darwin-arm64.tar.gz.sha256
mkdir cli-candidate
tar -xpf loginom-ai-agent-cli-<version>-darwin-arm64.tar.gz -C cli-candidate
cd cli-candidate
./install.sh
\`\`\`

The \`-p\` option preserves the exact modes verified by the manifest, including under \`umask 077\`. Do not extract into an existing installation. The installer verifies the complete payload and installs it under \`~/.local/share/loginom-ai-agent-cli/<version>-<channel>\`. The launcher is \`~/.local/bin/loginom-ai-agent-cli\`.

Add the following line to \`~/.zprofile\` if that directory is not already on your PATH, then open a new terminal:

\`\`\`sh
export PATH="$HOME/.local/bin:$PATH"
loginom-ai-agent-cli --version
loginom-ai-agent-cli --help
\`\`\`

You can also invoke \`~/.local/bin/loginom-ai-agent-cli\` directly. The installer does not edit PATH.

## Remove or replace

Stop every CLI process, leave the installed payload directory, and run \`./uninstall.sh\` from the original extracted archive. The installer checks open payload files with \`/usr/sbin/lsof\` and refuses removal when the payload is busy or the check cannot establish that it is idle. Uninstall preserves CLI profiles, history, Keychain entries, Desktop and PATH. Existing launchers are never overwritten. To replace a candidate, uninstall the stopped old payload first, then install the new archive.

## Test status and protected storage

This is an ad-hoc signed test build, without Developer ID, notarization or automatic updates. Its signature does not establish Gatekeeper trust. A downloaded archive or extracted application can retain quarantine and be blocked by macOS; use the macOS Privacy & Security approval flow only after checking its origin and checksum. Do not globally disable Gatekeeper. Consult the accompanying acceptance report for the exact macOS versions and scenarios actually tested.

CLI Loginom credentials use the bundled Keychain helper and an encrypted envelope in the independent CLI profile. A missing helper, a locked or unavailable Keychain, or denied access fails closed without plaintext fallback. The helper disables interactive Keychain prompts, so access requiring user interaction also fails closed. Ad-hoc identity does not guarantee uninterrupted Keychain access after replacement: access may need to be authorized in Keychain Access, or credentials reconfigured. Uninstall deliberately retains profile data and its Keychain key; it is not a credential-erasure operation. Desktop and CLI retain independent backends and profiles.
`
        : "# Linux user installation\n\nExtract the archive with tar --same-permissions -xzf <archive.tar.gz> into a dedicated directory. The manifest verifies exact file modes, including when your shell uses umask 077.\n\nRun ./install.sh from this extracted directory. The launcher is ~/.local/bin/loginom-ai-agent-cli; ensure that directory is on your PATH. No downloads occur during installation.\n\nStop all CLI processes before running ./uninstall.sh. Uninstall preserves profiles and Desktop. To update, uninstall the old payload after stopping its processes, then install the new payload. Existing launchers are never overwritten.\n",
  )
}
