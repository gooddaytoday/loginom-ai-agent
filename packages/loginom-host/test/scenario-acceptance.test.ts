import { expect, test } from "bun:test"

const node = { source: "source-guid", grouping: "grouping-guid" }
const packagePath = "/user/skills-acceptance-owned.lgp"
const digest = "a".repeat(64)
const csvSha256 = "b".repeat(64)
const skills = [{ name: "loginom-automation", digest }]

test("CSV path acceptance binds admission, delivery and import to the same source", async () => {
  const csvPath = "/input/Продажи.csv", destination = "/user/own-sales.csv"
  const values = bodies()
  values[0] = { input_artifacts: [] }
  Object.assign(values[1]!, { configuration: { readback: { kind: "text_import", source: { source_path: destination } } } })
  const admit = { tool: "loginom_file_admit", state: { status: "completed", input: { path: csvPath }, output: JSON.stringify({
    source_path: csvPath, artifact: { artifact_id: "artifact", sha256: csvSha256, upload: { grant_id: "grant", destination } } }) } }
  const delivered = { tool: "loginom_dock_artifact_deliver", state: { status: "completed",
    input: { operation_id: "delivery", artifact_id: "artifact", upload_grant_id: "grant" }, output: JSON.stringify({ operation_id: "delivery",
      outcome: { status: "SUCCEEDED", sha256: csvSha256, destination, cleanup_complete: true, upload_completion_verified: true } }) } }
  const actual = tools(values)
  actual.splice(2, 0, admit, delivered)
  expect((await verify(values, "", { tools: actual, csvPath })).code).toBe(0)
  delivered.state.output = JSON.stringify({ operation_id: "delivery", status: "SUCCEEDED", cleanup_complete: true,
    output: { status: "SUCCEEDED", sha256: csvSha256, destination, cleanup_complete: true, upload_completion_verified: true } })
  expect((await verify(values, "", { tools: actual, csvPath })).code).toBe(0)
  for (const missing of ["loginom_file_admit", "loginom_dock_artifact_deliver"])
    expect((await verify(values, "", { tools: actual.filter(tool => tool.tool !== missing), csvPath })).code).toBe(1)
  admit.state.input.path = "/input/foreign.csv"
  expect((await verify(values, "", { tools: actual, csvPath })).code).toBe(1)
  admit.state.input.path = csvPath
  delivered.state.input.artifact_id = "foreign"
  expect((await verify(values, "", { tools: actual, csvPath })).code).toBe(1)
  delivered.state.input.artifact_id = "artifact"
  Object.assign(values[1]!.configuration!.readback!, { source: { source_path: "/user/foreign.csv" } })
  Object.assign(actual[4]!.state, { output: JSON.stringify(values[1]) })
  expect((await verify(values, "", { tools: actual, csvPath })).code).toBe(1)
})

function bodies(inputHash = csvSha256, amount = 35, path = packagePath) {
  return [
    { input_artifacts: [{ sha256: inputHash }] },
    { status: "SUCCEEDED", node: { node_id: node.source }, configuration: { readback: { kind: "text_import" } } },
    {
      status: "SUCCEEDED",
      node: { node_id: node.grouping },
      configuration: {
        readback: { kind: "grouping", group_by: [{ name: "Category" }], measures: [{ name: "amount", functions: 1 }] },
      },
      execution: { status: "completed" },
      output: {
        ports: [
          {
            port: 0,
            row_count: 2,
            sample_complete: true,
            schema: [
              { name: "Category", type: "string" },
              { name: "amount", type: "integer" },
            ],
            sample: [
              [{ value: "Beta" }, { value: 20 }],
              [{ value: "Alpha" }, { value: amount }],
            ],
          },
        ],
      },
    },
    {
      status: "SUCCEEDED",
      action_key: "package.save_checkpoint",
      output: { save_completed: true, package_ref: { path } },
    },
  ]
}

function tools(values = bodies(), advice = "") {
  return [
    {
      tool: "skill",
      state: { status: "completed", metadata: { activation: { profile: "loginom-automation", digest } } },
    },
    ...values.map((body, index) => ({
      tool: index === 0 ? "loginom_dock_prepare" : "loginom_dock_node_wait",
      state: { status: "completed", output: JSON.stringify(body) + (index === 1 ? advice : "") },
    })),
  ]
}

async function verify(values = bodies(), advice = "", paths?: { tools: unknown[]; csvPath: string }) {
  const nativeNode = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!nativeNode) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
  const child = Bun.spawn(
    [
      nativeNode,
      "--input-type=module",
      "-e",
      `import { verifySalesScenario } from ${JSON.stringify(new URL("../script/skills-acceptance/scenario.mjs", import.meta.url).href)}
const input = JSON.parse(process.argv[1])
console.log(JSON.stringify(verifySalesScenario(input.tools, input.options)))`,
      JSON.stringify({ tools: paths?.tools ?? tools(values, advice), options: { skills, csvSha256, packagePath, ...(paths ? { csvPath: paths.csvPath } : {}) } }),
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

test("scenario acceptance rejects an interrupted import with an explicit grouping failure", async () => {
  const result = await verify(bodies().slice(0, 2))
  expect(result.code).toBe(1)
  expect(result.stderr).toContain("SCENARIO_GROUPING_NOT_VERIFIED")
})

test("scenario acceptance binds actual CSV, SUM results and saved package to read-back node identities", async () => {
  const result = await verify()
  expect(result.code).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({ builtNodes: node, inputSha256: csvSha256 })
})

test("scenario acceptance reads node receipts followed by human-readable Dock advice", async () => {
  const result = await verify(bodies(), "\n\nInspect the outcome and current state. Correct invalid parameters.")
  expect(result.code).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({ builtNodes: node, inputSha256: csvSha256 })
})

test("scenario acceptance rejects a malformed JSON receipt after Dock advice", async () => {
  const result = await verify(bodies(), "\n\nInspect the outcome.\n\n{invalid receipt")
  expect(result.code).toBe(1)
  expect(result.stderr).toContain("SyntaxError")
})

test.each([
  ["input hash", bodies("c".repeat(64))],
  ["aggregation result", bodies(csvSha256, 34)],
  ["saved path", bodies(csvSha256, 35, "/user/foreign.lgp")],
])("scenario acceptance rejects a changed %s", async (_name, changed) => {
  const result = await verify(changed, "\n\nInspect the outcome and current state.")
  expect(result.code).toBe(1)
  expect(result.stderr).toContain("ERR_ASSERTION")
})
