import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

test.each([
  { id: "edit-after-docs", profiles: ["package-docs", "loginom-automation"], inputs: ["external-text-path", "external-text-path"], scenario: [false, true] },
  { id: "docs-after-edit", profiles: ["loginom-automation", "package-docs"], inputs: ["external-text-path", "created-lgp-path"], scenario: [true, false] },
])("$id keeps the edit fixture after schema decode and across genuine task profiles", async (expected) => {
  const { decodeAcceptanceCorpus } = await import("../script/skills-acceptance/corpus")
  const { acceptanceTurns } = await import("../script/skills-acceptance/turns.mjs")
  const corpus = decodeAcceptanceCorpus(await Bun.file(new URL("../../agent/test/cli/package-docs-routing/cases.json", import.meta.url)).json())
  const testcase = corpus.cases.find(item => item.id === expected.id)!
  expect(testcase).toBeDefined()
  expect(testcase.fixture).toBe("edit_lgp")
  const turns = acceptanceTurns(testcase)
  expect(turns.map(turn => turn.expected.profile)).toEqual([...expected.profiles])
  expect(turns.map(turn => turn.input)).toEqual([...expected.inputs])
  expect(turns.map(turn => turn.fixture)).toEqual(["edit_lgp", "edit_lgp"])
  expect(turns.map(turn => turn.scenario)).toEqual([...expected.scenario])
  expect(turns.find(turn => !turn.scenario)!.expected.result).toBe("md")
  expect(turns.find(turn => turn.scenario)!.verification).toBe("local-calculator")
  expect(corpus.cases.find(item => item.id === "docs-external-unicode-path")?.fixture).toBeUndefined()
})

