import { expect, test } from "bun:test"
import { loadConfig } from "../src/config"
import { EvalFailure } from "../src/fail"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const full = {
  LOGINOM_DOCK_API_KEY: "dock-key",
  EVAL_AGENT_MODEL: "openai/gpt-5.6-sol",
  JUDGE_MODEL: "gpt-6-astra",
}

test("loadConfig: parallel selects slots v2 and defaults to legacy singleton", () => {
  expect(loadConfig([], full)).toMatchObject({ parallel: 1, slotsFile: undefined })
  expect(loadConfig(["--parallel", "2"], { ...full, EVAL_SLOTS_FILE: "/private/slots.json" })).toMatchObject({ parallel: 2, slotsFile: "/private/slots.json" })
})

test.each(["0", "-1", "1.5", "NaN", "Infinity", "9007199254740992"])("loadConfig: invalid parallel %s is refused before other requirements", value => {
  expect(() => loadConfig([`--parallel=${value}`], {})).toThrow("PARALLEL_COUNT")
  expect(() => loadConfig([`--parallel=${value}`], {})).toThrow(expect.objectContaining({ exitCode: 2 }))
})

test("loadConfig: multiple slots require slots file even for dry run", () => {
  expect(() => loadConfig(["--parallel", "2", "--dry-run"], {})).toThrow("PARALLEL_SLOTS_REQUIRED")
})

test.each(["--keep-storage", "--reset-profile"])("loadConfig: v2 refuses %s before agent requirements", flag => {
  expect(() => loadConfig([flag], { EVAL_SLOTS_FILE: "/private/slots.json" })).toThrow("SLOT_MODE_FLAGS")
  expect(() => loadConfig([flag], { EVAL_SLOTS_FILE: "/private/slots.json" })).toThrow(expect.objectContaining({ exitCode: 2 }))
  expect(loadConfig([flag, "--dry-run"], {}).parallel).toBe(1)
})

test.each([{ argv: ["--judge-only", "/missing-run"] }, { argv: ["--calibrate"] }])("loadConfig: parallel refuses offline mode %j before judge requirements", item => {
  expect(() => loadConfig(["--parallel", "2", ...item.argv], { EVAL_SLOTS_FILE: "/private/slots.json" })).toThrow("PARALLEL_MODE")
  expect(() => loadConfig(["--parallel", "2", ...item.argv], { EVAL_SLOTS_FILE: "/private/slots.json" })).toThrow(expect.objectContaining({ exitCode: 2 }))
})

test.each(["EVAL_NODE_OPS_CONFIG", "EVAL_NODE_STAND_LEASE", "EVAL_HARNESS_LEASE_RECEIPT"])("loadConfig: parallel refuses legacy %s independently", name => {
  expect(() => loadConfig(["--parallel", "2", "--dry-run"], { EVAL_SLOTS_FILE: "/private/slots.json", [name]: "/missing-private-file" })).toThrow("PARALLEL_LEGACY_LEASE")
  expect(loadConfig(["--dry-run"], { [name]: "/missing-private-file" }).parallel).toBe(1)
})

test.each([
  ["EVAL_NODE_OPS_CONFIG", "EVAL_NODE_STAND_LEASE"],
  ["EVAL_NODE_OPS_CONFIG", "EVAL_HARNESS_LEASE_RECEIPT"],
  ["EVAL_NODE_STAND_LEASE", "EVAL_HARNESS_LEASE_RECEIPT"],
])("loadConfig: parallel refuses combined legacy leases %s/%s", (first, second) => {
  expect(() => loadConfig(["--parallel", "2", "--dry-run"], { EVAL_SLOTS_FILE: "/private/slots.json", [first]: "missing", [second]: "missing" })).toThrow("PARALLEL_LEGACY_LEASE")
})

