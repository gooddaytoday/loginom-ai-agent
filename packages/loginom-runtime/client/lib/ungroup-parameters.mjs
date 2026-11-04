const need=(v,m)=>{if(!v)throw Error('Ungroup: '+m);};
const name=v=>typeof v==='string'&&v.length>0&&v.length<=128&&!/[\x00-\x1f]/.test(v);
export function validateUngroupParameters(p,mode,r){
 need(mode==='shares','only shares supported; computed weights, seasonality and variables are unsupported');
 need(p&&typeof p==='object'&&!Array.isArray(p),'parameters required');
 need(Object.keys(p).every(k=>k==='ungroup'),'unknown parameters');
 const u=p.ungroup;
 need(u!==undefined||r.target.kind==='existing'&&r.inputs.length===0&&!r.mappings.some(m=>m.direction==='input'),'new or changed inputs require complete ungroup settings');
 if(u!==undefined){
  need(u&&Object.keys(u).sort().join(',')==='balance,item_field,keys,rounding,share_field,value_field','complete ungroup settings required');
  need([u.value_field,u.item_field,u.share_field].every(name),'exact field names required');
  need(Array.isArray(u.keys)&&u.keys.length>0&&u.keys.length<=128,'nonempty bounded group keys required');
  const totals=new Set(),support=new Set();
  for(const k of u.keys){
   need(k&&Object.keys(k).sort().join(',')==='support,total'&&name(k.total)&&name(k.support),'group pair requires total and support');
   need(!totals.has(k.total.toLowerCase())&&!support.has(k.support.toLowerCase()),'duplicate group fields');
   totals.add(k.total.toLowerCase());support.add(k.support.toLowerCase());
  }
  need(!totals.has(u.value_field.toLowerCase())&&!support.has(u.item_field.toLowerCase())&&!support.has(u.share_field.toLowerCase())&&u.item_field.toLowerCase()!==u.share_field.toLowerCase(),'field roles must be distinct');
  const round=u.rounding;
  need(round&&['none','precision','multiple'].includes(round.format),'rounding format unsupported');
  need(Object.keys(round).sort().join(',')===(round.format==='none'?'format':'format,value'),'explicit rounding parameter required only for precision/multiple');
  if(round.format!=='none')need(Number.isInteger(round.value)&&round.value>=(round.format==='precision'?0:1)&&round.value<=(round.format==='precision'?12:2147483647),'rounding value outside supported range');
  need(['none','last','proportional','equal'].includes(u.balance),'balance unsupported');
 }
 need(r.inputs.length<=2&&new Set(r.inputs.map(i=>i.input)).size===r.inputs.length&&r.inputs.every(i=>[0,1].includes(i.input)),'two distinct table inputs required');
 need(r.target.kind==='existing'||r.inputs.length===2,'both totals input 0 and support input 1 required');
 need(r.read.ports.every(p=>p===0)&& (r.finish!=='execute'||r.read.ports.length===1),'only output 0 is supported; execution must read it');
 need(r.mappings.every(m=>(m.direction==='input'?[0,1].includes(m.port):m.port===0)
  &&(m.fields??m.changes??[]).every(f=>f.source?.kind==='configured_field'&&f.excluded!==true)),'unsupported mapping or port 1');
 need(r.finish!=='close'||r.mappings.every(m=>m.direction!=='input'),'Close cannot commit input mappings');
}
export function resolveUngroupFields(u,schemas,{requireKinds=true}={}){
 need(Array.isArray(schemas)&&schemas.length===2,'both input schemas required');
 const field=(port,n)=>{const matches=schemas[port].filter(f=>f.name===n);need(matches.length===1,'field absent or ambiguous: '+n);return matches[0];};
 for(const k of u.keys){const a=field(0,k.total),b=field(1,k.support);need(a.type===b.type&&['integer','real','string','boolean','datetime'].includes(a.type),'group key types differ or unsupported');}
 for(const [port,n] of [[0,u.value_field],[1,u.share_field]]){const f=field(port,n);need(['integer','real'].includes(f.type)&&(!requireKinds||f.data_kind==='Непрерывный'),'total/share must be continuous integer/real: '+n);}
 need(field(1,u.item_field).type==='string','item names must be string');
 return u;
}
export function ungroupOutputFields(c){
 const u=c.ungroup,totals=c.input_fields[0];
 return [...totals,{name:u.value_field+'_Rounded',label:u.value_field+'_Rounded',type:'real'},c.input_fields[1].find(f=>f.name===u.item_field),{name:'OutputValue',label:'OutputValue',type:'real'}].map(f=>({...f,used:true}));
}
