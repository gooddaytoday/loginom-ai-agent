import { $ } from "bun"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { lstat, mkdir, readdir, rename, rm } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"
import { createGunzip } from "node:zlib"
import release from "../../product/loginom-release.json"

// Generates licenses/bun from the exact upstream pins of one Bun release and verifies it offline:
//   bun script/bun-notices.ts generate <version> <cache> <new-output>   (pinned Bun of that version, Linux)
//   bun script/bun-notices.ts verify [<bundle>] [<companion-input>]
// Downloaded sources are parsed as data and never executed. The cache keeps every download, so a rerun
// without network reproduces the bundle; its top level is the input directory of build-bun-source-companion.ts.

const NOTICE = /^(licen[cs]e|copying|copyright|notice|authors|patents)([._-].*)?$/i
const ATTRIBUTES = "* -text -eol -filter -ident -working-tree-encoding -export-subst -export-ignore"
const SORTED = "Sorted USTAR paths; uid/gid/mtime=0, mode=0644, gzip mtime=0. File bytes and internal symlink target unchanged."
const SORTED_FILES = "Sorted USTAR regular files, uid/gid/mtime=0, mode=0644, gzip mtime=0; contents unchanged"
const REGISTRY = "registry+https://github.com/rust-lang/crates.io-index"
// Notices outside the archive root that the first, manually curated bundle selected.
const EXTRA_NOTICES: Record<string, string[]> = {
  webkit: ["Source/JavaScriptCore/COPYING.LIB", "Source/WebCore/LICENSE-LGPL-2"],
  picohttpparser: ["picohttpparser.c"],
}
const NODE_COMPAT = ["src/js/node/assert.ts", "src/js/node/events.ts", "src/js/node/url.ts"]
// process.versions keys that report a recipe pin, by component.
const RUNTIME_PINS: Record<string, string> = {
  ares: "cares",
  boringssl: "boringssl",
  libarchive: "libarchive",
  libdeflate: "libdeflate",
  lolhtml: "lolhtml",
  lshpack: "lshpack",
  mimalloc: "mimalloc",
  picohttpparser: "picohttpparser",
  tinycc: "tinycc",
  webkit: "webkit",
  zlib: "zlib",
  zstd: "zstd",
}

type Entry = { path: string; type: "file" | "symlink"; data: Uint8Array; target?: string }
type Runtime = { version: string; revision: string; versions: Record<string, string | undefined> }
type Notice = { path: string; url?: string; archivePath?: string; sha256: string; file: string }
type Component = { repo?: string; commit?: string; version?: string; files: Notice[] }
type Archive = { component: string; file: string; bytes: number; sha256: string; entries?: number }
type Crate = { name: string; version: string; file: string; url: string; sha256: string; bytes: number; entries: number }
type Pins = { commit: string; components: Record<string, { commit?: string }>; node: string; icu: string; sqlite: string }

const runtime: Runtime = { version: Bun.version, revision: Bun.revision, versions: process.versions }

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2)
  if (command === "generate" && args.length === 3) await generate(args[0]!, args[1]!, args[2]!)
  else if (command === "verify" && args.length <= 2)
    console.log(JSON.stringify(await verifyBundle(args[0] ?? resolve(import.meta.dir, "../licenses/bun"), args[1])))
  else throw Error("Usage: bun-notices.ts generate <version> <cache> <new-output> | verify [<bundle>] [<companion-input>]")
}

/** The bundle describes the running Bun only; build-cli.ts applies the same rule to the CLI. */
export function requireRuntime(version: string, commit: string, current: Omit<Runtime, "versions"> = runtime) {
  if (current.version !== version || current.revision !== commit) throw Error("LOGINOM_BUN_NOTICE_REVISION_MISMATCH")
}

/** Names of process.versions keys that disagree with the recipe pins. */
export function pinMismatches(versions: Runtime["versions"], pins: Pins) {
  const expected: Record<string, string | undefined> = {
    uwebsockets: pins.commit,
    usockets: pins.commit,
    node: pins.node,
    icu: pins.icu,
    sqlite: pins.sqlite,
    ...Object.fromEntries(Object.entries(RUNTIME_PINS).map(([key, name]) => [key, pins.components[name]?.commit])),
  }
  return Object.entries(expected)
    .filter(([key, value]) => !value || versions[key] !== value)
    .map(([key]) => key)
}

