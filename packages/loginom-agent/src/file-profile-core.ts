// From 0.4 `packages/opencode/src/tool/loginom-file-profile-core.ts`: only what local file admission reads (B2.5a).
// B2.5b brings the rest of the module (profiles, scans, samples) and its full `Stored` record.
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

type Identity = { canonical_path: string; size: number; mtime: number; ctime: number; file_id: string }
type Stored = { identity: Identity; scan?: { status: "exact" | "partial"; sha256?: string } }

function failure(code: string, detail: string): never {
  throw Error(`${code}: ${detail}`)
}

function profilePath(dir: string, id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) failure("LOGINOM_FILE_FORMAT_AMBIGUOUS", "unknown profile_id in this session")
  return join(dir, `${id}.json`)
}

export async function loadProfile(id: string, dir: string): Promise<Stored> {
  return JSON.parse(await readFile(profilePath(dir, id), "utf8"))
}

// Only exact scans for this original identity constrain full-file staging.
// Neither the model nor a quick profile can supply a trusted full-file digest.
export async function exactFileDigest(expected: Identity, dir: string) {
  const names = await readdir(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return []
    throw error
  })
  const digests = new Set<string>()
  for (const name of names) {
    if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue
    const profile = await loadProfile(name.slice(0, -5), dir)
    if (
      !["canonical_path", "size", "mtime", "ctime", "file_id"].every(
        (key) => profile.identity[key as keyof Identity] === expected[key as keyof Identity],
      )
    )
      continue
    if (profile.scan?.status !== "exact") continue
    if (!/^[a-f0-9]{64}$/.test(profile.scan.sha256 ?? "")) throw Error("LOGINOM_FILE_CHANGED")
    digests.add(profile.scan.sha256!)
  }
  if (digests.size > 1) throw Error("LOGINOM_FILE_CHANGED")
  return digests.values().next().value
}
