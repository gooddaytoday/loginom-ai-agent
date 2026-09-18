import { chmod, lstat, readdir } from "node:fs/promises"
import { join } from "node:path"

// Installed Linux payloads are root-owned and must remain readable by ordinary users.
// Only package contents belong here; never run this on user profiles.
export async function linuxPermissions(root: string) {
  const stat = await lstat(root)
  if (stat.isSymbolicLink()) return
  if (!stat.isDirectory()) {
    await chmod(root, stat.mode & 0o111 ? 0o755 : 0o644)
    return
  }
  await chmod(root, 0o755)
  await Promise.all((await readdir(root)).map((name) => linuxPermissions(join(root, name))))
}

export async function verifyLinuxPermissions(root: string) {
  const stat = await lstat(root)
  if (stat.isSymbolicLink()) return
  if (!stat.isDirectory()) {
    if (!(stat.mode & 0o004) || (stat.mode & 0o111 && !(stat.mode & 0o001)))
      throw Error("RELEASE_PUBLIC_FILE_PERMISSIONS_INVALID")
    return
  }
  if ((stat.mode & 0o005) !== 0o005) throw Error("RELEASE_PUBLIC_DIRECTORY_PERMISSIONS_INVALID")
  await Promise.all((await readdir(root)).map((name) => verifyLinuxPermissions(join(root, name))))
}
