import { expect, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"

for (const phase of ["body", "cleanup"]) {
  test(`exerciser fails instead of hanging in scenario ${phase}`, async () => {
    await using dir = await tmpdir()
    const child = Bun.spawn([process.execPath, "run", "test/fixture/httpapi-stalled-scenario.ts", phase], {
      env: {
        ...process.env,
        LOGINOM_AI_AGENT_HTTPAPI_EXERCISE_GLOBAL: `${dir.path}/global`,
        LOGINOM_AI_AGENT_HTTPAPI_EXERCISE_DB: `${dir.path}/exercise.db`,
      },
      stdout: "ignore",
      stderr: "pipe",
      signal: AbortSignal.timeout(10_000),
    })
    const stderr = await new Response(child.stderr).text()
    expect(await child.exited).toBe(1)
    expect(stderr).toContain(`probe reached ${phase}`)
    expect(stderr).toContain("stalled-probe")
    expect(stderr).toContain("including scope cleanup")
  }, 15_000)
}
