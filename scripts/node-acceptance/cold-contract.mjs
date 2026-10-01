import { isDeepStrictEqual } from "node:util"
import { validateExpected } from "./multi-output-oracle.mjs"

const need = (ok, message) => { if (!ok) throw Error(message) }
export function coldScenarios(expected) {
  // Absence of a version is the established legacy contract, not detection by fields.
  if (expected.version === undefined) {
    need(Array.isArray(expected.nodes) && expected.output_node_type && Array.isArray(expected.columns)
      && Array.isArray(expected.rows), "LEGACY_EXPECTED_SHAPE")
    return [{...expected, id:"legacy"}]
  }
  need(expected.version === "loginom-cold-scenarios-v1"
    && Object.keys(expected).every(k=>["version","package_path","scenarios"].includes(k)), "COLD_VERSION_OR_FIELD")
  need(Array.isArray(expected.scenarios) && expected.scenarios.length > 0
    && new Set(expected.scenarios.map(s=>s.id)).size===expected.scenarios.length, "COLD_SCENARIOS")
  expected.scenarios.forEach(s=>{
    need(Object.keys(s).every(k=>["id","nodes","output_node_type","graph","settings","oracle"].includes(k))
      && typeof s.id==="string" && /^[a-z0-9-]+$/.test(s.id)
      && typeof s.output_node_type==="string" && Array.isArray(s.nodes) && s.graph && Array.isArray(s.settings) && s.settings.length>0, "COLD_SCENARIO")
    need(s.settings.every(rule=>rule&&Object.keys(rule).every(k=>["node_id","kind","values"].includes(k))
      &&typeof rule.node_id==="string"&&["text-import-ui-v1","grouping-ui-v1","crosstable-ui-v1"].includes(rule.kind)
      &&rule.values&&typeof rule.values==="object"),"COLD_SETTINGS_RULE")
    validateExpected(s.oracle)
    need(s.oracle.owner.package_path===expected.package_path,"COLD_PACKAGE")
  })
  return expected.scenarios
}

export function verifyColdGraph(graph, expected) {
  need(graph.complete===true && graph.foreign_links.length===0,"COLD_GRAPH_INCOMPLETE")
  if (!expected) return // Legacy has no stored GUID binding.
  need(Object.keys(expected).every(k=>["nodes","links","navigation_path","service_nodes"].includes(k)),"COLD_GRAPH_FIELDS")
  need(Array.isArray(expected.navigation_path)&&isDeepStrictEqual(graph.workflow_ref.navigation_path.map(p=>p.label),expected.navigation_path),"COLD_WORKFLOW_CHANGED")
  const services=expected.service_nodes??[]
  services.forEach(rule=>{
    need(Object.keys(rule).every(k=>["type","count"].includes(k))&&rule.type==="bg-vendor-icon-modelvariables"&&rule.count===1,"COLD_SERVICE_RULE")
    const matches=graph.nodes.filter(n=>n.type===rule.type)
    need(matches.length===rule.count&&matches.every(n=>n.inputs.length===0&&n.outputs.length===0),"COLD_SERVICE_CHANGED")
  })
  const nodes=graph.nodes.filter(n=>!services.some(s=>s.type===n.type)).map(n=>({id:n.ref.node_id,type:n.type,inputs:n.inputs,outputs:n.outputs})).sort((a,b)=>a.id.localeCompare(b.id))
  need(isDeepStrictEqual(nodes,[...expected.nodes].sort((a,b)=>a.id.localeCompare(b.id)))
    && isDeepStrictEqual(graph.links,expected.links),"COLD_GRAPH_CHANGED")
}

export function observationPort(data, expected, executionID) {
  need(data.fresh!==false && data.sample_complete===true && data.filter_enabled===false
    && data.precision.numbers_verified===true && !data.limitations?.length,"COLD_READ_INCOMPLETE")
  need(data.schema.every(f=>f.data_kind_source==="fresh_native"),"COLD_SCHEMA_NOT_FRESH")
  return {index:data.port,role:expected.role,guid:data.port_guid,execution_id:executionID,
    schema:data.schema.map(f=>({index:f.index,name:f.name,label:f.label,type:f.type,data_kind:f.data_kind,null_semantics:"typed_null"})),
    schema_source:"fresh_native",filter_enabled:data.filter_enabled,complete:data.sample_complete,
    row_count:data.row_count,rows:data.sample.map(row=>row.map(c=>({type:c.type,is_null:c.is_null,value:c.value})))}
}

export function coldSettings(observed,expected){
  need(["crosstable-ui-v1","grouping-ui-v1","text-import-ui-v1"].includes(expected.kind),"COLD_SETTINGS_KIND")
  if(expected.kind==="text-import-ui-v1"){
    need(isDeepStrictEqual(observed,expected.values),"COLD_IMPORT_SETTINGS_CHANGED")
    return observed
  }
  need(observed?.verified===true&&observed.inventory_complete!==false&&Array.isArray(observed.input_fields),"COLD_SETTINGS_INCOMPLETE")
  const actual={fields:observed.input_fields.map(({record_id,...field})=>field),options:observed.options}
  need(isDeepStrictEqual(actual,expected.values),"COLD_SETTINGS_CHANGED")
  return actual
}