async function generate(version: string, cache: string, output: string) {
  if (!isAbsolute(cache) || !isAbsolute(output)) throw Error("Provide absolute cache and new output directories")
  await absent(output)
  await mkdir(join(cache, "http"), { recursive: true })
  const commit = await tagCommit(cache, "oven-sh/bun", `bun-v${version}`)
  requireRuntime(version, commit)
  // Runtime evidence is recorded as Linux; the source steps also use system git and xz.
  if (process.platform !== "linux") throw Error("LOGINOM_BUN_NOTICE_GENERATOR_PLATFORM")
  const http = (url: string) => cached(cache, url)
  const bunArchive = await archiveInto(cache, `bun-${commit}-source.tar.gz`, codeload("oven-sh/bun", commit))
  const tree = (await readArchive(bunArchive.path, `bun-${commit}/`)).entries
  const text = (path: string) => new TextDecoder().decode(required(tree, path).data)
  const license = required(tree, "LICENSE.md").data
  if (!equal(await Bun.file(await http(raw("oven-sh/bun", commit, "LICENSE.md"))).bytes(), license))
    throw Error("LOGINOM_BUN_LICENSE_SOURCE_MISMATCH")
  const recipes = parseRecipes(tree, commit)
  const sqlite = /#define SQLITE_VERSION\s+"([\d.]+)"/.exec(text("src/jsc/bindings/sqlite/sqlite3_local.h"))?.[1]
  const sourceID = /#define SQLITE_SOURCE_ID\s+"([^"]+)"/.exec(text("src/jsc/bindings/sqlite/sqlite3_local.h"))?.[1]
  if (!sqlite || !sourceID) throw Error("LOGINOM_BUN_RECIPE_UNKNOWN: sqlite")

  const webkit = await webkitSource(cache, recipes.webkit, commit)
  const icuPin = JSON.parse(webkit.read("icu/source.json")) as { version: string; sha256: string }
  const icuUrl = `https://github.com/unicode-org/icu/releases/download/release-${icuPin.version}/icu4c-${icuPin.version}-sources.tgz`
  if (!webkit.read("Dockerfile").includes(icuUrl.replaceAll(icuPin.version, "${ICU_VERSION}")))
    throw Error("LOGINOM_BUN_RECIPE_UNKNOWN: icu")
  const pins = { commit, components: { ...recipes.github, webkit: { commit: recipes.webkit } }, node: recipes.node.version, icu: icuPin.version, sqlite }
  const mismatches = pinMismatches(runtime.versions, pins)
  if (mismatches.length) throw Error(`LOGINOM_BUN_PIN_RUNTIME_MISMATCH: ${mismatches.join(", ")}`)
  const database = new Database(":memory:")
  const reported = database.query("select sqlite_version() as version, sqlite_source_id() as sourceID").get() as { version: string; sourceID: string }
  database.close()
  if (reported.version !== sqlite || reported.sourceID !== sourceID) throw Error("LOGINOM_BUN_PIN_RUNTIME_MISMATCH: sqlite")

  const previous = await Bun.file(resolve(import.meta.dir, "../licenses/bun/native/sources.json")).json().catch(() => ({ components: {} }))
  const staging = `${output}.partial-${process.pid}`
  await mkdir(join(staging, "native"), { recursive: true })
  const native = async (data: Uint8Array, extension: string) => {
    const sha256 = hash(data)
    await Bun.write(join(staging, "native", `${sha256}.${extension}`), data)
    return { sha256, file: `${sha256}.${extension}` }
  }
  const notices = async (repo: string | undefined, revision: string, entries: Map<string, Entry>, paths: string[], prefix: string) => {
    const files: Notice[] = []
    for (const path of paths) {
      const data = required(entries, path).data
      // A second upstream source for the archived text; some mirrors do not serve raw files.
      const remote = repo ? await cachedOptional(cache, raw(repo, revision, path)) : undefined
      if (remote && !equal(await Bun.file(remote).bytes(), data)) throw Error(`LOGINOM_BUN_NOTICE_SOURCE_MISMATCH: ${path}`)
      files.push({ path, ...(remote ? { url: raw(repo!, revision, path) } : {}), archivePath: prefix + path, ...(await native(data, "txt")) })
    }
    return files
  }
  const select = (name: string, entries: Map<string, Entry>) => {
    // Archived texts of the previous bundle stay selected; its derived files (tinycc source.tar.gz) are not texts.
    const old = ((previous.components[name]?.files ?? []) as Notice[]).filter((file) => file.url || file.archivePath).map((file) => file.path)
    const paths = [...entries.keys()].filter((path) => !path.includes("/") && NOTICE.test(path) && entries.get(path)!.type === "file")
    const missing = (EXTRA_NOTICES[name] ?? []).filter((path) => !entries.has(path))
    if (missing.length) throw Error(`LOGINOM_BUN_NOTICE_MISSING: ${name}: ${missing.join(", ")}`)
    const selected = [...new Set([...paths, ...(EXTRA_NOTICES[name] ?? []), ...old.filter((path) => entries.get(path)?.type === "file")])].sort()
    if (!selected.length) throw Error(`LOGINOM_BUN_NOTICE_MISSING: ${name}`)
    return { selected, gone: old.filter((path) => !entries.has(path)) }
  }

  const components: Record<string, unknown> = {}
  const archives: Record<string, unknown>[] = []
  const gone: string[] = []
  const submodules: string[] = []
  for (const [name, pin] of Object.entries(recipes.github).sort(([a], [b]) => compare(a, b))) {
    const top = `${pin.repo.split("/")[1]}-${pin.commit}/`
    const archive = await archiveInto(cache, `${name}-${pin.commit}-source.tar.gz`, codeload(pin.repo, pin.commit))
    const entries = (await readArchive(archive.path, top)).entries
    const choice = select(name, entries)
    gone.push(...choice.gone.map((path) => `${name}/${path}`))
    if (entries.has(".gitmodules")) submodules.push(name)
    const files = await notices(pin.repo, pin.commit, entries, choice.selected, top)
    if (name === "tinycc") {
      const inventory = {
        repo: pin.repo,
        commit: pin.commit,
        sourceArchiveUrl: codeload(pin.repo, pin.commit),
        archiveSha256: archive.sha256,
        scope: "Unmodified complete official source archive for TinyCC revision reported by pinned Bun; not a rebuilt libtcc",
        entries: [...entries.values()].map((entry) => fileRecord(entry, top)),
      }
      files.push({ path: "source.tar.gz", ...(await native(await Bun.file(archive.path).bytes(), "tar.gz")) })
      files.push({ path: "source-inventory.json", ...(await native(json(inventory), "json")) })
    }
    components[name] = { repo: pin.repo, commit: pin.commit, buildScript: raw("oven-sh/bun", commit, `scripts/build/deps/${name}.ts`), sourceArchiveUrl: codeload(pin.repo, pin.commit), sourceArchiveSha256: archive.sha256, files }
    archives.push({ component: name, repo: pin.repo, commit: pin.commit, url: codeload(pin.repo, pin.commit), file: archive.file, bytes: archive.bytes, sha256: archive.sha256, entries: entries.size, verifiedNoticeFiles: files.filter((file) => file.url).length })
  }

  const webkitChoice = select("webkit", webkit.notices)
  components.webkit = { repo: "oven-sh/WebKit", commit: recipes.webkit, buildScript: raw("oven-sh/bun", commit, "scripts/build/deps/webkit.ts"), files: await notices("oven-sh/WebKit", recipes.webkit, webkit.notices, webkitChoice.selected, "") }
  archives.push({ component: "webkit", ...webkit.record })

  const bunEntries = (prefix: string) => new Map([...tree].filter(([path]) => path.startsWith(prefix)))
  const jsTree = bunEntries("src/js/")
  const sqliteTree = bunEntries("src/jsc/bindings/sqlite/")
  const nativeTree = new Map([...bunEntries("src/")].filter(([path]) => !jsTree.has(path) && !sqliteTree.has(path)))
  const bunSource = { sourceCommit: commit, sourceArchiveUrl: codeload("oven-sh/bun", commit), sourceArchiveSha256: bunArchive.sha256 }
  const derived = async (entries: Map<string, Entry>, name: string, inventory: (archiveSha256: string) => Record<string, unknown>) => {
    const archive = await native(gzip(ustar([...entries.values()])), "tar.gz")
    return [{ path: name, ...archive }, { path: "inventory.json", ...(await native(json(inventory(archive.sha256)), "json")) }]
  }
  const jsScope = "Every non-directory src/js entry from the exact Bun source archive, including original notices and unmarked files; not a native dependency source closure"
  const nativeScope = "All Bun src entries outside separately supplied src/js and src/jsc/bindings/sqlite; preserves complete in-tree native source/notice material, not external dependency closure"
  const sqliteScope = "Complete Bun SQLite amalgamation and bindings directory, including original notices; version/source ID verified against pinned Bun runtime"
  if ([...sqliteTree.values()].some((entry) => entry.type !== "file")) throw Error("LOGINOM_BUN_SOURCE_LAYOUT: sqlite")
  components["bun-node-compat"] = {
    repo: "oven-sh/bun",
    commit,
    scope: "Three complete embedded JS source files with copyright/MIT notices; other compatibility implementations remain unaudited",
    files: await notices("oven-sh/bun", commit, tree, NODE_COMPAT, `bun-${commit}/`),
  }
  components["bun-js-sources"] = { repo: "oven-sh/bun", commit, scope: jsScope, files: await derived(jsTree, "src-js.tar.gz", (archiveSha256) => ({ ...bunSource, archiveSha256, scope: jsScope, transform: SORTED, entries: [...jsTree.values()].map((entry) => treeRecord(entry)) })) }
  components.sqlite = {
    scope: sqliteScope,
    files: await derived(sqliteTree, "sources.tar.gz", (archiveSha256) => ({ scope: sqliteScope, sourceCommit: commit, sourceUrl: bunSource.sourceArchiveUrl, sourceArchiveSha256: bunArchive.sha256, runtime: reported, archiveSha256, transform: SORTED_FILES, entries: [...sqliteTree.values()].map((entry) => fileRecord(entry, "")) })),
  }

  const node = await nodeHeaders(cache, recipes.node)
  const nodeScope = `Bun Node ${recipes.node.version} compatibility headers after its documented ${recipes.node.excluded.map((path) => path.split("/").at(-1)!.replace(/\.h$/, "")).filter((name, index, all) => all.indexOf(name) === index).join("/")} exclusions, plus exact Node source LICENSE; separate from the Node ${release.nodeVersion} host`
  components["nodejs-headers"] = {
    scope: nodeScope,
    files: await derived(node.entries, "sources.tar.gz", (archiveSha256) => ({ scope: nodeScope, sourceArchives: node.sources, checksumUrl: node.checksumUrl, checksumSha256: node.checksumSha256, buildScript: raw("oven-sh/bun", commit, "scripts/build/deps/nodejs-headers.ts"), reportedNodeVersion: runtime.versions.node, archiveSha256, transform: SORTED_FILES, entries: [...node.entries.values()].map((entry) => fileRecord(entry, "")) })),
  }
  archives.push({ component: "nodejs-headers", file: node.headers.file, bytes: node.headers.bytes, sha256: node.headers.sha256, entries: node.headers.entries, version: recipes.node.version, url: node.sources[0]!.url })
  components["bun-native-sources"] = { repo: "oven-sh/bun", commit, scope: nativeScope, files: await derived(nativeTree, "src-native.tar.gz", (archiveSha256) => ({ ...bunSource, archiveSha256, scope: nativeScope, transform: SORTED, entries: [...nativeTree.values()].map((entry) => treeRecord(entry)) })) }

  const icuTag = await tagCommit(cache, "unicode-org/icu", `release-${icuPin.version}`)
  const icu = await archiveInto(cache, `icu-${icuPin.version}-source.tar.gz`, icuUrl)
  if (icu.sha256 !== icuPin.sha256) throw Error("LOGINOM_BUN_SOURCE_HASH_MISMATCH: icu")
  const icuEntries = (await readArchive(icu.path, "icu/")).entries
  if (!equal(await Bun.file(await http(raw("unicode-org/icu", icuTag, "LICENSE"))).bytes(), required(icuEntries, "LICENSE").data))
    throw Error("LOGINOM_BUN_LICENSE_SOURCE_MISMATCH: icu")
  components.icu = {
    repo: "unicode-org/icu",
    commit: icuTag,
    version: icuPin.version,
    runtimeVersionVerified: runtime.versions.icu,
    scope: `All named license/notice files in official ICU ${icuPin.version} source release; root LICENSE byte-identical to release tag`,
    sourceArchiveUrl: icuUrl,
    sourceArchiveSha256: icu.sha256,
    rootLicenseUrl: raw("unicode-org/icu", icuTag, "LICENSE"),
    buildRecipe: raw("oven-sh/WebKit", recipes.webkit, "Dockerfile"),
    files: await notices(undefined, icuTag, icuEntries, select("icu", icuEntries).selected, "icu/"),
  }
  archives.push({ component: "icu", file: icu.file, bytes: icu.bytes, sha256: icu.sha256, entries: icuEntries.size, version: icuPin.version, url: icuUrl })
  archives.push({ component: "bun", file: bunArchive.file, bytes: bunArchive.bytes, sha256: bunArchive.sha256, entries: tree.size, repo: "oven-sh/bun", commit, url: codeload("oven-sh/bun", commit) })

  const rustSrcUrl = `https://static.rust-lang.org/dist/${recipes.rust.slice("nightly-".length)}/rust-src-nightly.tar.xz`
  const rustSrc = await archiveInto(cache, `rust-src-${recipes.rust}.tar.xz`, rustSrcUrl)
  const published = (await Bun.file(await http(rustSrcUrl + ".sha256")).text()).split(/\s+/)[0]
  if (published !== rustSrc.sha256) throw Error("LOGINOM_BUN_SOURCE_HASH_MISMATCH: rust-src")
  const rustSrcEntries = await readEntries(Bun.spawn(["xz", "-dc", rustSrc.path]).stdout, "rust-src-nightly/", false, (path) => path.endsWith("/library/Cargo.lock"))
  const stdLock = required(rustSrcEntries.entries, "rust-src/lib/rustlib/src/rust/library/Cargo.lock").data
  archives.push({ component: "rust-src", version: recipes.rust, file: rustSrc.file, bytes: rustSrc.bytes, sha256: rustSrc.sha256, entries: rustSrcEntries.count, url: rustSrcUrl, checksumUrl: rustSrcUrl + ".sha256" })
  const crateSets = [
    { name: "rust-std-crates", json: "rust-std-crates.json", file: `rust-std-${recipes.rust}-crates.tar.gz`, lock: stdLock, source: `rust-src ${recipes.rust} library/Cargo.lock`, record: { version: recipes.rust } },
    { name: "bun-crates", json: "bun-crates.json", file: `bun-${commit}-crates.tar.gz`, lock: required(tree, "Cargo.lock").data, source: `Bun Cargo.lock at ${commit}`, record: { commit } },
  ]
  for (const set of crateSets) {
    const crates = await lockedCrates(cache, set.lock)
    const inventory = json({ source: set.source, crates: crates.map((crate) => crate.record) })
    await Bun.write(join(staging, set.json), inventory)
    const bundle = gzip(ustar([{ path: "Cargo.lock", type: "file", data: set.lock }, ...crates.map((crate) => ({ path: `crates/${crate.record.file}`, type: "file" as const, data: crate.data })), { path: "inventory.json", type: "file", data: inventory }]))
    await Bun.write(join(cache, set.file), bundle)
    archives.push({ component: set.name, ...set.record, file: set.file, bytes: bundle.length, sha256: hash(bundle), entries: crates.length + 2, scope: `${crates.length} unmodified crate archives checked against ${set.source}, plus original lock and URL/hash inventory` })
  }

  const remaining = ["Verification of actual rebuild/relinking and build prerequisites; this collection does not claim an offline toolchain closure"]
  if (submodules.length) remaining.push(`Git submodules are not included; .gitmodules present in: ${submodules.join(", ")}`)
  await Bun.write(join(staging, "native/sources.json"), json({
    status: "incomplete",
    scope: `Notices from Bun ${version} default dependency source pins across supported platforms; not a binary linkage inventory`,
    remaining: ["External dependency nested notices and WebKit per-file attribution", "Corresponding external source and relinking verification"],
    sourceDependencyCoverage: { sourceCommit: commit, defaultBuildDependencyFiles: recipes.files, missingComponentRecords: recipes.files.filter((name) => !components[name]), scope: "Source-declared default dependency recipes only; not an emitted native linker map" },
    runtimeVersionEvidence: { bunVersion: version, bunRevision: commit, versions: runtime.versions, scope: "Versions reported by the pinned Linux Bun compiler/runtime; not a complete linker map" },
    // Dependency recipes first, by name, then the Bun-derived records.
    components: Object.fromEntries([
      ...Object.entries(components).filter(([name]) => recipes.files.includes(name)).sort(([a], [b]) => compare(a, b)),
      ...Object.entries(components).filter(([name]) => !recipes.files.includes(name)),
    ]),
  }))
  await Bun.write(join(staging, "source-companion.json"), json({
    bunCommit: commit,
    status: "incomplete",
    scope: "Complete upstream archives for direct native dependencies and full Bun build recipes; not an offline rebuild closure or relinking proof",
    remaining,
    archives: archives.sort((a, b) => compare(String(a.component), String(b.component))),
  }))
  await Bun.write(join(staging, "webkit-source.json"), json({ repo: "https://github.com/oven-sh/WebKit", commit: recipes.webkit, tree: webkit.record.tree, bunCommit: commit, ...Object.fromEntries(Object.entries(webkit.record).filter(([key]) => !["repo", "commit", "tree"].includes(key))), scope: "Complete WebKit source tree; not proof of rebuild or relinking" }))
  const sums = (await Bun.file(await http(`https://github.com/oven-sh/bun/releases/download/bun-v${version}/SHASUMS256.txt`)).text()).split("\n")
  const baseline = (name: string) => {
    const sum = sums.find((line) => line.endsWith(`  ${name}`))?.split(" ")[0]
    if (!sum) throw Error(`LOGINOM_BUN_CHECKSUM_MISSING: ${name}`)
    return sum
  }
  const shasums = `https://github.com/oven-sh/bun/releases/download/bun-v${version}/SHASUMS256.txt`
  await Bun.write(join(staging, "LICENSE.md"), license)
  await Bun.write(join(staging, "source.json"), json({
    version,
    linuxX64BaselineSha256: baseline("bun-linux-x64-baseline.zip"),
    linuxX64BaselineSha256Source: shasums,
    windowsX64BaselineSha256: baseline("bun-windows-x64-baseline.zip"),
    windowsX64BaselineSha256Source: shasums,
    commit,
    url: raw("oven-sh/bun", commit, "LICENSE.md"),
    sha256: hash(license),
    status: "incomplete",
    remaining: ["Linked-library and polyfill license texts", "Corresponding source and relinking distribution audit"],
  }))
  await verifyBundle(staging, cache)
  await rename(staging, output)
  console.log(JSON.stringify({ output, commit, archives: archives.length, previousNoticesGoneUpstream: gone, submodules, status: "PASS" }))
}

