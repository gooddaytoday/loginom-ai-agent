import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { evalsRoot } from "../../src/config"

export async function probeJudgeEnvironment(probe: "info" | "preflight", env?: Record<string, string>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-judge-env-"))
  try {
    const output = path.join(dir, "environment.json")
    const child = Bun.spawn([process.execPath, "-e", `
      import { loadConfig } from ${JSON.stringify(path.join(evalsRoot, "src/config.ts"))};
      import { parseArtifactSource } from ${JSON.stringify(path.join(evalsRoot, "src/artifact.ts"))};
      import { judgeInfo } from ${JSON.stringify(path.join(evalsRoot, "src/judge.ts"))};
      import { preflight } from ${JSON.stringify(path.join(evalsRoot, "src/preflight.ts"))};
      const config = loadConfig(["--judge-only", "probe"], { JUDGE_MODEL: "fake" });
      const configured = { ...config, judge: { ...config.judge,
        command: ${JSON.stringify([process.execPath, path.join(evalsRoot, "fixtures/fake-codex.ts"), "--environment-probe", output])},
        env: ${JSON.stringify(env)} } };
      const version = ${JSON.stringify(probe)} === "info"
        ? (await judgeInfo(configured)).codex_version
        : (await preflight(configured, parseArtifactSource("docker", configured.loginom))).codex?.version;
      console.log(JSON.stringify({ version }));
    `], {
      env: {
        ...process.env,
        LOGINOM_SECRET_PROBE: "inherited-secret",
        EVAL_SECRET_PROBE: "inherited-secret",
        JUDGE_SECRET_PROBE: "inherited-secret",
        FAKE_CODEX_SECRET_PROBE: "inherited-secret",
        PATH: "/judge-probe-preserved-path",
        PROBE_ALLOWED_ENV: "ordinary-value",
      },
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    if (exitCode !== 0) throw new Error(`judge probe exited ${exitCode}: ${stderr}`)
    return {
      ...JSON.parse(stdout) as { version: string | null },
      environment: await Bun.file(output).json() as Record<string, string | null>,
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
