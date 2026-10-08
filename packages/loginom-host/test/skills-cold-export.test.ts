import { expect, test } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

const request = {
  resources: "/missing/resources",
  resultPrefix: "eval-own-1",
  connection: { url: "http://localhost/app/", username: "user", password: "private-acceptance-password" },
  plan: {
    packagePath: "/user/eval-own-1.lgp",
    packageSha256: "a".repeat(64),
    export: { guid: "c88865ca-8a7f-497e-8b1f-7fa7162812a9", label: "Export", path: "/user/eval-own-1.result.csv" },
  },
}

async function rejectsBeforeBrowser(input: typeof request, error: string) {
  const directory = await mkdtemp(join(tmpdir(), "cold-export-"))
  try {
    const child = Bun.spawn(
      [process.env.LOGINOM_AI_AGENT_TEST_NODE!, join(import.meta.dir, "../script/skills-acceptance/cold-export.mjs")],
      {
        stdin: new Blob([JSON.stringify({ ...input, output: join(directory, "output") })]),
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    expect(code).not.toBe(0)
    expect(stdout + stderr).toContain(error)
    expect(stdout + stderr).not.toContain(request.connection.password)
    expect(await readdir(directory)).toEqual([])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test("cold export refuses a saved package outside its attempt before starting a browser", async () => {
  await rejectsBeforeBrowser(
    { ...request, plan: { ...request.plan, packagePath: "/user/other.lgp" } },
    "COLD_PACKAGE_OWNERSHIP_INVALID",
  )
})

test("cold export refuses a result filename outside this attempt before starting a browser", async () => {
  await rejectsBeforeBrowser(
    { ...request, plan: { ...request.plan, export: { ...request.plan.export, path: "/another-user/result.csv" } } },
    "COLD_OUTPUT_OWNERSHIP_INVALID",
  )
})

test("cold export refuses a remote stand before loading browser resources", async () => {
  await rejectsBeforeBrowser(
    { ...request, connection: { ...request.connection, url: "https://foreign.example/app/" } },
    "COLD_LOCAL_ENDPOINT_REQUIRED",
  )
})

test("cold export requires the saved export GUID instead of selecting a node by label", async () => {
  await rejectsBeforeBrowser(
    { ...request, plan: { ...request.plan, export: { ...request.plan.export, guid: "" } } },
    "COLD_EXPORT_IDENTITY_INVALID",
  )
})