/** Offline check of a bundle and, when given, of the companion input archives. */
export async function verifyBundle(dir: string, companion?: string, current: Runtime = runtime) {
  const source = await Bun.file(join(dir, "source.json")).json()
  const native = await Bun.file(join(dir, "native/sources.json")).json()
  const webkit = await Bun.file(join(dir, "webkit-source.json")).json()
  const catalog = await Bun.file(join(dir, "source-companion.json")).json()
  requireRuntime(source.version, source.commit, current)
  const components = native.components as Record<string, Component & { files: Notice[] }>
  const archives = catalog.archives as (Archive & { version?: string })[]
  const pinned = {
    commit: source.commit,
    components,
    node: archives.find((archive) => archive.component === "nodejs-headers")?.version ?? "",
    icu: components.icu?.version ?? "",
    sqlite: native.runtimeVersionEvidence.versions.sqlite,
  }
  const mismatches = [...pinMismatches(current.versions, pinned), ...pinMismatches(native.runtimeVersionEvidence.versions, pinned)]
  if (mismatches.length) throw Error(`LOGINOM_BUN_PIN_RUNTIME_MISMATCH: ${[...new Set(mismatches)].join(", ")}`)
  const webkitArchive = archives.find((archive) => archive.component === "webkit")
  if (
    catalog.bunCommit !== source.commit ||
    webkit.bunCommit !== source.commit ||
    webkit.commit !== components.webkit?.commit ||
    native.sourceDependencyCoverage.sourceCommit !== source.commit ||
    native.runtimeVersionEvidence.bunRevision !== source.commit ||
    native.runtimeVersionEvidence.bunVersion !== source.version ||
    !webkitArchive ||
    webkitArchive.sha256 !== webkit.sha256 ||
    webkitArchive.file !== webkit.file ||
    webkitArchive.bytes !== webkit.bytes
  )
    throw Error("LOGINOM_BUN_NOTICE_REVISION_MISMATCH")
  if (native.sourceDependencyCoverage.missingComponentRecords.length) throw Error("LOGINOM_BUN_NOTICE_COVERAGE_INCOMPLETE")
  if (hash(await Bun.file(join(dir, "LICENSE.md")).bytes()) !== source.sha256) throw Error("LOGINOM_BUN_NOTICE_HASH_MISMATCH")

  const referenced = new Set(["sources.json"])
  const contents = new Map<string, Uint8Array>()
  for (const component of Object.values(components)) {
    for (const file of component.files) {
      const data = await Bun.file(join(dir, "native", file.file)).bytes()
      if (hash(data) !== file.sha256 || file.file.split(".")[0] !== file.sha256) throw Error(`LOGINOM_BUN_NATIVE_NOTICE_HASH_MISMATCH: ${file.file}`)
      referenced.add(file.file)
      contents.set(file.file, data)
    }
  }
  const unreferenced = (await readdir(join(dir, "native"))).filter((name) => !referenced.has(name))
  if (unreferenced.length) throw Error(`LOGINOM_BUN_NATIVE_UNREFERENCED: ${unreferenced.join(", ")}`)
  // Each packaged source archive must contain exactly what its inventory lists.
  for (const component of Object.values(components)) {
    const inventory = component.files.find((file) => file.path === "inventory.json" || file.path === "source-inventory.json")
    if (!inventory) continue
    const listed = JSON.parse(new TextDecoder().decode(contents.get(inventory.file))) as { archiveSha256: string; entries: Record<string, unknown>[] }
    const archive = component.files.find((file) => file.sha256 === listed.archiveSha256)
    if (!archive) throw Error(`LOGINOM_BUN_NATIVE_INVENTORY_MISMATCH: ${inventory.file}`)
    const actual = [...(await readArchive(join(dir, "native", archive.file), "")).entries.values()].map((entry) =>
      "type" in (listed.entries[0] ?? {}) ? treeRecord(entry) : fileRecord(entry, ""),
    )
    if (JSON.stringify(actual) !== JSON.stringify(listed.entries)) throw Error(`LOGINOM_BUN_NATIVE_INVENTORY_MISMATCH: ${inventory.file}`)
  }
  const result = { commit: source.commit, notices: referenced.size - 1, archives: 0, crates: 0 }
  if (!companion) return result

  const crateFiles: Record<string, string> = { "rust-std-crates": "rust-std-crates.json", "bun-crates": "bun-crates.json" }
  for (const archive of archives) {
    const path = join(companion, archive.file)
    if ((await lstat(path)).size !== archive.bytes || (await hashFile(path)) !== archive.sha256) throw Error(`LOGINOM_BUN_SOURCE_HASH_MISMATCH: ${archive.file}`)
    result.archives++
    // xz needs a system tool; its size and hash above remain checked.
    if (archive.file.endsWith(".tar.xz")) continue
    const crateJson = crateFiles[archive.component]
    // The Bun archive also carries the Node compatibility texts and the root LICENSE.md.
    const notices = (archive.component === "bun" ? ["bun-node-compat"] : [archive.component]).flatMap((name) => (components[name]?.files ?? []).filter((file) => file.archivePath))
    const wanted = new Set([...notices.map((file) => file.archivePath!), `bun-${source.commit}/LICENSE.md`])
    const read = await readArchive(path, "", false, (path) => !!crateJson || wanted.has(path))
    if (read.count !== archive.entries) throw Error(`LOGINOM_BUN_SOURCE_ENTRIES_MISMATCH: ${archive.file}`)
    const entries = read.entries
    for (const file of notices)
      if (!equal(required(entries, file.archivePath!).data, contents.get(file.file)!)) throw Error(`LOGINOM_BUN_NOTICE_SOURCE_MISMATCH: ${archive.component}/${file.path}`)
    if (archive.component === "bun" && !equal(required(entries, `bun-${source.commit}/LICENSE.md`).data, await Bun.file(join(dir, "LICENSE.md")).bytes()))
      throw Error("LOGINOM_BUN_NOTICE_SOURCE_MISMATCH: LICENSE.md")
    if (!crateJson) continue
    const inventory = await Bun.file(join(dir, crateJson)).bytes()
    if (!equal(required(entries, "inventory.json").data, inventory)) throw Error(`LOGINOM_BUN_CRATE_INVENTORY_MISMATCH: ${crateJson}`)
    const locked = new Map(parseLock(required(entries, "Cargo.lock").data).map((pkg) => [`${pkg.name}-${pkg.version}.crate`, pkg.checksum]))
    const crates = (JSON.parse(new TextDecoder().decode(inventory)) as { crates: Crate[] }).crates
    for (const crate of crates) {
      const data = required(entries, `crates/${crate.file}`).data
      if (hash(data) !== crate.sha256 || locked.get(crate.file) !== crate.sha256 || data.length !== crate.bytes) throw Error(`LOGINOM_BUN_CRATE_HASH_MISMATCH: ${crate.file}`)
    }
    if (read.count !== crates.length + 2) throw Error(`LOGINOM_BUN_CRATE_INVENTORY_MISMATCH: ${crateJson}`)
    result.crates += crates.length
  }
  return result
}

