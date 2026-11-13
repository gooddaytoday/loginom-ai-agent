// Условие, этап 1: две последовательные настройки одного узла.
// ports — новый узел без портов: вход таблицы 0 и вход переменных 0, оба
// передаются на выход каждой ветви. Связи создаются только после этого.
// variable_branch — существующий узел со связанными входами: одна ветвь
// «переменная = значение» и встроенная «Иначе».
const need=(ok,message)=>{if(!ok)throw Error('Condition: '+message);};
const object=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const name=v=>typeof v==='string'&&v.trim().length>0&&v.length<=128&&!/[;|<>"'\\\x00-\x1f]/.test(v);

export const conditionParametersSchema={type:'object',additionalProperties:false,
 description:'Condition. mode ports: NEW node, parameters {}, inputs [], finish done; creates table input 0 and variables input 0, both passed to every branch. Then link with mode variable_branch on the SAME node: inputs [table→0], variable_inputs [{kind:variables,input:0}], branches. Output 0 = first branch, output 1 = built-in Иначе (Else). Re-run after changing variables: existing, parameters {}, finish execute.',
 properties:{branches:{type:'array',minItems:1,maxItems:1,description:'Exactly one user branch; Иначе is built in.',items:{type:'object',additionalProperties:false,required:['name','variable','operator','value'],
  properties:{name:{type:'string',minLength:1,maxLength:128},variable:{type:'string',minLength:1,maxLength:128,description:'Linked input variable name'},
   operator:{type:'string',enum:['=']},value:{type:['integer','string'],description:'Integer or string literal of the variable type'}}}}}};

export function validateConditionParameters(p,mode,r){
 need(['ports','variable_branch'].includes(mode),'only ports or variable_branch mode is supported');
 need(object(p,['branches']),'unsupported parameter; aggregation, OR, case, debug, trees and several branches are not supported');
 if(mode==='ports'){
  need(Object.keys(p).length===0,'ports takes parameters {}');
  need(r?.target.kind==='new','ports configures a NEW Condition; reconfigure an existing one with variable_branch');
  need(!r.inputs?.length&&!r.variable_inputs?.length,'ports has no links yet: inputs:[] and no variable_inputs; link with variable_branch');
  need(r.finish==='done','ports requires finish done');
  return;
 }
 need(r?.target.kind==='existing','variable_branch configures an existing Condition created with mode ports');
 // Unchanged saved settings: execute again after upstream variables changed.
 if(Object.keys(p).length===0&&r.finish==='execute'&&!r.inputs?.length&&!r.variable_inputs?.length)return;
 need(Array.isArray(p.branches)&&p.branches.length===1,'exactly one user branch is required');
 const b=p.branches[0];
 need(object(b,['name','variable','operator','value'])&&name(b.name)&&b.name!=='Иначе','branch name: 1–128 characters, not Иначе, without ; | < > quotes or backslash');
 need(name(b.variable),'variable: linked input variable name');
 need(b.operator==='=','only operator = is supported');
 need(Number.isSafeInteger(b.value)||typeof b.value==='string'&&b.value.length<=1024&&!/[\x00-\x1f]/.test(b.value),'value: integer or single-line string');
 need((r.inputs??[]).every(i=>i.input===0)&&(r.variable_inputs??[]).every(i=>i.kind==='variables'&&i.input===0),'Condition has table input 0 and variables input 0 only');
}
