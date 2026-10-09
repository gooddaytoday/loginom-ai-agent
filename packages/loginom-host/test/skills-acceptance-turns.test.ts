import { expect, test } from "bun:test"

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
