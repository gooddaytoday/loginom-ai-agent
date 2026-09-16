export const DUPLICATES_OUTPUT = Object.freeze([
 {name:'Duplicate',label:'Дубликат',type:'boolean'},
 {name:'DuplicateGroup',label:'Группа дубликата',type:'integer'},
 {name:'Contradiction',label:'Противоречие',type:'boolean'},
 {name:'ContradictionGroup',label:'Группа противоречия',type:'integer'},
]);
const need=(v,m)=>{if(!v)throw Error('Duplicates: '+m);};
export function validateDuplicatesParameters(p,mode,r){
 need(mode==='mark','only mark mode is supported');
 need(p&&Object.keys(p).length===2&&Object.keys(p).every(k=>['input_fields','output_fields'].includes(k)),'declare both complete role lists');
 for(const key of ['input_fields','output_fields'])need(Array.isArray(p[key])&&p[key].length<=1000&&p[key].every(n=>typeof n==='string'&&n.length>0&&n.length<=128),'invalid '+key);
 need(p.input_fields.length>0,'at least one input field required');
 const names=[...p.input_fields,...p.output_fields];need(new Set(names.map(n=>n.toLowerCase())).size===names.length,'duplicate or overlapping roles');
 if(r){
  need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0)&&(r.target.kind==='existing'||r.inputs.length===1),'one table input required');
  need(r.mappings.length===0,'mapping overrides are unsupported; all source columns are retained');
  need(r.read.ports.every(p=>p===0),'one table output required');
 }
}
export function resolveDuplicatesParameters(p,fields){
 validateDuplicatesParameters(p,'mark');
 need(Array.isArray(fields)&&fields.length>0&&fields.length<=1000,'complete nonempty schema required');
 need(new Set(fields.map(f=>f.name?.toLowerCase())).size===fields.length,'ambiguous field names');
 for(const f of fields){
  need(typeof f.name==='string'&&['integer','real','string','boolean','datetime'].includes(f.type),'unsupported scalar field');
  need(!DUPLICATES_OUTPUT.some(o=>o.name.toLowerCase()===f.name.toLowerCase()||o.label===f.label),'reserved service field name or label');
 }
 need([...p.input_fields,...p.output_fields].every(n=>fields.some(f=>f.name===n)),'unknown field');
 return fields.map(f=>({...f,usage_type:p.input_fields.includes(f.name)?3:p.output_fields.includes(f.name)?4:0}));
}
