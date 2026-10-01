import { isDeepStrictEqual } from "node:util"

// Explicit wire version. This module has no Loginom/runtime imports: expected
// rows and provenance come from fixtures, never from a product observation.
export const MULTI_OUTPUT_VERSION = "loginom-multi-output-v1"
const need = (condition, message) => { if (!condition) throw Error(message) }
const object = (value, keys) => {
  need(value && typeof value === "object" && !Array.isArray(value), "OBJECT_REQUIRED")
  need(Object.keys(value).every(key => keys.includes(key)), "UNKNOWN_FIELD")
}

export function compareMultiOutput(expected, observation) {
  try {
    validateExpected(expected)
    object(observation, ["version", "owner", "execution", "ports"])
    need(observation.version === MULTI_OUTPUT_VERSION, "OBSERVATION_VERSION")
    need(isDeepStrictEqual(observation.owner, expected.owner), "OWNER_CHANGED")
    object(observation.execution, ["id", "status", "fresh", "owner_verified"])
    need(typeof observation.execution.id === "string" && observation.execution.id.length > 0
      && observation.execution.status === "completed" && observation.execution.fresh === true
      && observation.execution.owner_verified === true, "EXECUTION_NOT_FRESH_COMPLETED")
    need(Array.isArray(observation.ports) && observation.ports.length === expected.ports.length
      && new Set(observation.ports.map(port => port.index)).size === observation.ports.length, "PORT_SET")
    for (const want of expected.ports) {
      const actual = observation.ports.find(port => port.index === want.index)
      object(actual, ["index", "role", "guid", "execution_id", "schema", "schema_source", "filter_enabled", "complete", "row_count", "rows"])
      need(actual.guid === want.guid && actual.role === want.role, "PORT_IDENTITY")
      need(actual.execution_id === observation.execution.id, "STALE_PORT_EXECUTION")
      need(actual.schema_source === "fresh_native" && isDeepStrictEqual(actual.schema, want.schema), "SCHEMA_CHANGED_OR_CACHED")
      need(actual.filter_enabled === false && actual.complete === true
        && Array.isArray(actual.rows) && Number.isSafeInteger(actual.row_count)
        && actual.row_count === actual.rows.length, "FILTER_OR_PARTIAL_READ")
      actual.rows.forEach(row => validateRow(row, want.schema))
      if (want.comparator === "invariants") continue
      need(actual.rows.length === want.rows.length, "ROW_COUNT")
      if (want.comparator === "sequence") {
        need(want.rows.every((row, index) => sameRow(row, actual.rows[index], want.rules)), "ROW_SEQUENCE")
        continue
      }
      // Bipartite matching preserves occurrences even when tolerance intervals
      // overlap; a greedy match can reject an existing complete assignment.
      const assigned = new Map()
      const match = (index, visited) => actual.rows.some((row, candidate) => {
        if (visited.has(candidate) || !sameRow(want.rows[index], row, want.rules)) return false
        visited.add(candidate)
        if (assigned.has(candidate) && !match(assigned.get(candidate), visited)) return false
        assigned.set(candidate, index)
        return true
      })
      need(want.rows.every((_, index) => match(index, new Set())), "ROW_MULTISET")
    }
    for (const invariant of expected.invariants) checkInvariant(invariant, expected, observation)
    return { status: "PASS", version: MULTI_OUTPUT_VERSION, ports: observation.ports.length }
  } catch (error) {
    return { status: "FAIL", version: MULTI_OUTPUT_VERSION, error: error.message }
  }
}

