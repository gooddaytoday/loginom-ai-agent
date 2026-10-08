export const baselineFixturePins = { mode: "fixture" as const, harnessSha: "a".repeat(40), corpusSha: "b".repeat(40), cliVersion: "0.1.17",
  cliSource: "fc3d97dbf695c2ed8dba942feb6fe83591a33944", cliManifestSha256: "c".repeat(64), binarySha256: "d".repeat(64),
  model: "openai/gpt-6.1-sol", variant: "medium", judgeModel: "gpt-6-astra", judgeReasoning: "high", threshold: 70,
  timeoutMs: 1_800_000, judgeTimeoutMs: 300_000, promptSha256: "e".repeat(64), schemaSha256: "f".repeat(64),
  opsConfigSha256: "1".repeat(64), isolationSha256: "2".repeat(64), endpoint: "http://localhost/app/",
  containerId: "3".repeat(64), imageDigest: "sha256:" + "4".repeat(64), dockRevision: "fixture" }