test("both adapters stage the selected external package and preserve the old default bytes", async () => {
  const { acceptanceTurns, prepareAcceptanceInputs } = await import("../script/skills-acceptance/turns.mjs")
  const corpus = await Bun.file(new URL("../../agent/test/cli/package-docs-routing/cases.json", import.meta.url)).json()
  const fixtures: Record<string, string> = Object.fromEntries(Object.entries(corpus.fixtures).map(([key, file]) => [key, resolve(import.meta.dir, "../../..", file as string)]))
  expect(fixtures.edit_lgp, "confirmed edit fixture must be registered in cases.json").toBeDefined()
  expect(new Bun.CryptoHasher("sha256").update(await Bun.file(fixtures.edit_lgp!).bytes()).digest("hex")).toBe(
    (await Bun.file(new URL("../../agent/test/cli/package-docs-routing/fixtures/edit-source.provenance.json", import.meta.url)).json()).sha256,
  )
  const root = await mkdtemp(join(tmpdir(), "loginom-routing-input-"))
  try {
    await mkdir(join(root, "input"))
    const paths = Object.fromEntries(["lgp", "local", "csv", "text", "png", "created"].map(key => [key, join(root, "input", key)]))
    for (const id of ["edit-after-docs", "docs-after-edit", "docs-external-unicode-path", "scenario-create-path", "text-read"]) {
      const testcase = corpus.cases.find((item: { id: string }) => item.id === id)
      await prepareAcceptanceInputs(acceptanceTurns(testcase), fixtures, paths)
      const key = id === "scenario-create-path" ? "csv" : id === "text-read" ? "text" : "lgp"
      const source = key === "lgp" ? fixtures[testcase.fixture ?? "lgp"] : fixtures[key]
      expect(await Bun.file(paths[key]!).bytes()).toEqual(await Bun.file(source).bytes())
    }
    await rm(paths.lgp!)
    await prepareAcceptanceInputs(acceptanceTurns(corpus.cases.find((item: { id: string }) => item.id === "docs-after-build")), fixtures, paths)
    expect(await Bun.file(paths.lgp!).exists()).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("path turns bind their real source and scope CLI allow only to non-scenario new cases", async () => {
  const { acceptanceTurns, acceptanceInputPath, acceptanceCliPermission } = await import("../script/skills-acceptance/turns.mjs")
  const corpus = await Bun.file(new URL("../../agent/test/cli/package-docs-routing/cases.json", import.meta.url)).json()
  const paths = { csv: "/input/sales.csv", text: "/input/read.txt", lgp: "/input/source.lgp", created: "/workspace/changed.lgp" }
  for (const [id, expected] of [["scenario-create-path", [paths.csv]], ["text-read", [paths.text]],
    ["edit-after-docs", [paths.lgp, paths.lgp]], ["docs-after-edit", [paths.lgp, paths.created]],
    ["docs-external-unicode-path", [paths.lgp]]] as const) {
    const testcase = corpus.cases.find((item: { id: string }) => item.id === id)
    const turns = acceptanceTurns(testcase)
    expect(turns.map(turn => acceptanceInputPath(turn, paths))).toEqual([...expected])
    for (const turn of turns) expect(acceptanceCliPermission(testcase, turn, acceptanceInputPath(turn, paths))).toEqual(
      !turn.scenario && ["text-read", "edit-after-docs"].includes(id)
        ? { permission: { external_directory: { "/input/*": "allow" } } } : {})
  }
})

test("new path answers require the exact Read value and facts from the modified Markdown", async () => {
  const { verifyLocalFileAnswer } = await import("../script/skills-acceptance/receipts.mjs")
  const path = "/workspace/changed.lgp"
  const read = [{ tool: "read", state: { status: "completed", input: { filePath: path } } }]
  expect(() => verifyLocalFileAnswer("text-read", read, path, "PATH-74-АБВ-37")).not.toThrow()
  expect(() => verifyLocalFileAnswer("text-read", read, path, "37")).toThrow()
  expect(() => verifyLocalFileAnswer("text-read", read, "/foreign", "PATH-74-АБВ-37")).toThrow()
  const docs = [
    { tool: "package_docs_run", state: { status: "completed", input: { operation: "extract", lgp: path } } },
    { tool: "package_docs_run", state: { status: "completed", input: { operation: "emit", lgp: path, format: "md" } } },
  ]
  expect(() => verifyLocalFileAnswer("docs-after-edit", docs, path, "Готово", "amount_double = amount * 3")).not.toThrow()
  expect(() => verifyLocalFileAnswer("docs-after-edit", docs, path, "Готово",
    "amount_double\n\nФормула и параметры выражений в извлечённых настройках отсутствуют; в частности, сохранение формулы `amount*3` по извлечённой структуре проверить нельзя.")).toThrow("MODIFIED_DOC_FACTS_NOT_VERIFIED")
  expect(() => verifyLocalFileAnswer("docs-after-edit", docs, path, "Готово", "amount_double = amount * 2")).toThrow()
  expect(() => verifyLocalFileAnswer("docs-after-edit", docs, path, "Готово", "amount_double = amount * 30")).toThrow("MODIFIED_DOC_FACTS_NOT_VERIFIED")
  expect(() => verifyLocalFileAnswer("docs-after-edit", docs, path, "amount*3")).toThrow()
  docs[1]!.state.input.lgp = "/foreign/original.lgp"
  expect(() => verifyLocalFileAnswer("docs-after-edit", docs, path, "Готово", "amount_double = amount*3")).toThrow()
})

test("local edit preserves source node IDs and exact link endpoints", async () => {
  const { verifyPreservedGraph } = await import("../script/skills-acceptance/receipts.mjs")
  const source = { modules: [{ workflow_nodes: [{ guid: "source" }, { guid: "calc" }], links: [
    { source_node_guid: "source", source_port_guid: "out", target_node_guid: "calc", target_port_guid: "in" }] }] }
  expect(() => verifyPreservedGraph(source, structuredClone(source), "calc")).not.toThrow()
  expect(() => verifyPreservedGraph(source, source, "replacement")).toThrow()
  expect(() => verifyPreservedGraph(source, { modules: [{ workflow_nodes: [{ guid: "calc" }], links: [] }] }, "calc")).toThrow()
  expect(() => verifyPreservedGraph(source, { modules: [{ ...source.modules[0], links: [] }] }, "calc")).toThrow()
})

test.each([
  { id: "scenario-create-path", input: "csv-path", profile: "loginom-automation", scenario: true },
  { id: "text-read", input: "text-path", profile: "default", scenario: false },
])("$id routes a text-only path through its expected profile", async (expected) => {
  const { acceptanceTurns } = await import("../script/skills-acceptance/turns.mjs")
  const corpus = await Bun.file(new URL("../../agent/test/cli/package-docs-routing/cases.json", import.meta.url)).json()
  const testcase = corpus.cases.find((item: { id: string }) => item.id === expected.id)
  expect(testcase).toBeDefined()
  expect(acceptanceTurns(testcase)).toMatchObject([{ input: expected.input, scenario: expected.scenario,
    expected: { profile: expected.profile } }])
})

test("a modification uses the saved package on the second turn, without attaching CSV again", async () => {
  const { acceptanceTurns } = await import("../script/skills-acceptance/turns.mjs")
  const corpus = await Bun.file(new URL("../../agent/test/cli/package-docs-routing/cases.json", import.meta.url)).json()
  const testcase = corpus.cases.find((item: { id: string }) => item.id === "scenario-modify")
  const turns = acceptanceTurns(testcase)
  expect(turns).toHaveLength(2)
  expect(turns[0].input).toBe("csv-attachment")
  expect(turns[0].verification).toBe("import")
  expect(turns[1].prompt).toBe(testcase.prompt)
  expect(turns[1].input).toBe("own-created-server-package")
  expect(turns[1].verification).toBe("calculator")
  expect(turns.every((turn) => turn.scenario && turn.expected.profile === "loginom-automation")).toBe(true)
})

test("execution reuses the saved source on a separate automation turn", async () => {
  const { acceptanceTurns } = await import("../script/skills-acceptance/turns.mjs")
  const corpus = await Bun.file(new URL("../../agent/test/cli/package-docs-routing/cases.json", import.meta.url)).json()
  const testcase = corpus.cases.find((item: { id: string }) => item.id === "scenario-execute-save")
  const turns = acceptanceTurns(testcase)
  expect(turns).toHaveLength(2)
  expect(turns[0].input).toBe("csv-attachment")
  expect(turns[0].verification).toBe("import")
  expect(turns[1].input).toBe("own-created-server-package")
  expect(turns[1].verification).toBe("execution")
})
