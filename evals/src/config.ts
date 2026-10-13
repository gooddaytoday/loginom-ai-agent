import path from "node:path"
import { parseArgs } from "node:util"
import { EvalFailure } from "./fail"

export const evalsRoot = path.resolve(import.meta.dir, "..")
export const repoRoot = path.resolve(evalsRoot, "..")

const cliModes = ["source", "binary", "fake"] as const
type Env = Record<string, string | undefined>

export function loadConfig(argv: string[], env: Env = process.env) {
  const values = parseEvalArgs(argv)
  const parallel = Number(values.parallel ?? 1)
  if (!Number.isSafeInteger(parallel) || parallel < 1) throw new EvalFailure("PARALLEL_COUNT: ожидается положительное целое", 2)
  const slotsFile = env.EVAL_SLOTS_FILE ? path.resolve(evalsRoot, env.EVAL_SLOTS_FILE) : undefined
  if (parallel > 1 && !slotsFile) throw new EvalFailure("PARALLEL_SLOTS_REQUIRED", 2)
  if (parallel > 1 && [env.EVAL_NODE_OPS_CONFIG, env.EVAL_NODE_STAND_LEASE, env.EVAL_HARNESS_LEASE_RECEIPT].some(Boolean))
    throw new EvalFailure("PARALLEL_LEGACY_LEASE: node-ops/stand/harness receipts требуют N=1", 2)
  const dryRun = values["dry-run"]
  const judgeOnly = values["judge-only"]
  const calibrate = values.calibrate
  if (parallel > 1 && (judgeOnly !== undefined || calibrate)) throw new EvalFailure("PARALLEL_MODE: judge-only/calibrate требуют N=1", 2)
  if (slotsFile && (values["keep-storage"] || values["reset-profile"]))
    throw new EvalFailure("SLOT_MODE_FLAGS: --keep-storage и --reset-profile запрещены с EVAL_SLOTS_FILE", 2)
  if (judgeOnly !== undefined && values["skip-judge"]) throw new EvalFailure("Несовместимые флаги: --judge-only и --skip-judge", 2)
  if (judgeOnly !== undefined && dryRun) throw new EvalFailure("Несовместимые флаги: --judge-only и --dry-run", 2)
  if (calibrate && values["skip-judge"]) throw new EvalFailure("Несовместимые флаги: --calibrate и --skip-judge", 2)
  if (calibrate && dryRun) throw new EvalFailure("Несовместимые флаги: --calibrate и --dry-run", 2)
  if (judgeOnly !== undefined && calibrate) throw new EvalFailure("Несовместимые флаги: --judge-only и --calibrate", 2)
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
  const threshold = (name: string, raw: string | undefined, fallback: number) => {
    const parsed = positive(name, raw, fallback)
    if (parsed > 100) throw new EvalFailure(`${name}: ожидается целое от 1 до 100, получено "${raw}"`, 2)
    return parsed
  }
  const providerId = env.EVAL_AGENT_PROVIDER_ID
  return {
    parallel,
    slotsFile,
    dryRun,
    calibrate,
    judgeOnly,
    only: values.only
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean),
    tasksDir: path.resolve(evalsRoot, values.tasks ?? "tasks"),
    tasksDirExplicit: values.tasks !== undefined,
    label: values.label ?? null,
    repeat: positive("--repeat", values.repeat ?? env.EVAL_REPEAT, 1),
    timeoutMs: values["timeout-ms"] === undefined ? undefined : positive("--timeout-ms", values["timeout-ms"], 0),
    skipJudge: !needsJudge,
    keepStorage: values["keep-storage"],
    resetProfile: values["reset-profile"],
    taskTimeoutMs: positive("EVAL_TASK_TIMEOUT_MS", env.EVAL_TASK_TIMEOUT_MS, 900_000),
    judgeTimeoutMs: positive("EVAL_JUDGE_TIMEOUT_MS", env.EVAL_JUDGE_TIMEOUT_MS, 300_000),
    passThreshold: threshold("EVAL_PASS_THRESHOLD", env.EVAL_PASS_THRESHOLD, 70),
    calibration: {
      positiveMin: threshold("EVAL_CALIBRATION_POSITIVE_MIN", env.EVAL_CALIBRATION_POSITIVE_MIN, 90),
      negativeMax: threshold("EVAL_CALIBRATION_NEGATIVE_MAX", env.EVAL_CALIBRATION_NEGATIVE_MAX, 40),
    },
    profileDir: path.resolve(evalsRoot, env.EVAL_PROFILE_DIR ?? ".profile/agent"),
    resultsDir: path.resolve(evalsRoot, env.EVAL_RESULTS_DIR ?? "results"),
    loginom: {
      url: env.LOGINOM_URL ?? "http://localhost/app/",
      username: dryRun ? "user" : env.LOGINOM_USERNAME ?? "user",
      password: env.LOGINOM_PASSWORD ?? "",
      container: env.LOGINOM_CONTAINER ?? "loginom-server-master",
      storageDir: env.LOGINOM_STORAGE_DIR ?? "/workdir/UserStorage/user",
    },
    dock: {
      apiKey: agentless ? "" : required("LOGINOM_DOCK_API_KEY", true),
      baseUrl: env.LOGINOM_DOCK_BASE_URL ?? "https://loginom.duckdns.org",
    },
    agent: {
      model: required("EVAL_AGENT_MODEL", !agentless) || "fake/fake-model",
      variant: env.EVAL_AGENT_VARIANT?.trim() || "default",
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

export type EvalConfig = ReturnType<typeof loadConfig> & { auth?: { sharedDir: string }; judge: { env?: Record<string, string> } }

function parseEvalArgs(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      strict: true,
      options: {
        only: { type: "string" },
        tasks: { type: "string" },
        label: { type: "string" },
        repeat: { type: "string" },
        parallel: { type: "string" },
        "timeout-ms": { type: "string" },
        "skip-judge": { type: "boolean", default: false },
        "keep-storage": { type: "boolean", default: false },
        "judge-only": { type: "string" },
        calibrate: { type: "boolean", default: false },
        "reset-profile": { type: "boolean", default: false },
        "dry-run": { type: "boolean", default: false },
      },
    }).values
  } catch (error) {
    throw new EvalFailure(`Неверные аргументы: ${error instanceof Error ? error.message : String(error)}`, 2)
  }
}
