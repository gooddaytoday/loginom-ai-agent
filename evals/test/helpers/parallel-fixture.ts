import path from "node:path"
import { mkdir } from "node:fs/promises"
import type { SlotFile } from "../../src/slots"

export async function parallelFixture(root: string, taskIds = ["parallel-fast", "parallel-slow"], withArtifact = false) {
  const slots: SlotFile = {
    version: 2,
    server: { container: "fixture-server", studioContainer: "fixture-studio", url: "http://127.0.0.1/app/",
      network: "fixture-network", alias: "fixture-server", storageRoot: "/workdir/UserStorage", backupRoot: "/workdir/SessionBackup" },
    controller: { stateDir: path.join(root, "controller"), adminCredentialsFile: path.join(root, "unused-admin.json") },
    judge: { codexHome: path.join(root, "judge") },
    slots: ["a", "b"].map(id => ({ id, username: `eval-${id}`, profileDir: path.join(root, `profile-${id}`),
      workspaceRoot: path.join(root, `work-${id}`), historyDir: path.join(root, `history-${id}`) })),
  }
  const lockRoot = path.join(root, "locks")
  const storage = path.join(root, "storage")
  await Promise.all([lockRoot, storage, slots.controller.stateDir, slots.judge.codexHome,
    ...slots.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir, path.join(storage, slot.id)])]
    .map(dir => mkdir(dir, { recursive: true, mode: 0o700 })))
  await Promise.all(slots.slots.map(slot => Bun.write(path.join(slot.profileDir, "data/auth.json"), '{"fake":{"type":"api","key":"fixture"}}')))
  await Promise.all(taskIds.map(async id => {
    await Bun.write(path.join(root, "tasks", id, "spec.md"), "Fixture diagnostic")
    if (withArtifact) {
      await Bun.write(path.join(root, "tasks", id, "reference.lgp"), Bun.file(path.resolve(import.meta.dir, "../../fixtures/storage/fixture-group-sum-qty.lgp")))
      await Bun.write(path.join(root, "tasks", id, "parallel-package.json"), "{}")
    }
    await Bun.write(path.join(root, "tasks", id, "task.json"), JSON.stringify({ id, title: id, prompt: id,
      ...(withArtifact ? { reference: "reference.lgp", inputs: ["parallel-package.json"] } : { output_mode: "diagnostic" }),
      spec: "spec.md", expected_output: "diagnostic", checklist: [{ id: "diagnostic", text: "Returns diagnostic", weight: 1, required: true }] }))
  }))
  return { slots, lockRoot, env: { EVAL_CLI_MODE: "fake", EVAL_ARTIFACT_SOURCE: `dir:${storage}`,
    EVAL_AGENT_MODEL: "fake/fake-model", LOGINOM_DOCK_API_KEY: "fixture-dock", EVAL_RESULTS_DIR: path.join(root, "results") } }
}
