import path from "node:path"
import { cp } from "node:fs/promises"
import { parallelFixture } from "./parallel-fixture"
import { writeLeaseReceipt } from "../../src/lease"
import { evalsRoot, loadConfig } from "../../src/config"
import { redact, runAttempt } from "../../src/run"
import { agentCommand } from "../../src/cli"
import { parseArtifactSource } from "../../src/artifact"
import { agentInputsHash, loadTasks, rubricHash } from "../../src/task"
import { judgeInfo } from "../../src/judge"
import { evaluationContractHash } from "../../src/evaluation"

export async function pendingJudgeFixture(root: string) {
  const fixture = await parallelFixture(root)
  const slots = path.join(root, "slots.json"), trace = path.join(root, "judge.jsonl"), probe = path.join(root, "version.json")
  await writeLeaseReceipt(slots, fixture.slots)
  const env = { EVAL_RESULTS_DIR: path.join(root, "results"), EVAL_WORKSPACE_ROOT: path.join(root, "workspace"),
    JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: `${process.execPath} ${path.join(evalsRoot, "fixtures/fake-codex.ts")} --gate-log ${trace} --version-home-file ${probe}` }
  const tasksDir = path.join(root, "tasks")
  await cp(path.join(evalsRoot, "tasks/group-sum-qty"), path.join(tasksDir, "group-sum-qty"), { recursive: true })
  const generation = { ...loadConfig(["--dry-run", "--tasks", tasksDir, "--only", "group-sum-qty"], env), skipJudge: false }
  const tasks = await loadTasks(generation.tasksDir, generation.only)
  const judge = await judgeInfo({ judge: { ...generation.judge, env: { CODEX_HOME: fixture.slots.judge.codexHome } } })
  const rubric = await rubricHash(tasks)
  const hash = evaluationContractHash({ rubric_hash: rubric, judge, pass_threshold: generation.passThreshold })
  const runDir = path.join(env.EVAL_RESULTS_DIR, "saved")
  const original = await runAttempt({ config: generation, command: agentCommand(generation), source: parseArtifactSource(generation.artifactSource, generation.loginom),
    task: tasks[0]!, attempt: 1, runId: "saved", runDir, signal: new AbortController().signal, profileRecovered: false, skipJudge: false, evaluationHash: hash })
  await writeLeaseReceipt(path.join(runDir, "config.json"), { ...redact(generation), agent_inputs_hash: await agentInputsHash(tasks), rubric_hash: rubric, judge })
  return { fixture, runDir, resultFile: path.join(runDir, tasks[0]!.id, "1/result.json"), original, trace, probe, hash,
    config: loadConfig(["--judge-only", "saved"], { ...env, EVAL_SLOTS_FILE: slots }) }
}