function parseRecipes(tree: Map<string, Entry>, commit: string) {
  const read = (path: string) => new TextDecoder().decode(required(tree, path).data)
  const files = [...tree.keys()]
    .filter((path) => /^scripts\/build\/deps\/[^/]+\.ts$/.test(path) && !path.endsWith("/index.ts"))
    .map((path) => path.slice("scripts/build/deps/".length, -3))
    .sort(compare)
  const github: Record<string, { repo: string; commit: string }> = {}
  const spec = read("scripts/build/ci-images/spec.ts")
  const node = {
    version: /nodejs:\s*\{\s*version:\s*"(\d+\.\d+\.\d+)"/.exec(spec)?.[1] ?? "",
    sha256: /nodejs:\s*\{[^}]*?headers:\s*"([0-9a-f]{64})"/s.exec(spec)?.[1] ?? "",
    excluded: [] as string[],
  }
  const webkit = /export const WEBKIT_VERSION = "([0-9a-f]{40})"/.exec(read("scripts/build/deps/webkit.ts"))?.[1] ?? ""
  for (const name of files) {
    const text = read(`scripts/build/deps/${name}.ts`)
    const sources = [...text.matchAll(/kind:\s*"github-archive",\s*repo:\s*"([\w.-]+\/[\w.-]+)",\s*commit:\s*([A-Z0-9_]+),/g)]
    const pin = sources.length === 1 ? new RegExp(`const ${sources[0]![2]} = "([0-9a-f]{40})"`).exec(text)?.[1] : undefined
    if (pin) {
      github[name] = { repo: sources[0]![1]!, commit: pin }
      continue
    }
    if (name === "webkit" && webkit && text.includes('kind: "prebuilt"')) continue
    if (name === "sqlite" && /kind:\s*"in-tree",\s*path:\s*"src\/jsc\/bindings\/sqlite"/.test(text)) continue
    if (
      name === "nodejs-headers" &&
      text.includes("export const NODEJS_VERSION = pins.nodejs.version;") &&
      text.includes("url: `https://nodejs.org/dist/v${cfg.nodejsVersion}/node-v${cfg.nodejsVersion}-headers.tar.gz`")
    ) {
      node.excluded = [...(/rmAfterExtract:\s*\[([^\]]*)\]/.exec(text)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((match) => match[1]!)
      continue
    }
    throw Error(`LOGINOM_BUN_RECIPE_UNKNOWN: ${name}`)
  }
  const rust = /channel = "(nightly-\d{4}-\d{2}-\d{2})"/.exec(read("rust-toolchain.toml"))?.[1]
  if (!node.version || !node.sha256 || !node.excluded.length || !rust || !spec.includes(`channel: "${rust}"`))
    throw Error("LOGINOM_BUN_RECIPE_UNKNOWN: toolchain pins")
  return { commit, files, github, webkit, node, rust }
}

async function webkitSource(cache: string, commit: string, bunCommit: string) {
  const repo = join(cache, "webkit.git")
  if (!(await Bun.file(join(repo, "HEAD")).exists())) await $`git init -q --bare ${repo}`
  if ((await $`git -C ${repo} cat-file -e ${commit}^{commit}`.nothrow().quiet()).exitCode !== 0)
    await $`git -C ${repo} fetch -q --depth 1 --no-tags https://github.com/oven-sh/WebKit ${commit}`
  // Highest-precedence attributes: archive the tree exactly, without export-ignore or substitutions.
  await Bun.write(join(repo, "info/attributes"), ATTRIBUTES + "\n")
  const tree = (await $`git -C ${repo} rev-parse ${commit}^{tree}`.text()).trim()
  const file = `webkit-${commit}-source.tar.gz`
  if (!(await Bun.file(join(cache, file)).exists())) {
    await $`git -C ${repo} archive --format=tar.gz -o ${join(cache, file + ".partial")} ${commit}`
    await rename(join(cache, file + ".partial"), join(cache, file))
  }
  const expected = new Map(
    (await $`git -C ${repo} ls-tree -r -z --full-tree ${commit}`.text())
      .split("\0")
      .filter(Boolean)
      .map((line) => {
        const [meta, path] = line.split("\t") as [string, string]
        const [mode, type, object] = meta.split(" ") as [string, string, string]
        if (type !== "blob") throw Error(`LOGINOM_WEBKIT_SOURCE_LAYOUT: ${path}`)
        return [path, { mode, object }]
      }),
  )
  const wanted = new Set(EXTRA_NOTICES.webkit)
  const notices = new Map<string, Entry>()
  let entries = 0
  let symlinks = 0
  for await (const entry of tarEntries(createReadStream(join(cache, file)).pipe(createGunzip()))) {
    if (entry.type === "directory") continue
    if (entry.type !== "file" && entry.type !== "symlink") throw Error(`LOGINOM_WEBKIT_SOURCE_LAYOUT: ${entry.path}`)
    const blob = entry.type === "symlink" ? new TextEncoder().encode(entry.target) : entry.data
    const mode = entry.type === "symlink" ? "120000" : entry.mode & 0o100 ? "100755" : "100644"
    const object = createHash("sha1").update(`blob ${blob.length}\0`).update(blob).digest("hex")
    const match = expected.get(entry.path)
    if (match?.mode !== mode || match.object !== object) throw Error(`LOGINOM_WEBKIT_SOURCE_TREE_MISMATCH: ${entry.path}`)
    expected.delete(entry.path)
    entries++
    if (entry.type === "symlink") symlinks++
    if (wanted.has(entry.path) || (!entry.path.includes("/") && NOTICE.test(entry.path)))
      notices.set(entry.path, { path: entry.path, type: entry.type, data: entry.data, target: entry.target })
  }
  if (expected.size) throw Error(`LOGINOM_WEBKIT_SOURCE_TREE_MISMATCH: ${expected.size} missing`)
  const version = (await $`git --version`.text()).trim().replace(/^git version /, "")
  const read = (path: string) => new TextDecoder().decode(Bun.spawnSync(["git", "-C", repo, "show", `${commit}:${path}`]).stdout)
  const stats = await lstat(join(cache, file))
  return {
    notices,
    read,
    record: {
      repo: "https://github.com/oven-sh/WebKit",
      commit,
      tree,
      file,
      bytes: stats.size,
      sha256: await hashFile(join(cache, file)),
      entries,
      symlinks,
      generation: `git archive --format=tar.gz ${commit} (git ${version}) with info/attributes: ${ATTRIBUTES}`,
      verification: "Every file and link matched the pinned Git tree's blob hash and executable mode",
      bunCommit,
    },
  }
}

async function nodeHeaders(cache: string, pin: { version: string; sha256: string; excluded: string[] }) {
  const base = `https://nodejs.org/dist/v${pin.version}`
  const checksumUrl = `${base}/SHASUMS256.txt`
  const checksums = await cached(cache, checksumUrl)
  const sums = (await Bun.file(checksums).text()).split("\n")
  const published = (name: string) => sums.find((line) => line.endsWith(`  ${name}`))?.split(" ")[0]
  const headers = await archiveInto(cache, `node-v${pin.version}-headers.tar.gz`, `${base}/node-v${pin.version}-headers.tar.gz`)
  if (headers.sha256 !== pin.sha256 || published(headers.file) !== pin.sha256) throw Error("LOGINOM_BUN_SOURCE_HASH_MISMATCH: nodejs-headers")
  const sourceUrl = `${base}/node-v${pin.version}.tar.gz`
  const source = await cached(cache, sourceUrl)
  const sourceSha256 = await hashFile(source)
  if (published(`node-v${pin.version}.tar.gz`) !== sourceSha256) throw Error("LOGINOM_BUN_SOURCE_HASH_MISMATCH: node source")
  const license = required((await readArchive(source, `node-v${pin.version}/`, true, (path) => path === "LICENSE")).entries, "LICENSE")
  const all = (await readArchive(headers.path, `node-v${pin.version}/`)).entries
  if ([...all.values()].some((entry) => entry.type !== "file")) throw Error("LOGINOM_BUN_SOURCE_LAYOUT: nodejs-headers")
  const kept = [...all.values()].filter((entry) => !pin.excluded.some((path) => entry.path === path || entry.path.startsWith(path + "/")))
  return {
    headers: { ...headers, entries: all.size },
    sources: [{ url: `${base}/node-v${pin.version}-headers.tar.gz`, sha256: headers.sha256 }, { url: sourceUrl, sha256: sourceSha256 }],
    checksumUrl,
    checksumSha256: await hashFile(checksums),
    entries: new Map([license, ...kept].sort((a, b) => compare(a.path, b.path)).map((entry) => [entry.path, entry])),
  }
}

async function lockedCrates(cache: string, lock: Uint8Array) {
  await mkdir(join(cache, "crates"), { recursive: true })
  const crates = []
  for (const pkg of parseLock(lock)) {
    if (!pkg.source) continue
    if (pkg.source !== REGISTRY || !/^[0-9a-f]{64}$/.test(pkg.checksum ?? "")) throw Error(`LOGINOM_BUN_CRATE_SOURCE_UNKNOWN: ${pkg.name}`)
    const file = `${pkg.name}-${pkg.version}.crate`
    const url = `https://static.crates.io/crates/${pkg.name}/${file}`
    const path = join(cache, "crates", file)
    if (!(await Bun.file(path).exists())) await Bun.write(path + ".partial", await download(url)).then(() => rename(path + ".partial", path))
    const data = await Bun.file(path).bytes()
    if (hash(data) !== pkg.checksum) throw Error(`LOGINOM_BUN_CRATE_HASH_MISMATCH: ${file}`)
    const entries = await readEntries(new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip")), "", false, () => false)
    crates.push({ data, record: { name: pkg.name, version: pkg.version, file, url, sha256: pkg.checksum!, bytes: data.length, entries: entries.count } })
  }
  return crates.sort((a, b) => compare(a.record.file, b.record.file))
}

function parseLock(lock: Uint8Array) {
  return new TextDecoder()
    .decode(lock)
    .split(/^\[\[package\]\]$/m)
    .slice(1)
    .map((block) => {
      const field = (key: string) => new RegExp(`^${key} = "([^"]+)"$`, "m").exec(block)?.[1]
      return { name: field("name") ?? "", version: field("version") ?? "", source: field("source"), checksum: field("checksum") }
    })
}

async function tagCommit(cache: string, repo: string, tag: string) {
  const ref = await Bun.file(await cached(cache, `https://api.github.com/repos/${repo}/git/ref/tags/${tag}`)).json()
  if (ref.object.type === "commit") return ref.object.sha as string
  const annotated = await Bun.file(await cached(cache, `https://api.github.com/repos/${repo}/git/tags/${ref.object.sha}`)).json()
  if (annotated.object.type !== "commit") throw Error(`LOGINOM_BUN_TAG_UNKNOWN: ${repo} ${tag}`)
  return annotated.object.sha as string
}

async function archiveInto(cache: string, file: string, url: string) {
  const path = join(cache, file)
  if (!(await Bun.file(path).exists())) {
    await Bun.write(path + ".partial", await download(url))
    await rename(path + ".partial", path)
  }
  return { path, file, bytes: (await lstat(path)).size, sha256: await hashFile(path) }
}

async function cached(cache: string, url: string) {
  const path = await cachedOptional(cache, url)
  if (!path) throw Error(`LOGINOM_BUN_DOWNLOAD_FAILED: ${url}`)
  return path
}

// A missing remote file is remembered too, so an offline rerun makes the same choices.
async function cachedOptional(cache: string, url: string) {
  const path = join(cache, "http", hash(new TextEncoder().encode(url)))
  if (await Bun.file(path).exists()) return path
  if (await Bun.file(path + ".missing").exists()) return undefined
  const data = await download(url, true)
  if (!data) {
    await Bun.write(path + ".missing", url + "\n")
    return undefined
  }
  await Bun.write(path + ".partial", data)
  await rename(path + ".partial", path)
  return path
}

async function download(url: string): Promise<Uint8Array>
async function download(url: string, optional: true): Promise<Uint8Array | undefined>
async function download(url: string, optional = false): Promise<Uint8Array | undefined> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url).catch((error: unknown) => error)
    if (response instanceof Response && response.ok) return new Uint8Array(await response.arrayBuffer())
    if (optional && response instanceof Response && response.status === 404) return undefined
    if (attempt >= 4 || (response instanceof Response && response.status < 500 && response.status !== 429))
      throw Error(`LOGINOM_BUN_DOWNLOAD_FAILED: ${url}`, { cause: response instanceof Response ? response.status : response })
    await Bun.sleep(1000 * 2 ** (attempt - 1))
  }
}

