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
        ? "# macOS user installation\n\nExtract the complete archive with tar -xpf <archive.tar.gz> into a dedicated directory. Run ./install.sh there, using the bundled Node. No downloads occur.\n\nThe launcher is ~/.local/bin/loginom-ai-agent-cli; add that directory to PATH explicitly. Stop all CLI processes before running ./uninstall.sh from the original extracted archive, outside the installed payload. The installer checks open payload files with /usr/sbin/lsof and refuses deletion if this check fails. Profiles and Desktop are preserved. Updates require uninstalling the stopped old payload first. Native signing and platform acceptance are required before release.\n"
        : "# Linux user installation\n\nExtract the archive with tar --same-permissions -xzf <archive.tar.gz> into a dedicated directory. The manifest verifies exact file modes, including when your shell uses umask 077.\n\nRun ./install.sh from this extracted directory. The launcher is ~/.local/bin/loginom-ai-agent-cli; ensure that directory is on your PATH. No downloads occur during installation.\n\nStop all CLI processes before running ./uninstall.sh. Uninstall preserves profiles and Desktop. To update, uninstall the old payload after stopping its processes, then install the new payload. Existing launchers are never overwritten.\n",
  )
}
