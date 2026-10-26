import path from "node:path"
import { readdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { confirmedProfileArchive } from "./profile-archive"

/** Export observed native inventories after cleanup; never manufacture a numeric mask from function names. */
export async function collectNodeNativeEvidence(attemptDir:string, profileDir:string, historyDir = path.resolve(profileDir)+".history") {
  const archive=await confirmedProfileArchive(attemptDir,profileDir,historyDir)
  const observations=new Map<string,unknown>()
  const localVariables: unknown[] = []
  async function visit(directory:string) {
    for(const entry of await readdir(directory,{withFileTypes:true})) {
      const file=path.join(directory,entry.name)
      if(entry.isDirectory()) { if(entry.name!=="browser-profile") await visit(file); continue }
      if(!entry.isFile() || entry.name!=="execution-events.jsonl")continue
      const bytes=await Bun.file(file).arrayBuffer(), source_sha256=createHash("sha256").update(new Uint8Array(bytes)).digest("hex")
      for(const [source_line,line] of new TextDecoder().decode(bytes).split(/\r?\n/).entries()) {
        if(!line.trim())continue
        const event=JSON.parse(line), native=event.outcome?.output?.node_crosstable
        if (event.phase === "node_step_completed" && event.outcome?.status === "SUCCEEDED" && event.outcome.cleanup_complete === true &&
          event.outcome.action_key === "node.crosstable.local_variables.internal" && event.outcome.output?.verified === true &&
          event.outcome.output.cleanup_complete === true && event.outcome.output.node_context?.verified === true && Array.isArray(event.outcome.output.variables))
          localVariables.push({ operation_id: event.operation_id, internal_operation_id: event.internal_operation_id,
            action_key: event.outcome.action_key, output: event.outcome.output, source: path.relative(archive, file), source_sha256, source_line })
        if(event.phase!=="node_observation_completed" || event.outcome?.status!=="SUCCEEDED" || native?.verified!==true || native.inventory_complete!==true || native.node_context?.verified!==true || !Array.isArray(native.input_fields))continue
        const key=JSON.stringify([event.operation_id,native.node_context.document_id,native.node_context.workflow_id,native.node_context.node_id])
        observations.set(key,{operation_id:event.operation_id,recorded_at:event.recorded_at,node_crosstable:native,source:path.relative(archive,file),source_sha256,source_line})
      }
    }
  }
  await visit(archive)
  await Bun.write(path.join(attemptDir,"native-crosstable.json"), JSON.stringify({version:1,archive,observations:[...observations.values()],local_variable_observations:localVariables},null,2)+"\n")
}
