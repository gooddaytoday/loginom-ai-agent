import limits from './text-import-limits.json' with {type:'json'};

// Host-selected allowance for the declared schema. Existing patches may retain
// all 1000 columns, even with an empty patch. Adjacent output moves are quadratic.
// The independent auditor uses the same pinned limits. Deadlines, scroll bounds
// and the three-attempt pre-gesture refusal policy remain separately enforced.
export function textImportStepBudget(request) {
  // Preview discovers the schema instead of declaring columns. Use the same
  // bounded read allowance as an existing import; all pinned limits stay fixed.
  const columns=request.target.kind==='existing'||request.parameters.preview_only===true
    ?limits.max_columns:request.parameters.settings.columns.length;
  const mapped=request.mappings.find(m=>m.direction==='output')?.fields?.length??0;
  if(!Number.isInteger(columns)||columns<1||columns>limits.max_columns||mapped>limits.max_columns)
    throw Error('Invalid bounded text import schema');
  return limits.base_steps+limits.steps_per_column*columns+limits.steps_per_mapping_pair*mapped*mapped;
}
