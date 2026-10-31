const need=(v,m)=>{if(!v)throw Error('Autocorrelation: '+m);};
export function validateAutoCorrelationParameters(p,mode,r){
 need(mode==='time_domain','use mode time_domain (PACF off)');
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>k==='autocorrelation'),'use parameters.autocorrelation only');
 const a=p.autocorrelation;
 need(a===undefined||a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).every(k=>['field','lag_count'].includes(k)),'only field and lag_count are supported');
 need(r.target.kind==='existing'||a?.field!==undefined&&a?.lag_count!==undefined,'new nodes require field and lag_count');
 if(a?.field!==undefined)need(typeof a.field==='string'&&a.field.length>0&&a.field.length<=128,'one exact technical field name required');
 if(a?.lag_count!==undefined)need(Number.isSafeInteger(a.lag_count)&&a.lag_count>=1,'lag_count must be an integer 1..9007199254740991 including lag 0');
 need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0)&&(r.target.kind==='existing'||r.inputs.length===1),'one table input at port 0 required');
 need(r.mappings.length===0,'mapping overrides are unsupported');
 need(r.read.ports.every(p=>p===0),'only output port 0 exists');
}
export function resolveAutoCorrelationField(p,fields){
 const field=p.autocorrelation?.field;
 need(Array.isArray(fields)&&new Set(fields.map(f=>f.name)).size===fields.length,'complete unique input fields required');
 const selected=field===undefined?fields.filter(f=>f.usage_type===3):fields.filter(f=>f.name===field);
 need(selected.length===1&&['integer','real'].includes(selected[0].type),'one known integer/real series required; all other fields must be unused');
 return selected[0].name;
}
