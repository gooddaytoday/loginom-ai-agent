import test from 'node:test';
import assert from 'node:assert/strict';
import {configureCorrAnalysis} from '../lib/corr-analysis-procedure.mjs';
for(const initial of ['pearson','spearman','kendall','all'])for(const mode of ['pearson','spearman','kendall'])test('native assignments replace '+initial+' with only '+mode+' without clearing the last coefficient',async()=>{
 const root='MF;TF;WizrdMCF',owner={document_id:'doc',workflow_id:'wf',node_id:'corr'};
 const fields=['X','Y','Z'].map((name,i)=>({index:i,record_id:String(i),name,label:name,type:'real',first_set:i!==1,second_set:i!==2}));
 const coefficients={pearson:initial==='pearson'||initial==='all',kendall:initial==='kendall'||initial==='all',spearman:initial==='spearman'||initial==='all',extremum:initial==='all'},actions=[];
 let stage='corr_analysis';
 const snapshot=()=>({wizard:{stage,root_tid:root},prepared_node_context:owner,node_corr_analysis:{verified:true,inventory_complete:true,node_context:owner,fields:structuredClone(fields),coefficients:{...coefficients}},
  ui:{elements:[{tid:root+';btnNext',ref:'next',allowed_actions:['wizard_step']},
   ...Object.entries({pearson:'Linear',kendall:'Kendall',spearman:'Spearmen',extremum:'Extremum'}).map(([key,suffix])=>({tid:root+';CorrAnalysisWizard;cbCorrType'+suffix+';DisplayEl',ref:key,allowed_actions:['set_checked']})),
   ...fields.flatMap(f=>['First','Second'].map(set=>({tid:root+';CorrAnalysisWizard;colChk'+set+'Set_'+f.name,ref:set+':'+f.name,allowed_actions:['click']})))]}});
 const channel={async observe(options){const s=snapshot();assert.ok(options.ready(s),options.condition);return s;},async perform(options){
  const s=snapshot();assert.ok(options.ready(s));const a=options.resolve(s);actions.push(a);
  if(a.verb==='set_checked'){coefficients[a.ref]=a.checked;assert.ok(Object.values(coefficients).some(Boolean),'Never clear the last coefficient: an empty selection preceded UI_REFERENCE_OBSCURED (LAB-1076 journal:344)');return;}
  if(a.verb==='wizard_step'){assert.equal(a.expected_stage,'done');stage='done';return;}
  const [set,name]=a.ref.split(':'),f=fields.find(f=>f.name===name),key=set==='First'?'first_set':'second_set';f[key]=!f[key];
 }};
 const result=await configureCorrAnalysis(channel,{first_set:['Y'],second_set:['X']},{request:{finish:'execute',mode},inputMapping:{verified:true,target_fields:fields.map(({name,label,type})=>({name,label,type}))}});
 assert.deepEqual(result.configuration.fields.filter(f=>f.first_set).map(f=>f.name),['Y']);
 assert.deepEqual(result.configuration.fields.filter(f=>f.second_set).map(f=>f.name),['X']);
 assert.deepEqual(result.configuration.coefficients,{pearson:mode==='pearson',kendall:mode==='kendall',spearman:mode==='spearman',extremum:false});
 assert.equal(result.configuration.mode,mode);
 assert.equal(result.validation.status,'accepted_by_loginom_next');assert.equal(actions.filter(a=>a.verb==='wizard_step').length,1);
});
