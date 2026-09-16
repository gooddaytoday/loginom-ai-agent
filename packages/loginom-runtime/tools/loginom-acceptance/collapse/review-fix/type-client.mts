import type {NodeApplyRequest,CollapseParameters,NodeOutputPort,NativeTableCell,TableCell} from '../../../../client/lib/node-contracts.js';
function requests(base:NodeApplyRequest<'transform.collapse_columns',CollapseParameters>) {
 const sample:NodeApplyRequest<'transform.collapse_columns',CollapseParameters>={...base,read:{ports:[0],sample_rows:10,require_exact_numbers:false}};
 const exact:NodeApplyRequest<'transform.collapse_columns',CollapseParameters>={...base,finish:'execute',read:{ports:[0],sample_rows:10,require_exact_numbers:true,coverage:'full'}};
 return [sample,exact];
}
const integer:NativeTableCell={type:'variant',cell_type:'integer',is_null:false,precision:'exact_native',value:'9007199254740993',decimal:'9007199254740993',representation:'decimal_integer',native:{tag:20,encoding:'signed-int64-le',bits:64,bytes_le:'0100000000002000'}};
const legacy:TableCell={type:'string',is_null:false,precision:'display_text',value:'text'};
function consume(port:NodeOutputPort): string[] {
 if(port.exact_table) {
  const coverage:boolean=port.read_coverage.table_complete;
  const execution:string=port.binding.execution.execution_id;
  const atomic:false=port.read_consistency.atomic_snapshot;
  return port.exact_table.rows.flatMap(row=>row.map(cell=>{
   if(cell.cell_type==='integer') {const value:string=cell.value;const bits:64=cell.native.bits;return value;}
   if(cell.cell_type==='datetime') {const epoch:false=cell.native.epoch_verified;const scope:'native_serial_only'=cell.native.semantic_scope;return cell.value;}
   return String(cell.value);
  }));
 }
 return port.sample.flatMap(row=>row.map(cell=>String(cell.value??cell.display_text)));
}
// @ts-expect-error native int64 cannot be a JSON number
const wrongInteger:NativeTableCell={...integer,value:9007199254740993};
// @ts-expect-error unsupported precision/encoding/subtype pair
const wrongTag:NativeTableCell={type:'variant',cell_type:'integer',is_null:false,precision:'exact_native',value:'1',decimal:'1',representation:'decimal_integer',native:{tag:3,encoding:'signed-int64-le',bits:32,bytes_le:'00'}};
// @ts-expect-error other handlers cannot opt into exact-full
const wrongRead:NodeApplyRequest<'imports.text',unknown>['read']={ports:[0],sample_rows:10,require_exact_numbers:true,coverage:'full'};
