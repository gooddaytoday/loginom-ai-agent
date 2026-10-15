import path from "node:path"
import { lstat, mkdir, readFile, rm, writeFile, readdir, readlink } from "node:fs/promises"
import { EvalFailure } from "./fail"

export type EvalrunnerConfig = {
  kind: "evalrunner-runtime"; version: 1; root: string; checkout: string; harnessSha: string
  cliBin: string; cliManifestSha256: string; binarySha256: string; profile: string; workspace: string
  results: string; envFile: string; judgeHome: string; containerId: string; imageDigest: string
  endpoint: string; readinessIssue: string
}

export async function verifyEvalrunnerCli(binary: string) {
  const root = path.dirname(path.dirname(binary))
  const manifest = await Bun.file(path.join(root, "cli-manifest.json")).json() as {
    format: string; metadata: { version: string; sourceCommit: string; sourceDirty: boolean }
    files: { path: string; sha256: string; mode: number; link?: string }[]
  }
  if (manifest.format !== "loginom-cli-artifact-v1" || manifest.metadata.version !== "0.2.0" || manifest.metadata.sourceDirty ||
    manifest.metadata.sourceCommit !== "0c975a73676d9aba556085dbda97e1a9ceb23cc6") throw new EvalFailure("Unexpected CLI build", 2)
  const actual = await payloadFiles(root)
  if (actual.length !== manifest.files.length || new Set(manifest.files.map(item => item.path)).size !== actual.length)
    throw new EvalFailure("CLI payload file set changed", 2)
  for (const item of manifest.files) {
    if (!actual.includes(item.path) || item.path.split("/").includes("..") || path.isAbsolute(item.path)) throw new EvalFailure("CLI payload path changed", 2)
    const file = path.join(root, item.path)
    const info = await lstat(file)
    const link = info.isSymbolicLink() ? await readlink(file) : undefined
    if ((info.mode & 0o7777) !== item.mode || link !== item.link ||
      (link === undefined ? await fileHash(file) : hash(link)) !== item.sha256) throw new EvalFailure("CLI payload integrity changed", 2)
  }
  return manifest.metadata
}

async function payloadFiles(root: string, relative = ""): Promise<string[]> {
  return (await Promise.all((await readdir(path.join(root, relative), { withFileTypes: true })).map(async item => {
    const file = path.join(relative, item.name)
    if (file === "cli-manifest.json") return []
    return item.isDirectory() ? payloadFiles(root, file) : [file]
  }))).flat()
}

const hash = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex")

async function fileHash(file: string) {
  const digest = new Bun.CryptoHasher("sha256")
  for await (const chunk of Bun.file(file).stream()) digest.update(chunk)
  return digest.digest("hex")
}

export async function readEvalrunnerConfig(file: string) {
  const info = await lstat(file)
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.mode & 0o077)
    throw new EvalFailure("Private runtime config required", 2)
  const value: unknown = await Bun.file(file).json()
  if (!value || typeof value !== "object") throw new EvalFailure("Invalid runtime config", 2)
  const config = value as EvalrunnerConfig
  if (config.kind !== "evalrunner-runtime" || config.version !== 1 ||
    ![config.root, config.checkout, config.cliBin, config.profile, config.workspace, config.results, config.envFile, config.judgeHome]
      .every(item => typeof item === "string" && path.isAbsolute(item) && path.resolve(item) === item) ||
    !/^[a-f0-9]{40}$/.test(config.harnessSha) ||
    ![config.cliManifestSha256, config.binarySha256, config.containerId].every(item => /^[a-f0-9]{64}$/.test(item)) ||
    !/^sha256:[a-f0-9]{64}$/.test(config.imageDigest) || !config.endpoint || !/^[\w-]+$/.test(config.readinessIssue))
    throw new EvalFailure("Invalid runtime config", 2)
  const directories = [config.checkout, path.dirname(path.dirname(config.cliBin)), config.profile, config.workspace, config.results, config.judgeHome]
  if (directories.some(item => !item.startsWith(config.root + path.sep)) ||
    directories.some((item, index) => directories.some((other, second) => second !== index && (item === other || item.startsWith(other + path.sep)))))
    throw new EvalFailure("Overlapping runtime boundaries", 2)
  return config
}

/** A failed or crashed admission is durable. Never infer release from a dead PID. */
export async function admitEvalrunner(config: EvalrunnerConfig, input: { series: string; case: string; issue: string; task: string }) {
  if (!/^[\w-]+$/.test(input.case) || !/^[\w-]+$/.test(input.issue) || !/^[\w-]+$/.test(input.task) ||
    !input.series.startsWith(config.results + path.sep) || path.resolve(input.series) !== input.series)
    throw new EvalFailure("Invalid admission", 2)
  await mkdir(path.join(config.root, "operations/admissions"), { recursive: true, mode: 0o700 })
  const directory = path.join(config.root, "operations/stand.lease")
  await mkdir(directory, { mode: 0o700 }).catch(() => { throw new EvalFailure("Stand BUSY/BLOCKED", 2) })
  const stat = await lstat(directory)
  const owner = { nonce: crypto.randomUUID(), pid: process.pid, uid: process.getuid?.(),
    stat: await readFile(`/proc/${process.pid}/stat`, "utf8"), issue: input.issue, task: input.task }
  const raw = JSON.stringify(owner)
  await Bun.write(path.join(directory, "owner.json"), raw, { mode: 0o600 })
  const manifest = { version: 1, kind: "evalrunner-series", config, ...input, owner, infraRetries: 0,
    model: "openai/gpt-6.1-sol", variant: "medium", judge: "gpt-6-sol/xhigh", createdAt: new Date().toISOString() }
  const release = async () => {
    const current = await lstat(directory)
    if (current.dev !== stat.dev || current.ino !== stat.ino || current.isSymbolicLink() || await Bun.file(path.join(directory, "owner.json")).text() !== raw)
      throw new EvalFailure("Stand owner changed", 2)
    await rm(directory, { recursive: true })
  }
  try {
    const admission = path.join(config.root, "operations/admissions", `${input.issue}-${input.case}.json`)
    await writeFile(admission, JSON.stringify(manifest, null, 2), { mode: 0o600, flag: "wx" })
    await mkdir(input.series, { mode: 0o700 })
    await Bun.write(path.join(input.series, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 })
  } catch (error) {
    await release()
    throw new EvalFailure(error instanceof Error && "code" in error && error.code === "EEXIST" ? "Case already admitted; inspect original evidence" : "Admission persistence failed", 2)
  }
  return { manifest, release }
}
