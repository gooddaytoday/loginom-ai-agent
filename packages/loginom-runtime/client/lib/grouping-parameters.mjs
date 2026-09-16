const requireValue=(ok,message)=>{if(!ok)throw Error(message);};
export const GROUPING_FUNCTIONS=Object.freeze({sum:{bit:1,suffix:'Sum',label:'Сумма'},count:{bit:2,suffix:'Count',label:'Количество'},min:{bit:4,suffix:'Min',label:'Минимум'},max:{bit:8,suffix:'Max',label:'Максимум'},avg:{bit:16,suffix:'Avg',label:'Среднее'}});
const name=v=>typeof v==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v);
const field=v=>v&&Object.keys(v).sort().join(',')==='kind,name'&&v.kind==='input_field'&&name(v.name);
export function validateGroupingParameters(p,mode,r) {
 requireValue(mode==='aggregate','Grouping supports aggregate mode');
 requireValue(p&&Object.keys(p).every(k=>['group_by','measures'].includes(k)),'Invalid grouping parameters');
 const preserved=p.group_by===undefined&&p.measures===undefined;
 requireValue(!preserved||r.target.kind==='existing','New grouping requires complete keys and measures');
 if(!preserved){
  requireValue(Array.isArray(p.group_by)&&p.group_by.length>0&&p.group_by.length<=128&&p.group_by.every(field),'Ordered nonempty grouping keys required');
  requireValue(new Set(p.group_by.map(f=>f.name.toLowerCase())).size===p.group_by.length,'Duplicate grouping key');
  requireValue(Array.isArray(p.measures)&&p.measures.length>0&&p.measures.length<=256,'Nonempty grouping measures required');
  const pairs=new Set(),names=new Set(p.group_by.map(f=>f.name.toLowerCase()));
  for(const m of p.measures){
   requireValue(m&&Object.keys(m).sort().join(',')==='field,function,label,name'&&field(m.field)&&Object.hasOwn(GROUPING_FUNCTIONS,m.function),'Invalid grouping measure');
   requireValue(name(m.name)&&!names.has(m.name.toLowerCase()),'Invalid or duplicate grouping output name');names.add(m.name.toLowerCase());
   requireValue(typeof m.label==='string'&&m.label.length>0&&m.label.length<=120&&!/[\x00-\x1f]/.test(m.label),'Invalid grouping output label');
   const key=m.field.name.toLowerCase()+':'+m.function;requireValue(!pairs.has(key),'Duplicate field/function pair');pairs.add(key);
   requireValue(!p.group_by.some(g=>g.name.toLowerCase()===m.field.name.toLowerCase()),'A field cannot be both a key and a measure');
  }
 }
 requireValue(preserved||r.inputs.length===1,'Complete grouping configuration requires one explicit input');
 requireValue(r.inputs.length<=1&&r.inputs.every(i=>i.input===0),'Grouping accepts one input');
 requireValue(r.read.ports.every(i=>i===0),'Grouping has one output');
 requireValue(r.mappings.length<=2&&r.mappings.every(m=>m.port===0),'Grouping has one input/output mapping');
 for(const mapping of r.mappings){
  if(mapping.fields){
   const sourceNames=new Set(),outputNames=new Set();
   for(const item of mapping.fields){
    requireValue(item.source?.kind==='configured_field'&&name(item.source.name)&&!sourceNames.has(item.source.name.toLowerCase()),'Unique configured mapping fields required');sourceNames.add(item.source.name.toLowerCase());
    const output=item.name??item.source.name;requireValue(name(output)&&!outputNames.has(output.toLowerCase()),'Duplicate mapping output name');outputNames.add(output.toLowerCase());
    requireValue(item.excluded!==true||mapping.direction==='output'&&(preserved||p.group_by.some(f=>f.name===item.source.name)),'Only grouping output keys can be excluded');
   }
   if(mapping.direction==='output'&&!preserved){
    const outputs=[...p.group_by.map(f=>f.name),...p.measures.map(m=>m.name)];
    requireValue(mapping.fields.length===outputs.length&&mapping.fields.every(f=>outputs.includes(f.source.name)),'Grouping output mapping must cover the exact requested fields');
   }
  }
 }
 requireValue(r.finish!=='close'||r.mappings.every(m=>m.direction!=='input'),'Close cannot commit separate input mappings');
 return p;
}
export function resolveGroupingParameters(p,fields) {
 requireValue(Array.isArray(fields)&&fields.length<=1000&&new Set(fields.map(f=>f.name)).size===fields.length,'Complete unique input schema required');
 const get=f=>{const matches=fields.filter(x=>x.name===f.name);requireValue(matches.length===1,'Grouping input field is missing: '+f.name);return matches[0];};
 const keys=p.group_by.map(get),measures=p.measures.map(m=>{
  const input=get(m.field);requireValue(!['sum','avg'].includes(m.function)||['integer','real'].includes(input.type),'Grouping function is incompatible with input type: '+m.field.name+'/'+m.function);
  return {...m,input};
 });
 const fieldOrder=[...new Set(measures.map(m=>m.input.name))];
 return {keys,measures,field_order:fieldOrder,functions:fieldOrder.map(n=>({name:n,mask:measures.filter(m=>m.input.name===n).reduce((mask,m)=>mask|GROUPING_FUNCTIONS[m.function].bit,0)}))};
}
