import { expect } from "bun:test"
import { LayerNode } from "@loginom-ai-agent/core/effect/layer-node"
import { filesystem } from "@loginom-ai-agent/core/effect/app-node-platform"
import { FSUtil } from "@loginom-ai-agent/core/fs-util"
import { Effect } from "effect"
import { Truncate } from "@/tool/truncate"
import { loginomResultState, loginomResultSummary } from "@/session/loginom-result"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([Truncate.node, FSUtil.node, filesystem])))

for (const status of ["AMBIGUOUS", "SUCCEEDED"]) {
  it.live("retains Loginom control state when a Unicode JSON table exceeds the backend limit: " + status, () =>
    Effect.gen(function* () {
      const truncate = yield* Truncate.Service
      const fs = yield* FSUtil.Service
      const value = {
        operation_id: "large-table",
        status,
        state: "settled",
        phase: "read_output",
        node: { document_id: "document", workflow_id: "workflow", node_id: "node" },
        execution: { status: "completed", execution_id: "original-execution" },
        cleanup_complete: status === "SUCCEEDED",
        error: status === "AMBIGUOUS" ? { code: "READ_FAILED", message: "Ошибка чтения результата" } : null,
        next_step: { tool: "dock_operation_inspect", arguments: { operation_id: "large-table" } },
        output: { ports: [{ exact_table: { rows: [["Данные".repeat(12000)]] }, sample_complete: true }] },
      }
      const text = JSON.stringify(value)
      const result = { content: [{ type: "text", text }], structuredContent: value }
      const shortened = yield* truncate.output(text)
      expect(shortened.truncated).toBe(true)
      expect(shortened.content).not.toContain("original-execution")
      if (!shortened.truncated) throw Error("Expected oversized receipt")
      const summary = loginomResultSummary(result)
      if (!summary) throw Error("Expected control summary")
      const parsed = JSON.parse(summary)
      expect(parsed.execution).toEqual(value.execution)
      expect(parsed.node).toEqual(value.node)
      expect(parsed.error).toEqual(value.error)
      expect(parsed.next_step).toEqual(value.next_step)
      expect(parsed.status).toBe(status)
      expect(parsed.output).toBeUndefined()
      expect(parsed.data_delivery).toBe("omitted_by_backend_size_limit")
      expect(Buffer.byteLength(summary)).toBeLessThan(2048)
      expect(loginomResultState(result)).toBe(status === "SUCCEEDED" ? "completed" : "failed")
      expect(yield* fs.readFileString(shortened.outputPath)).toBe(text)
      yield* fs.remove(shortened.outputPath)
    }),
  )
}
