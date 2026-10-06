import { afterAll, beforeAll, expect, test } from "bun:test"
import { Uint8ArrayReader, TextWriter, ZipReader } from "@zip.js/zip.js"
import { createHash } from "node:crypto"
import { cp, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { inflateSync } from "node:zlib"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import { join } from "node:path"
import { extractPackage } from "../src/package-docs/extract"
import { renderSkeleton } from "../src/package-docs/skeleton"
import { renderReport } from "../src/package-docs/emit"
import { pdfText } from "./package-docs-pdf"

const fixtures = join(import.meta.dir, "fixtures/package-docs")
const fonts = new URL("../../product/skills/package-docs/assets/fonts/", import.meta.url)
const bundle = await mkdtemp(join(tmpdir(), "loginom-docs-node-"))
const output = join(bundle, "scripts")

beforeAll(async () => {
  const builder = Bun.spawn([process.execPath, join(import.meta.dir, "../script/build-package-docs.ts"), output],
    { cwd: import.meta.dir, stdout: "pipe", stderr: "pipe" })
  const stdout = new Response(builder.stdout).text(), stderr = new Response(builder.stderr).text()
  expect(await builder.exited).toBe(0)
  expect(await stderr).toBe("")
  expect(JSON.parse(await stdout).script).toBe(join(output, "package-docs.mjs"))
  await cp(fonts, join(bundle, "assets/fonts"), { recursive: true })
})
afterAll(() => rm(bundle, { recursive: true, force: true }))

test("Markdown writer preserves the baseline report and terminates it with a newline", async () => {
  const markdown = await readFile(join(fixtures, "demo.report.md"), "utf8")
  expect(new TextDecoder().decode(await renderReport(markdown.trimEnd(), "md"))).toBe(markdown)
})

test("the product builder emits a standalone Node script and its actual license dependency graph", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
  const directory = await mkdtemp(join(tmpdir(), "loginom-docs-builder-"))
  try {
    const builder = Bun.spawn([process.execPath, join(import.meta.dir, "../script/build-package-docs.ts"), join(directory, "scripts")],
      { cwd: import.meta.dir, stdout: "pipe", stderr: "pipe" })
    const stdout = new Response(builder.stdout).text(), stderr = new Response(builder.stderr).text()
    expect(await builder.exited).toBe(0)
    expect(await stderr).toBe("")
    const build = JSON.parse(await stdout)
    expect(build.script).toBe(join(directory, "scripts/package-docs.mjs"))
    expect(Object.keys(build.metafile.inputs).some((name) => name.includes("@zip.js"))).toBe(true)
    expect(Object.keys(build.metafile.inputs).some((name) => name.includes("@xmldom"))).toBe(true)
    const child = Bun.spawn([node, build.script, "extract", "--lgp", join(fixtures, "demo.lgp"), "--directory", directory],
      { cwd: directory, env: { LANG: "C.UTF-8" }, stdout: "pipe", stderr: "pipe" })
    const result = new Response(child.stdout).text()
    expect(await child.exited).toBe(0)
    expect(await Bun.file(JSON.parse(await result).structure).json()).toEqual(await Bun.file(join(fixtures, "structure.json")).json())
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 20_000)

test("Node CLI extracts an unchanged package into a session-owned work directory", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
  const directory = await mkdtemp(join(tmpdir(), "loginom-docs-session-"))
  try {
    const lgp = join(fixtures, "demo.lgp")
    const before = createHash("sha256").update(await readFile(lgp)).digest("hex")
    const child = Bun.spawn([node, join(output, "package-docs.mjs"), "extract", "--lgp", lgp, "--directory", directory],
      { cwd: directory, env: { LANG: "C.UTF-8" }, stdout: "pipe", stderr: "pipe" })
    const stdout = new Response(child.stdout).text(), stderr = new Response(child.stderr).text()
    expect(await child.exited).toBe(0)
    expect(await stderr).toBe("")
    const result = JSON.parse(await stdout)
    expect(result.structure).toBe(join(directory, ".work/package-docs", "demo-" + createHash("sha256").update(lgp).digest("hex").slice(0, 8), "structure.json"))
    expect(await Bun.file(result.structure).json()).toEqual(await Bun.file(join(fixtures, "structure.json")).json())
    expect(createHash("sha256").update(await readFile(lgp)).digest("hex")).toBe(before)
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 20_000)

test("Node CLI creates a Markdown skeleton in the same session work directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-docs-skeleton-session-"))
  try {
    const result = await docsCommand(["skeleton", "--lgp", join(fixtures, "demo.lgp"), "--directory", directory], directory)
    expect(result.code).toBe(0)
    expect(result.stderr).toBe("")
    const paths = JSON.parse(result.stdout)
    expect(paths.report).toBe(join(directory, ".work/package-docs", "demo-" + createHash("sha256").update(join(fixtures, "demo.lgp")).digest("hex").slice(0, 8), "report.md"))
    const normalize = (text: string) => text.replace(/\(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\)/, "(timestamp)")
    expect(normalize(await readFile(paths.report, "utf8"))).toBe(normalize(await readFile(join(fixtures, "skeleton.md"), "utf8")))
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 20_000)

async function docsCommand(args: string[], directory: string) {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
  const child = Bun.spawn([node, join(output, "package-docs.mjs"), ...args],
    { cwd: directory, env: { LANG: "C.UTF-8" }, stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  return { code, stdout, stderr }
}

test("repeating skeleton preserves the user's filled draft", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-docs-repeat-skeleton-"))
  try {
    const args = ["skeleton", "--lgp", join(fixtures, "demo.lgp"), "--directory", directory]
    const first = await docsCommand(args, directory)
    expect(first.code).toBe(0)
    const path = JSON.parse(first.stdout).report
    await writeFile(path, "# Заполненный пользователем черновик\n")
    const repeated = await docsCommand(args, directory)
    expect(repeated.code).toBe(0)
    expect(await readFile(path, "utf8")).toBe("# Заполненный пользователем черновик\n")
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 20_000)

test("Node CLI emits default PDF into the session directory from its filled draft", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-docs-emit-session-"))
  try {
    const options = ["--lgp", join(fixtures, "demo.lgp"), "--directory", directory]
    const skeleton = await docsCommand(["skeleton", ...options], directory)
    expect(skeleton.code).toBe(0)
    const report = JSON.parse(skeleton.stdout).report
    await writeFile(report, (await readFile(report, "utf8")).replace(/PLACEHOLDER_[A-Z_0-9]+/g, "Описание сценария и потоков данных."))
    const result = await docsCommand(["emit", ...options], directory)
    expect(result.code).toBe(0)
    expect(result.stderr).toBe("")
    expect(JSON.parse(result.stdout).output).toBe(join(directory, "demo.lgp_report.pdf"))
    expect(pdfText(await readFile(join(directory, "demo.lgp_report.pdf"))).join(" ")).toContain("Описание сценария и потоков данных.")
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 20_000)

test("emit rejects a draft missing mandatory sections without publishing a report", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-docs-incomplete-"))
  try {
    const options = ["--lgp", join(fixtures, "demo.lgp"), "--directory", directory]
    const skeleton = await docsCommand(["skeleton", ...options], directory)
    expect(skeleton.code).toBe(0)
    await writeFile(JSON.parse(skeleton.stdout).report, "# Отчет о пакете «demo.lgp»\n\nТолько описание.\n")
    const result = await docsCommand(["emit", ...options, "--format", "md"], directory)
    expect(result.code).toBe(1)
    expect(result.stderr).toBe("PACKAGE_DOCS_REQUIRED_SECTION\n")
    expect(result.stdout).toBe("")
    expect(await readdir(directory)).toEqual([".work"])
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 20_000)

test("emit preserves existing reports and chooses the next free collision suffix", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-docs-collision-"))
  try {
    const options = ["--lgp", join(fixtures, "demo.lgp"), "--directory", directory]
    const skeleton = await docsCommand(["skeleton", ...options], directory)
    expect(skeleton.code).toBe(0)
    const draft = JSON.parse(skeleton.stdout).report
    const markdown = (await readFile(draft, "utf8")).replace(/PLACEHOLDER_[A-Z_0-9]+/g, "Описание пакета.")
    await writeFile(draft, markdown)
    await writeFile(join(directory, "demo.lgp_report.md"), "first original")
    await writeFile(join(directory, "demo.lgp_report-2.md"), "second original")
    const result = await docsCommand(["emit", ...options, "--format", "markdown"], directory)
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout).output).toBe(join(directory, "demo.lgp_report-3.md"))
    expect(await readFile(join(directory, "demo.lgp_report.md"), "utf8")).toBe("first original")
    expect(await readFile(join(directory, "demo.lgp_report-2.md"), "utf8")).toBe("second original")
    expect(await readFile(join(directory, "demo.lgp_report-3.md"), "utf8")).toBe(markdown)
    expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([])
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 20_000)

test("CLI handles spaces and quoted Cyrillic paths, all formats and format aliases", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom docs formats "))
  try {
    const lgp = join(directory, "Пакет & 'данные'.lgp")
    await cp(join(fixtures, "demo.lgp"), lgp)
    const before = createHash("sha256").update(await readFile(lgp)).digest("hex")
    const options = ["--lgp", lgp, "--directory", directory]
    const skeleton = await docsCommand(["skeleton", ...options], directory)
    expect(skeleton.code).toBe(0)
    const report = JSON.parse(skeleton.stdout).report
    await writeFile(report, (await readFile(report, "utf8")).replace(/PLACEHOLDER_[A-Z_0-9]+/g, "Готовое описание."))
    for (const [requested, extension] of [["WORD", "docx"], [".md", "md"], ["unknown", "pdf"]]) {
      const result = await docsCommand(["emit", ...options, "--format", requested], directory)
      expect(result.code).toBe(0)
      const file = JSON.parse(result.stdout).output
      expect(file).toBe(join(directory, "Пакет & 'данные'.lgp_report." + extension))
      const bytes = await readFile(file)
      if (extension === "md") expect(bytes.toString()).toContain("Готовое описание.")
      if (extension === "pdf") expect(pdfText(bytes).join(" ")).toContain("Готовое описание.")
      if (extension === "docx") {
        const zip = new ZipReader(new Uint8ArrayReader(new Uint8Array(bytes)), { useWebWorkers: false })
        try {
          const entry = (await zip.getEntries()).find((entry) => entry.filename === "word/document.xml")!
          expect(await entry.getData!(new TextWriter())).toContain("Готовое описание.")
        } finally { await zip.close() }
      }
    }
    expect(createHash("sha256").update(await readFile(lgp)).digest("hex")).toBe(before)
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 20_000)

test("a workspace symlink cannot redirect generated files outside the session", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-docs-linked-work-"))
  const external = await mkdtemp(join(tmpdir(), "loginom-docs-external-"))
  try {
    await writeFile(join(external, "keep"), "original")
    await symlink(external, join(directory, ".work"))
    const result = await docsCommand(["extract", "--lgp", join(fixtures, "demo.lgp"), "--directory", directory], directory)
    expect(result.code).toBe(1)
    expect(result.stderr).toBe("PACKAGE_DOCS_OUTPUT_ESCAPE\n")
    expect(result.stdout).toBe("")
    expect(await readdir(external)).toEqual(["keep"])
    expect(await readFile(join(external, "keep"), "utf8")).toBe("original")
  } finally { await rm(directory, { recursive: true, force: true }); await rm(external, { recursive: true, force: true }) }
}, 20_000)

test("CLI placeholder failure leaves no final report or publication temporary file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-docs-placeholders-"))
  try {
    const options = ["--lgp", join(fixtures, "demo.lgp"), "--directory", directory]
    expect((await docsCommand(["skeleton", ...options], directory)).code).toBe(0)
    const result = await docsCommand(["emit", ...options], directory)
    expect(result.code).toBe(1)
    expect(result.stderr).toBe("PACKAGE_DOCS_PLACEHOLDER\n")
    expect(result.stdout).toBe("")
    expect(await readdir(directory)).toEqual([".work"])
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 20_000)

test("PDF defaults to embedded Golos fonts and preserves baseline Cyrillic text through ToUnicode", async () => {
  const bytes = await renderReport(await readFile(join(fixtures, "demo.report.md"), "utf8"), undefined, fonts)
  expect(Buffer.from(bytes).subarray(0, 8).toString()).toBe("%PDF-1.4")
  expect(pdfText(bytes)).toEqual(pdfText(await readFile(join(fixtures, "demo.report.pdf"))))
  expect(pdfText(bytes).join(" ")).toContain("Отчет о пакете «demo.lgp»")
  expect(Buffer.from(bytes).toString("latin1")).toContain("/Encoding /Identity-H")
})

for (const name of ["formatting", "nested"]) {
  test(`PDF ${name} report matches frozen Python text runs through ToUnicode`, async () => {
    const bytes = await renderReport(await readFile(join(fixtures, name + ".report.md"), "utf8"), "pdf", fonts)
    expect(pdfText(bytes)).toEqual(pdfText(await readFile(join(fixtures, name + ".report.pdf"))))
  })
}

test("a missing report font gives a specific error instead of a finished report", async () => {
  await expect(renderReport("# Русский отчёт", "pdf", new URL("absent/", fonts)))
    .rejects.toThrow("PACKAGE_DOCS_FONT_MISSING")
})

test("a truncated TTF metrics table gives a specific invalid-font error", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-docs-bad-font-"))
  try {
    await cp(fonts, directory, { recursive: true })
    const path = join(directory, "GolosText-Regular.ttf")
    const bytes = await readFile(path)
    for (let offset = 12; offset < 12 + bytes.readUInt16BE(4) * 16; offset += 16) {
      if (bytes.toString("latin1", offset, offset + 4) === "head") bytes.writeUInt32BE(1, offset + 12)
    }
    await writeFile(path, bytes)
    await expect(renderReport("# Русский отчёт", "pdf", pathToFileURL(directory + "/")))
      .rejects.toThrow("PACKAGE_DOCS_FONT_INVALID")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("PDF embeds smaller valid TTF subsets and leaves the supplied fonts unchanged", async () => {
  const originals = await Promise.all(["Regular", "Bold"].map((weight) => readFile(new URL(`GolosText-${weight}.ttf`, fonts))))
  const pdf = Buffer.from(await renderReport(await readFile(join(fixtures, "demo.report.md"), "utf8"), "pdf", fonts)).toString("latin1")
  const embedded = [...pdf.matchAll(/\/Length (\d+) \/Length1 (\d+) \/Filter \/FlateDecode >>\nstream\n/g)]
    .map((match) => inflateSync(Buffer.from(pdf.slice(match.index + match[0].length, match.index + match[0].length + Number(match[1])), "latin1")))
  expect(embedded).toHaveLength(2)
  for (const [index, font] of embedded.entries()) {
    expect(font.length).toBeLessThan(originals[index].length)
    let checksum = 0
    for (let offset = 0; offset < font.length; offset += 4) checksum = (checksum + font.readUInt32BE(offset)) >>> 0
    expect(checksum).toBe(0xb1b0afba)
  }
  expect(await readFile(new URL("GolosText-Regular.ttf", fonts))).toEqual(originals[0])
  expect(await readFile(new URL("GolosText-Bold.ttf", fonts))).toEqual(originals[1])
})

test("bundled Node PDF writer resolves sibling skill fonts and preserves all oracle text", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
  for (const name of ["demo", "formatting", "nested"]) {
    const child = Bun.spawn([node, "--input-type=module", "--eval",
      "import {readFile} from 'node:fs/promises'; const {renderReport} = await import(process.argv[1]); process.stdout.write(await renderReport(await readFile(process.argv[2], 'utf8')))",
      pathToFileURL(join(output, "package-docs.mjs")).href, join(fixtures, name + ".report.md")],
      { env: { LANG: "C.UTF-8" }, stdout: "pipe", stderr: "pipe" })
    const stdout = new Response(child.stdout).arrayBuffer()
    const stderr = new Response(child.stderr).text()
    expect(await child.exited).toBe(0)
    expect(await stderr).toBe("")
    expect(pdfText(new Uint8Array(await stdout))).toEqual(pdfText(await readFile(join(fixtures, name + ".report.pdf"))))
  }
}, 20_000)

test("report publication rejects every unfilled placeholder before rendering", async () => {
  for (const format of ["md", "docx", "pdf"] as const) {
    await expect(renderReport("# Отчёт\n\nPLACEHOLDER_PACKAGE_DESCRIPTION", format, fonts))
      .rejects.toThrow("PACKAGE_DOCS_PLACEHOLDER")
  }
})

test("multipage PDF retains every paragraph across page boundaries", async () => {
  const paragraphs = Array.from({ length: 100 }, (_, index) => `Строка ${index + 1}. Русский текст документации по сценарию Loginom с описанием потоков данных.`)
  const bytes = await renderReport("# Многостраничный отчёт\n\n" + paragraphs.join("\n\n"), "pdf", fonts)
  const pages = /\/Type \/Pages \/Count (\d+)/.exec(Buffer.from(bytes).toString("latin1"))!
  expect(Number(pages[1])).toBeGreaterThan(1)
  expect(pdfText(bytes).join(" ").replace(/\s+/g, ""))
    .toBe(("Многостраничный отчёт" + paragraphs.join("")).replace(/\s+/g, ""))
})

test("DOCX writer preserves the baseline Word XML and package relationships", async () => {
  const bytes = await renderReport(await readFile(join(fixtures, "demo.report.md"), "utf8"), "docx")
  const zip = new ZipReader(new Uint8ArrayReader(bytes), { useWebWorkers: false })
  try {
    const entries = await zip.getEntries()
    expect(entries.map((entry) => entry.filename).toSorted()).toEqual([
      "[Content_Types].xml", "_rels/.rels", "word/_rels/document.xml.rels", "word/document.xml", "word/styles.xml",
    ])
    const document = entries.find((entry) => entry.filename === "word/document.xml")!
    expect(await document.getData!(new TextWriter())).toBe(await readFile(join(fixtures, "demo.word-document.xml"), "utf8"))
  } finally { await zip.close() }
})

for (const name of ["formatting", "nested"]) {
  test(`DOCX ${name} report matches frozen Python Word XML`, async () => {
    const zip = new ZipReader(new Uint8ArrayReader(await renderReport(await readFile(join(fixtures, name + ".report.md"), "utf8"), "docx")), { useWebWorkers: false })
    try {
      const entry = (await zip.getEntries()).find((entry) => entry.filename === "word/document.xml")!
      expect(await entry.getData!(new TextWriter())).toBe(await readFile(join(fixtures, name + ".word-document.xml"), "utf8"))
    } finally { await zip.close() }
  })
}

test("the DOCX writer runs under bundled Node without Bun or Python", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
  const child = Bun.spawn([node, "--input-type=module", "--eval",
    "import {readFile} from 'node:fs/promises'; const {renderReport} = await import(process.argv[1]); process.stdout.write(await renderReport(await readFile(process.argv[2], 'utf8'), 'docx'))",
    pathToFileURL(join(output, "package-docs.mjs")).href, join(fixtures, "formatting.report.md")],
    { env: { LANG: "C.UTF-8" }, stdout: "pipe", stderr: "pipe" })
  const stdout = new Response(child.stdout).arrayBuffer()
  const stderr = new Response(child.stderr).text()
  expect(await child.exited).toBe(0)
  expect(await stderr).toBe("")
  const zip = new ZipReader(new Uint8ArrayReader(new Uint8Array(await stdout)), { useWebWorkers: false })
  try {
    const entry = (await zip.getEntries()).find((entry) => entry.filename === "word/document.xml")!
    expect(await entry.getData!(new TextWriter())).toBe(await readFile(join(fixtures, "formatting.word-document.xml"), "utf8"))
  } finally { await zip.close() }
}, 20_000)

test("Markdown skeleton matches the saved Python report apart from its timestamp", async () => {
  const report = renderSkeleton(await extractPackage(join(fixtures, "demo.lgp")))
  const normalize = (text: string) => text.replace(/\(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\)/, "(timestamp)")
  expect(normalize(report)).toBe(normalize(await readFile(join(fixtures, "skeleton.md"), "utf8")))
})

for (const name of ["nested", "notes", "references", "views"]) {
  test(`Markdown skeleton preserves ${name} fixture statistics and descriptions`, async () => {
    const normalize = (text: string) => text.replace(/\(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\)/, "(timestamp)")
    expect(normalize(renderSkeleton(await extractPackage(join(fixtures, name + ".lgp")))))
      .toBe(normalize(await readFile(join(fixtures, name + ".skeleton.md"), "utf8")))
  })
}

test("the skeleton writer runs under bundled Node with no Bun or Python", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
  const child = Bun.spawn([node, "--input-type=module", "--eval",
    "import {readFile} from 'node:fs/promises'; const {renderSkeleton} = await import(process.argv[1]); process.stdout.write(renderSkeleton(JSON.parse(await readFile(process.argv[2], 'utf8'))))",
    pathToFileURL(join(output, "package-docs.mjs")).href, join(fixtures, "references.structure.json")],
    { env: { LANG: "C.UTF-8" }, stdout: "pipe", stderr: "pipe" })
  const stdout = new Response(child.stdout).text()
  const stderr = new Response(child.stderr).text()
  expect(await child.exited).toBe(0)
  expect(await stderr).toBe("")
  expect((await stdout).replace(/\(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\)/, "(timestamp)"))
    .toBe((await readFile(join(fixtures, "references.skeleton.md"), "utf8")).replace(/\(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\)/, "(timestamp)"))
}, 20_000)

test("Node extraction matches the saved Python structure of a Cyrillic two-node package", async () => {
  const source = join(fixtures, "demo.lgp")
  const before = createHash("sha256").update(await readFile(source)).digest("hex")
  const expected: Awaited<ReturnType<typeof extractPackage>> = await Bun.file(join(fixtures, "structure.json")).json()
  expect(await extractPackage(source)).toEqual(expected)
  expect(createHash("sha256").update(await readFile(source)).digest("hex")).toBe(before)
})

test("nested workflows match the frozen Python structure, identities and statistics", async () => {
  const expected: Awaited<ReturnType<typeof extractPackage>> = await Bun.file(join(fixtures, "nested.structure.json")).json()
  expect(await extractPackage(join(fixtures, "nested.lgp"))).toEqual(expected)
})

test("ZIP member case and backslash names preserve the Python structure", async () => {
  const expected: Awaited<ReturnType<typeof extractPackage>> = await Bun.file(join(fixtures, "aliases.structure.json")).json()
  expect(await extractPackage(join(fixtures, "aliases.lgp"))).toEqual(expected)
})

test("statistics and graph include descendants beyond the former two-level limit", async () => {
  const structure = await extractPackage(join(fixtures, "deep.lgp"))
  expect(structure.stats).toEqual({ modules: 1, notes: 0, nodes: 8, submodels: 3,
    programming_nodes: 2, reference_nodes: 1, derived_nodes: 1 })
  expect(structure.modules[0].stats.nesting_depth).toBe(4)
  const node = structure.modules[0].submodels[0].submodels[0].submodels[0].workflow_nodes[0]
  expect(node.engine_type).toBe("TBGJavaScript")
  expect(node.path).toBe("Unit_0/Вложенная модель/Ещё глубже/Третий уровень")
})

test("an indexed module without Unit.xml fails instead of producing an empty report", async () => {
  await expect(extractPackage(join(fixtures, "missing-unit.lgp"))).rejects.toThrow("PACKAGE_DOCS_UNIT_MISSING")
})

test("annotations preserve direct text, attributes, deduplication and nested note counts", async () => {
  const expected: Awaited<ReturnType<typeof extractPackage>> = await Bun.file(join(fixtures, "notes.structure.json")).json()
  expect(await extractPackage(join(fixtures, "notes.lgp"))).toEqual(expected)
})

test("external references retain names, display names, paths and XML order", async () => {
  const expected: Awaited<ReturnType<typeof extractPackage>> = await Bun.file(join(fixtures, "references.structure.json")).json()
  expect(await extractPackage(join(fixtures, "references.lgp"))).toEqual(expected)
})

test("visualizers keep their identities and labels without affecting workflow statistics", async () => {
  const expected: Awaited<ReturnType<typeof extractPackage>> = await Bun.file(join(fixtures, "views.structure.json")).json()
  expect(await extractPackage(join(fixtures, "views.lgp"))).toEqual(expected)
})

test("the bundled extractor runs under the product-pinned Node without Bun or Python", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
  for (const name of ["demo", "nested", "aliases", "notes", "references", "views"]) {
    const child = Bun.spawn([node, "--input-type=module", "--eval",
      "const {extractPackage} = await import(process.argv[1]); console.log(JSON.stringify(await extractPackage(process.argv[2])))",
      pathToFileURL(join(output, "package-docs.mjs")).href, join(fixtures, name + ".lgp")],
      { env: { LANG: "C.UTF-8" }, stdout: "pipe", stderr: "pipe" })
    const stdout = new Response(child.stdout).text()
    const stderr = new Response(child.stderr).text()
    expect(await child.exited).toBe(0)
    expect(await stderr).toBe("")
    expect(JSON.parse(await stdout)).toEqual(await Bun.file(join(fixtures, name === "demo" ? "structure.json" : name + ".structure.json")).json())
  }
}, 20_000)
