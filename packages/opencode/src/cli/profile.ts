import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { Product } from "@loginom-ai-agent/product"
import { profilePaths } from "@loginom-ai-agent/product/cli-profile"

export async function acquireProfile(root: string, channel: keyof typeof Product.channels) {
  if (!path.isAbsolute(root)) throw new Error("PROFILE_ROOT_INVALID")
  await fs.mkdir(root, { recursive: true, mode: 0o700 })
  const canonical = await fs.realpath(root)
  if (
    Object.values(Product.channels).some((name) => path.basename(canonical) === name) ||
    [Product.slug, `${Product.slug}-dev`, `${Product.slug}-beta`].includes(path.basename(canonical))
  ) {
    throw new Error("PROFILE_DESKTOP_ROOT")
  }
  if (process.platform === "win32") {
    const { protectWindowsProfile } = await import("./profile-windows")
    await protectWindowsProfile(canonical)
  }
  if (process.platform !== "win32") {
    const info = await fs.stat(canonical)
    if ((process.getuid && info.uid !== process.getuid()) || (info.mode & 0o077) !== 0)
      throw new Error("PROFILE_PERMISSIONS_INVALID")
  }
  const lock = path.join(canonical, ".writer")
  const nonce = randomUUID()
  await fs.mkdir(lock, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw new Error("PROFILE_BUSY")
    throw error
  })
  await fs.writeFile(path.join(lock, "owner"), nonce, { flag: "wx", mode: 0o600 })
  const release = async () => {
    if ((await fs.readFile(path.join(lock, "owner"), "utf8")) !== nonce) throw new Error("PROFILE_OWNER_CHANGED")
    await fs.unlink(path.join(lock, "owner"))
    await fs.rmdir(lock)
  }
  try {
    const marker = path.join(canonical, "cli-profile.json")
    const entries = await fs.readdir(canonical)
    if (!entries.includes("cli-profile.json")) {
      if (entries.some((name) => name !== ".writer")) throw new Error("PROFILE_FORMAT_INVALID")
      await fs.writeFile(marker, JSON.stringify({ format: "loginom-cli", version: 1, channel }), {
        flag: "wx",
        mode: 0o600,
      })
    }
    if ((await fs.lstat(marker)).isSymbolicLink()) throw new Error("PROFILE_FORMAT_INVALID")
    const value: unknown = JSON.parse(await fs.readFile(marker, "utf8"))
    if (
      typeof value !== "object" ||
      value === null ||
      !("format" in value) ||
      value.format !== "loginom-cli" ||
      !("version" in value) ||
      value.version !== 1 ||
      !("channel" in value) ||
      value.channel !== channel
    ) {
      throw new Error("PROFILE_FORMAT_INVALID")
    }
    const paths = profilePaths(canonical)
    for (const directory of [paths.config, paths.data, paths.state, paths.cache, paths.tmp, paths.loginom]) {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 })
      const info = await fs.lstat(directory)
      if (!info.isDirectory() || info.isSymbolicLink() || (await fs.realpath(directory)) !== directory) {
        throw new Error("PROFILE_PATH_INVALID")
      }
      if (
        process.platform !== "win32" &&
        ((process.getuid && info.uid !== process.getuid()) || (info.mode & 0o077) !== 0)
      )
        throw new Error("PROFILE_PERMISSIONS_INVALID")
    }
    return { paths, release }
  } catch (error) {
    await release()
    throw error
  }
}

export function profileEnvironment(paths: ReturnType<typeof profilePaths>, env: NodeJS.ProcessEnv) {
  const result = { ...env }
  // Inherited Desktop/sidecar settings must not redirect CLI writes or supply its auth.
  delete result.LOGINOM_AI_AGENT_AUTH_CONTENT
  delete result.LOGINOM_AI_AGENT_CONFIG
  delete result.LOGINOM_AI_AGENT_CONFIG_CONTENT
  return {
    ...result,
    LOGINOM_AI_AGENT_CLI_ROOT: paths.root,
    LOGINOM_AI_AGENT_CONFIG_DIR: paths.config,
    LOGINOM_AI_AGENT_DB: path.join(paths.data, Product.database),
    TMPDIR: paths.tmp,
    TMP: paths.tmp,
    TEMP: paths.tmp,
  }
}
