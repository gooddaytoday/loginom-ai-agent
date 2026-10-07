import path from "node:path"
import { createHash } from "node:crypto"
import { readdir } from "node:fs/promises"
import { after, checkNodeSequence, operationReceipts, readNodeEvents, successful } from "./node-events"
import { checkNodeXml, numericType, type PackageXml } from "./node-xml"
import { nodeCase } from "./node-cases"

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
export async function checkNodeEvidence(taskDir: string, attemptDir: string, id: string, required: Set<string>, xml: PackageXml, packagePath?: string) {
  const contract = nodeCase(id)
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
    const expectedColumns=["Amount:numeric:utActive", "Category:dtString:utActive", ...contract.keys.map(k=>`${k}:dtString:utActive`)].sort()
    const rb=imported?.receipt.output.configuration?.readback
    const nativeColumns=[...contract.keys,"Category","Amount"]
    if (imports.length !== 1 || !delivery || !imported || !after(imported.request, delivery) ||
      imp?.engine.CodePage !== "65001" || imp?.engine.DelimiterChar !== "," ||
      JSON.stringify(columns) !== JSON.stringify(expectedColumns) || contract.native && (
        imp?.columns.some(c=>c.DataType!==(c.Name==="Amount"?"dtFloat":"dtString") || c.DataKind!==(c.Name==="Amount"?"dkContinuous":"dkDiscrete")) ||
        rb?.columns?.length!==nativeColumns.length || !nativeColumns.every((name,index)=>rb.columns[index].name===name && rb.columns[index].type===(name==="Amount"?"real":"string") && rb.columns[index].used===true && rb.columns[index].data_kind===(name==="Amount"?"Непрерывный":"Дискретный"))))
      failures.push("input: original bytes and native CSV import proof required")
  }
  if (required.has("export") || required.has("sequence")) {
    const finalCsv = await Bun.file(path.join(taskDir, "oracle.csv")).text()
    const initialCsv = id === "crosstable-reconfigure" ? await Bun.file(path.join(taskDir, "initial-oracle.csv")).text() : undefined
    const sequence = checkNodeSequence(events, id, cross?.id ?? "", finalCsv, initialCsv)
    failures.push(...sequence.failures)
    if (id === "crosstable-min-max") {
      const final=sequence.final, c=final?.config, mapping=c?.output_mapping
      const sameOwner=(a:Record<string,any>|undefined,b:Record<string,any>|undefined)=>!!a && !!b && ["document_id","workflow_id","node_id"].every(k=>typeof a[k]==="string" && a[k]===b[k])
      const file=Bun.file(path.join(attemptDir,"native-crosstable.json"))
      const observations=(await file.exists() ? await file.json() : {}).observations ?? []
      const frame=observations.findLast((o:Record<string,any>)=>o.operation_id===final?.application.request.input.operation_id && sameOwner(o.node_crosstable?.node_context,c?.node))?.node_crosstable
      if (!frame?.verified || !frame.inventory_complete || frame.node_context.verified!==true || frame.input_fields?.length!==3 ||
        !["Region","Category","Amount"].every((label,index)=>{
          const f=frame.input_fields.find((f:Record<string,any>)=>f.label===label)
          return f?.type===(index===2?"real":"string") && f.disposition===[2,1,3][index] && f.order===0 && f.functions===(index===2?12:0)
        })) failures.push("crosstable: owned native min/max mask 12 proof required")
      const expected=["Region","A_min","A_max","B_min","B_max"]
      const sources=mapping?.source_fields, targets=mapping?.target_fields
      const valid=mapping?.verified===true && mapping.inventory_complete===true && mapping.source_identity_verified===true &&
        mapping.node_context?.verified===true && mapping.node_context.output_port?.port===0 && sameOwner(mapping.node_context,c?.node) &&
        sources?.length===5 && targets?.length===5 && new Set(sources.map((s:Record<string,any>)=>s.record_id)).size===5 &&
        new Set(targets.map((t:Record<string,any>)=>t.source?.record_id)).size===5 && expected.every(name=>{
          const ts=targets.filter((t:Record<string,any>)=>t.name===name), t=ts[0], source=t?.source
          const sourceMatches=sources.filter((s:Record<string,any>)=>s.required===true && ["record_id","name","label","type"].every(k=>s[k]===source?.[k]))
          const column=cross?.output_columns?.find(col=>col.Name===name)
          const parts=name.split("_"), key=name==="Region", fn=parts[1], label=fn==="min"?"Минимум":"Максимум"
          return ts.length===1 && !t.excluded && t.type===(key?"string":"real") && sourceMatches.length===1 && source.type===t.type &&
            (key ? source.name==="Region" && source.label==="Region" : source.label===`${parts[0]}${c!.options.separator}Amount${c!.options.separator}${label}` && new RegExp(`_Amount_${fn==="min"?"Min":"Max"}(?:_[1-9][0-9]*)?$`).test(source.name)) &&
            column?.source===source.name && column.DataType===(key?"dtString":"dtFloat")
        }) && cross?.output_columns?.length===5
      if (!valid) failures.push("crosstable: complete owned native output mapping and XML sources required")
    }
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
