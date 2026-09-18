const need=(v,m)=>{if(!v)throw Error(m);};
const name=v=>typeof v==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v);
const keys=(v,allowed)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>allowed.includes(k));
export function validateReplacementValue(v,type){
 need(keys(v,['type','value'])&&Object.hasOwn(v,'value')&&v.type===type,'Replacement requires a typed value of the input type');
 if(v.value===null)return;
 if(type==='string')need(typeof v.value==='string'&&v.value.length<=2048&&!/[\x00\r\n]/.test(v.value),'Invalid replacement string');
 else if(type==='real')need(typeof v.value==='number'&&Number.isFinite(v.value),'Finite real replacement required');
 else if(type==='integer'){
  need(typeof v.value==='number'&&Number.isSafeInteger(v.value)||typeof v.value==='string'&&/^-?(0|[1-9]\d*)$/.test(v.value),'Exact integer replacement required');
  const n=BigInt(v.value);need(n>=-9223372036854775808n&&n<=9223372036854775807n,'Replacement integer outside Int64');
 }else need(false,'Unsupported replacement type');
}
export function replacementValueKey(v,caseSensitive=true){
 if(v.value===null)return v.type+':null';
 return v.type+':value:'+ (v.type==='integer'?BigInt(v.value).toString():v.type==='string'&&!caseSensitive?v.value.toLowerCase():String(v.value));
}
export function validateReplacementParameters(p,mode,r){
 need(mode==='exact','Replacement supports exact internal tables only');
 need(keys(p,['rules','output_mode']),'Invalid replacement parameters');
 need(p.rules!==undefined||r.target.kind==='existing','New replacement requires complete rules');
 need(p.output_mode===undefined?r.target.kind==='existing':['replace','add'].includes(p.output_mode),'Explicit replacement output_mode required');
 if(p.rules!==undefined){
  need(Array.isArray(p.rules)&&p.rules.length>0&&p.rules.length<=128,'Nonempty replacement rules required');
  const fields=new Set();
  for(const rule of p.rules){
   need(keys(rule,['field','type','pairs','other','case_sensitive','precision'])&&keys(rule.field,['kind','name'])&&rule.field.kind==='input_field'&&name(rule.field.name),'Invalid replacement field');
   need(!fields.has(rule.field.name.toLowerCase()),'Duplicate replacement field');fields.add(rule.field.name.toLowerCase());
   need(['string','integer','real'].includes(rule.type),'Replacement type unsupported');
   need(rule.type==='string'?typeof rule.case_sensitive==='boolean'&&rule.precision===undefined:rule.precision===0&&rule.case_sensitive===undefined,'String case flag or numeric precision zero required');
   need(Array.isArray(rule.pairs)&&rule.pairs.length<=256,'Replacement table exceeds supported bound');
   const seen=new Set();
   for(const pair of rule.pairs){
    need(keys(pair,['from','to']),'Invalid replacement pair');validateReplacementValue(pair.from,rule.type);validateReplacementValue(pair.to,rule.type);
    // The tested binary comparison covers ASCII. Do not guess non-ASCII case folding.
    need(rule.type!=='string'||rule.case_sensitive||pair.from.value===null||/^[\x01-\x7f]*$/.test(pair.from.value),'Non-ASCII case-insensitive keys require verified Loginom comparison');
    const key=replacementValueKey(pair.from,rule.case_sensitive);need(!seen.has(key),'Duplicate replacement key');seen.add(key);
   }
   need(keys(rule.other,['mode','value'])&&['keep','null','value'].includes(rule.other.mode),'Explicit remaining-value policy required');
   if(rule.other.mode==='value'){validateReplacementValue(rule.other.value,rule.type);need(rule.other.value.value!==null,'Remaining Null requires null mode');need(rule.type!=='real'||Number(rule.other.value.value.toFixed(2))===rule.other.value.value,'Loginom remaining-value real editor supports at most two decimal places');}else need(rule.other.value===undefined,'Unexpected remaining replacement value');
  }
 }
 need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0),'Replacement accepts one table input');
 need(r.target.kind!=='new'||r.inputs.length===1,'New replacement requires input');
 need(r.read.ports.every(i=>i===0),'Replacement has one table output');
 need(r.mappings.length<=2&&r.mappings.every(m=>m.port===0),'Replacement has one input/output mapping');
 need(r.finish!=='close'||r.mappings.every(m=>m.direction!=='input'),'Close cannot commit separate input mapping');
 for(const m of r.mappings)if(m.fields||m.changes){const src=new Set(),out=new Set();for(const f of m.fields??m.changes){need(f.source?.kind==='configured_field'&&name(f.source.name)&&!src.has(f.source.name),'Unique configured mapping sources required');src.add(f.source.name);const n=f.name??f.source.name;need(name(n)&&!out.has(n.toLowerCase()),'Unique replacement output names required');out.add(n.toLowerCase());need(m.direction==='output'||!f.excluded,'Replacement input exclusions unsupported');}}
 return p;
}
export function resolveReplacementParameters(p,fields){
 need(Array.isArray(fields)&&fields.length<=1000&&new Set(fields.map(f=>f.name.toLowerCase())).size===fields.length,'Complete unique replacement input schema required');
 for(const rule of p.rules??[]){const matches=fields.filter(f=>f.name===rule.field.name);need(matches.length===1,'Replacement input field missing: '+rule.field.name);need(matches[0].type===rule.type,'Replacement input type mismatch: '+rule.field.name);}
 const changed=new Set((p.rules??[]).map(r=>r.field.name)),names=new Set(fields.map(f=>f.name.toLowerCase()));
 for(const f of fields)if(changed.has(f.name))for(const suffix of p.output_mode==='add'?['_Replace','_Replaced']:['_Replaced']){const n=f.name+suffix;need(name(n)&&!names.has(n.toLowerCase()),'Replacement output collision: '+n);names.add(n.toLowerCase());}
 return p;
}
export function validateReplacementInputParameters(p,resolved,native){resolveReplacementParameters(p,resolved.fields??native.target_fields);}
export function resolveEffectiveReplacementParameters(p,fields,savedRules,savedMode){
 const mode=p.output_mode??savedMode;
 need(['replace','add'].includes(mode),'Observed replacement output mode required for partial rules');
 const rules=savedRules.filter(r=>!p.rules?.some(w=>w.field.name===r.field.name)).concat(p.rules??[]);
 return resolveReplacementParameters({rules,output_mode:mode},fields);
}
