// Independent acceptance audit. No handler/runtime imports or native string oracle.
const need=(v,m)=>{if(!v)throw Error(m)};
function decimal(value){
 const s=String(value);need(/^[+-]?\d+(?:\.\d+)?$/.test(s),'FINITE_DECIMAL_REQUIRED');
 const [whole,fraction='']=s.replace(/^[+-]/,'').split('.');
 return {n:BigInt((s.startsWith('-')?'-':'')+whole+fraction),scale:fraction.length};
}
function compareDecimal(a,b){
 const x=decimal(a),y=decimal(b),scale=Math.max(x.scale,y.scale);
 const n=x.n*10n**BigInt(scale-x.scale),m=y.n*10n**BigInt(scale-y.scale);
 return n<m?-1:n>m?1:0;
}
export function auditNumericOrder({schema,input,output,keys}){
 need(Array.isArray(schema)&&schema.length>0&&new Set(schema.map(f=>f.name)).size===schema.length,'UNIQUE_SCHEMA_REQUIRED');
 need(Array.isArray(input)&&Array.isArray(output)&&input.every(r=>Array.isArray(r)&&r.length===schema.length)&&output.every(r=>Array.isArray(r)&&r.length===schema.length),'POSITIONAL_ROWS_REQUIRED');
 need(Array.isArray(keys)&&keys.length>0&&new Set(keys.map(k=>k.field)).size===keys.length,'UNIQUE_KEYS_REQUIRED');
 const plan=keys.map(k=>{
  const index=schema.findIndex(f=>f.name===k.field);need(index>=0&&['ASC','DESC'].includes(k.direction),'KEY_OR_DIRECTION_INVALID');
  need(['integer','real'].includes(schema[index].type),'NUMERIC_ORACLE_ONLY');
  return {index,direction:k.direction};
 });
 for(const row of [...input,...output])for(const k of plan)decimal(row[k.index]);
 const counts=new Map();for(const row of input){const s=JSON.stringify(row);counts.set(s,(counts.get(s)??0)+1)}
 for(const row of output){const s=JSON.stringify(row),n=counts.get(s)??0;need(n>0,'CELL_MULTISET_CHANGED');counts.set(s,n-1)}
 need([...counts.values()].every(n=>n===0),'CELL_MULTISET_CHANGED');
 for(let i=1;i<output.length;i++){
  let cmp=0;for(const k of plan){cmp=compareDecimal(output[i-1][k.index],output[i][k.index])*(k.direction==='ASC'?1:-1);if(cmp)break}
  need(cmp<=0,'WRONG_SORT_ORDER');
 }
 return {status:'OFFLINE_PASS',rows:output.length,keys:keys.map(k=>({...k})),multiset:true,ordered:true,stable_ties_promised:false};
}
