import { expect, test } from "bun:test"
import { resolve } from "node:path"

async function verify(fixture: unknown, operation = "verifyImportBuild") {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
  const child = Bun.spawn(
    [
      node,
      "--input-type=module",
      "-e",
      `
import { ${operation} } from ${JSON.stringify(new URL("../script/skills-acceptance/scenario-import.mjs", import.meta.url).href)}
const input = JSON.parse(process.argv[1])
console.log(JSON.stringify(${operation}(input.tools, input.options)))`,
      JSON.stringify(fixture),
    ],
    { stdout: "pipe", stderr: "pipe" },
  )
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  return { code, stdout, stderr }
}

test("import setup binds actual CSV and records the numeric precision limitation", async () => {
  const fixture = await Bun.file(resolve(import.meta.dir, "fixtures/scenario-import.json")).json()
  const result = await verify(fixture)
  expect({ code: result.code, stderr: result.stderr }).toEqual({ code: 0, stderr: "" })
  expect(JSON.parse(result.stdout)).toEqual({
    builtNodes: { source: "b3f5b2ba-0a24-49d9-ad52-8aa2988bce71" },
    inputSha256: fixture.options.csvSha256,
    importNumbersVerified: false,
  })
})

async function calculatorFixture() {
  const fixture = await Bun.file(resolve(import.meta.dir, "fixtures/scenario-import.json")).json()
  const imported = JSON.parse(
    fixture.tools.find((t: { state: { output?: string } }) => t.state.output?.includes('"kind": "text_import"')).state
      .output,
  )
  const calculator = structuredClone(imported)
  calculator.node.node_id = "9bc0f4a4-ab82-4e47-bb58-f3a807bd7f99"
  calculator.configuration.readback = {
    kind: "calculator",
    expressions: [{ name: "amount_double", formula: "amount * 2" }],
  }
  const port = calculator.output.ports[0]
  port.schema.push({ name: "amount_double", type: "integer" })
  port.precision.numbers_verified = true
  port.sample.forEach((row: { value?: string; display_text?: string }[], index: number) => {
    row[1] = { value: ["10", "20", "25"][index] }
    row.push({ value: ["20", "40", "50"][index] })
  })
  fixture.tools.push({
    tool: "loginom_dock_node_wait",
    state: { status: "completed", output: JSON.stringify(calculator) },
  })
  fixture.tools.push(
    fixture.tools.find((t: { state: { output?: string } }) =>
      t.state.output?.includes('"action_key": "package.save_checkpoint"'),
    ),
  )
  fixture.options.sourceNode = imported.node.node_id
  return { fixture, calculator }
}

test("calculator acceptance requires the original source and exact doubled output rows", async () => {
  const { fixture, calculator } = await calculatorFixture()
  const result = await verify(fixture, "verifyCalculatorModification")
  expect({ code: result.code, stderr: result.stderr }).toEqual({ code: 0, stderr: "" })
  expect(JSON.parse(result.stdout).builtNodes).toEqual({
    source: fixture.options.sourceNode,
    calculator: calculator.node.node_id,
  })
})

test("import setup does not accept an unfinished activation from a projected tool event", async () => {
  const fixture = await Bun.file(resolve(import.meta.dir, "fixtures/scenario-import.json")).json()
  fixture.tools.find((t: { tool: string }) => t.tool === "skill").state.status = "pending"
  const result = await verify(fixture)
  expect(result.code).toBe(1)
  expect(result.stderr).toContain("SCENARIO_ACTIVATION_NOT_VERIFIED")
})

test("execution acceptance reads the saved source without requiring configuration changes", async () => {
  const fixture = await Bun.file(resolve(import.meta.dir, "fixtures/scenario-import.json")).json()
  const imported = JSON.parse(
    fixture.tools.find((t: { state: { output?: string } }) => t.state.output?.includes('"kind": "text_import"')).state
      .output,
  )
  fixture.options.sourceNode = imported.node.node_id
  delete imported.configuration
  imported.output.ports[0].precision.numbers_verified = true
  imported.output.ports[0].sample.forEach((row: { value?: string }[], index: number) => {
    row[1] = { value: ["10", "20", "25"][index] }
  })
  fixture.tools = [
    fixture.tools.find((t: { tool: string }) => t.tool === "skill"),
    { tool: "loginom_dock_node_wait", state: { status: "completed", output: JSON.stringify(imported) } },
    fixture.tools.find((t: { state: { output?: string } }) =>
      t.state.output?.includes('"action_key": "package.save_checkpoint"'),
    ),
  ]
  const result = await verify(fixture, "verifyImportExecution")
  expect({ code: result.code, stderr: result.stderr }).toEqual({ code: 0, stderr: "" })
  expect(JSON.parse(result.stdout).builtNodes).toEqual({ source: imported.node.node_id })
})

test("import setup rejects a source path different from its admitted original CSV", async () => {
  const fixture = await Bun.file(resolve(import.meta.dir, "fixtures/scenario-import.json")).json()
  const imported = fixture.tools.find((t: { state: { output?: string } }) =>
    t.state.output?.includes('"kind": "text_import"'),
  )
  const body = JSON.parse(imported.state.output)
  body.configuration.readback.source.source_path = "/user/foreign.csv"
  imported.state.output = JSON.stringify(body)
  const result = await verify(fixture)
  expect(result.code).toBe(1)
  expect(result.stderr).toContain("SCENARIO_IMPORT_SOURCE_CHANGED")
})

test("calculator acceptance rejects numeric-looking strings in the output schema", async () => {
  const { fixture, calculator } = await calculatorFixture()
  calculator.output.ports[0].schema[2].type = "string"
  fixture.tools.findLast((t: { tool: string }) => t.tool === "loginom_dock_node_wait").state.output =
    JSON.stringify(calculator)
  const result = await verify(fixture, "verifyCalculatorModification")
  expect(result.code).toBe(1)
  expect(result.stderr).toContain("SCENARIO_OUTPUT_SCHEMA_CHANGED")
})

test("operation inspection advice does not invalidate verified calculator output", async () => {
  const { fixture } = await calculatorFixture()
  fixture.tools.push({
    tool: "loginom_dock_operation_inspect",
    state: {
      status: "completed",
      output:
        '{"operation_id":"calculator-inspection"}\n\nInspect the outcome and current state. Correct invalid parameters using the pinned schema; consult additional Dock knowledge only if needed.',
    },
  })
  const result = await verify(fixture, "verifyCalculatorModification")
  expect({ code: result.code, stderr: result.stderr }).toEqual({ code: 0, stderr: "" })
})
