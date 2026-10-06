import path from "node:path"
import { createHash } from "node:crypto"
import { readdir } from "node:fs/promises"
import { after, checkNodeSequence, operationReceipts, readNodeEvents, successful } from "./node-events"
import { checkNodeXml, numericType, type PackageXml } from "./node-xml"

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
export async function checkNodeEvidence(taskDir: string, attemptDir: string, id: string, required: Set<string>, xml: PackageXml, packagePath?: string) {
  const failures: string[] = []
  const raw = Bun.file(path.join(attemptDir, "events.jsonl"))
  if (!(await raw.exists())) return ["events: full events.jsonl missing"]
  const events = readNodeEvents(await raw.text()), operations = operationReceipts(events)
  failures.push(...operations.failures)
  const { imports, cross, exports } = checkNodeXml(xml, id, required)
  if (required.has("input")) {
    const source = new Uint8Array(await Bun.file(path.join(taskDir, "data/sales.csv")).arrayBuffer())
    const hash = digest(source), imp = imports[0]
    const delivery = events.calls.find(call => call.tool.endsWith("artifact_deliver") && successful(call) &&
      call.output.output?.destination === imp?.engine.FileName && call.output.output?.bytes === source.length &&
      call.output.output?.sha256 === hash && call.output.output?.upload_completion_verified === true)
    const imported = operations.receipts.find(({ request, receipt }) => request.input.target?.type === "imports.text" &&
      receipt.output.node?.node_id === imp?.id && receipt.output.execution?.status === "completed" &&
      request.input.parameters?.source?.upload_operation_id === delivery?.output.output?.upload_operation_id &&
      request.input.parameters?.source?.bytes === source.length && request.input.parameters?.source?.sha256 === hash &&
      receipt.output.configuration?.readback?.source?.source_path === imp?.engine.FileName &&
      receipt.output.configuration?.readback?.source?.first_line_as_title === true &&
      receipt.output.configuration?.readback?.format?.delimiter === ",")
    const columns = imp?.columns.map(c => `${c.Name}:${numericType(c.DataType) ? "numeric" : c.DataType}:${c.UsageType}`).sort()
    if (imports.length !== 1 || !delivery || !imported || !after(imported.request, delivery) ||
      imp?.engine.CodePage !== "65001" || imp?.engine.DelimiterChar !== "," ||
      JSON.stringify(columns) !== JSON.stringify(["Amount:numeric:utActive", "Category:dtString:utActive", "Region:dtString:utActive"]))
      failures.push("input: original bytes and native CSV import proof required")
  }
  if (required.has("export") || required.has("sequence")) {
    const finalCsv = await Bun.file(path.join(taskDir, "oracle.csv")).text()
    const initialCsv = id === "crosstable-reconfigure" ? await Bun.file(path.join(taskDir, "initial-oracle.csv")).text() : undefined
    const sequence = checkNodeSequence(events, id, cross?.id ?? "", finalCsv, initialCsv)
    failures.push(...sequence.failures)
    if (required.has("export")) {
      const out = exports[0]
      const files = await readdir(path.join(attemptDir, "artifact/results")).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return []; throw error
      })
      const csvs = files.filter(f => f.endsWith(".result.csv"))
      const file = csvs.length === 1 ? Bun.file(path.join(attemptDir, "artifact/results", csvs[0]!)) : undefined
      const bytes = file ? new Uint8Array(await file.arrayBuffer()) : undefined
      const exported = operations.receipts.find(({ request, receipt }) => {
        const r = receipt.output, artifact = r.output?.file_artifacts?.[0]
        return request.input.target?.type === "exports.text" && r.node?.node_id === out?.id &&
          r.execution?.status === "completed" && sequence.final && after(request, sequence.final.receipt) &&
          r.node?.document_id === sequence.final.config.node?.document_id && r.node?.workflow_id === sequence.final.config.node?.workflow_id &&
          r.configuration?.readback?.destination === out?.engine.FileName &&
          r.output?.file_artifacts?.length === 1 && artifact?.destination === out?.engine.FileName &&
          artifact?.execution_id === r.execution?.execution_id && artifact?.freshness_basis === "native_absence_check_and_completed_execution" &&
          bytes && artifact?.bytes === bytes.length && artifact?.sha256 === digest(bytes)
      })
      if (exports.length !== 1 || out?.engine.DelimiterChar !== "," || out?.engine.CaptionType !== "ctUseColumnNames" ||
        out?.engine.CodePage !== "65001" || !file || path.posix.basename(out?.engine.FileName ?? "") !== csvs[0] || !exported)
        failures.push("export: native export, fresh file hash and CSV settings required")
      const saved = events.calls.find(call => {
        const r = call.output
        return call.tool.endsWith("action_run") && call.input.action_key === "package.save_checkpoint" && successful(call) &&
          r.output?.save_completed === true && r.output?.workflow_preserved === true && typeof r.output?.package_ref?.path === "string" &&
          (!packagePath || r.output.package_ref.path === packagePath) &&
          r.output.package_ref.path === call.input.parameters?.path &&
          exported && after(call, exported.receipt) && sequence.final && after(call, sequence.final.receipt) &&
          r.output?.workflow_continuations?.some((w: Record<string, any>) => w.document_id === sequence.final!.config.node?.document_id &&
            w.workflow_ref?.workflow_id === sequence.final!.config.node?.workflow_id)
      })
      if (!saved) failures.push("export: successful final package save after final read/export missing")
    }
  }
  return failures
}
