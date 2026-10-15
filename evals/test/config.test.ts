import { expect, test } from "bun:test"
import { loadConfig } from "../src/config"
import { EvalFailure } from "../src/fail"

const full = {
  LOGINOM_DOCK_API_KEY: "dock-key",
  EVAL_AGENT_MODEL: "openai/gpt-5.6-sol",
  JUDGE_MODEL: "gpt-6-astra",
}

test("loadConfig: infrastructure retry budget is explicit and legacy default stays one", () => {
  expect(loadConfig([], full).infraRetries).toBe(1)
  expect(loadConfig([], { ...full, EVAL_INFRA_RETRIES: "0" }).infraRetries).toBe(0)
  for (const value of ["-1", "2", "0.5", "x", ""]) {
    expect(() => loadConfig([], { ...full, EVAL_INFRA_RETRIES: value })).toThrow("EVAL_INFRA_RETRIES")
  }
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
