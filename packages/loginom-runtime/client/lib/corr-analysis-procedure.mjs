import {resolveCorrAnalysisSets} from './corr-analysis-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error('Correlation analysis: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function configureCorrAnalysis(channel,p,{request,inputMapping}){
 const one=(s,tid,verb)=>{const es=s.ui.elements.filter(e=>e.tid===tid&&e.allowed_actions.includes(verb));need(es.length===1,'unique control required: '+tid);return es[0];};
 const next=async(stage,destination)=>channel.perform({condition:'accept correlation '+stage,ready:s=>s.wizard?.stage===stage,identity:s=>s.prepared_node_context,
  resolve:s=>({verb:'wizard_step',ref:one(s,s.wizard.root_tid+';btnNext','wizard_step').ref,expected_stage:destination})});
 let state=await channel.observe({condition:'correlation settings page',ready:s=>['input_mapping','corr_analysis'].includes(s.wizard?.stage)});
 if(state.wizard.stage==='input_mapping'){await next('input_mapping','corr_analysis');}
 const ready=s=>s.wizard?.stage==='corr_analysis'&&s.node_corr_analysis?.verified===true;
 const observe=condition=>channel.observe({condition,readCorrAnalysis:true,ready});
 state=await observe('complete correlation assignments');const baseline=state.node_corr_analysis;
 if(request.finish==='close')return {verified:true,cleanup_complete:true,effect_possible:false,configuration:baseline,draft_edits_skipped:true};
 need(inputMapping?.verified===true&&same(baseline.fields.map(({name,label,type})=>({name,label,type})),inputMapping.target_fields.map(({name,label,type})=>({name,label,type}))),'assignment fields differ from bound input mapping');
 const expected=resolveCorrAnalysisSets(p,baseline.fields);let current=structuredClone(baseline),edits=0;
 const check=s=>need(same(s.node_corr_analysis.fields,current.fields)&&same(s.node_corr_analysis.coefficients,current.coefficients),'unrequested settings changed');
 for(const [name,key] of [['pearson','cbCorrTypeLinear'],['kendall','cbCorrTypeKendall'],['spearman','cbCorrTypeSpearmen'],['extremum','cbCorrTypeExtremum']]){
  const wanted=name==='pearson';if(current.coefficients[name]===wanted)continue;
  state=await observe('coefficient before edit');check(state);
  await channel.perform({condition:'set correlation coefficient '+name,initialObservation:state,ready,identity:s=>s.prepared_node_context,
   resolve:s=>({verb:'set_checked',ref:one(s,s.wizard.root_tid+';CorrAnalysisWizard;'+key,'set_checked').ref,checked:wanted})});
  current.coefficients[name]=wanted;state=await observe('coefficient readback');check(state);edits++;
 }
 for(const field of expected)for(const [key,column] of [['first_set','colChkFirstSet_'],['second_set','colChkSecondSet_']]){
  const old=current.fields.find(f=>f.record_id===field.record_id);if(old[key]===field[key])continue;
  state=await observe('assignment before click');check(state);
  const tid=state.wizard.root_tid+';CorrAnalysisWizard;'+column+field.name.replace(/\s/g,'_').replace(/,/g,'');
  await channel.perform({condition:'toggle correlation '+key+' '+field.name,initialObservation:state,ready,identity:()=>field,
   resolve:s=>({verb:'click',ref:one(s,tid,'click').ref})});
  old[key]=field[key];state=await observe('complete assignment readback');check(state);edits++;
 }
 const configuration={...state.node_corr_analysis,mode:'pearson'};
 need(same(configuration.fields,expected),'final assignments differ');
 await next('corr_analysis','done');
 const done=await channel.observe({condition:'correlation settings accepted',ready:s=>s.wizard?.stage==='done'});
 return {verified:true,cleanup_complete:true,effect_possible:edits>0,configuration,settings_applied:false,validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
}
