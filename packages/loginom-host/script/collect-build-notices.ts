import { createHash } from "node:crypto"
import { mkdir, readFile, readdir, realpath } from "node:fs/promises"
import { isAbsolute, join, relative, resolve, sep } from "node:path"
import upstreamSources from "../licenses/upstream/sources.json"

// This inventory covers npm inputs emitted by Bun, not Bun's embedded native libraries.
export async function collectBuildNotices(
  output: string,
  builds: Array<{ root: string; metafile: Bun.BuildMetafile }>,
) {
  const roots = new Set<string>()
  for (const build of builds) {
    for (const item of Object.values(build.metafile.outputs)) {
      for (const [input, contribution] of Object.entries(item.inputs)) {
        if (contribution.bytesInOutput <= 0) continue
        const parts = resolve(build.root, input).split(sep)
        const index = parts.lastIndexOf("node_modules")
        if (index === -1) continue
        const length = parts[index + 1]?.startsWith("@") ? 3 : 2
        roots.add(await realpath(parts.slice(0, index + length).join(sep)))
      }
    }
  }
  await mkdir(output, { recursive: true })
  const packages = []
  for (const [index, root] of [...roots].sort().entries()) {
    const pkg = await Bun.file(join(root, "package.json")).json()
    if (typeof pkg.name !== "string" || typeof pkg.version !== "string") throw Error("LOGINOM_NOTICE_PACKAGE_INVALID")
    const directory = String(index + 1).padStart(4, "0")
    const files = []
    const documentation = []
    for (const entry of await noticePaths(root)) {
      const source = await realpath(join(root, entry.path))
      const inside = relative(root, source)
      if (inside === ".." || inside.startsWith(".." + sep) || isAbsolute(inside))
        throw Error("LOGINOM_NOTICE_SOURCE_ESCAPE")
      const contents = await readFile(source)
      const path = `${directory}/${entry.path}`
      await Bun.write(join(output, path), contents)
      // README can contain attribution, but its presence alone does not supply a license text.
      const record = {
        path,
        scope: entry.path.includes("/") ? "nested" : "package",
        sha256: createHash("sha256").update(contents).digest("hex"),
      }
      if (entry.readme) {
        documentation.push(record)
        continue
      }
      files.push(record)
    }
    const upstream = Object.entries(upstreamSources).find(([name]) => name === `${pkg.name}@${pkg.version}`)?.[1]
    if (!files.some((file) => file.scope === "package") && upstream) {
      const contents = await readFile(join(import.meta.dir, "../licenses/upstream", upstream.file))
      const normalized = Buffer.from(contents.toString("utf8").replaceAll("\r\n", "\n"))
      const canonical =
        createHash("sha256").update(contents).digest("hex") === upstream.sha256 ? contents : normalized
      if (createHash("sha256").update(canonical).digest("hex") !== upstream.sha256)
        throw Error("LOGINOM_UPSTREAM_NOTICE_HASH_MISMATCH")
      const path = `${directory}/UPSTREAM-LICENSE.txt`
      await Bun.write(join(output, path), canonical)
      files.push({ path, scope: "package", sha256: upstream.sha256 })
    }
    packages.push({
      name: pkg.name,
      version: pkg.version,
      license: pkg.license ?? null,
      files,
      documentation,
      upstream: upstream ?? null,
    })
  }
  const inventory = {
    status: "incomplete",
    scope: "Package and nested npm notices and pinned upstream supplements for positive Bun output contributions",
    exclusions: ["Directory symlinks are not traversed", "Bun and embedded native dependencies", "Non-npm resources"],
    packages,
    missing: packages
      .filter((pkg) => !pkg.files.some((file) => file.scope === "package"))
      .map((pkg) => `${pkg.name}@${pkg.version}`),
  }
  await Bun.write(join(output, "inventory.json"), JSON.stringify(inventory, null, 2) + "\n")
  return inventory
}

// Keep vendored attribution under its original package-relative path. A vendor
// LICENSE never substitutes for the containing package's own license. Nested
// node_modules are separate packages selected independently by the build graph.
async function noticePaths(root: string, folder = ""): Promise<{ path: string; readme: boolean }[]> {
  const result: { path: string; readme: boolean }[] = []
  for (const entry of (await readdir(join(root, folder), { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".git")
        result.push(...(await noticePaths(root, folder ? `${folder}/${entry.name}` : entry.name)))
      continue
    }
    const readme = !folder && /^readme(?:\.|$)/i.test(entry.name)
    if (
      !readme &&
      (!/^(license|licence|notice|copying|copyright)/i.test(entry.name) ||
        /\.(?:[cm]?[jt]sx?|json|map)$/i.test(entry.name))
    )
      continue
    if (!entry.isFile() && !entry.isSymbolicLink()) continue
    result.push({ path: folder ? `${folder}/${entry.name}` : entry.name, readme: !!readme })
  }
  return result
}
