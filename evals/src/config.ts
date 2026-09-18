import path from "node:path"
import { parseArgs } from "node:util"
import { EvalFailure } from "./fail"

export const evalsRoot = path.resolve(import.meta.dir, "..")
export const repoRoot = path.resolve(evalsRoot, "..")

const cliModes = ["source", "binary", "fake"] as const
type Env = Record<string, string | undefined>

export function loadConfig(argv: string[], env: Env = process.env) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      only: { type: "string" },
      tasks: { type: "string" },
      label: { type: "string" },
      repeat: { type: "string" },
      "timeout-ms": { type: "string" },
      "skip-judge": { type: "boolean", default: false },
      "keep-storage": { type: "boolean", default: false },
      "judge-only": { type: "string" },
      calibrate: { type: "boolean", default: false },
      "reset-profile": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
  })
  const dryRun = values["dry-run"]
  const judgeOnly = values["judge-only"]
  const calibrate = values.calibrate
  // Режимы без агента не требуют Loginom/Dock/модели агента.
  const agentless = dryRun || judgeOnly !== undefined || calibrate
  const needsJudge = !dryRun && !values["skip-judge"]
  const requestedMode = dryRun ? "fake" : (env.EVAL_CLI_MODE ?? "source")
  const mode = cliModes.find((candidate) => candidate === requestedMode)
  if (!mode) throw new EvalFailure(`EVAL_CLI_MODE: ожидается source|binary|fake, получено "${requestedMode}"`, 2)
  if (mode === "binary" && !env.EVAL_CLI_BIN) throw new EvalFailure("EVAL_CLI_BIN обязателен при EVAL_CLI_MODE=binary", 2)
  const required = (name: string, needed: boolean) => {
    const value = env[name]
    if (!value && needed) throw new EvalFailure(`${name} обязателен в evals/.env`, 2)
    return value ?? ""
  }
  const positive = (name: string, raw: string | undefined, fallback: number) => {
    if (raw === undefined) return fallback
    const parsed = Number(raw)
    if (!Number.isInteger(parsed) || parsed <= 0)
      throw new EvalFailure(`${name}: ожидается положительное целое, получено "${raw}"`, 2)
    return parsed
  }
  const providerId = env.EVAL_AGENT_PROVIDER_ID
  return {
    dryRun,
    calibrate,
    judgeOnly,
    only: values.only
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean),
    tasksDir: path.resolve(evalsRoot, values.tasks ?? "tasks"),
    label: values.label ?? null,
    repeat: positive("--repeat", values.repeat ?? env.EVAL_REPEAT, 1),
    timeoutMs: values["timeout-ms"] === undefined ? undefined : positive("--timeout-ms", values["timeout-ms"], 0),
    skipJudge: !needsJudge,
    keepStorage: values["keep-storage"],
    resetProfile: values["reset-profile"],
    taskTimeoutMs: positive("EVAL_TASK_TIMEOUT_MS", env.EVAL_TASK_TIMEOUT_MS, 900_000),
    judgeTimeoutMs: positive("EVAL_JUDGE_TIMEOUT_MS", env.EVAL_JUDGE_TIMEOUT_MS, 300_000),
    passThreshold: positive("EVAL_PASS_THRESHOLD", env.EVAL_PASS_THRESHOLD, 70),
    calibration: {
      positiveMin: positive("EVAL_CALIBRATION_POSITIVE_MIN", env.EVAL_CALIBRATION_POSITIVE_MIN, 90),
      negativeMax: positive("EVAL_CALIBRATION_NEGATIVE_MAX", env.EVAL_CALIBRATION_NEGATIVE_MAX, 40),
    },
    profileDir: path.join(evalsRoot, ".profile", "agent"),
    resultsDir: path.join(evalsRoot, "results"),
    loginom: {
      url: env.LOGINOM_URL ?? "http://localhost/app/",
      username: env.LOGINOM_USERNAME ?? "user",
      password: env.LOGINOM_PASSWORD ?? "",
      container: env.LOGINOM_CONTAINER ?? "loginom-server-master",
      storageDir: env.LOGINOM_STORAGE_DIR ?? "/workdir/UserStorage/user",
    },
    dock: {
      apiKey: required("LOGINOM_DOCK_API_KEY", !agentless),
      baseUrl: env.LOGINOM_DOCK_BASE_URL ?? "https://loginom.duckdns.org",
    },
    agent: {
      model: required("EVAL_AGENT_MODEL", !agentless) || "fake/fake-model",
      cliMode: mode,
      cliBin: env.EVAL_CLI_BIN,
      bundle: path.resolve(evalsRoot, env.EVAL_CLI_BUNDLE ?? ".bundle"),
      workspaceRoot: env.EVAL_WORKSPACE_ROOT ?? "/tmp/loginom-evals",
      provider: providerId
        ? {
            id: providerId,
            baseUrl: required("EVAL_AGENT_PROVIDER_BASE_URL", true),
            apiKey: required("EVAL_AGENT_PROVIDER_API_KEY", true),
            modelId: required("EVAL_AGENT_PROVIDER_MODEL_ID", true),
          }
        : undefined,
    },
    artifactSource: dryRun
      ? `dir:${path.join(evalsRoot, "fixtures", "storage")}`
      : (env.EVAL_ARTIFACT_SOURCE ?? "docker"),
    judge: {
      command: (env.EVAL_JUDGE_COMMAND ?? "codex").split(" ").filter(Boolean),
      model: required("JUDGE_MODEL", needsJudge),
      reasoning: env.JUDGE_REASONING ?? "high",
    },
  }
}

export type EvalConfig = ReturnType<typeof loadConfig>