/** Non-directory entries of a .tar.gz below `prefix`; every entry must be inside it unless `outside` is allowed. */
async function readArchive(path: string, prefix: string, outside = false, keep: (path: string) => boolean = () => true) {
  return readEntries(createReadStream(path).pipe(createGunzip()), prefix, outside, keep)
}

// Counts every non-directory entry, keeping data only for the paths `keep` accepts.
async function readEntries(chunks: AsyncIterable<Uint8Array>, prefix: string, outside = false, keep: (path: string) => boolean = () => true) {
  const entries = new Map<string, Entry>()
  let count = 0
  for await (const entry of tarEntries(chunks)) {
    if (entry.type === "directory") continue
    if (!entry.path.startsWith(prefix)) {
      if (outside) continue
      throw Error(`LOGINOM_BUN_SOURCE_LAYOUT: ${entry.path}`)
    }
    if (entry.type !== "file" && entry.type !== "symlink") throw Error(`LOGINOM_BUN_SOURCE_LAYOUT: ${entry.path}`)
    count++
    const path = entry.path.slice(prefix.length)
    if (keep(path)) entries.set(path, { path, type: entry.type, data: entry.data, target: entry.target })
  }
  return { entries: new Map([...entries].sort(([a], [b]) => compare(a, b))), count }
}