test("CLI: parallel incompatibilities exit 2 without run directory or private config reads", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-flags-"))
  try {
    const scenarios = [
      { args: ["--judge-only", "missing"], extra: {} }, { args: ["--calibrate"], extra: {} },
      ...["EVAL_NODE_OPS_CONFIG", "EVAL_NODE_STAND_LEASE", "EVAL_HARNESS_LEASE_RECEIPT"].map(name => ({ args: [], extra: { [name]: path.join(root, "private-missing") } })),
    ]
    for (const scenario of scenarios) {
      const child = Bun.spawn([process.execPath, "--no-env-file", path.resolve(import.meta.dir, "../src/run.ts"), "--parallel", "2", ...scenario.args], {
        env: { PATH: process.env.PATH, EVAL_SLOTS_FILE: path.join(root, "slots.json"), EVAL_RESULTS_DIR: path.join(root, "results"), ...scenario.extra },
        stdout: "pipe", stderr: "pipe",
      })
      const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
      expect(code).toBe(2)
      expect(stdout).toBe("")
      expect(stderr).toContain("PARALLEL_")
      expect(stderr).not.toContain("ENOENT")
    }
    expect(await readdir(root)).toEqual([])
  } finally { await rm(root, { recursive: true, force: true }) }
})


test("loadConfig: значения по умолчанию при полном .env", () => {
  const config = loadConfig([], full)
  expect(config.agent.cliMode).toBe("source")
  expect(config.agent.model).toBe("openai/gpt-5.6-sol")
  expect(config.repeat).toBe(1)
  expect(config.taskTimeoutMs).toBe(900_000)
  expect(config.passThreshold).toBe(70)
  expect(config.calibration).toEqual({ positiveMin: 90, negativeMax: 40 })
  expect(config.judge.reasoning).toBe("high")
  expect(config.judge.command).toEqual(["codex"])
  expect(config.artifactSource).toBe("docker")
  expect(config.loginom.username).toBe("user")
  expect(config.skipJudge).toBe(false)
})

test("loadConfig: --dry-run включает fake CLI, dir-хранилище и пропуск судьи без .env", () => {
  const config = loadConfig(["--dry-run"], {})
  expect(config.agent.cliMode).toBe("fake")
  expect(config.skipJudge).toBe(true)
  expect(config.artifactSource.startsWith("dir:")).toBe(true)
  expect(config.artifactSource.endsWith("fixtures/storage")).toBe(true)
})

test("loadConfig: --dry-run не читает LOGINOM_USERNAME и LOGINOM_DOCK_API_KEY", () => {
  const config = loadConfig(["--dry-run"], { LOGINOM_USERNAME: "other", LOGINOM_DOCK_API_KEY: "k", EVAL_REPEAT: "3" })
  expect(config.loginom.username).toBe("user")
  expect(config.dock.apiKey).toBe("")
  expect(config.repeat).toBe(3)
})

test("loadConfig: без LOGINOM_DOCK_API_KEY — EvalFailure с кодом 2 и именем переменной", () => {
  expect(() => loadConfig([], { ...full, LOGINOM_DOCK_API_KEY: undefined })).toThrow(EvalFailure)
  expect(() => loadConfig([], { ...full, LOGINOM_DOCK_API_KEY: undefined })).toThrow("LOGINOM_DOCK_API_KEY")
})

test("loadConfig: --repeat перекрывает EVAL_REPEAT, нечисло отклоняется", () => {
  expect(loadConfig(["--repeat", "3"], { ...full, EVAL_REPEAT: "2" }).repeat).toBe(3)
  expect(loadConfig([], { ...full, EVAL_REPEAT: "2" }).repeat).toBe(2)
  expect(() => loadConfig(["--repeat", "x"], full)).toThrow("--repeat")
})

test.each(["EVAL_PASS_THRESHOLD", "EVAL_CALIBRATION_POSITIVE_MIN", "EVAL_CALIBRATION_NEGATIVE_MAX"])(
  "loadConfig: %s выше 100 отклоняется",
  (name) => {
    expect(() => loadConfig([], { ...full, [name]: "101" })).toThrow(EvalFailure)
    expect(() => loadConfig([], { ...full, [name]: "101" })).toThrow(name)
    expect(() => loadConfig([], { ...full, [name]: "101" })).toThrow(expect.objectContaining({ exitCode: 2 }))
  },
)

test.each(["1", "100"])("loadConfig: процентные пороги принимают границу %s", (value) => {
  expect(loadConfig([], {
    ...full,
    EVAL_PASS_THRESHOLD: value,
    EVAL_CALIBRATION_POSITIVE_MIN: value,
    EVAL_CALIBRATION_NEGATIVE_MAX: value,
  })).toMatchObject({
    passThreshold: Number(value),
    calibration: { positiveMin: Number(value), negativeMax: Number(value) },
  })
})

