const need=(v,m)=>{if(!v)throw Error('Logistic regression normalization: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function configureLogRegressionNormalization(channel,p,{request,baseline}){
 const one=(s,predicate,message)=>{const es=s.ui.elements.filter(predicate);need(es.length===1,message);return es[0];};
 const normReady=s=>s.wizard?.stage==='normalization'&&s.node_logregression?.verified===true&&s.node_logregression.kind==='normalization';
 const norm=condition=>channel.observe({condition,readLogRegression:true,ready:normReady});
 let state=await norm('complete logistic normalizers');
 const features=baseline.fields.filter(f=>p.input_fields.includes(f.name));
 need(features.length===p.input_fields.length,'normalizers differ from predictors');
 const wantedNorm=p.normalization===undefined&&request.target.kind==='existing'?features[0]?.norm_type:{none:0,standardize:5}[p.normalization??'none'];
 need([0,5].includes(wantedNorm)&&(p.normalization!==undefined||request.target.kind==='new'||features.every(f=>f.norm_type===wantedNorm)),
  'existing mixed normalization requires explicit none or standardize');
 const normLabel=wantedNorm===5?'Стандартизация':'Нет';
 for(const field of features){
  state=await norm('normalizer before change');if(state.node_logregression.fields.find(f=>f.record_id===field.record_id)?.norm_type===wantedNorm)continue;
  const base=state.wizard.root_tid+';NormTuneWizard;',key=field.name.replace(/\s/g,'_').replace(/,/g,'');
  await channel.perform({condition:'select normalizer field '+field.name,initialObservation:state,ready:normReady,identity:()=>field,
   resolve:s=>({verb:'click',ref:one(s,e=>e.tid===base+'colDisplayName_'+key&&e.allowed_actions.includes('click'),'Normalizer field unavailable').ref})});
  state=await norm('normalizer field selected');need(same(state.node_logregression.selected,[field.record_id]),'normalizer selection changed');
  await channel.perform({condition:'edit owned normalizer',initialObservation:state,ready:normReady,identity:()=>field,
   resolve:s=>({verb:'click',ref:one(s,e=>e.tid===base+'btnEdit'&&e.allowed_actions.includes('click'),'Normalizer Edit unavailable').ref})});
  const editor=s=>normReady(s)&&same(s.node_logregression.editor?.record_ids,[field.record_id]);
  state=await channel.observe({condition:'bound normalizer editor',readLogRegression:true,ready:editor});
  const editorBase=state.node_logregression.editor.root_tid;
  await channel.perform({condition:'open native normalizer choices',initialObservation:state,ready:editor,identity:()=>field,
   resolve:s=>({verb:'click',ref:one(s,e=>e.tid===editorBase+';cbxNormType;trg_picker'&&e.allowed_actions.includes('click'),'Normalizer picker unavailable').ref})});
  state=await channel.observe({condition:'native normalizer option',readLogRegression:true,ready:s=>editor(s)&&s.ui.elements.some(e=>e.label===normLabel&&e.allowed_actions.includes('click')&&(e.role==='option'||e.tid?.startsWith(editorBase+';cbxNormType;boundlist;')))});
  await channel.perform({condition:'select '+normLabel,initialObservation:state,ready:editor,identity:()=>field,
   resolve:s=>({verb:'click',ref:one(s,e=>e.label===normLabel&&e.allowed_actions.includes('click')&&(e.role==='option'||e.tid?.startsWith(editorBase+';cbxNormType;boundlist;')),'Unique normalizer option required').ref})});
  state=await channel.observe({condition:'normalization in owned editor',readLogRegression:true,ready:s=>editor(s)&&s.node_logregression.editor.norm_type===wantedNorm});
  await channel.perform({condition:'commit owned normalizer once',initialObservation:state,ready:editor,identity:()=>field,
   resolve:s=>({verb:'click',ref:one(s,e=>e.tid===editorBase+';btnApply'&&e.allowed_actions.includes('click'),'Normalizer OK unavailable').ref})});
  state=await norm('normalizer committed');need(!state.node_logregression.editor&&state.node_logregression.fields.find(f=>f.record_id===field.record_id)?.norm_type===wantedNorm,'normalizer was not committed');
 }
 state=await norm('complete normalization readback');const normalization=state.node_logregression;
 need(same(normalization.fields,baseline.fields.map(f=>p.input_fields.includes(f.name)?{...f,norm_type:wantedNorm}:f)),'normalization changed other field settings');
 return normalization;
}
