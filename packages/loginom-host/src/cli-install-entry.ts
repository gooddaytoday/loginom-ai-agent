import { homedir } from "node:os"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { installCli, uninstallCli } from "./cli-install"

try {
  if (process.platform === "win32") {
    const { installWindowsCli, uninstallWindowsCli } = await import("./cli-install-windows")
    const root = process.env.LOCALAPPDATA ?? ""
    if (process.argv[2] === "install") {
      console.log(JSON.stringify(await installWindowsCli(dirname(fileURLToPath(import.meta.url)), root)))
    } else if (process.argv[2] === "uninstall") {
      await uninstallWindowsCli(root)
      console.log(JSON.stringify({ uninstalled: true, profilesPreserved: true }))
    } else {
      throw new Error("CLI_INSTALL_ARGUMENT_INVALID")
    }
  } else if (process.argv[2] === "install") {
    console.log(JSON.stringify(await installCli(dirname(fileURLToPath(import.meta.url)), homedir())))
  } else if (process.argv[2] === "uninstall") {
    await uninstallCli(homedir())
    console.log(JSON.stringify({ uninstalled: true, profilesPreserved: true }))
  } else {
    throw new Error("CLI_INSTALL_ARGUMENT_INVALID")
  }
} catch (error) {
  const code =
    error instanceof Error && /^(CLI_INSTALL|LOGINOM_MANIFEST)_[A-Z_]+$/.test(error.message)
      ? error.message
      : "CLI_INSTALL_FAILED"
  process.stderr.write(code + "\n")
  process.exitCode = 1
}
