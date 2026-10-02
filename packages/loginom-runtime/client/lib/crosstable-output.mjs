import {resolveCrossTableSchema} from './crosstable-schema.mjs';
export function materializeCrossTableOutput(columns,configuration,{node,execution}){
 if(execution?.status!=='completed'||typeof execution.execution_id!=='string'
  ||!['document_id','workflow_id','node_id'].every(k=>configuration.node_context?.[k]===node[k]))
  throw Error('CrossTable: owned fresh materialization required');
 return resolveCrossTableSchema(columns,configuration);
}