test.each(
  ["EVAL_PASS_THRESHOLD", "EVAL_CALIBRATION_POSITIVE_MIN", "EVAL_CALIBRATION_NEGATIVE_MAX"].flatMap((name) =>
    ["0", "-1", "1.5", "NaN", "Infinity"].map((value) => [name, value] as const),
  ),
)("loadConfig: %s отклоняет %s", (name, value) => {
  expect(() => loadConfig([], { ...full, [name]: value })).toThrow(EvalFailure)
  expect(() => loadConfig([], { ...full, [name]: value })).toThrow(name)
  expect(() => loadConfig([], { ...full, [name]: value })).toThrow(expect.objectContaining({ exitCode: 2 }))
})

test("loadConfig: большие повторы и таймауты не ограничиваются процентным максимумом", () => {
  expect(loadConfig(["--timeout-ms", "3000000"], {
    ...full,
    EVAL_REPEAT: "1000",
    EVAL_TASK_TIMEOUT_MS: "1000000",
    EVAL_JUDGE_TIMEOUT_MS: "2000000",
  })).toMatchObject({ repeat: 1000, taskTimeoutMs: 1000000, judgeTimeoutMs: 2000000, timeoutMs: 3000000 })
})

test("loadConfig: binary без EVAL_CLI_BIN отклоняется", () => {
  expect(() => loadConfig([], { ...full, EVAL_CLI_MODE: "binary" })).toThrow("EVAL_CLI_BIN")
})

test("loadConfig: вариант агента задаётся явно, по умолчанию default", () => {
  expect(loadConfig([], full).agent.variant).toBe("default")
  expect(loadConfig([], { ...full, EVAL_AGENT_VARIANT: "low" }).agent.variant).toBe("low")
})

test("loadConfig: отличает явный --tasks от каталога по умолчанию", () => {
  expect(loadConfig(["--judge-only", "run-1"], full).tasksDirExplicit).toBe(false)
  expect(loadConfig(["--judge-only", "run-1", "--tasks", "custom-tasks"], full).tasksDirExplicit).toBe(true)
})

test("loadConfig: --judge-only требует только JUDGE_MODEL", () => {
  const config = loadConfig(["--judge-only", "run-1"], { JUDGE_MODEL: "gpt-6-astra" })
  expect(config.judgeOnly).toBe("run-1")
  expect(config.dock.apiKey).toBe("")
  expect(() => loadConfig(["--judge-only", "run-1"], {})).toThrow("JUDGE_MODEL")
})

test("loadConfig: неизвестный флаг — EvalFailure с кодом 2", () => {
  expect(() => loadConfig(["--bogus"], full)).toThrow(EvalFailure)
  try {
    loadConfig(["--bogus"], full)
  } catch (error) {
    expect(error).toBeInstanceOf(EvalFailure)
    expect((error as EvalFailure).exitCode).toBe(2)
    expect((error as EvalFailure).message).toContain("Неверные аргументы")
  }
})

test("loadConfig: несовместимые пары флагов — EvalFailure", () => {
  const pairs = [
    ["--judge-only", "run-1", "--skip-judge"],
    ["--judge-only", "run-1", "--dry-run"],
    ["--calibrate", "--skip-judge"],
    ["--calibrate", "--dry-run"],
    ["--judge-only", "run-1", "--calibrate"],
  ]
  for (const argv of pairs) {
    expect(() => loadConfig(argv, full)).toThrow(EvalFailure)
    try {
      loadConfig(argv, full)
    } catch (error) {
      expect(error).toBeInstanceOf(EvalFailure)
      expect((error as EvalFailure).exitCode).toBe(2)
      expect((error as EvalFailure).message).toContain("Несовместимые флаги")
    }
  }
})

test("loadConfig: EVAL_JUDGE_COMMAND разбивается по пробелам", () => {
  expect(loadConfig([], { ...full, EVAL_JUDGE_COMMAND: "bun fixtures/fake-codex.ts" }).judge.command).toEqual([
    "bun",
    "fixtures/fake-codex.ts",
  ])
})
