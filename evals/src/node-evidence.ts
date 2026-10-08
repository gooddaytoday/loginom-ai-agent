import path from "node:path"
import { createHash } from "node:crypto"
import { readdir } from "node:fs/promises"
import { after, checkNodeSequence, operationReceipts, readNodeEvents, successful } from "./node-events"
import { checkNodeXml, numericType, type PackageXml } from "./node-xml"
import { coverageOutputFields, nodeCase } from "./node-cases"
import { crossTableBindings } from "./node-bindings"

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const scalarTypesForOutput = (type: string) => ({ string: "dtString", real: "dtFloat", integer: "dtInteger" })[type as "string" | "real" | "integer"]
export async function checkNodeEvidence(taskDir: string, attemptDir: string, id: string, required: Set<string>, xml: PackageXml, packagePath?: string) {
  const contract = nodeCase(id)
  const failures: string[] = []
  const raw = Bun.file(path.join(attemptDir, "events.jsonl"))
  if (!(await raw.exists())) return ["events: full events.jsonl missing"]
  const events = readNodeEvents(await raw.text()), operations = operationReceipts(events)
  failures.push(...operations.failures)
  const { imports, cross, exports } = checkNodeXml(xml, id, required)
  if (required.has("input")) {
    const imp = imports[0]
    const scalarTypes: Record<string, string> = { string: "dtString", real: "dtFloat", integer: "dtInteger" }
    const assignedFields = [...contract.keys.map(name => ({ name, type: "string" })), ...contract.dimensions.map(name => ({ name, type: "string" })), ...contract.facts]
    const files = id === "crosstable-sliding-source-refresh" ? ["sales-initial.csv", "sales-updated.csv"] : ["sales.csv"]
    const columns = imp?.columns.map(c => `${c.Name}:${!contract.coverage && numericType(c.DataType) ? "numeric" : c.DataType}:${c.UsageType}`).sort()
    const expectedColumns = contract.coverage ? assignedFields.map(f => `${f.name}:${scalarTypes[f.type]}:utActive`).sort() : ["Amount:numeric:utActive", "Category:dtString:utActive", ...contract.keys.map(k => `${k}:dtString:utActive`)].sort()
    const nativeColumns = contract.coverage ? assignedFields.map(f => f.name) : [...contract.keys, "Category", "Amount"]
    for (const [index, file] of files.entries()) {
      const source = new Uint8Array(await Bun.file(path.join(taskDir, "data", file)).arrayBuffer()), hash = digest(source)
      const finalSource = index === files.length - 1
      const delivery = events.calls.find(call => call.tool.endsWith("artifact_deliver") && successful(call) &&
        (!finalSource || call.output.output?.destination === imp?.engine.FileName) &&
        call.output.output?.bytes === source.length && call.output.output?.sha256 === hash && call.output.output?.upload_completion_verified === true)
      const imported = operations.receipts.find(({ request, receipt }) => {
        const input = request.input, r = receipt.output, src = input.parameters?.source, rb = r.configuration?.readback
        return delivery && input.target?.type === "imports.text" && r.node?.node_id === imp?.id && r.execution?.status === "completed" &&
          src?.upload_operation_id === delivery.output.output.upload_operation_id &&
          (src.bytes === source.length || contract.native && src.bytes === undefined) &&
          (src.sha256 === hash || contract.native && src.sha256 === undefined) &&
          rb?.source?.source_path === delivery.output.output.destination && rb?.source?.first_line_as_title === true && (rb?.format?.delimiter === "," || contract.native && rb?.format?.delimiter === "Запятая") &&
          (!contract.native || input.document_id === r.node.document_id && input.workflow_ref?.workflow_id === r.node.workflow_id &&
            (index === 0 ? input.target.kind === "new" : input.target.kind === "existing" &&
              ["document_id", "workflow_id", "node_id"].every(k => input.target.ref?.[k] === r.node[k])))
      })
      const rb = imported?.receipt.output.configuration?.readback
      const port = imported?.receipt.output.output?.ports?.find((p: Record<string, any>) => p.port === 0)
      if (imports.length !== 1 || !delivery || !imported || !after(imported.request, delivery) ||
        imp?.engine.CodePage !== "65001" || imp?.engine.DelimiterChar !== "," || JSON.stringify(columns) !== JSON.stringify(expectedColumns) ||
        contract.coverage && (imp?.columns.some(c => c.DataKind !== (assignedFields.find(f => f.name === c.Name)?.type === "string" ? "dkDiscrete" : "dkContinuous")) ||
          rb?.columns?.length !== assignedFields.length || !assignedFields.every((f, i) => rb.columns[i].name === f.name && rb.columns[i].type === f.type && rb.columns[i].used === true &&
            rb.columns[i].data_kind === (f.type === "string" ? "Дискретный" : "Непрерывный")) ||
          id === "crosstable-string-counts-null" && ((imp?.engine.ValueNull ?? "?") !== "?" || rb?.format?.null_marker !== "?" || imported?.request.input.parameters?.settings?.format?.null_marker !== "?" ||
            port?.fresh !== true || port.row_count !== 7 || port.sample_complete !== true || port.sample?.length !== 7 ||
            ![2, 4].every(row => port.sample[row]?.[2]?.type === "string" && port.sample[row][2].is_null === true && port.sample[row][2].value === null && port.sample[row][2].precision === "exact_null"))) ||
        contract.native && !contract.coverage && (imp?.columns.some(c => c.DataType !== (c.Name === "Amount" ? "dtFloat" : "dtString") || c.DataKind !== (c.Name === "Amount" ? "dkContinuous" : "dkDiscrete")) ||
          rb?.columns?.length !== nativeColumns.length || !nativeColumns.every((name, i) => rb.columns[i].name === name && rb.columns[i].type === (name === "Amount" ? "real" : "string") &&
            rb.columns[i].used === true && rb.columns[i].data_kind === (name === "Amount" ? "Непрерывный" : "Дискретный"))))
        failures.push(`input: original bytes and native CSV import proof required (${file})`)
    }
  }
  if (required.has("export") || required.has("sequence")) {
    const finalCsv = await Bun.file(path.join(taskDir, "oracle.csv")).text()
    const initialCsv = ["crosstable-reconfigure", "crosstable-sliding-source-refresh"].includes(id) ? await Bun.file(path.join(taskDir, "initial-oracle.csv")).text() : undefined
    const sequence = checkNodeSequence(events, id, cross?.id ?? "", finalCsv, initialCsv)
    failures.push(...sequence.failures)
    if (contract.coverage) {
      const final = sequence.final, c = final?.config
      const sameOwner = (a: Record<string, any> | undefined, b: Record<string, any> | undefined) => !!a && !!b && ["document_id", "workflow_id", "node_id"].every(k => typeof a[k] === "string" && a[k] === b[k])
      const file = Bun.file(path.join(attemptDir, "native-crosstable.json"))
      const native = await file.exists() ? await file.json() : {}
      const observations = native.observations ?? []
      const observation = observations.findLast((o: Record<string, any>) => o.operation_id === final?.application.request.input.operation_id && sameOwner(o.node_crosstable?.node_context, c?.node))
      const frame = observation?.node_crosstable
      const expected = [
        ...contract.keys.map((name, order) => ({ name, type: "string", order, disposition: 2, mask: 0 })),
        ...contract.dimensions.map((name, order) => ({ name, type: "string", order, disposition: 1, mask: 0 })),
        ...contract.facts.map((f, order) => ({ ...f, order, disposition: 3 })),
      ]
      if (!frame?.verified || !frame.inventory_complete || frame.node_context?.verified !== true || frame.input_fields?.length !== expected.length ||
        !/^[a-f0-9]{64}$/.test(observation?.source_sha256 ?? "") || !Number.isInteger(observation?.source_line) || typeof observation?.source !== "string" ||
        new Set(frame.input_fields?.map((f: Record<string, any>) => f.record_id)).size !== expected.length ||
        !expected.every((f, index) => frame.input_fields.filter((v: Record<string, any>) => v.label === f.name && v.index === index && v.type === f.type &&
          v.disposition === f.disposition && v.order === f.order && v.functions === f.mask && v.data_kind === (f.type === "string" ? "Дискретный" : "Непрерывный") &&
          v.include_null === false && v.include_other === false && v.min_values === 0).length === 1) ||
        frame.service_fields?.some((f: Record<string, any>) => f.disposition > 0))
        failures.push("crosstable: complete owned observed native roles and masks required")
      if (id === "crosstable-local-variable-bindings") {
        const local = native.local_variable_observations?.findLast((o: Record<string, any>) =>
          o.operation_id === final?.application.request.input.operation_id && sameOwner(o.output?.node_context, c?.node))
        const variables = local?.output?.variables
        const request = final?.application.request.input.parameters
        const schema = final?.receipt.output.output?.ports?.[0]?.schema
        const labels: Record<string, string> = { Region: "Region", A_Amount_Sum: "A.Amount.Сумма", A_Amount_Count: "A.Amount.Количество" }
        if (!local || local.action_key !== "node.crosstable.local_variables.internal" || local.output?.verified !== true ||
          local.output?.cleanup_complete !== true || local.output?.node_context?.verified !== true ||
          !/^[a-f0-9]{64}$/.test(local.source_sha256 ?? "") || !Number.isInteger(local.source_line) || local.source_line < 0 || typeof local.source !== "string" ||
          variables?.length !== 3 || new Set(variables?.map((v: Record<string, any>) => v.id)).size !== 3 ||
          request?.local_variables?.length !== 3 || Object.keys(request?.bindings ?? {}).sort().join(",") !== "limit,separator,unique_names" ||
          c?.output_mapping !== undefined || schema?.length !== 3 || !schema.every((s: Record<string, any>) => labels[s.name] === s.label) ||
          !crossTableBindings.every(field => {
            const matches = variables?.filter((v: Record<string, any>) => v.name === field.name), v = matches?.[0]
            const rb = c?.options?.variable_bindings?.[field.key], option = frame?.options?.[field.native], proxy = option?.variable
            return matches?.length === 1 && Number.isInteger(v?.id) && v.id >= 0 && v.type === field.nativeType && v.value === field.value && v.is_null === false &&
              request.local_variables.filter((x: Record<string, any>) => x.name === field.name && x.type === field.type && x.value === field.value).length === 1 &&
              request.bindings[field.key]?.variable === field.name &&
              [rb, proxy].every(b => b?.name === field.name && b.id === v.id && b.type === v.type && b.value === v.value && b.selected_proxy_equal === true) &&
              option?.switch_pressed === true && option.disabled === false && option.value === field.value
          })) failures.push("crosstable: actual owned local variable IDs and selected bindings with automatic native names/labels required")
      }
      if (id !== "crosstable-local-variable-bindings") {
        const fields = [{ name: "Region", categories: [] as string[], fact: "", fn: "", type: "string" }, ...coverageOutputFields(id)]
        const mapping = c?.output_mapping, sources = mapping?.source_fields, targets = mapping?.target_fields
        const labels: Record<string, string> = { sum: "Сумма", count: "Количество", unique_count: "Кол-во уникальных", null_count: "Кол-во пропусков", max: "Максимум" }
        const suffixes: Record<string, string> = { sum: "Sum", count: "Count", unique_count: "UniqueCount", null_count: "NullCount", max: "Max" }
        const detailed = contract.facts.length > 1 || contract.facts.some(f => f.functions.length > 1)
        const valid = mapping?.verified === true && mapping.inventory_complete === true && mapping.source_identity_verified === true &&
          mapping.node_context?.verified === true && mapping.node_context.output_port?.port === 0 && sameOwner(mapping.node_context, c?.node) &&
          sources?.length === fields.length && targets?.length === fields.length && cross?.output_columns?.length === fields.length &&
          new Set(sources.map((s: Record<string, any>) => s.record_id)).size === fields.length && new Set(targets.map((t: Record<string, any>) => t.source?.record_id)).size === fields.length &&
          fields.every(f => {
            const ts = targets.filter((t: Record<string, any>) => t.name === f.name), t = ts[0], s = t?.source
            const source = sources?.filter((v: Record<string, any>) => v.required === true && ["record_id", "name", "label", "type"].every(k => v[k] === s?.[k]))
            const column = cross?.output_columns?.find(col => col.Name === f.name)
            const label = f.name === "Region" ? "Region" : [...f.categories, ...(detailed ? [f.fact, labels[f.fn]] : [])].join(c!.options.separator)
            const technical = f.name === "Region" ? /^Region$/ : detailed ? new RegExp(`_(?:${f.fact})_${suffixes[f.fn]}(?:_[1-9][0-9]*)?$`) : /^[A-Za-z_][A-Za-z0-9_]*$/
            return ts.length === 1 && t.excluded === false && t.type === f.type && source?.length === 1 && s.type === f.type && s.label === label && technical.test(s.name) &&
              column !== undefined && column.source === s.name && column.DataType === scalarTypesForOutput(f.type)
          })
        if (!valid) failures.push("crosstable: complete owned category/fact/function/type native mapping and persisted sources required")
      }
    }
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
            column && column.source===source.name && column.DataType===(key?"dtString":"dtFloat")
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
