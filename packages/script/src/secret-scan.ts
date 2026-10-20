import { existsSync } from "node:fs"
import { chmod, lstat, mkdir, mkdtemp, rm } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { basename, dirname, join, posix } from "node:path"

type Finding = { File: string; StartLine: number; RuleID: string; Commit?: string }
type Archive = { oid: string; file: string; current?: boolean; blob?: Uint8Array }
class ScanFailure extends Error {}
const archivePaths = ["lgp", "zip", "tgz", "gz", "tar", "7z", "xz", "bz2", "zst"].map((ext) => `:(icase)*.${ext}`)
const archivePattern = /\.(lgp|zip|tgz|tar\.gz|gz|tar|7z|xz|bz2|zst)$/i

async function main() {
  const started = performance.now()
  const mode = Bun.argv[2]
  if (!["staged", "range", "push", "audit"].includes(mode))
    throw new ScanFailure("Usage: bun run secrets <staged|push REMOTE|range BASE HEAD|audit>")
  const references =
    mode === "audit"
      ? git("for-each-ref", "--format=%(refname) %(objectname)", "refs/heads", "refs/remotes", "refs/tags")
          .trim()
          .split("\n")
          .filter(Boolean)
      : undefined
  const revisions =
    mode === "audit"
      ? [...new Set([commit("HEAD"), ...references!.map((reference) => reference.split(" ")[1])])]
      : mode === "range"
        ? [`${commit(Bun.argv[3])}..${commit(Bun.argv[4])}`]
        : mode === "push"
          ? pushRevisions(await Bun.stdin.text(), Bun.argv[3])
          : []
  const commits =
    mode === "staged" || !revisions.length
      ? []
      : git("rev-list", ...revisions)
          .trim()
          .split("\n")
          .filter(Boolean)
  if (mode === "staged" ? !git("diff", "--staged", "--name-only", "-z") : mode !== "audit" && !commits.length) {
    console.log(
      JSON.stringify({ status: "clean", commits: 0, archives: 0, elapsed_ms: Math.round(performance.now() - started) }),
    )
    return 0
  }
  const version = (await Bun.file(new URL("../../../.gitleaks-version", import.meta.url)).text()).trim()
  const binary = Bun.which(process.env.GITLEAKS_BIN || "gitleaks")
  if (!binary) throw new ScanFailure("Gitleaks is missing. Run bun run secrets:install before committing.")
  if (Bun.spawnSync([binary, "version"]).stdout.toString().trim() !== version)
    throw new ScanFailure("Gitleaks version differs from .gitleaks-version. Run bun run secrets:install.")
  process.umask(0o077)
  const preferred = join(homedir(), "storage", "tmp")
  const temp = await mkdtemp(join(process.env.TMPDIR || (existsSync(preferred) ? preferred : tmpdir()), "secret-scan-"))
  await chmod(temp, 0o700)
  try {
    await Bun.write(join(temp, "ignore"), "")
    await Bun.write(join(temp, "audit.toml"), "[extend]\nuseDefault = true\n")
    const config =
      mode === "audit" || !existsSync(".gitleaks.toml")
        ? join(temp, "audit.toml")
        : join(process.cwd(), ".gitleaks.toml")
    const ignore =
      mode !== "audit" && existsSync(".gitleaksignore") ? join(process.cwd(), ".gitleaksignore") : join(temp, "ignore")
    const findings = await scan(
      binary,
      mode === "staged"
        ? ["git", "--staged"]
        : ["git", `--log-opts=--full-history --diff-merges=first-parent ${revisions.join(" ")}`],
      temp,
      "history",
      config,
      ignore,
    )
    const archives = new Map<string, Archive>()
    const raw = (
      mode === "staged"
        ? git("diff", "--staged", "--raw", "--no-abbrev", "--no-renames", "-z", "--", ...archivePaths)
        : git(
            "log",
            "--full-history",
            "--format=",
            "--raw",
            "--no-abbrev",
            "--no-renames",
            "--diff-merges=first-parent",
            "-z",
            ...revisions,
            "--",
            ...archivePaths,
          )
    ).split("\0")
    for (let i = 0; i < raw.length - 1; i += 2) {
      const oid = raw[i].trim().split(" ")[3]
      if (/^0+$/.test(oid)) continue
      if (!/^[a-f0-9]{40,64}$/.test(oid))
        throw new ScanFailure("Secret scan incomplete: invalid Git archive inventory.")
      archives.set(oid, { oid, file: raw[i + 1] })
    }
    const skipped: { file: string; reason: string }[] = []
    const current =
      mode === "audit"
        ? git("ls-files", "-z", "--cached", "--others", "--exclude-standard").split("\0").filter(Boolean)
        : []
    if (current.length) {
      const directory = join(temp, "current")
      await mkdir(directory)
      for (const file of new Set(current)) {
        const stat = await lstat(file).catch(() => undefined)
        if (!stat?.isFile()) {
          skipped.push({ file, reason: stat?.isSymbolicLink() ? "symlink" : "missing or non-file" })
          continue
        }
        if (archivePattern.test(file)) {
          const blob = new Uint8Array(await Bun.file(file).arrayBuffer())
          const oid = gitInput(blob, "hash-object", "--stdin").trim()
          archives.set(oid, { oid, file, current: true, blob })
          continue
        }
        await mkdir(dirname(join(directory, file)), { recursive: true })
        await Bun.write(join(directory, file), Bun.file(file))
      }
      await indexSnapshot(directory)
      findings.push(...(await scan(binary, ["git", "--staged", directory], temp, "current", config, ignore)))
    }
    if (archives.size) {
      const directory = join(temp, "archives")
      await mkdir(directory)
      for (const archive of archives.values()) {
        const blob = archive.blob || gitBlob(archive.oid)
        await unpack(blob, archive.file, join(directory, archive.oid))
      }
      await indexSnapshot(directory)
      for (const finding of await scan(binary, ["git", "--staged", directory], temp, "archives", config, ignore)) {
        const oid = finding.File.split("/")[0]
        const archive = oid ? archives.get(oid) : undefined
        if (!archive) throw new ScanFailure("Secret scan incomplete: archive report cannot be mapped.")
        findings.push({
          ...finding,
          File: finding.File.slice(oid.length + 1),
          Commit: archive.current || mode === "staged" ? undefined : archiveOrigin(archive, revisions),
        })
      }
    }
    findings.forEach((finding) =>
      console.log(
        JSON.stringify({
          file: finding.File,
          line: finding.StartLine,
          rule: finding.RuleID,
          commit: finding.Commit || undefined,
        }),
      ),
    )
    console.log(
      JSON.stringify({
        status: findings.length ? "findings" : "clean",
        commits: commits.length,
        archives: archives.size,
        current_files: current.length,
        skipped,
        references,
        elapsed_ms: Math.round(performance.now() - started),
      }),
    )
    return findings.length ? 2 : 0
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
}

function archiveOrigin(archive: Archive, revisions: string[]) {
  const origin = git(
    "log",
    "--full-history",
    "--diff-merges=first-parent",
    "--reverse",
    "--format=%H",
    `--find-object=${archive.oid}`,
    ...revisions,
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .find((revision) => {
      const result = Bun.spawnSync(["git", "rev-parse", "--verify", "--end-of-options", `${revision}:${archive.file}`])
      return result.exitCode === 0 && result.stdout.toString().trim() === archive.oid
    })
  if (!origin) throw new ScanFailure("Secret scan incomplete: archive source commit cannot be resolved.")
  return origin
}

async function unpack(blob: Uint8Array, file: string, directory: string, depth = 1) {
  if (depth > 2) throw new ScanFailure(`Secret scan incomplete: archive depth exceeds 2 ${JSON.stringify(file)}`)
  try {
    const members = new Set<string>()
    const put = async (name: string, data: Uint8Array) => {
      const raw = name.replace(/\\/g, "/")
      const path = posix.normalize(raw)
      const key = process.platform === "linux" ? path : path.toLowerCase()
      if (
        /^(\/|[a-z]:)/i.test(raw) ||
        raw.split("/").some((part) => part === ".." || part.toLowerCase() === ".git") ||
        path === "." ||
        path.includes("\0") ||
        members.has(key)
      )
        throw new ScanFailure(`Secret scan incomplete: unsafe or duplicate archive path ${JSON.stringify(file)}`)
      members.add(key)
      const logical = `${file}!${path}`
      if (archivePattern.test(path)) return unpack(data, logical, directory, depth + 1)
      await mkdir(dirname(join(directory, logical)), { recursive: true })
      await Bun.write(join(directory, logical), data)
    }
    if (/\.(lgp|zip)$/i.test(file)) {
      const { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } = await import("@zip.js/zip.js")
      const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(blob)), { useWebWorkers: false })
      try {
        for (const entry of await reader.getEntries()) {
          if (entry.encrypted)
            throw new ScanFailure(`Secret scan incomplete: encrypted archive ${JSON.stringify(file)}`)
          if (!entry.directory)
            await put(entry.filename, await entry.getData!(new Uint8ArrayWriter(), { checkSignature: true }))
        }
      } finally {
        await reader.close()
      }
      return
    }
    if (/\.(tar\.gz|tgz|tar)$/i.test(file)) {
      const data = /\.tar$/i.test(file) ? new Uint8Array(blob) : Bun.gunzipSync(new Uint8Array(blob))
      // Bun.Archive.files() drops duplicate entries before they can be checked.
      const { Parser } = await import("tar")
      const entries = await new Promise<{ name: string; data: Uint8Array }[]>((resolve, reject) => {
        const entries: { name: string; data: Uint8Array }[] = []
        const parser = new Parser({
          strict: true,
          onReadEntry(entry) {
            const chunks: Buffer[] = []
            entry.on("data", (chunk: Buffer) => chunks.push(chunk))
            entry.on("error", reject)
            entry.on("end", () => {
              if (entry.type === "Directory") return
              if (entry.type === "SymbolicLink" || entry.type === "Link") {
                // Scan the stored target name; never follow links from an archive.
                entries.push({ name: entry.path + ".link-target", data: Buffer.from(entry.linkpath || "") })
                return
              }
              if (!["File", "OldFile", "ContiguousFile"].includes(entry.type)) {
                reject(new ScanFailure(`Secret scan incomplete: unsupported TAR entry ${JSON.stringify(file)}`))
                return
              }
              entries.push({ name: entry.path, data: Buffer.concat(chunks) })
            })
          },
        })
        parser.on("error", reject)
        parser.on("ignoredEntry", () =>
          reject(new ScanFailure(`Secret scan incomplete: ignored TAR entry ${JSON.stringify(file)}`)),
        )
        parser.on("end", () => resolve(entries))
        parser.end(Buffer.from(data))
      })
      for (const entry of entries) await put(entry.name, entry.data)
      return
    }
    if (/\.gz$/i.test(file)) {
      await put(file.split("!").at(-1)!.replace(/\.gz$/i, ""), Bun.gunzipSync(new Uint8Array(blob)))
      return
    }
    throw new ScanFailure(`Secret scan incomplete: unsupported archive format ${JSON.stringify(file)}`)
  } catch (error) {
    if (error instanceof ScanFailure) throw error
    throw new ScanFailure(`Secret scan incomplete: invalid or encrypted archive ${JSON.stringify(file)}`)
  }
}

