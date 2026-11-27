import {confirmedTablePort} from './user-results.mjs';
import {alignReadSchema} from './node-read-contract.mjs';
import {USER_PREVIEW_WIRE_BUDGET} from './user-preview-budget.mjs';

export function sampleFromReceipt(port,result,redactor) {
 const output=result?.output;
 if(result?.verified!==true||result.cleanup_complete!==true||!confirmedTablePort(output,port.execution_id)
  ||output.port_guid!==port.port_guid||output.port!==port.port||output.row_count!==port.row_count)return null;
 try{alignReadSchema(output.schema,port.schema);}catch{return null;}
 const rows=redactor.redact(output.sample);
 if(!Array.isArray(rows))return null;
 const targetRows=Math.min(100,port.row_count);
 let bytes=2,length=0;
 for(const row of rows.slice(0,targetRows)){
  bytes+=Buffer.byteLength(JSON.stringify(row),'utf8')+Number(length>0);
  if(bytes>USER_PREVIEW_WIRE_BUDGET)break;
  length++;
 }
 return {rows:rows.slice(0,length),targetRows,...(length<targetRows?{limitation:'preview_limit'}:{})};
}
