import {alignReadSchema} from './node-read-contract.mjs';
import {USER_PREVIEW_WIRE_BUDGET} from './user-preview-budget.mjs';

export function confirmedTablePort(port,executionId) {
 return typeof executionId==='string'&&!!executionId&&port?.fresh===true
  &&port.freshness_basis==='completed_execution_port_source'&&port.execution_id===executionId
  &&typeof port.port_guid==='string'&&!!port.port_guid&&Number.isSafeInteger(port.port)&&port.port>=0
  &&Number.isSafeInteger(port.row_count)&&port.row_count>=0&&Array.isArray(port.schema)
  &&Array.isArray(port.sample)&&port.sample.length<=Math.min(100,port.row_count);
}

export function sensitiveOutputColumn(column) {
 const name=`${column.name} ${column.label}`;
 const words=name.replace(/(\p{Ll})(\p{Lu})/gu,'$1 $2');
 return /password|passwd|secret|token|api.?key|access.?key|authorization|cookie|private.?key|пароль|токен|credential/i.test(name)
  ||/(?:^|[^\p{L}\p{N}])(?:pwd|pass|ключ)(?=$|[^\p{L}\p{N}])/iu.test(words);
}

export function redactOutputRows(rows,schema,redactor) {
 const cleaned=redactor.redact(rows,{preserveJsonText:true});
 if(!Array.isArray(cleaned))return null;
 const sensitive=schema.map(sensitiveOutputColumn);
 return cleaned.map((row,rowIndex)=>row.map((cell,columnIndex)=>{
  if(sensitive[columnIndex]&&cell.is_null!==true)return {type:cell.type,is_null:false,value:'[redacted]'};
  if(Object.hasOwn(cell,'native')&&JSON.stringify(cell)!==JSON.stringify(rows[rowIndex][columnIndex])){
   const {native,...visible}=cell;
   return visible;
  }
  return cell;
 }));
}

export function sampleFromReceipt(port,result,redactor) {
 const output=result?.output;
 if(result?.verified!==true||result.cleanup_complete!==true||!confirmedTablePort(output,port.execution_id)
  ||output.port_guid!==port.port_guid||output.port!==port.port||output.row_count!==port.row_count)return null;
 try{alignReadSchema(output.schema,port.schema);}catch{return null;}
 const rows=redactOutputRows(output.sample,output.schema,redactor);
 if(!rows)return null;
 const targetRows=Math.min(100,port.row_count);
 let bytes=2,length=0;
 for(const row of rows.slice(0,targetRows)){
  bytes+=Buffer.byteLength(JSON.stringify(row),'utf8')+Number(length>0);
  if(bytes>USER_PREVIEW_WIRE_BUDGET)break;
  length++;
 }
 return {rows:rows.slice(0,length),...(length<targetRows?{limitation:'preview_limit'}:{})};
}
