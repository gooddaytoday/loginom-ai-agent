// Private pure conversion. Callers must establish provenance in the owning driver.
import {decodeVariantFrame} from './variant-native-decode.mjs';
const need=(x,m)=>{if(!x)throw Error(m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const hex=bytes=>bytes.map(n=>n.toString(16).padStart(2,'0')).join('');
const tags=new Map([[1,'null'],[5,'real'],[7,'datetime'],[8,'string'],[11,'boolean'],[20,'integer']]);
export const temporalProfile='loginom-7.4.2-native-oadate';

export function adaptCell(cell,column,{dateProfile}={}) {
 need(tags.has(cell.tag),'unsupported native tag; no inferred subtype');
 need(Array.isArray(cell.payload)&&cell.payload.length>=10&&cell.payload.length<=65524,'logical payload');
 need(Number.isInteger(cell.frame_size)&&cell.frame_size===Math.max(60,12+cell.payload.length),'frame length');
 // Saved evidence omits transport padding. Reconstruct only ignored padding;
 // the decoder validates the exact logical length again below.
 const frame=[...cell.payload,...Array(cell.frame_size-12-cell.payload.length).fill(0)];
 const d=decodeVariantFrame(frame,cell.frame_size);
 need(d.tag===cell.tag&&d.consumed_bytes===cell.payload.length,'tag/logical length mismatch');
 const cellType=tags.get(d.tag);
 need(column.type==='variant'||cellType==='null'||column.type===cellType,'schema/native subtype mismatch');
 const native={tag:d.tag,encoding:{1:'null',20:'signed-int64-le',5:'ieee754-binary64-le',7:'oadate-binary64-le',8:'utf8',11:'boolean8'}[d.tag],
  ...([20,5,7].includes(d.tag)?{bytes_le:hex(cell.payload.slice(2,10))}:d.tag===11?{bytes_le:hex(cell.payload.slice(2,3))}:d.tag===8?{utf8_hex:hex(cell.payload.slice(16))}:{})};
 const result={type:column.type,cell_type:cellType,is_null:cellType==='null',precision:'exact_native',native};
 if(cellType==='null')return {...result,value:null,representation:'native_null'};
 if(cellType==='integer')return {...result,value:d.decimal,decimal:d.decimal,representation:'decimal_integer',native:{...native,bits:64}};
 if(cellType==='real')return {...result,value:d.representation,decimal:d.representation,representation:'binary64_decimal',native:{...native,bits:64,bytes_le:d.bytes_le}};
 if(cellType==='datetime'){
  need(dateProfile===temporalProfile,'unknown temporal semantics');
  return {...result,value:d.bytes_le,decimal:d.representation,representation:'native_oadate_binary64_le',timezone:'unspecified',native:{...native,bits:64,bytes_le:d.bytes_le,temporal_profile:dateProfile,semantic_scope:'native_serial_only',civil_time_verified:false,epoch_verified:false}};
 }
 return {...result,value:d.value,representation:cellType==='string'?'native_string':'native_boolean'};
}

export function adaptRead(raw,{expected,lifecycle,dateProfile,consistency}={}) {
 need(expected&&lifecycle&&consistency,'trusted host evidence required');
 need(['read_id','document_id','workflow_id','package_id','node_id','port_guid'].every(k=>typeof raw[k]==='string'&&raw[k].length>0),'complete host identity');
 need(Number.isInteger(raw.source?.owner)&&Number.isInteger(raw.source?.object),'source identity');
 need(raw.method===321&&raw.interface===116&&raw.port===0,'fixed reader contract');
 need(typeof raw.read_id==='string'&&raw.read_id.length>0&&lifecycle.id===raw.read_id,'read lifecycle identity');
 for(const key of ['read_id','document_id','workflow_id','package_id','node_id','port_guid','port','source','execution','schema','row_count'])need(same(raw[key],expected[key]),'stale/foreign '+key);
 need(raw.execution?.status==='completed'&&raw.execution.execution_id.startsWith(raw.document_id+':'),'completed execution binding');
 need(raw.owner_rechecked===true&&raw.cache_identity_rechecked===true,'binding guards missing');
 need(consistency.kind==='observed_local'&&consistency.changed===false&&consistency.exclusive_operation===true&&consistency.stability_basis==='owned_static_completed_fixture','observed change or missing operation exclusion');
 need(lifecycle.status==='completed'&&lifecycle.published===true&&lifecycle.pending===0&&lifecycle.retired===false
  &&lifecycle.requests===raw.cells.length&&lifecycle.releasedRequests===raw.cells.length&&lifecycle.releasedResponses===raw.cells.length,'unfinished or retired read');
 const codes={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'};
 const schema=raw.schema.map((c,index)=>({...c,index,type:codes[c.type]}));
 need(Number.isSafeInteger(raw.row_count)&&raw.row_count>=0&&schema.length>0&&schema.length<=8&&new Set(schema.map(c=>c.name)).size===schema.length,'table bounds/schema');
 need(schema.every(c=>['variant','integer','real','string','boolean','datetime'].includes(c.type)),'unknown schema type');
 need(raw.cells.length<=400,'cell bound');
 if(raw.row_count===0)need(raw.empty_count_attested===true,'empty native count/schema proof missing');
 const seen=new Set(),rows=new Set(),columns=new Set(),messages=new Set();
 const cells=raw.cells.map(c=>{
  need(Number.isInteger(c.row)&&c.row>=0&&c.row<raw.row_count&&Number.isInteger(c.column)&&c.column>=0&&c.column<schema.length,'cell address');
  const key=c.row+':'+c.column;need(!seen.has(key),'duplicate cell');seen.add(key);rows.add(c.row);columns.add(c.column);
  need(Number.isSafeInteger(c.message_id)&&!messages.has(c.message_id),'missing/duplicate response ID');messages.add(c.message_id);
  return {row:c.row,column:c.column,...adaptCell(c,schema[c.column],{dateProfile})};
 });
 need(rows.size<=50,'row read bound');
 cells.sort((a,b)=>a.row-b.row||a.column-b.column);
 const complete=raw.row_count<=50&&seen.size===raw.row_count*schema.length;
 return {contract:'collapse-native-full-1',schema,row_count:raw.row_count,cells,
  binding:{read_id:raw.read_id,document_id:raw.document_id,workflow_id:raw.workflow_id,package_id:raw.package_id,node_id:raw.node_id,port_guid:raw.port_guid,execution:raw.execution},
  coverage:{cells_read:seen.size,rows_read:rows.size,columns_read:columns.size,table_complete:complete},
  precision:{cells:'exact_native',temporal:'native_serial_only'},
  consistency:{kind:'observed_local',changed:false,exclusive_operation:true,stability_basis:'owned_static_completed_fixture',atomic_snapshot:false,unobserved_aba_excluded:false},
  limitations:['no_server_snapshot','unobserved_aba_risk',...(complete?[]:['partial_table'])]};
}

// Bounded port projection; the bridge applies its separate final envelope limit.
export function nativeUserPort(table,{sampleRows=10}={}) {
 need(Number.isInteger(sampleRows)&&sampleRows>=0&&sampleRows<=10,'public sample bound');
 const sample=[];
 for(let row=0;row<Math.min(sampleRows,table.row_count);row++){
  const cells=table.cells.filter(c=>c.row===row);
  if(cells.length!==table.schema.length)break;
  sample.push(cells.map(({row,column,...cell})=>cell));
 }
 const full=table.coverage.table_complete?Array.from({length:table.row_count},(_,i)=>table.cells.filter(c=>c.row===i).map(({row,column,...cell})=>cell)):null;
 const result={schema:table.schema,row_count:table.row_count,sample,sample_rows:sample.length,
  ...(full?{exact_table:{rows:full,complete:true}}:{}),
  sample_complete:table.coverage.table_complete&&sample.length===table.row_count,
  read_coverage:table.coverage,cell_precision:table.precision,read_consistency:table.consistency,
  binding:table.binding,limitations:table.limitations};
 need(new TextEncoder().encode(JSON.stringify(result)).length<=1048576,'exact serialized output limit');
 return result;
}
