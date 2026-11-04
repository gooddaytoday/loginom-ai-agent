const need=(ok,message)=>{if(!ok)throw Error('Variables replacement: '+message);};
const object=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
export function validateVariablesReplaceParameters(p,mode,r){
 need(mode==='exact','only exact mode is supported');
 need(object(p,['rules']),'unsupported parameter');
 need(p.rules===undefined?r?.target.kind==='existing':Array.isArray(p.rules)&&p.rules.length>=1&&p.rules.length<=32,'1–32 rules required for a new node');
 const names=new Set();
 for(const rule of p.rules??[]){
  need(object(rule,['variable','type','pairs','other','case_sensitive','precision'])&&object(rule.variable,['kind','name'])
   &&rule.variable.kind==='input_variable'&&typeof rule.variable.name==='string'&&rule.variable.name.length>0&&rule.variable.name.length<=128
   &&!names.has(rule.variable.name),'unique exact input variable name required');names.add(rule.variable.name);
  need(['integer','real','string','boolean'].includes(rule.type)&&rule.other==='keep','same simple type and other keep required');
  need(rule.type==='string'?rule.case_sensitive===true&&rule.precision===undefined:rule.case_sensitive===undefined
   &&(['integer','real'].includes(rule.type)?rule.precision===0:rule.precision===undefined),'strings require case_sensitive true; numbers require precision zero; omit inapplicable options');
  need(Array.isArray(rule.pairs)&&rule.pairs.length>=1&&rule.pairs.length<=32,'1–32 complete pairs required');
  const keys=new Set();
  for(const pair of rule.pairs){
   need(object(pair,['from','to'])&&Object.hasOwn(pair,'from')&&Object.hasOwn(pair,'to'),'complete from/to required');
   for(const v of [pair.from,pair.to])need(v===null||rule.type==='integer'&&Number.isSafeInteger(v)||rule.type==='real'&&typeof v==='number'&&Number.isFinite(v)
    ||rule.type==='string'&&typeof v==='string'&&v.length<=2048&&!/[\0\r\n]/.test(v)||rule.type==='boolean'&&typeof v==='boolean','pair value must have its declared type, or null');
   const key=JSON.stringify(pair.from);need(!keys.has(key),'duplicate original value');keys.add(key);
  }
 }
 if(r){
  need(r.inputs.length===0&&r.mappings.length===0,'no table inputs or explicit mappings; input labels/order are preserved automatically');
  need((r.variable_inputs??[]).every(i=>i.kind==='variables'&&i.input===0)&&(r.variable_inputs??[]).length<=1
   &&(r.target.kind==='existing'||r.variable_inputs?.length===1),'one variables input zero required');
  need(r.read?.ports.length===0&&(r.read.variable_ports??[]).every(p=>p===0),'only variable output zero can be read');
 }
}
export function resolveVariablesReplaceParameters(p,fields,saved=[]){
 validateVariablesReplaceParameters(p,'exact',{target:{kind:'existing'},inputs:[],mappings:[],read:{ports:[]}});
 need(Array.isArray(fields)&&fields.length<=128&&new Set(fields.map(f=>f.name)).size===fields.length,'complete unique input inventory required');
 for(const rule of [...saved,...p.rules??[]])need(fields.some(f=>f.name===rule.variable.name&&f.type===rule.type),'unknown variable name or changed input type: '+rule.variable.name);
 return [...saved.map(r=>p.rules?.find(p=>p.variable.name===r.variable.name)??r),...(p.rules??[]).filter(r=>!saved.some(s=>s.variable.name===r.variable.name))].map(r=>structuredClone(r));
}