/** Minimal streaming tar reader: ustar prefix, pax path/linkpath, GNU long names. */
export async function* tarEntries(chunks: AsyncIterable<Uint8Array>) {
  const iterator = chunks[Symbol.asyncIterator]()
  let buffer: Uint8Array = new Uint8Array(0)
  const read = async (size: number) => {
    const parts = [buffer]
    let length = buffer.length
    while (length < size) {
      const next = await iterator.next()
      if (next.done) throw Error("LOGINOM_TAR_TRUNCATED")
      parts.push(next.value)
      length += next.value.length
    }
    const joined = parts.length === 1 ? buffer : Buffer.concat(parts)
    buffer = joined.subarray(size)
    return joined.subarray(0, size)
  }
  const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes.subarray(0, bytes.indexOf(0) === -1 ? bytes.length : bytes.indexOf(0)))
  const octal = (bytes: Uint8Array) => parseInt(text(bytes).trim() || "0", 8)
  let pax: Record<string, string> = {}
  while (true) {
    const header = await read(512)
    if (header.every((byte) => byte === 0)) return
    const size = octal(header.subarray(124, 136))
    const data = (await read(Math.ceil(size / 512) * 512)).subarray(0, size)
    const flag = String.fromCharCode(header[156]!)
    if (flag === "x" || flag === "g") {
      if (flag === "x") pax = { ...pax, ...parsePax(data) }
      continue
    }
    if (flag === "L" || flag === "K") {
      pax = { ...pax, [flag === "L" ? "path" : "linkpath"]: text(data) }
      continue
    }
    const prefix = text(header.subarray(257, 263)) === "ustar" ? text(header.subarray(345, 500)) : ""
    const path = pax.path ?? (prefix ? `${prefix}/` : "") + text(header.subarray(0, 100))
    const target = pax.linkpath ?? text(header.subarray(157, 257))
    pax = {}
    const type = flag === "0" || flag === "\0" || flag === "7" ? "file" : flag === "5" ? "directory" : flag === "2" ? "symlink" : `other:${flag}`
    yield { path: path.replace(/\/$/, ""), type, mode: octal(header.subarray(100, 108)), data: new Uint8Array(data), target: type === "symlink" ? target : undefined }
  }
}

