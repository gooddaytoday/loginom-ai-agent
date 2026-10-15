import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, cp, writeFile, chmod, readFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { evalsRoot } from "../src/config"
import { qualifyEvalrunner, type EvalrunnerConfig } from "../src/evalrunner"
import { verifyEvalrunnerSeriesPins } from "../src/evalrunner-controller"
import { loadEvalrunnerCorpus, createEvalrunnerManifest, reserveEvalrunnerSeries, evalrunnerHash } from "../src/evalrunner-series"

const image = process.env.EVAL_TEST_LOGINOM_IMAGE ?? "sha256:5e3c79877de937aae168ecdcaf70c837bbbcf04e8f4262c2a976ac283ea394c2"
const available = Boolean(Bun.which("docker")) && (await Bun.$`docker image inspect ${image}`.quiet().nothrow()).exitCode === 0

test.skipIf(!available)("series pins reject environment, config, CLI, judge, corpus and container drift before any product execution", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-pins-"))
  const container = (await Bun.$`docker run --rm -d --network none --entrypoint /bin/sh ${image} -c ${"sleep 120"}`.quiet()).text().trim()
  try {
    for (const name of ["checkout/evals", "cli/bin", "bin", "profile", "workspace", "results", "judge"])
      await mkdir(path.join(root, name), { recursive: true, mode: 0o700 })
    const checkout = path.join(root, "checkout")
    await cp(path.join(evalsRoot, "tasks"), path.join(checkout, "evals/tasks"), { recursive: true })
    await Bun.$`git init`.cwd(checkout).quiet()
    await Bun.$`git add .`.cwd(checkout).quiet()
    await Bun.$`git -c user.name=Fixture -c user.email=fixture@example.invalid commit -m fixture`.cwd(checkout).quiet()
    const cli = path.join(root, "cli/bin/cli"), judge = path.join(root, "bin/codex")
    const product = `#!/bin/sh\ntouch ${JSON.stringify(path.join(root, "PRODUCT_EXECUTED"))}\n`
    const judgeSource = "#!/bin/sh\nprintf 'codex-cli 0.159.3\\n'\n"
    await writeFile(cli, product, { mode: 0o755 }); await writeFile(judge, judgeSource, { mode: 0o755 })
    await chmod(cli, 0o755); await chmod(judge, 0o755)
    const installed = { format: "loginom-cli-artifact-v1", metadata: { version: "0.2.0", sourceCommit: "a".repeat(40), sourceDirty: false },
      files: [{ path: "bin/cli", sha256: evalrunnerHash(product), mode: 0o755 }] }
    const installedFile = path.join(root, "cli/cli-manifest.json")
    await writeFile(installedFile, JSON.stringify(installed), { mode: 0o600 })
    const config: EvalrunnerConfig = { kind: "evalrunner-runtime", version: 2, root, checkout,
      harnessSha: (await Bun.$`git rev-parse HEAD`.cwd(checkout).quiet()).text().trim(), cliBin: cli, cliVersion: "0.2.0", cliSourceSha: "a".repeat(40),
      cliManifestSha256: evalrunnerHash(await readFile(installedFile)), binarySha256: evalrunnerHash(product), profile: path.join(root, "profile"), workspace: path.join(root, "workspace"),
      results: path.join(root, "results"), envFile: path.join(root, "env.json"), judgeHome: path.join(root, "judge"), containerId: container,
      imageDigest: (await Bun.$`docker inspect --format ${"{{.Image}}"} ${container}`.quiet()).text().trim(), endpoint: "http://127.0.0.1:1/app/", readinessIssue: "LAB-77",
      judgeBin: judge, judgeVersion: "codex-cli 0.159.3", judgeSha256: evalrunnerHash(judgeSource), bunSha256: evalrunnerHash(await readFile(process.execPath)),
      qualificationFile: path.join(root, "qualification.json"), qualificationSha256: "0".repeat(64) }
    const env = { EVAL_CLI_BIN: cli, EVAL_PROFILE_DIR: config.profile, EVAL_WORKSPACE_ROOT: config.workspace, LOGINOM_URL: config.endpoint,
      CODEX_HOME: config.judgeHome, EVAL_AGENT_MODEL: "openai/gpt-6.1-sol", EVAL_AGENT_VARIANT: "medium", JUDGE_MODEL: "gpt-6-sol", JUDGE_REASONING: "xhigh", EVAL_JUDGE_COMMAND: judge }
    await writeFile(config.envFile, JSON.stringify(env), { mode: 0o600 })
    const initial = await qualifyEvalrunner(config), corpus = await loadEvalrunnerCorpus(path.join(checkout, "evals"))
    const qualification = { kind: "evalrunner-nonmodel-qualification", status: "QUALIFIED", harnessSha: initial.harnessSha, binarySha256: initial.binarySha256,
      manifestSha256: initial.manifestSha256, envSha256: initial.envSha256, corpusSha256: corpus.sha256, containerId: container, imageDigest: config.imageDigest,
      judgeSha256: config.judgeSha256, bunSha256: config.bunSha256, tests: { exitCode: 0, fail: 0 }, typecheck: { exitCode: 0 },
      native: { cleanup: "confirmed" }, sandbox: "confirmed", exportDownloadRegression: "confirmed", historicalRecovery: { status: "RECOVERED" } }
    await writeFile(config.qualificationFile!, JSON.stringify(qualification), { mode: 0o600 })
    config.qualificationSha256 = evalrunnerHash(await readFile(config.qualificationFile!))
    const proof = await qualifyEvalrunner(config)
    const manifest = createEvalrunnerManifest({ issue: "LAB-77", task: "fixture", scope: "full", series: path.join(config.results, "v02-full-LAB-77"), pins: { ...proof, env: undefined }, corpus })
    await reserveEvalrunnerSeries(config, manifest)
    await cp(installedFile, path.join(manifest.series, "cli-manifest.json"))
    await verifyEvalrunnerSeriesPins(config, manifest)
    const envBytes = await readFile(config.envFile)
    await writeFile(config.envFile, JSON.stringify({ ...env, EVAL_INFRA_RETRIES: "1" }))
    await expect(verifyEvalrunnerSeriesPins(config, manifest)).rejects.toThrow("Series pins")
    await writeFile(config.envFile, envBytes)
    for (const changed of [{ ...config, binarySha256: "f".repeat(64) }, { ...config, imageDigest: "sha256:" + "f".repeat(64) }, { ...config, bunSha256: "f".repeat(64) }])
      await expect(verifyEvalrunnerSeriesPins(changed, manifest)).rejects.toThrow()
    await writeFile(cli, product + "changed")
    await expect(verifyEvalrunnerSeriesPins(config, manifest)).rejects.toThrow("payload")
    await writeFile(cli, product)
    await writeFile(judge, judgeSource + "changed")
    await expect(verifyEvalrunnerSeriesPins(config, manifest)).rejects.toThrow("binary pins")
    await writeFile(judge, judgeSource)
    const task = path.join(checkout, "evals/tasks/calc-data-double/task.json"), bytes = await readFile(task)
    await writeFile(task, Buffer.concat([bytes, Buffer.from("\n")]))
    await expect(verifyEvalrunnerSeriesPins(config, manifest)).rejects.toThrow("Harness pin")
    await writeFile(task, bytes)
    await verifyEvalrunnerSeriesPins(config, manifest)
    expect(await Bun.file(path.join(root, "PRODUCT_EXECUTED")).exists()).toBe(false)
  } finally { await Bun.$`docker rm -f ${container}`.quiet().nothrow(); await rm(root, { recursive: true, force: true }) }
}, 60_000)