export function validateExpected(expected) {
  object(expected, ["version", "owner", "ports", "invariants"])
  need(expected.version === MULTI_OUTPUT_VERSION, "EXPECTED_VERSION")
  object(expected.owner, ["source_sha", "package_path", "workflow_id", "node_id"])
  need(Object.keys(expected.owner).length === 4 && Object.values(expected.owner).every(value => typeof value === "string" && value.length > 0), "OWNER_REQUIRED")
  need(Array.isArray(expected.ports) && expected.ports.length > 0 && expected.ports.length <= 3
    && new Set(expected.ports.map(port => port.index)).size === expected.ports.length
    && new Set(expected.ports.map(port => port.guid)).size === expected.ports.length, "EXPECTED_PORTS")
  for (const port of expected.ports) {
    object(port, ["index", "role", "guid", "schema", "comparator", "rules", "rows"])
    need(Number.isInteger(port.index) && port.index >= 0 && port.index <= 2
      && typeof port.role === "string" && port.role.length > 0
      && typeof port.guid === "string" && port.guid.length > 0, "EXPECTED_PORT_IDENTITY")
    need(["sequence", "multiset", "invariants"].includes(port.comparator), "UNKNOWN_COMPARATOR")
    need(Array.isArray(port.schema) && port.schema.length > 0
      && new Set(port.schema.map(field => field.name)).size === port.schema.length, "EXPECTED_SCHEMA")
    port.schema.forEach((field, index) => {
      object(field, ["index", "name", "label", "type", "data_kind", "null_semantics"])
      need(field.index === index && ["name", "label", "data_kind"].every(key => typeof field[key] === "string")
        && ["integer", "real", "string", "boolean", "datetime"].includes(field.type)
        && field.null_semantics === "typed_null", "EXPECTED_FIELD")
    })
    need(Array.isArray(port.rules) && port.rules.length === port.schema.length, "EXPECTED_RULES")
    port.rules.forEach((rule, index) => {
      object(rule, ["kind", "atol", "rtol"])
      need(rule.kind === "exact" || rule.kind === "computed_real", "UNKNOWN_RULE")
      if (rule.kind === "exact") {
        need(Object.keys(rule).length === 1, "EXACT_RULE_TOLERANCE")
        return
      }
      need(port.schema[index].type === "real" && [rule.atol ?? 1e-12, rule.rtol ?? 1e-12]
        .every(value => typeof value === "number" && Number.isFinite(value) && value >= 0), "INVALID_REAL_TOLERANCE")
    })
    need(Array.isArray(port.rows), "EXPECTED_ROWS")
    port.rows.forEach(row => validateRow(row, port.schema))
    need(port.comparator !== "invariants" || port.rows.length === 0, "INVARIANT_ROWS_MUST_BE_INDEPENDENT_SOURCE")
  }
  need(Array.isArray(expected.invariants), "EXPECTED_INVARIANTS")
  expected.ports.filter(port => port.comparator === "invariants").forEach(port => {
    need(expected.invariants.some(rule => rule.ports?.includes(port.index)), "UNCONSTRAINED_PORT")
  })
  return expected
}

function validateRow(row, schema) {
  need(Array.isArray(row) && row.length === schema.length, "ROW_WIDTH")
  row.forEach((cell, index) => {
    object(cell, ["type", "is_null", "value"])
    need(Object.keys(cell).length === 3 && cell.type === schema[index].type && typeof cell.is_null === "boolean", "CELL_TYPE")
    if (cell.is_null) {
      need(cell.value === null, "TYPED_NULL")
      return
    }
    const valid = cell.type === "integer" ? typeof cell.value === "string" && /^(?:0|-?[1-9][0-9]*)$/.test(cell.value)
      : cell.type === "real" ? typeof cell.value === "number" && Number.isFinite(cell.value)
      : cell.type === "boolean" ? typeof cell.value === "boolean"
      : typeof cell.value === "string"
    need(valid, "CELL_VALUE")
  })
}

function sameRow(expected, actual, rules) {
  return expected.every((cell, index) => {
    const value = actual[index]
    if (cell.type !== value.type || cell.is_null !== value.is_null) return false
    if (cell.is_null || rules[index].kind === "exact") return isDeepStrictEqual(cell, value)
    return Math.abs(value.value - cell.value) <= (rules[index].atol ?? 1e-12) + (rules[index].rtol ?? 1e-12) * Math.abs(cell.value)
  })
}