async function indexSnapshot(directory: string) {
  git("-C", directory, "init", "-q")
  // Disable repository-supplied filters and diff drivers in this private snapshot.
  await Bun.write(join(directory, ".git", "info", "attributes"), "* -filter -text diff\n")
  git("-C", directory, "-c", "core.autocrlf=false", "add", "--all", "--force")
}

function commit(ref: string) {
  if (!ref) throw new ScanFailure("Secret scan incomplete: base and head are required.")
  return git("rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`).trim()
}

function pushRevisions(input: string, remote: string) {
  return input
    .trim()
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      const update = line.trim().split(/\s+/)
      if (update.length !== 4 || !/^[a-f0-9]{40,64}$/.test(update[1]) || !/^[a-f0-9]{40,64}$/.test(update[3]))
        throw new ScanFailure("Secret scan incomplete: invalid pre-push input.")
      if (/^0+$/.test(update[1])) return []
      const head = commit(update[1])
      if (!/^0+$/.test(update[3])) return [`${commit(update[3])}..${head}`]
      if (!remote || !/^[\w.-]+$/.test(remote))
        throw new ScanFailure("Secret scan incomplete: use a named Git remote for a new branch, then git fetch.")
      const known = git("for-each-ref", "--format=%(objectname)", `refs/remotes/${remote}/`)
        .trim()
        .split("\n")
        .filter(Boolean)
      if (!known.length) throw new ScanFailure("Secret scan incomplete: no remote baseline. Run git fetch and retry.")
      return [head, ...known.map((oid) => `^${commit(oid)}`)]
    })
}