function parsePax(data: Uint8Array) {
  const records: Record<string, string> = {}
  let offset = 0
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset)
    const length = parseInt(new TextDecoder().decode(data.subarray(offset, space)), 10)
    const record = new TextDecoder().decode(data.subarray(space + 1, offset + length - 1))
    const equals = record.indexOf("=")
    records[record.slice(0, equals)] = record.slice(equals + 1)
    offset += length
  }
  return records
}

/** USTAR with the headers of Python's tarfile: sorted, mode 0644, zero ids and times, padded records. */
export function ustar(entries: Entry[]) {
  const encoder = new TextEncoder()
  const blocks = [...entries]
    .sort((a, b) => compare(a.path, b.path))
    .flatMap((entry) => {
      const header = new Uint8Array(512)
      const put = (offset: number, value: string) => header.set(encoder.encode(value), offset)
      const name = encoder.encode(entry.path).length > 100 ? splitName(entry.path) : { prefix: "", name: entry.path }
      const size = entry.type === "file" ? entry.data.length : 0
      put(0, name.name)
      put(100, "0000644\0")
      put(108, "0000000\0")
      put(116, "0000000\0")
      put(124, size.toString(8).padStart(11, "0") + "\0")
      put(136, "00000000000\0")
      put(148, "        ")
      put(156, entry.type === "file" ? "0" : "2")
      put(157, entry.target ?? "")
      // Device numbers stay empty for regular files and links, as in Python 3.12 tarfile.
      put(257, "ustar\0" + "00")
      put(345, name.prefix)
      put(148, header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0") + "\0")
      const data = entry.type === "file" ? entry.data : new Uint8Array(0)
      return [header, data, new Uint8Array((512 - (data.length % 512)) % 512)]
    })
  const length = blocks.reduce((sum, block) => sum + block.length, 0) + 1024
  const archive = new Uint8Array(Math.ceil(length / 10240) * 10240)
  blocks.reduce((offset, block) => {
    archive.set(block, offset)
    return offset + block.length
  }, 0)
  return archive
}

function splitName(path: string) {
  const parts = path.split("/")
  const index = parts.findIndex((_, i) => i > 0 && parts.slice(0, i).join("/").length <= 155 && parts.slice(i).join("/").length <= 100)
  if (index === -1 || path.length !== new TextEncoder().encode(path).length) throw Error(`LOGINOM_TAR_NAME_TOO_LONG: ${path}`)
  return { prefix: parts.slice(0, index).join("/"), name: parts.slice(index).join("/") }
}

/** gzip with a fixed header (no name, mtime 0, maximum compression, unknown OS), so bytes do not depend on the host. */
export function gzip(data: Uint8Array<ArrayBuffer>) {
  const body = Bun.deflateSync(data, { level: 9 })
  const trailer = new DataView(new ArrayBuffer(8))
  trailer.setUint32(0, Bun.hash.crc32(data), true)
  trailer.setUint32(4, data.length % 2 ** 32, true)
  return Buffer.concat([Uint8Array.of(0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 2, 0xff), body, new Uint8Array(trailer.buffer)])
}

function treeRecord(entry: Entry) {
  if (entry.type === "symlink") return { path: entry.path, type: "symlink", target: entry.target, sha256: hash(new TextEncoder().encode(entry.target)) }
  return { path: entry.path, type: "file", bytes: entry.data.length, sha256: hash(entry.data) }
}

function fileRecord(entry: Entry, prefix: string) {
  if (entry.type !== "file") throw Error(`LOGINOM_BUN_SOURCE_LAYOUT: ${entry.path}`)
  return { path: prefix + entry.path, bytes: entry.data.length, sha256: hash(entry.data) }
}

function required(entries: Map<string, Entry>, path: string) {
  const entry = entries.get(path)
  if (!entry) throw Error(`LOGINOM_BUN_SOURCE_MISSING: ${path}`)
  return entry
}

async function absent(path: string) {
  const exists = await lstat(path).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error
      return false
    },
  )
  if (exists) throw Error("Output directory already exists")
}

async function hashFile(path: string) {
  const digest = createHash("sha256")
  for await (const chunk of createReadStream(path)) digest.update(chunk)
  return digest.digest("hex")
}

function hash(data: Uint8Array) {
  return createHash("sha256").update(data).digest("hex")
}

function equal(a: Uint8Array, b: Uint8Array) {
  return Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(b)
}

function json(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value, null, 2) + "\n")
}

function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

function codeload(repo: string, commit: string) {
  return `https://codeload.github.com/${repo}/tar.gz/${commit}`
}

function raw(repo: string, commit: string, path: string) {
  return `https://raw.githubusercontent.com/${repo}/${commit}/${path}`
}
