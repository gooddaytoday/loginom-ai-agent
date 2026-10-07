import { expect, test } from "bun:test"

const node = { source: "source-guid", grouping: "grouping-guid" }
const packagePath = "/user/skills-acceptance-owned.lgp"
const digest = "a".repeat(64)
const csvSha256 = "b".repeat(64)
const skills = [{ name: "loginom-automation", digest }]
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

function tools(values = bodies()) {
  return [
    {
      tool: "skill",
      state: { status: "completed", metadata: { activation: { profile: "loginom-automation", digest } } },
    },
    ...values.map((body, index) => ({
      tool: index === 0 ? "loginom_dock_prepare" : "loginom_dock_node_wait",
      state: { status: "completed", output: JSON.stringify(body) },
    })),
  ]
}

async function verify(values = bodies()) {
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
      JSON.stringify({ tools: tools(values), options: { skills, csvSha256, packagePath } }),
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

test.each([
  ["input hash", bodies("c".repeat(64))],
  ["aggregation result", bodies(csvSha256, 34)],
  ["saved path", bodies(csvSha256, 35, "/user/foreign.lgp")],
])("scenario acceptance rejects a changed %s", async (_name, changed) => {
  const result = await verify(changed)
  expect(result.code).toBe(1)
})
