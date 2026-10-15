import path from "node:path"
import { lstat, readdir, readFile, realpath } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { loadTasks } from "./task"

export type EvalrunnerCollection = "regular" | "analytic" | "node"
export type EvalrunnerCorpus = Awaited<ReturnType<typeof loadEvalrunnerCorpus>>
export type EvalrunnerSlot = { id: string; collection: EvalrunnerCollection; case: string; round: number }

export const evalrunnerHash = (text: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(text).digest("hex")

export async function loadEvalrunnerCorpus(evals: string) {
  const root = path.join(evals, "tasks")
  const cases = (await Promise.all((["regular", "analytic", "node"] as const).map(async collection => {
    const directory = collection === "regular" ? root : path.join(root, collection === "node" ? "node-evals" : collection)
    return (await loadTasks(directory)).map(task => ({ collection, id: task.id }))
  }))).flat()
  if (["regular", "analytic", "node"].some((collection, index) => cases.filter(item => item.collection === collection).length !== [3, 35, 10][index]))
    throw new EvalFailure("Expected accepted corpus 3 regular, 35 analytic, 10 node", 2)
  const files = await inventory(root)
  return { cases, files, sha256: evalrunnerHash(JSON.stringify(files)) }
}

export function buildEvalrunnerSlots(corpus: EvalrunnerCorpus): EvalrunnerSlot[] {
  return [1, 2, 3].flatMap(round => corpus.cases.map(item => ({ id: `r${round}-${item.collection}-${item.id}`,
    collection: item.collection, case: item.id, round })))
}

async function inventory(root: string, relative = ""): Promise<{ path: string; sha256: string }[]> {
  if (await realpath(root) !== root) throw new EvalFailure("Corpus boundary changed", 2)
  const entries = await readdir(path.join(root, relative), { withFileTypes: true })
  const files = (await Promise.all(entries.map(async entry => {
    const file = path.join(relative, entry.name)
    const info = await lstat(path.join(root, file))
    if (info.isSymbolicLink()) throw new EvalFailure("Corpus symlink refused", 2)
    if (info.isDirectory()) return inventory(root, file)
    if (!info.isFile()) throw new EvalFailure("Corpus entry refused", 2)
    return [{ path: file, sha256: evalrunnerHash(await readFile(path.join(root, file))) }]
  }))).flat()
  return files.sort((a, b) => a.path.localeCompare(b.path, "en"))
}