function checkInvariant(rule, expected, observation) {
  if(rule.kind === "partition-selected") {
    object(rule, ["kind", "ports", "sizes", "source_rows", "provenance_field", "replacement", "membership_field"])
    need(isDeepStrictEqual(rule.ports,[0,1,2]) && expected.ports.length===3
      && rule.ports.every((index)=>expected.ports.find(port=>port.index===index)?.role===["combined","training","test"][index]),"SELECTED_PORT_ROLES")
    need(Array.isArray(rule.sizes)&&rule.sizes.length===3&&rule.sizes.every(size=>Number.isSafeInteger(size)&&size>=0)
      &&rule.sizes[0]===rule.sizes[1]+rule.sizes[2],"SELECTED_SIZES")
    need(typeof rule.replacement==="boolean"&&typeof rule.provenance_field==="string"
      &&typeof rule.membership_field==="string"&&Array.isArray(rule.source_rows),"SELECTED_SOURCE")
    const schema=expected.ports.find(port=>port.index===1).schema
    need(isDeepStrictEqual(schema,expected.ports.find(port=>port.index===2).schema),"SELECTED_SCHEMA")
    const combinedSchema=expected.ports.find(port=>port.index===0).schema
    const member=combinedSchema.findIndex(field=>field.name===rule.membership_field)
    need(member>=0&&combinedSchema[member].type==="boolean"
      &&isDeepStrictEqual(combinedSchema.filter((_,index)=>index!==member).map((field,index)=>({...field,index})),schema),"MEMBERSHIP_SCHEMA")
    const column=schema.findIndex(field=>field.name===rule.provenance_field)
    need(column>=0,"PROVENANCE_FIELD")
    rule.source_rows.forEach(row=>validateRow(row,schema))
    const source=new Map(rule.source_rows.map(row=>[JSON.stringify(row[column]),row]))
    need(source.size===rule.source_rows.length&&rule.source_rows.every(row=>!row[column].is_null),"SOURCE_OCCURRENCE_ID")
    const seen=new Set(),wanted=new Map()
    rule.ports.forEach((index,position)=>need(observation.ports.find(port=>port.index===index).rows.length===rule.sizes[position],"SELECTED_SIZE"))
    for(const index of [1,2]) for(const row of observation.ports.find(port=>port.index===index).rows){
      const key=JSON.stringify(row[column])
      need(isDeepStrictEqual(source.get(key),row),"PROVENANCE_OR_PAYLOAD")
      need(rule.replacement||!seen.has(key),"DUPLICATE_OCCURRENCE")
      seen.add(key)
      const occurrence=JSON.stringify([row,index===2])
      wanted.set(occurrence,(wanted.get(occurrence)??0)+1)
    }
    for(const row of observation.ports.find(port=>port.index===0).rows){
      need(row[member].type==="boolean"&&!row[member].is_null,"MEMBERSHIP_VALUE")
      const occurrence=JSON.stringify([row.filter((_,index)=>index!==member),row[member].value])
      need((wanted.get(occurrence)??0)>0,"COMBINED_OCCURRENCE")
      wanted.set(occurrence,wanted.get(occurrence)-1)
    }
    need([...wanted.values()].every(count=>count===0),"COMBINED_MISSING_OCCURRENCE")
    return
  }
  object(rule, ["kind", "ports", "sizes", "source_rows", "provenance_field", "replacement"])
  need(rule.kind === "partition", "UNKNOWN_INVARIANT")
  need(Array.isArray(rule.ports) && rule.ports.length > 0 && new Set(rule.ports).size === rule.ports.length
    && rule.ports.every(index => expected.ports.some(port => port.index === index)), "INVARIANT_PORTS")
  need(Array.isArray(rule.sizes) && rule.sizes.length === rule.ports.length
    && rule.sizes.every(size => Number.isSafeInteger(size) && size >= 0), "INVARIANT_SIZES")
  need(typeof rule.provenance_field === "string" && typeof rule.replacement === "boolean"
    && Array.isArray(rule.source_rows), "INVARIANT_SOURCE")
  const schema = expected.ports.find(port => port.index === rule.ports[0]).schema
  need(rule.ports.every(index => isDeepStrictEqual(expected.ports.find(port => port.index === index).schema, schema)), "PARTITION_SCHEMA")
  const column = schema.findIndex(field => field.name === rule.provenance_field)
  need(column >= 0, "PROVENANCE_FIELD")
  rule.source_rows.forEach(row => validateRow(row, schema))
  const source = new Map(rule.source_rows.map(row => [JSON.stringify(row[column]), row]))
  need(source.size === rule.source_rows.length && rule.source_rows.every(row => !row[column].is_null), "SOURCE_OCCURRENCE_ID")
  const seen = new Set()
  rule.ports.forEach((index, position) => {
    const rows = observation.ports.find(port => port.index === index).rows
    need(rows.length === rule.sizes[position], "PARTITION_SIZE")
    rows.forEach(row => {
      const key = JSON.stringify(row[column])
      need(isDeepStrictEqual(source.get(key), row), "PROVENANCE_OR_PAYLOAD")
      need(rule.replacement || !seen.has(key), "DUPLICATE_OCCURRENCE")
      seen.add(key)
    })
  })
  need(rule.replacement || seen.size === source.size, "PARTITION_NOT_EXHAUSTIVE")
}