async function scan(binary: string, args: string[], temp: string, name: string, config: string, ignore: string) {
  const report = join(temp, `${name}.json`)
  const result = Bun.spawnSync(
    [
      binary,
      ...args,
      "--redact=100",
      "--no-banner",
      "--no-color",
      "--log-level=warn",
      "--exit-code=2",
      `--max-archive-depth=${args[0] === "git" ? 0 : 2}`,
      "--max-decode-depth=2",
      "--ignore-gitleaks-allow",
      `--config=${config}`,
      `--gitleaks-ignore-path=${ignore}`,
      "--report-format=json",
      `--report-path=${report}`,
    ],
    { env: { ...process.env, TMPDIR: temp, TMP: temp, TEMP: temp }, stdout: "ignore", stderr: "pipe" },
  )
  const diagnostic = result.stderr
    .toString()
    .split("\n")
    .filter((line) => line.trim() && !/\bWRN leaks found: \d+\s*$/.test(line))
  if (![0, 2].includes(result.exitCode) || diagnostic.length) {
    const privateLog = join(dirname(temp), `${basename(temp)}-${name}-diagnostics.txt`)
    await Bun.write(privateLog, result.stderr)
    throw new ScanFailure(`Secret scan incomplete at ${name}. Private diagnostics: ${privateLog}`)
  }
  if (!(await Bun.file(report).exists())) throw new ScanFailure("Secret scan incomplete: scanner report missing.")
  const findings: Finding[] = await Bun.file(report).json()
  return findings
}

function git(...args: string[]) {
  return gitInput(undefined, ...args)
}

function gitInput(input: Uint8Array | undefined, ...args: string[]) {
  const result = Bun.spawnSync(["git", ...args], { stdin: input ? Buffer.from(input) : "ignore" })
  if (result.exitCode) throw new ScanFailure("Secret scan incomplete: Git data unavailable. Run git fetch and retry.")
  return result.stdout.toString()
}

function gitBlob(oid: string) {
  const result = Bun.spawnSync(["git", "cat-file", "blob", oid])
  if (result.exitCode) throw new ScanFailure("Secret scan incomplete: archive blob unavailable.")
  return result.stdout
}

if (import.meta.main) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      console.error(error instanceof ScanFailure ? error.message : "Secret scan failed; raw diagnostics withheld.")
      process.exitCode = 1
    })
}
