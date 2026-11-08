const need=(ok,message)=>{if(!ok)throw Error('Variables replacement: '+message);};
const object=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
export function validateVariablesReplaceParameters(p,mode,r){
 need(['exact','rules'].includes(mode),'only exact or rules mode is supported');
 need(object(p,['rules']),'unsupported parameter');
 need(p.rules===undefined?r?.target.kind==='existing':Array.isArray(p.rules)&&p.rules.length>=1&&p.rules.length<=32,'1–32 rules required for a new node');
 const names=new Set();
 for(const rule of p.rules??[]){
  need(object(rule,['variable','type','pairs','other','case_sensitive','precision',...(mode==='rules'?['regex_pairs']:[])])&&object(rule.variable,['kind','name'])
   &&rule.variable.kind==='input_variable'&&typeof rule.variable.name==='string'&&rule.variable.name.length>0&&rule.variable.name.length<=128
   &&!names.has(rule.variable.name),'unique exact input variable name required');names.add(rule.variable.name);
  need(['integer','real','string','boolean'].includes(rule.type)&&(rule.other==='keep'||mode==='rules'&&rule.other==='null'),'same simple type and supported unmatched policy required');
  need(rule.type==='string'?(mode==='exact'?rule.case_sensitive===true:typeof rule.case_sensitive==='boolean')&&rule.precision===undefined:rule.case_sensitive===undefined
   &&(['integer','real'].includes(rule.type)?(mode==='exact'?rule.precision===0:typeof rule.precision==='number'&&Number.isFinite(rule.precision)&&rule.precision>=0):rule.precision===undefined),'strings require case_sensitive; numbers require finite nonnegative precision; exact requires true/zero; omit inapplicable options');
  need(Array.isArray(rule.pairs)&&rule.pairs.length>=(mode==='exact'?1:0)&&rule.pairs.length<=32,'bounded complete pairs required');
  if(rule.regex_pairs!==undefined){
   need(mode==='rules'&&rule.type==='string'&&Array.isArray(rule.regex_pairs)&&rule.regex_pairs.length>=1&&rule.regex_pairs.length<=32&&rule.pairs.length===0,'string regex group cannot be mixed with exact pairs');
   const patterns=new Set();
   for(const pair of rule.regex_pairs){
    need(object(pair,['pattern','replacement'])&&typeof pair.pattern==='string'&&pair.pattern.length>0&&pair.pattern.length<=2048&&!/[\0\r\n]/.test(pair.pattern)
     &&typeof pair.replacement==='string'&&pair.replacement.length<=2048&&!/[\0\r\n]/.test(pair.replacement)&&!/[\$\\]/.test(pair.replacement),'bounded regex with constant string replacement required');
    need(!patterns.has(pair.pattern),'duplicate regex pattern');patterns.add(pair.pattern);
   }
  }
  need(rule.pairs.length>0||rule.regex_pairs?.length>0||mode==='rules'&&rule.other==='null','an exact/regex pair or null unmatched policy required');
  const keys=new Set();
  for(const pair of rule.pairs){
   need(object(pair,['from','to'])&&Object.hasOwn(pair,'from')&&Object.hasOwn(pair,'to'),'complete from/to required');
   for(const v of [pair.from,pair.to])need(v===null||rule.type==='integer'&&Number.isSafeInteger(v)||rule.type==='real'&&typeof v==='number'&&Number.isFinite(v)
    ||rule.type==='string'&&typeof v==='string'&&v.length<=2048&&!/[\0\r\n]/.test(v)||rule.type==='boolean'&&typeof v==='boolean','pair value must have its declared type, or null');
   const key=JSON.stringify(rule.type==='string'&&rule.case_sensitive===false&&typeof pair.from==='string'?pair.from.toLowerCase():pair.from);need(!keys.has(key),'duplicate original value');keys.add(key);
  }
 }
 if(r){
  need(r.inputs.length===0&&r.mappings.length===0,'no table inputs or explicit mappings; input labels/order are preserved automatically');
  need((r.variable_inputs??[]).every(i=>i.kind==='variables'&&i.input===0)&&(r.variable_inputs??[]).length<=1
   &&(r.target.kind==='existing'||r.variable_inputs?.length===1),'one variables input zero required');
  need(r.read?.ports.length===0&&(r.read.variable_ports??[]).every(p=>p===0),'only variable output zero can be read');
 }
}
export function resolveVariablesReplaceParameters(p,fields,saved=[],mode='exact'){
 validateVariablesReplaceParameters(p,mode,{target:{kind:'existing'},inputs:[],mappings:[],read:{ports:[]}});
 need(Array.isArray(fields)&&fields.length<=128&&new Set(fields.map(f=>f.name)).size===fields.length,'complete unique input inventory required');
 for(const rule of [...saved,...p.rules??[]])need(fields.some(f=>f.name===rule.variable.name&&f.type===rule.type),'unknown variable name or changed input type: '+rule.variable.name);
 return [...saved.map(r=>p.rules?.find(p=>p.variable.name===r.variable.name)??r),...(p.rules??[]).filter(r=>!saved.some(s=>s.variable.name===r.variable.name))].map(r=>structuredClone(r));
}
