import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { loadTasks, agentInputsHash, rubricHash, buildAgentPrompt } from "../src/task"

test("diagnostic tasks load and hash a refusal without a fictitious reference", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-diagnostic-"))
  try {
    const dir = path.join(root, "txt-ambiguous-headers")
    const raw = { id: "txt-ambiguous-headers", title: "Refusal", prompt: "Reject invalid settings for {{PACKAGE_PATH}}",
      inputs: ["data.txt"], output_mode: "diagnostic", spec: "SPEC.md", expected_output: "REQUEST_REJECTED",
      checklist: [{ id: "sequence", text: "No Execute", required: true }] }
    await Bun.write(path.join(dir, "task.json"), JSON.stringify(raw))
    await Bun.write(path.join(dir, "data.txt"), "Name,Name\na,b\n")
    await Bun.write(path.join(dir, "SPEC.md"), "No apply or Execute")
    const tasks = await loadTasks(root)
    expect(tasks[0]!.reference).toBe("")
    expect(await rubricHash(tasks)).toMatch(/^[a-f0-9]{64}$/)
    const hash = await agentInputsHash(tasks)
    const prompt = buildAgentPrompt(tasks[0]!.prompt, "/user/attempt.lgp", "attempt.result.csv", tasks[0]!.outputMode)
    expect(prompt).toContain("/user/attempt.lgp")
    expect(prompt).not.toContain("Сохрани готовый пакет")
    expect(prompt).not.toContain("{{PACKAGE_PATH}}")
    await Bun.write(path.join(dir, "reference.lgp"), "not a reference")
    expect(await agentInputsHash(await loadTasks(root))).toBe(hash)
    await Bun.write(path.join(dir, "task.json"), JSON.stringify({ ...raw, output_mode: "guess" }))
    await expect(loadTasks(root)).rejects.toThrow("output_mode")
    await Bun.write(path.join(dir, "task.json"), JSON.stringify({ ...raw, output_mode: undefined }))
    await expect(loadTasks(root)).rejects.toThrow("reference")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("checker-side typed expectations change rubric identity without changing agent inputs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-checker-hash-"))
  try {
    const dir = path.join(root, "refusal")
    await Bun.write(path.join(dir, "task.json"), JSON.stringify({ id: "refusal", title: "Refusal", prompt: "Reject settings",
      output_mode: "diagnostic", spec: "SPEC.md", expected_output: "refusal", inputs: [],
      checker_files: ["expected/outcome.json"], checklist: [{ id: "diagnostic", text: "Exact outcome", required: true }] }))
    await Bun.write(path.join(dir, "SPEC.md"), "Outcome")
    await Bun.write(path.join(dir, "expected/outcome.json"), '{"kind":"refusal"}')
    const before = await loadTasks(root)
    const rubric = await rubricHash(before), inputs = await agentInputsHash(before)
    await Bun.write(path.join(dir, "expected/outcome.json"), '{"kind":"different"}')
    const after = await loadTasks(root)
    expect(await rubricHash(after)).not.toBe(rubric)
    expect(await agentInputsHash(after)).toBe(inputs)
  } finally { await rm(root, { recursive: true, force: true }) }
})
